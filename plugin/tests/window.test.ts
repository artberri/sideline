import { expect, test } from 'claude-code/testing'

import { OUTPUT_LINES, cleanOutput, commandOutput, commandStep } from '../hooks/commands'
import {
	changesRows,
	clampOffset,
	commandRows,
	hiddenAround,
	hiddenLabel,
	isOverCommands,
	commandRowsOption,
	commandsBoxRows,
	revealOffset,
	wrapLines,
} from '../hooks/window'

test('changesRows leaves the title, hints, the session box or branch line, borders and commands box out', () => {
	// 40 rows: title 1, hints 2, session box 4, the changes border 2, commands 7.
	expect(changesRows(40, true, true, 7)).toBe(24)
	// Without the session box the branch line and its blank row (2) are in the changes box instead.
	expect(changesRows(40, true, false, 7)).toBe(26)
	expect(changesRows(40, false, true, 7)).toBe(26)
	expect(changesRows(5, true, true, 7)).toBe(1)
	// With no commands box, its 7 rows are the changes box's.
	expect(changesRows(40, true, true, 0)).toBe(31)
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

test('isOverCommands is true on the commands box rows, false above, for a key, and with no box', () => {
	expect(isOverCommands(13, 20, 7)).toBe(true)
	expect(isOverCommands(12, 20, 7)).toBe(false)
	expect(isOverCommands(15, 20, 5)).toBe(true)
	expect(isOverCommands(14, 20, 5)).toBe(false)
	expect(isOverCommands(undefined, 20, 7)).toBe(false)
	expect(isOverCommands(19, 20, 0)).toBe(false)
})

test('commandRowsOption takes a whole number from 0 to 20, else 5', () => {
	expect([5, 0, 20, -1, 21, 2.5, 'x', undefined].map(commandRowsOption)).toEqual([5, 0, 20, 5, 5, 5, 5, 5])
	expect(commandsBoxRows(3)).toBe(5)
	expect(commandsBoxRows(0)).toBe(0)
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

test('cleanOutput drops escapes, overwritten text, tabs and trailing blank lines', () => {
	expect(cleanOutput('\x1b[32mok\x1b[0m\r\n10%\r50%\r100%\na\tb\n\n')).toBe('ok\n100%\na  b')
})

test('cleanOutput keeps the first lines and counts the rest', () => {
	const text = Array.from({ length: OUTPUT_LINES + 3 }, (_, n) => `line ${n}`).join('\n')
	const lines = cleanOutput(text).split('\n')
	expect(lines).toHaveLength(OUTPUT_LINES + 1)
	expect(lines.at(-1)).toBe('… 3 more lines')
})

test('commandOutput reads the streams, a failure as the error text, nothing for a refusal', () => {
	expect(commandOutput({ result: { stdout: 'hi\n', stderr: '', interrupted: false } })).toEqual({
		stdout: 'hi',
		stderr: '',
	})
	expect(commandOutput({ isError: true, result: 'Exit code 1\nnope' })).toEqual({
		stdout: '',
		stderr: 'Exit code 1\nnope',
	})
	expect(commandOutput({ deny: 'no' })).toBeUndefined()
	expect(commandOutput(null)).toBeUndefined()
})

const tones = (rows: { tone: string }[]) => rows.map((row) => row.tone)

test('commandRows puts the output under the command, with a note while it runs or when it printed nothing', () => {
	expect(tones(commandRows('ls', 'done', { stdout: 'a\nb', stderr: 'c' }, 20))).toEqual([
		'command',
		'note',
		'stdout',
		'stdout',
		'stderr',
	])
	expect(commandRows('ls', 'running', undefined, 20).at(-1)?.text).toBe('running…')
	expect(commandRows('ls', 'done', { stdout: '', stderr: '' }, 20).at(-1)?.text).toBe('no output')
	expect(commandRows('ls', 'done', undefined, 20)).toEqual([{ text: '$ ls', tone: 'command' }])
})
