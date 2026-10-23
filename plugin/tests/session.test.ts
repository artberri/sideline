import { expect, test } from 'claude-code/testing'

import { bar, barWidth, level, modelName, percentLabel, readings } from '../hooks/meter'

test('modelName shortens a model id to its family and version', () => {
	expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
	expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
	expect(modelName('claude-sonnet-4-20250514')).toBe('Sonnet 4')
	expect(modelName('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
	expect(modelName('some-gateway-model')).toBe('some-gateway-model')
})

test('bar fills a share of its cells, clamped at 0 and 100', () => {
	expect(bar(34, 8)).toBe('▰▰▰▱▱▱▱▱')
	expect(bar(-5, 4)).toBe('▱▱▱▱')
	expect(bar(140, 4)).toBe('▰▰▰▰')
})

test('level is plain up to 75%, orange past it, red past 90%', () => {
	expect(level(75)).toBeUndefined()
	expect(level(76)).toBe('warning')
	expect(level(91)).toBe('error')
	expect(level(null)).toBeUndefined()
})

test('readings picks the context and the five-hour and seven-day windows, null when missing', () => {
	const limits = [
		{ kind: 'five_hour', percentUsed: 23.5 },
		{ kind: 'seven_day', percentUsed: 13 },
	]
	expect(readings({ context: { percent: 34 }, rateLimits: limits })).toEqual({
		context: 34,
		fiveHour: 23.5,
		sevenDay: 13,
	})
	expect(readings({ context: {}, rateLimits: [] })).toEqual({ context: null, fiveHour: null, sevenDay: null })
	expect(percentLabel(23.5)).toBe('24%')
	expect(percentLabel(null)).toBe('—')
})

test('barWidth gives the bar what the usage text leaves, never under 3 cells', () => {
	// 46 columns, less `context `, a space, ` · 5h `, ` · 7d ` (21) and the numbers as printed.
	expect(barWidth(46, ['34%', '23%', '13%'])).toBe(16)
	expect(barWidth(46, ['100%', '—', '—'])).toBe(19)
	expect(barWidth(20, ['34%', '23%', '13%'])).toBe(3)
})
