import { expect, test } from 'claude-code/testing'

import { treeRows } from '../hooks/tree'
import type { ChangedFile } from '../types'

const file = (path: string, added = 0, deleted = 0): ChangedFile => ({
	path,
	status: 'modified',
	isUntracked: false,
	added,
	deleted,
	isBinary: false,
})

test('treeRows compacts single-child folder chains and keeps folders with files expanded', () => {
	const rows = treeRows([file('a/b/c/x.ts', 1), file('a/b/y.ts', 2), file('top.ts')])
	expect(rows.map((r) => `${'  '.repeat(r.depth)}${r.name}`)).toEqual([
		'a/b/',
		'  c/',
		'    x.ts',
		'  y.ts',
		'top.ts',
	])
})

test('treeRows sorts folders before files and rolls counts up into folders', () => {
	const rows = treeRows([file('z.ts', 1, 1), file('src/b.ts', 2, 0), file('src/lib/a.ts', 3, 4)])
	expect(rows.map((r) => [r.name, r.added, r.deleted])).toEqual([
		['src/', 5, 4],
		['lib/', 3, 4],
		['a.ts', 3, 4],
		['b.ts', 2, 0],
		['z.ts', 1, 1],
	])
})
