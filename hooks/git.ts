import type { EngineInterface } from 'claude-code'

import type { BranchStatus, Header } from '../types'

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

// `git status --porcelain=v2 --branch -z`: NUL-separated records; a rename record (`2`) is followed by one more
// NUL-terminated field, the path it came from.
export function parseStatus(stdout: string): Extract<Header, { kind: 'repo' }> {
	const status = emptyStatus()
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
			if (index === 'D' || worktree === 'D') status.deleted++
			if (index !== '.' && index !== 'D' && !isRename) status.staged++
			if (worktree === 'M' || worktree === 'T') status.modified++
		} else if (record.startsWith('u ')) status.conflicted++
		else if (record.startsWith('? ')) status.untracked++
	}
	const isDetached = head === '(detached)'
	return { kind: 'repo', branch: isDetached ? oid.slice(0, 7) : head, isDetached, status }
}

export async function readHeader($: EngineInterface, cwd: string): Promise<Header> {
	const run = await git($, cwd, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'])
	if (run.exitCode !== 0) return { kind: 'none' }
	const header = parseStatus(run.stdout)
	const stash = await git($, cwd, ['rev-parse', '--verify', '--quiet', 'refs/stash'])
	header.status.stashed = stash.exitCode === 0
	return header
}
