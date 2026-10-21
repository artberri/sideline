import type { ChangedFile, Cursor, FileStatus } from '../types'

export type TreeRow = {
	id: string
	depth: number
	name: string
	kind: 'dir' | 'file'
	status?: FileStatus
	added: number
	deleted: number
	isBinary: boolean
}

type Dir = { dirs: Map<string, Dir>; files: ChangedFile[] }

const newDir = (): Dir => ({ dirs: new Map(), files: [] })

function insert(root: Dir, file: ChangedFile): void {
	const parts = file.path.split('/')
	let dir = root
	for (const part of parts.slice(0, -1)) {
		let next = dir.dirs.get(part)
		if (!next) {
			next = newDir()
			dir.dirs.set(part, next)
		}
		dir = next
	}
	dir.files.push(file)
}

function totals(dir: Dir): { added: number; deleted: number } {
	let added = 0
	let deleted = 0
	for (const file of dir.files) {
		added += file.added
		deleted += file.deleted
	}
	for (const child of dir.dirs.values()) {
		const sub = totals(child)
		added += sub.added
		deleted += sub.deleted
	}
	return { added, deleted }
}

const byName = (a: string, b: string) => a.localeCompare(b)

function emit(dir: Dir, prefix: string, depth: number, rows: TreeRow[]): void {
	for (const [name, child] of [...dir.dirs].toSorted(([a], [b]) => byName(a, b))) {
		let label = name
		let path = `${prefix}${name}/`
		let shown = child
		while (shown.files.length === 0 && shown.dirs.size === 1) {
			const [[onlyName, only]] = [...shown.dirs] as [[string, Dir]]
			label = `${label}/${onlyName}`
			path = `${path}${onlyName}/`
			shown = only
		}
		rows.push({ id: path, depth, name: `${label}/`, kind: 'dir', isBinary: false, ...totals(shown) })
		emit(shown, path, depth + 1, rows)
	}
	for (const file of dir.files.toSorted((a, b) => byName(a.path, b.path))) {
		rows.push({
			id: file.path,
			depth,
			name: file.path.slice(file.path.lastIndexOf('/') + 1),
			kind: 'file',
			status: file.status,
			added: file.added,
			deleted: file.deleted,
			isBinary: file.isBinary,
		})
	}
}

export function treeRows(files: ChangedFile[]): TreeRow[] {
	const root = newDir()
	for (const file of files) insert(root, file)
	const rows: TreeRow[] = []
	emit(root, '', 0, rows)
	return rows
}

// The selected row's index: its id's row, or the row now at its old index when it left; -1 with nothing selected.
export function resolveCursor(rows: readonly { id: string }[], cursor: Cursor | null): number {
	if (cursor === null || rows.length === 0) return -1
	const index = rows.findIndex((row) => row.id === cursor.id)
	return index >= 0 ? index : Math.min(cursor.index, rows.length - 1)
}
