const capital = (family: string) => family.charAt(0).toUpperCase() + family.slice(1).toLowerCase()

// A model id as the session box shows it: `claude-opus-5-5` is `Opus 5.5`, `claude-3-5-sonnet-20241022` is
// `Sonnet 3.5`, and a 1M-context id (`[1m]`, `-1m`) gains ` 1M`; any other id stays as it is.
export function modelName(id: string): string {
	const big = /\[1m\]|-1m\b/i.test(id) ? ' 1M' : ''
	const current = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?!\d)/i.exec(id)
	if (current?.[1] && current[2])
		return `${capital(current[1])} ${current[2]}${current[3] ? `.${current[3]}` : ''}${big}`
	const older = /claude-(\d+)(?:-(\d))?-([a-z]+)/i.exec(id)
	if (older?.[1] && older[3]) return `${capital(older[3])} ${older[1]}${older[2] ? `.${older[2]}` : ''}${big}`
	return id
}

// A percentage as a bar of `width` cells, `▰` used and `▱` left, clamped to 0..100.
export function bar(percent: number, width: number): string {
	const used = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
	return '▰'.repeat(used) + '▱'.repeat(width - used)
}

// The colour a usage percentage reads in: plain up to 75%, orange past it, red past 90%.
export function level(percent: number | null): 'warning' | 'error' | undefined {
	if (percent === null || percent <= 75) return undefined
	return percent > 90 ? 'error' : 'warning'
}

type Readings = { context: { percent?: number }; rateLimits: readonly { kind: string; percentUsed: number }[] }

// The context used and the 5-hour and 7-day usage out of a usage reading, each null when it doesn't say.
export function readings({ context, rateLimits }: Readings): {
	context: number | null
	fiveHour: number | null
	sevenDay: number | null
} {
	const limit = (kind: string) => rateLimits.find((one) => one.kind === kind)?.percentUsed ?? null
	return { context: context.percent ?? null, fiveHour: limit('five_hour'), sevenDay: limit('seven_day') }
}

// A percentage as the session box prints it: whole, or `—` before anything reported it.
export const percentLabel = (percent: number | null) => (percent === null ? '—' : `${Math.round(percent)}%`)

// The usage line's parts: `context`, then the 5h and 7d windows after a middle dot.
export const USAGE_LABEL = 'context '
export const USAGE_SEPARATOR = ' · '

// What the usage line spends besides the bar and its numbers: `context `, a space, then ` · 5h ` and ` · 7d `.
const USAGE_TEXT = USAGE_LABEL.length + 1 + 2 * (USAGE_SEPARATOR.length + '5h '.length)

// The context bar's width on a line `columns` wide holding `numbers` as printed: whatever the text leaves, so the line
// ends at the box's right edge, never under 3 cells.
export function barWidth(columns: number, numbers: readonly string[]): number {
	return Math.max(3, columns - USAGE_TEXT - numbers.reduce((sum, number) => sum + number.length, 0))
}
