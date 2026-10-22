import { expect, test } from 'claude-code/testing'

import { commandStep } from '../hooks/commands'
import {
	changesRows,
	clampOffset,
	hiddenAround,
	hiddenLabel,
	isOverCommands,
	revealOffset,
	wrapLines,
} from '../hooks/window'

test('changesRows leaves the title, hints, the session box or branch line, borders and commands box out', () => {
	// 40 rows: title 1, hints 2, session box 4, the changes border 2, commands 7.
	expect(changesRows(40, true, true)).toBe(24)
	// Without the session box the branch line and its blank row (2) are in the changes box instead.
	expect(changesRows(40, true, false)).toBe(26)
	expect(changesRows(40, false, true)).toBe(26)
	expect(changesRows(5, true, true)).toBe(1)
})

test('clampOffset keeps the window inside the content', () => {
	expect(clampOffset(-3, 50, 10)).toBe(0)
	expect(clampOffset(45, 50, 10)).toBe(40)
	expect(clampOffset(12, 50, 10)).toBe(12)
	expect(clampOffset(5, 4, 10)).toBe(0)
})

test('hiddenLabel counts the lines above and below, only the sides that have some', () => {
	expect(hiddenLabel(hiddenAround(0, 50, 10))).toBe('↓ 40')
	expect(hiddenLabel(hiddenAround(4, 50, 10))).toBe('↑ 4 ↓ 36')
	expect(hiddenLabel(hiddenAround(40, 50, 10))).toBe('↑ 40')
	expect(hiddenLabel(hiddenAround(0, 4, 10))).toBe('')
})

test('isOverCommands is true on the last seven rows, false above and for a key', () => {
	expect(isOverCommands(13, 20)).toBe(true)
	expect(isOverCommands(12, 20)).toBe(false)
	expect(isOverCommands(undefined, 20)).toBe(false)
})

test('wrapLines puts $ before the first line and wraps each line at the width', () => {
	expect(wrapLines('echo hi\n\n' + 'x'.repeat(12), 5)).toEqual(['$ ech', 'o hi', ' ', 'xxxxx', 'xxxxx', 'xx'])
})

test('revealOffset moves the window just enough to show the line', () => {
	expect(revealOffset(0, 3, 5)).toBe(0)
	expect(revealOffset(0, 5, 5)).toBe(1)
	expect(revealOffset(4, 2, 5)).toBe(2)
})

test('commandStep moves j/k through the log, stopping at the ends; l opens and h leaves', () => {
	const ids = ['one', 'two', 'three']
	expect(commandStep(ids, 'three', 'up')).toEqual({ kind: 'focus', id: 'two' })
	expect(commandStep(ids, 'two', 'down')).toEqual({ kind: 'focus', id: 'three' })
	expect(commandStep(ids, 'three', 'down')).toBeNull()
	expect(commandStep(ids, 'one', 'up')).toBeNull()
	expect(commandStep(ids, 'two', 'open')).toEqual({ kind: 'open' })
	expect(commandStep(ids, 'two', 'leave')).toEqual({ kind: 'leave' })
})
