import { expect, test } from 'claude-code/testing'

import { parseNumstat, parseStatus } from '../hooks/git'
import { statusSymbols } from '../hooks/symbols'

const NUL = '\0'

test('parseStatus reads the branch, ahead/behind and each kind of change', () => {
	const stdout = [
		'# branch.oid 0123456789abcdef',
		'# branch.head main',
		'# branch.upstream origin/main',
		'# branch.ab +2 -0',
		'1 M. N... 100644 100644 100644 a a staged.ts',
		'1 .M N... 100644 100644 100644 a a modified.ts',
		'1 .D N... 100644 100644 000000 a a gone.ts',
		'2 R. N... 100644 100644 100644 a a R100 new.ts',
		'old.ts',
		'u UU N... 100644 100644 100644 100644 a a a clash.ts',
		'? fresh.ts',
		'',
	].join(NUL)
	const header = parseStatus(stdout)
	expect(header.branch).toBe('main')
	expect(header.isDetached).toBe(false)
	expect(header.status).toEqual({
		conflicted: 1,
		stashed: false,
		deleted: 1,
		renamed: 1,
		modified: 1,
		staged: 1,
		untracked: 1,
		ahead: 2,
		behind: 0,
	})
})

test('parseStatus shows the short hash on a detached HEAD', () => {
	const header = parseStatus(['# branch.oid 0123456789abcdef', '# branch.head (detached)', ''].join(NUL))
	expect(header.branch).toBe('0123456')
	expect(header.isDetached).toBe(true)
})

const clean = {
	conflicted: 0,
	stashed: false,
	deleted: 0,
	renamed: 0,
	modified: 0,
	staged: 0,
	untracked: 0,
	ahead: 0,
	behind: 0,
}

test('statusSymbols follows starship order and spelling', () => {
	expect(statusSymbols(clean)).toBe('')
	expect(
		statusSymbols({
			...clean,
			conflicted: 1,
			stashed: true,
			deleted: 1,
			renamed: 1,
			modified: 2,
			staged: 1,
			untracked: 3,
		}),
	).toBe('=$✘»!+?')
	expect(statusSymbols({ ...clean, ahead: 2 })).toBe('⇡2')
	expect(statusSymbols({ ...clean, behind: 3 })).toBe('⇣3')
	expect(statusSymbols({ ...clean, ahead: 2, behind: 1 })).toBe('⇕⇡2⇣1')
})

test('parseStatus lists each changed file with its status and path', () => {
	const stdout = [
		'# branch.head main',
		'1 M. N... 100644 100644 100644 a a src/staged file.ts',
		'1 A. N... 000000 100644 100644 a a added.ts',
		'1 .D N... 100644 100644 000000 a a gone.ts',
		'2 R. N... 100644 100644 100644 a a R100 new.ts',
		'old.ts',
		'u UU N... 100644 100644 100644 100644 a a a clash.ts',
		'? fresh.ts',
		'',
	].join(NUL)
	expect(parseStatus(stdout).files.map((f) => [f.path, f.status, f.isUntracked])).toEqual([
		['src/staged file.ts', 'modified', false],
		['added.ts', 'added', false],
		['gone.ts', 'deleted', false],
		['new.ts', 'renamed', false],
		['clash.ts', 'conflicted', false],
		['fresh.ts', 'added', true],
	])
})

test('parseNumstat reads counts, renames, binaries and --no-index output', () => {
	const counts = parseNumstat(
		['2\t1\ta.ts', '-\t-\tlogo.png', '0\t0\t', 'old.ts', 'new.ts', '3\t0\t', '/dev/null', 'fresh.ts', ''].join(NUL),
	)
	expect(counts.get('a.ts')).toEqual({ added: 2, deleted: 1, isBinary: false })
	expect(counts.get('logo.png')).toEqual({ added: 0, deleted: 0, isBinary: true })
	expect(counts.get('new.ts')).toEqual({ added: 0, deleted: 0, isBinary: false })
	expect(counts.has('old.ts')).toBe(false)
	expect(counts.get('fresh.ts')).toEqual({ added: 3, deleted: 0, isBinary: false })
})
