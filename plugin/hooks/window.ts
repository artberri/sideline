import { LOG_SIZE } from './commands'

// The rows the pane spends outside the changes box's content: the title and the box's border.
const CHANGES_CHROME = 1 + 2
// The branch line and the blank row under it, in the changes box when there is no session box.
const BRANCH_ROWS = 2
// The session box: its two lines and its border.
export const SESSION_ROWS = 2 + 2
// The hint line under the title, with the blank row above it.
const HINT_ROWS = 2
// The commands box's lines when the `commandRows` option says nothing usable.
export const COMMAND_ROWS_DEFAULT = 5
const COMMAND_ROWS_MAX = LOG_SIZE

// The `commandRows` option as a number of lines: a whole number from 0 to 20, else the default.
export function commandRowsOption(value: unknown): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= COMMAND_ROWS_MAX
		? value
		: COMMAND_ROWS_DEFAULT
}

// The rows the commands box takes for `lines` lines: those and its border, or none at all when it has no lines.
export function commandsBoxRows(lines: number): number {
	return lines === 0 ? 0 : lines + 2
}

// Whether a wheel tick at body row `row` is over the commands box, the last `boxRows` rows of the pane; a scroll key
// (no row) is not.
export function isOverCommands(row: number | undefined, bodyRows: number, boxRows: number): boolean {
	return row !== undefined && boxRows > 0 && row >= bodyRows - boxRows
}

// How many content rows the changes box shows in a pane `bodyRows` tall; never below one. The session box above it
// takes the branch line out of it.
export function changesRows(bodyRows: number, hasHints: boolean, hasSession: boolean, commandsRows: number): number {
	const above = (hasHints ? HINT_ROWS : 0) + (hasSession ? SESSION_ROWS : BRANCH_ROWS)
	return Math.max(1, bodyRows - CHANGES_CHROME - above - commandsRows)
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

// Text as rows `columns` wide, each line wrapped at the width, so one row is one line of the window; a blank line
// is one row.
function wrapText(text: string, columns: number): string[] {
	const width = Math.max(1, columns)
	return text.split('\n').flatMap((line) => {
		if (line === '') return [' ']
		const rows: string[] = []
		for (let at = 0; at < line.length; at += width) rows.push(line.slice(at, at + width))
		return rows
	})
}

// A command's text as rows `columns` wide, the first line after `$ `.
export function wrapLines(command: string, columns: number): string[] {
	return wrapText(`$ ${command}`, columns)
}

// What a row of an opened command is: the command, its stdout, its stderr (or a failure's error text), the line that
// says it is still running, or a note (a blank row, no output).
export type CommandRowTone = 'command' | 'stdout' | 'stderr' | 'running' | 'note'

export type CommandRow = { text: string; tone: CommandRowTone }

// An opened command's rows: the command, a blank row, then what it printed, stdout before stderr; a note while it runs
// or when it printed nothing. A command logged before sideline kept output shows the command alone.
export function commandRows(
	command: string,
	state: 'running' | 'done' | 'failed',
	output: { stdout: string; stderr: string } | undefined,
	columns: number,
): CommandRow[] {
	const rows = (text: string, tone: CommandRowTone) => wrapText(text, columns).map((row) => ({ text: row, tone }))
	const head = rows(`$ ${command}`, 'command')
	if (state === 'running') return [...head, { text: ' ', tone: 'note' }, ...rows('running…', 'running')]
	if (!output) return head
	const printed = [
		...(output.stdout === '' ? [] : rows(output.stdout, 'stdout')),
		...(output.stderr === '' ? [] : rows(output.stderr, 'stderr')),
	]
	return [...head, { text: ' ', tone: 'note' }, ...(printed.length > 0 ? printed : rows('no output', 'note'))]
}
