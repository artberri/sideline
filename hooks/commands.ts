// A command longer than this, or on more than one line, is hidden behind its description.
export const LONG_COMMAND = 80

export type DescribedCommand = { command: string; description: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const isLongCommand = (command: string) => command.includes('\n') || command.length > LONG_COMMAND

// A Bash input's command and the model's own description of it; `undefined` without a description, since vacuo never
// makes one up.
export function describedCommand(input: unknown): DescribedCommand | undefined {
	if (!isRecord(input) || typeof input.command !== 'string' || typeof input.description !== 'string') return undefined
	const description = input.description.trim()
	return description === '' ? undefined : { command: input.command, description }
}

// The input a Bash row is drawn from with its command hidden: the description in the command's place, so the engine
// draws `Bash(<description>)` and no `$ command` line. `undefined` when the row keeps its command.
export function hiddenCommandInput(input: unknown): Record<string, unknown> | undefined {
	const described = describedCommand(input)
	if (!isRecord(input) || !described || !isLongCommand(described.command)) return undefined
	const { description: _, ...rest } = input
	return { ...rest, command: described.description }
}

type GroupCall = { tool: string; input: unknown; isRunning: boolean }

// The description a live group's line shows in place of its current Bash call's command; `undefined` for another tool
// or an undescribed command. Any length: under its line the engine prints the turn's latest command, even one that
// isn't in the group. The current call is the running one, else the last: a call is not running yet as the group
// appears, nor any more just before the group folds.
export function runningDescription(calls: readonly GroupCall[]): string | undefined {
	const running = [...calls].reverse().find((call) => call.isRunning) ?? calls.at(-1)
	if (!running || running.tool !== 'Bash') return undefined
	return describedCommand(running.input)?.description
}

// At most this many of a running command's lines show at the bottom of the pane.
export const FOOTER_LINES = 3

// A running command as the pane's footer draws it: up to FOOTER_LINES non-blank lines, the first after `$ `, each cut
// to `columns` with an ellipsis, and a last line saying how many more there are.
export function commandLines(command: string, columns: number): string[] {
	const lines = command
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter((line) => line !== '')
	const cut = (line: string) => (line.length > columns ? `${line.slice(0, Math.max(columns - 1, 0))}…` : line)
	const shown = lines.slice(0, FOOTER_LINES).map((line, index) => cut(index === 0 ? `$ ${line}` : `  ${line}`))
	const more = lines.length - shown.length
	return more > 0 ? [...shown, cut(`  … ${more} more line${more === 1 ? '' : 's'}`)] : shown
}
