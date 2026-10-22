import { LOG_SIZE } from './commands'

// The rows the pane spends outside the changes box's content: the title, the box's border, and the branch line with
// the blank row under it.
const CHANGES_CHROME = 1 + 2 + 2
// The hint lines under the title, with the blank row above them.
const HINT_ROWS = 3
// The commands box: its lines and its border.
export const COMMANDS_ROWS = LOG_SIZE + 2

// Whether a wheel tick at body row `row` is over the commands box, the last COMMANDS_ROWS rows of the pane; a scroll
// key (no row) is not.
export function isOverCommands(row: number | undefined, bodyRows: number): boolean {
	return row !== undefined && row >= bodyRows - COMMANDS_ROWS
}

// How many content rows the changes box shows in a pane `bodyRows` tall; never below one.
export function changesRows(bodyRows: number, hasHints: boolean): number {
	return Math.max(1, bodyRows - CHANGES_CHROME - (hasHints ? HINT_ROWS : 0) - COMMANDS_ROWS)
}

// An offset kept inside `[0, lines - rows]`, so the window never runs past either end.
export function clampOffset(offset: number, lines: number, rows: number): number {
	return Math.min(Math.max(0, offset), Math.max(0, lines - rows))
}

// The offset that brings line `index` into a window of `rows`: unchanged when it already shows, else just enough to
// put it at the window's nearer edge.
export function revealOffset(offset: number, index: number, rows: number): number {
	if (index < offset) return index
	if (index >= offset + rows) return index - rows + 1
	return offset
}

// The lines a window of `rows` at `offset` hides above and below.
export function hiddenAround(offset: number, lines: number, rows: number): { above: number; below: number } {
	const at = clampOffset(offset, lines, rows)
	return { above: at, below: Math.max(0, lines - at - rows) }
}

// `↑ N ↓ M` for the lines out of view, only the sides that have some; empty when it all fits.
export function hiddenLabel({ above, below }: { above: number; below: number }): string {
	return [above > 0 ? `↑ ${above}` : '', below > 0 ? `↓ ${below}` : ''].filter(Boolean).join(' ')
}

// A command's text as rows `columns` wide, each line wrapped at the width, so one row is one line of the window; the
// first line after `$ `.
export function wrapLines(command: string, columns: number): string[] {
	const width = Math.max(1, columns)
	return command.split('\n').flatMap((line, index) => {
		const text = index === 0 ? `$ ${line}` : line
		if (text === '') return [' ']
		const rows: string[] = []
		for (let at = 0; at < text.length; at += width) rows.push(text.slice(at, at + width))
		return rows
	})
}
