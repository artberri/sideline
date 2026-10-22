import type { EngineInterface } from 'claude-code'

import type { BranchStatus, ChangedFile, FileStatus, LineCounts, Snapshot } from '../types'

type RepoSnapshot = Extract<Snapshot, { kind: 'repo' }>

const UNTRACKED_COUNT_LIMIT = 60

export function git($: EngineInterface, cwd: string, args: string[]) {
	return $.process.run(['git', '--no-optional-locks', '-C', cwd, ...args], {
		timeoutMs: 10_000,
		env: { GIT_OPTIONAL_LOCKS: '0' },
	})
}

const emptyStatus = (): BranchStatus => ({
	conflicted: 0,
	stashed: false,
	deleted: 0,
	renamed: 0,
	modified: 0,
	staged: 0,
	untracked: 0,
	ahead: 0,
	behind: 0,
})

const changed = (path: string, status: FileStatus, isUntracked = false): ChangedFile => ({
	path,
	status,
	isUntracked,
	added: 0,
	deleted: 0,
	isBinary: false,
})

// A record's path follows a fixed number of space-separated fields, and may itself contain spaces.
const pathAfter = (record: string, fields: number) => record.split(' ').slice(fields).join(' ')

// `git status --porcelain=v2 --branch -z`: NUL-separated records; a rename record (`2`) is followed by one more
// NUL-terminated field, the path it came from.
export function parseStatus(stdout: string): RepoSnapshot {
	const status = emptyStatus()
	const files: ChangedFile[] = []
	let oid = ''
	let head = ''
	const records = stdout.split('\0')
	for (let i = 0; i < records.length; i++) {
		const record = records[i] ?? ''
		if (record.startsWith('# branch.oid ')) oid = record.slice('# branch.oid '.length)
		else if (record.startsWith('# branch.head ')) head = record.slice('# branch.head '.length)
		else if (record.startsWith('# branch.ab ')) {
			const [ahead = '', behind = ''] = record.slice('# branch.ab '.length).split(' ')
			status.ahead = Number(ahead.replace('+', '')) || 0
			status.behind = Number(behind.replace('-', '')) || 0
		} else if (record.startsWith('1 ') || record.startsWith('2 ')) {
			const isRename = record.startsWith('2 ')
			const index = record[2] ?? '.'
			const worktree = record[3] ?? '.'
			if (isRename) {
				status.renamed++
				i++
			}
			const isDeleted = index === 'D' || worktree === 'D'
			if (isDeleted) status.deleted++
			if (index !== '.' && index !== 'D' && !isRename) status.staged++
			if (worktree === 'M' || worktree === 'T') status.modified++
			const fileStatus: FileStatus = isRename
				? 'renamed'
				: isDeleted
					? 'deleted'
					: index === 'A'
						? 'added'
						: 'modified'
			files.push(changed(pathAfter(record, isRename ? 9 : 8), fileStatus))
		} else if (record.startsWith('u ')) {
			status.conflicted++
			files.push(changed(pathAfter(record, 10), 'conflicted'))
		} else if (record.startsWith('? ')) {
			status.untracked++
			files.push(changed(record.slice(2), 'added', true))
		}
	}
	const isDetached = head === '(detached)'
	return { kind: 'repo', root: '', branch: isDetached ? oid.slice(0, 7) : head, isDetached, status, files }
}

// `git diff --numstat -z`: `added\tdeleted\tpath\0`, or `added\tdeleted\t\0from\0to\0` for a rename (and for
// `--no-index` against /dev/null). A binary file counts `-\t-`.
export function parseNumstat(stdout: string): Map<string, LineCounts> {
	const counts = new Map<string, LineCounts>()
	const tokens = stdout.split('\0')
	for (let i = 0; i < tokens.length; i++) {
		const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(tokens[i] ?? '')
		if (!match) continue
		const [, added = '', deleted = '', inline = ''] = match
		let path = inline
		if (inline === '') {
			path = tokens[i + 2] ?? ''
			i += 2
		}
		const isBinary = added === '-'
		counts.set(path, { added: isBinary ? 0 : Number(added), deleted: isBinary ? 0 : Number(deleted), isBinary })
	}
	return counts
}

// An untracked file's counts with the size and modification time they were read at, by absolute path: the poll runs
// `git diff --no-index` again only for a file that changed. It starts empty on a reload.
const untrackedCache = new Map<string, { size: number; mtimeMs: number; counts: LineCounts | undefined }>()

async function untrackedCounts($: EngineInterface, cwd: string, files: ChangedFile[]) {
	const counts = new Map<string, LineCounts>()
	const seen = new Set<string>()
	for (const file of files.filter((f) => f.isUntracked).slice(0, UNTRACKED_COUNT_LIMIT)) {
		const path = `${cwd}/${file.path}`
		seen.add(path)
		// Without a stat (a file gone between status and now, a host without one) the file is read every time.
		const stat = await $.fs.stat(path).catch(() => null)
		const cached = untrackedCache.get(path)
		let one = cached?.counts
		if (!stat || !cached || cached.size !== stat.size || cached.mtimeMs !== stat.mtimeMs) {
			const run = await git($, cwd, ['diff', '--no-index', '--numstat', '-z', '--', '/dev/null', file.path])
			one = parseNumstat(run.stdout).get(file.path)
			if (stat) untrackedCache.set(path, { size: stat.size, mtimeMs: stat.mtimeMs, counts: one })
		}
		if (one) counts.set(file.path, one)
	}
	// A file that is no longer untracked (added, deleted, ignored) leaves the cache.
	for (const path of untrackedCache.keys()) if (!seen.has(path)) untrackedCache.delete(path)
	return counts
}

export async function readSnapshot($: EngineInterface, cwd: string): Promise<Snapshot> {
	const run = await git($, cwd, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'])
	if (run.exitCode !== 0) return { kind: 'none' }
	const snapshot = parseStatus(run.stdout)
	const top = await git($, cwd, ['rev-parse', '--show-toplevel'])
	snapshot.root = top.stdout.trim()
	const stash = await git($, cwd, ['rev-parse', '--verify', '--quiet', 'refs/stash'])
	snapshot.status.stashed = stash.exitCode === 0
	const tracked = await git($, cwd, ['diff', 'HEAD', '--numstat', '-z'])
	const counts = tracked.exitCode === 0 ? parseNumstat(tracked.stdout) : new Map<string, LineCounts>()
	for (const [path, one] of await untrackedCounts($, cwd, snapshot.files)) counts.set(path, one)
	snapshot.files = snapshot.files.map((file) => ({ ...file, ...counts.get(file.path) }))
	return snapshot
}

// Drops git's file header (`diff --git`, `index`, `---`, `+++`), keeping the hunks from the first `@@`.
export function hunksOnly(diff: string): string {
	const start = diff.startsWith('@@') ? 0 : diff.indexOf('\n@@') + 1
	return start > 0 || diff.startsWith('@@') ? diff.slice(start) : ''
}

export async function readDiff($: EngineInterface, root: string, file: ChangedFile): Promise<string> {
	const args = file.isUntracked
		? ['diff', '--no-index', '--', '/dev/null', file.path]
		: ['diff', 'HEAD', '--', file.path]
	const run = await git($, root, args)
	return hunksOnly(run.stdout)
}
