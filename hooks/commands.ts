// A command longer than this, or on more than one line, is hidden behind its description.
export const LONG_COMMAND = 80

export type DescribedCommand = { command: string; description: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const isLongCommand = (command: string) => command.includes('\n') || command.length > LONG_COMMAND

// A Bash input's command and the model's own description of it; `undefined` without a description, since sideline never
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
// appears, nor any more just before the group folds. While the model is still writing the call its input is empty,
// and the engine shows the previous description with the previous command, so `previous` stands in.
export function runningDescription(calls: readonly GroupCall[], previous?: string): string | undefined {
	const running = calls.toReversed().find((call) => call.isRunning) ?? calls.at(-1)
	if (!running || running.tool !== 'Bash') return undefined
	const isStreaming = isRecord(running.input) && running.input.command === undefined
	return isStreaming ? previous : describedCommand(running.input)?.description
}

// The pane's log keeps this many commands, the newest last.
export const LOG_SIZE = 5

// A command as one line of the log: its first non-blank line with whitespace squeezed, after `$ `, cut to `columns`
// with an ellipsis; a script with more lines ends in one too.
export function logLine(command: string, columns: number): string {
	const lines = command
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter((line) => line !== '')
	const line = `$ ${lines[0] ?? ''}${lines.length > 1 ? ' …' : ''}`
	return line.length > columns ? `${line.slice(0, Math.max(columns - 1, 0))}…` : line
}

export type CommandMove = 'down' | 'up' | 'open' | 'leave'

// What a key does while the focus ring is on the log line `current`: j/k move it to the next or previous command,
// stopping at the ends; l opens the command; h leaves the box. `ids` are oldest first.
export function commandStep(
	ids: readonly string[],
	current: string,
	move: CommandMove | null,
): { kind: 'focus'; id: string } | { kind: 'open' } | { kind: 'leave' } | null {
	if (move === 'open' || move === 'leave') return { kind: move }
	if (move === null) return null
	const target = ids[ids.indexOf(current) + (move === 'down' ? 1 : -1)]
	return target === undefined ? null : { kind: 'focus', id: target }
}
