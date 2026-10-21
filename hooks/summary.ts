export type FileSummary = { verb: 'Updated' | 'Created' | 'Deleted'; path: string; added: number; deleted?: number }

type Hunk = { lines: readonly string[] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const hunksOf = (value: unknown): Hunk[] =>
	Array.isArray(value) ? value.filter((hunk): hunk is Hunk => isRecord(hunk) && Array.isArray(hunk.lines)) : []

export function countPatch(hunks: Hunk[]): { added: number; deleted: number } {
	let added = 0
	let deleted = 0
	for (const hunk of hunks)
		for (const line of hunk.lines) {
			if (line.startsWith('+')) added++
			else if (line.startsWith('-')) deleted++
		}
	return { added, deleted }
}

const lineCount = (content: string) => (content === '' ? 0 : content.replace(/\n$/, '').split('\n').length)

const relativeTo = (cwd: string, path: string) => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path)

// The one-line summaries that stand in for an edit's inline diff; `undefined` when the result has nothing to summarize,
// so the engine draws its own row.
export function summarize(tool: string, output: unknown, cwd: string): FileSummary[] | undefined {
	if (!isRecord(output)) return undefined
	if ((tool === 'Edit' || tool === 'Write') && typeof output.filePath === 'string') {
		const path = relativeTo(cwd, output.filePath)
		if (tool === 'Write' && output.type === 'create' && typeof output.content === 'string')
			return [{ verb: 'Created', path, added: lineCount(output.content) }]
		return [{ verb: 'Updated', path, ...countPatch(hunksOf(output.structuredPatch)) }]
	}
	if (tool === 'Bash' && isRecord(output.bashEditDiff) && Array.isArray(output.bashEditDiff.files)) {
		const files = output.bashEditDiff.files.filter(isRecord).flatMap((file): FileSummary[] => {
			if (typeof file.filePath !== 'string') return []
			const path = relativeTo(cwd, file.filePath)
			const counts = countPatch(hunksOf(file.hunks))
			if (file.created === true) return [{ verb: 'Created', path, added: counts.added }]
			if (file.deleted === true) return [{ verb: 'Deleted', path, added: 0, deleted: counts.deleted }]
			return [{ verb: 'Updated', path, ...counts }]
		})
		return files.length > 0 ? files : undefined
	}
	return undefined
}

export function countsLabel(summary: FileSummary): string {
	if (summary.verb === 'Created') return `(+${summary.added})`
	if (summary.verb === 'Deleted') return `(-${summary.deleted ?? 0})`
	return `(+${summary.added} -${summary.deleted ?? 0})`
}
