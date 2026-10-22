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

type GroupCall = { tool: string; input: unknown; isRunning: boolean }

// The description a live group's line shows in place of its current Bash call's long command; `undefined` when the
// engine's own line is fine (another tool, a short or undescribed command). The current call is the running one, else
// the last: a call is not running yet as the group appears, nor any more just before the group folds.
export function runningDescription(calls: readonly GroupCall[]): string | undefined {
	const running = [...calls].reverse().find((call) => call.isRunning) ?? calls.at(-1)
	if (!running || running.tool !== 'Bash') return undefined
	const described = describedCommand(running.input)
	return described && isLongCommand(described.command) ? described.description : undefined
}
