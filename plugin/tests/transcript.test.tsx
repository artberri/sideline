import type { On, ToolGroupCall } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { hiddenCommandInput, isLongCommand, runningDescription } from '../hooks/commands'
import { countPatch, fileRow, summarize } from '../hooks/summary'

const CWD = '/repo'

test('summarize counts an Edit patch, relative to the session directory', () => {
	const output = {
		filePath: '/repo/src/a.ts',
		structuredPatch: [{ lines: [' keep', '-old', '+new', '+more'] }],
	}
	expect(summarize('Edit', output, CWD)).toEqual([{ verb: 'Updated', path: 'src/a.ts', added: 2, deleted: 1 }])
})

test('summarize reads a new file from Write as Created with its line count', () => {
	const output = { type: 'create', filePath: '/elsewhere/b.md', content: 'one\ntwo\nthree\n', structuredPatch: [] }
	expect(summarize('Write', output, CWD)).toEqual([{ verb: 'Created', path: '/elsewhere/b.md', added: 3 }])
})

test('summarize lists each file a Bash command changed', () => {
	const output = {
		stdout: '',
		bashEditDiff: {
			moreFiles: 0,
			files: [
				{ filePath: '/repo/a.ts', hunks: [{ lines: ['+x', '-y'] }] },
				{ filePath: '/repo/new.ts', created: true, hunks: [{ lines: ['+1', '+2'] }] },
				{ filePath: '/repo/gone.ts', deleted: true, hunks: [{ lines: ['-1'] }] },
			],
		},
	}
	expect(summarize('Bash', output, CWD)).toEqual([
		{ verb: 'Updated', path: 'a.ts', added: 1, deleted: 1 },
		{ verb: 'Created', path: 'new.ts', added: 2 },
		{ verb: 'Deleted', path: 'gone.ts', added: 0, deleted: 1 },
	])
})

test('summarize leaves results with nothing to summarize to the engine', () => {
	expect(summarize('Bash', { stdout: 'hi' }, CWD)).toBeUndefined()
	expect(summarize('Read', { filePath: '/repo/a.ts' }, CWD)).toBeUndefined()
	expect(countPatch([])).toEqual({ added: 0, deleted: 0 })
})

const EDIT_OUTPUT = {
	filePath: '/repo/src/a.ts',
	oldString: 'old',
	newString: 'new',
	originalFile: 'old\n',
	structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-old', '+new'] }],
	userModified: false,
	replaceAll: false,
}

function world(on: On) {
	on('session.cwd', () => ({ value: CWD }))
	on('ui.render', ($, e) => {
		const { Text } = $.ui.resolve(e)
		return <Text>engine diff</Text>
	})
}

async function drawnResult(
	$: Engine,
	tool: string,
	output: unknown,
	extra: { isExpanded?: boolean; isErrored?: boolean } = {},
) {
	const ui = await $.ui.mount({
		plugin: 'sideline',
		surface: 'terminal',
		component: 'ToolResult',
		requestId: 'toolu_1',
		props: {
			tool_use_id: 'toolu_1',
			tool,
			output,
			isErrored: extra.isErrored ?? false,
			isExpanded: extra.isExpanded ?? false,
		},
	})
	const text = JSON.stringify(await ui.drawn())
	await ui.unmount()
	return text
}

test('an Edit result draws nothing: its row carries the counts', async ($, on) => {
	world(on)
	const text = await drawnResult($, 'Edit', EDIT_OUTPUT)
	expect(text).not.toContain('src/a.ts')
	expect(text).not.toContain('engine diff')
})

test('each file a Bash command changed gets its own gutter', async ($, on) => {
	world(on)
	const output = {
		stdout: '',
		stderr: '',
		interrupted: false,
		bashEditDiff: {
			moreFiles: 0,
			files: [
				{
					filePath: '/repo/a.ts',
					hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['+x', '-y'] }],
				},
				{
					filePath: '/repo/b.ts',
					hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['+z'] }],
				},
			],
		},
	}
	expect((await drawnResult($, 'Bash', output)).split('  ⎿  ').length - 1).toBe(2)
})

test('a Bash result without file changes draws the engine row', async ($, on) => {
	world(on)
	expect(await drawnResult($, 'Bash', { stdout: 'hi', stderr: '', interrupted: false })).toContain('engine diff')
})

test('ctrl+o shows the engine diff', async ($, on) => {
	world(on)
	expect(await drawnResult($, 'Edit', EDIT_OUTPUT, { isExpanded: true })).toContain('engine diff')
})

test('transcriptDiffs: show keeps the engine diff', { options: { transcriptDiffs: 'show' } }, async ($, on) => {
	world(on)
	expect(await drawnResult($, 'Edit', EDIT_OUTPUT)).toContain('engine diff')
})

const LONG = "python3 - <<'EOF'\np='hooks/symbols.ts'; s=open(p).read()\nEOF"
const DESCRIPTION = 'Adding hover underline to file rows'

test('isLongCommand is true for a newline or past 80 characters', () => {
	expect(isLongCommand('git status')).toBe(false)
	expect(isLongCommand('x'.repeat(80))).toBe(false)
	expect(isLongCommand('x'.repeat(81))).toBe(true)
	expect(isLongCommand('a\nb')).toBe(true)
})

test('hiddenCommandInput puts the description in the command place', () => {
	expect(hiddenCommandInput({ command: LONG, description: DESCRIPTION, timeout: 5000 })).toEqual({
		command: DESCRIPTION,
		timeout: 5000,
	})
	expect(hiddenCommandInput({ command: 'git status', description: 'Show status' })).toBeUndefined()
	expect(hiddenCommandInput({ command: LONG })).toBeUndefined()
	expect(hiddenCommandInput({ command: LONG, description: '  ' })).toBeUndefined()
})

// The engine's row, standing in for Claude Code's: it shows the input it was handed.
function commandWorld(on: On) {
	on('ui.render', { component: 'ToolUse' }, ($, e) => {
		const { Text } = $.ui.resolve(e)
		return <Text>{`engine ${JSON.stringify(e.props.input)}`}</Text>
	})
}

type RowState = { isRunning?: boolean; isErrored?: boolean; isInterrupted?: boolean; isExpanded?: boolean }

async function drawnRow($: Engine, input: unknown, state: RowState = {}) {
	const ui = await $.ui.mount({
		plugin: 'sideline',
		surface: 'terminal',
		component: 'ToolUse',
		requestId: 'toolu_1',
		props: {
			tool_use_id: 'toolu_1',
			tool: 'Bash',
			input,
			isRunning: state.isRunning ?? false,
			isErrored: state.isErrored ?? false,
			isInterrupted: state.isInterrupted ?? false,
			isExpanded: state.isExpanded ?? false,
		},
	})
	const text = JSON.stringify(await ui.drawn())
	await ui.unmount()
	return text
}

const described = { command: LONG, description: DESCRIPTION }

test('a finished long described Bash row draws the description, not the command', async ($, on) => {
	commandWorld(on)
	const text = await drawnRow($, described)
	expect(text).toContain(DESCRIPTION)
	expect(text).not.toContain('python3')
})

test('a running long described Bash row draws no command', async ($, on) => {
	commandWorld(on)
	expect(await drawnRow($, described, { isRunning: true })).not.toContain('python3')
})

test('a short command, or one without a description, keeps its row', async ($, on) => {
	commandWorld(on)
	expect(await drawnRow($, { command: 'git status', description: 'Show status' })).toContain('git status')
	expect(await drawnRow($, { command: LONG })).toContain('python3')
})

test('an errored or interrupted row keeps its command', async ($, on) => {
	commandWorld(on)
	expect(await drawnRow($, described, { isErrored: true })).toContain('python3')
	expect(await drawnRow($, described, { isInterrupted: true })).toContain('python3')
})

test('ctrl+o shows the command', async ($, on) => {
	commandWorld(on)
	expect(await drawnRow($, described, { isExpanded: true })).toContain('python3')
})

test('transcriptCommands: show keeps the command', { options: { transcriptCommands: 'show' } }, async ($, on) => {
	commandWorld(on)
	expect(await drawnRow($, described)).toContain('python3')
})

const longCall = { tool: 'Bash', input: described, isRunning: true, isErrored: false, isInterrupted: false }

function groupWorld(on: On) {
	on('ui.render', { component: 'ToolGroup' }, ($, e) => {
		const { Text } = $.ui.resolve(e)
		return <Text>{`engine group ${JSON.stringify(e.props.calls.map((call) => call.input))}`}</Text>
	})
}

type GroupState = { isActive?: boolean; isExpanded?: boolean; isCallsOnly?: boolean }

async function drawnGroup($: Engine, calls: ToolGroupCall[], state: GroupState = {}) {
	const ui = await $.ui.mount({
		plugin: 'sideline',
		surface: 'terminal',
		component: 'ToolGroup',
		props: {
			calls,
			isActive: state.isActive ?? true,
			isExpanded: state.isExpanded ?? false,
			isCallsOnly: state.isCallsOnly ?? true,
		},
	})
	const text = JSON.stringify(await ui.drawn())
	await ui.unmount()
	return text
}

test('runningDescription reads the running call, else the last one', () => {
	const done = { ...longCall, isRunning: false }
	const read = { ...longCall, tool: 'Read', input: { file_path: '/repo/a.ts' } }
	expect(runningDescription([longCall])).toBe(DESCRIPTION)
	expect(runningDescription([done])).toBe(DESCRIPTION)
	expect(runningDescription([longCall, { ...read, isRunning: false }])).toBe(DESCRIPTION)
	expect(runningDescription([done, read])).toBeUndefined()
	expect(runningDescription([])).toBeUndefined()
	expect(runningDescription([{ ...longCall, tool: 'Read' }])).toBeUndefined()
	expect(runningDescription([{ ...longCall, input: { command: 'ls', description: 'List' } }])).toBe('List')
	expect(runningDescription([{ ...longCall, input: { command: LONG } }])).toBeUndefined()
})

test('a live group running a long described command draws the description, not the command', async ($, on) => {
	groupWorld(on)
	const text = await drawnGroup($, [longCall])
	expect(text).toContain(DESCRIPTION)
	expect(text).not.toContain('python3')
})

test('a live group draws the description before its call runs and after it ends', async ($, on) => {
	groupWorld(on)
	expect(await drawnGroup($, [{ ...longCall, isRunning: false }])).toContain(DESCRIPTION)
})

test('runningDescription keeps the previous description while a call is still being written', () => {
	const writing = { ...longCall, isRunning: false, input: {} }
	expect(runningDescription([writing], 'Earlier step')).toBe('Earlier step')
	expect(runningDescription([writing])).toBeUndefined()
	expect(runningDescription([{ ...longCall, input: { command: LONG } }], 'Earlier step')).toBeUndefined()
})

test('a live group keeps the last description while the next command is written', async ($, on) => {
	groupWorld(on)
	expect(await drawnGroup($, [longCall])).toContain(DESCRIPTION)
	const text = await drawnGroup($, [{ ...longCall, isRunning: false, input: {} }])
	expect(text).toContain(DESCRIPTION)
	expect(text).not.toContain('engine group')
})

test('a finished group draws nothing', async ($, on) => {
	groupWorld(on)
	const text = await drawnGroup($, [{ ...longCall, isRunning: false }], { isActive: false })
	expect(text).not.toContain('engine group')
	expect(text).not.toContain(DESCRIPTION)
})

test('a finished group that loaded a CLAUDE.md or ran a hook keeps the engine line', async ($, on) => {
	groupWorld(on)
	const done = { ...longCall, isRunning: false }
	expect(await drawnGroup($, [done], { isActive: false, isCallsOnly: false })).toContain('engine group')
	expect(await drawnGroup($, [done], { isActive: false, isExpanded: true })).toContain('engine group')
})

test('a finished group with a failed or interrupted call draws nothing either', async ($, on) => {
	groupWorld(on)
	const failed = { ...longCall, isRunning: false, isErrored: true }
	const cut = { ...longCall, isRunning: false, isInterrupted: true }
	expect(await drawnGroup($, [failed], { isActive: false, isCallsOnly: false })).not.toContain('engine group')
	expect(await drawnGroup($, [cut], { isActive: false, isCallsOnly: false })).not.toContain('engine group')
})

test('a live group running a Read draws the engine line', async ($, on) => {
	groupWorld(on)
	const read = { ...longCall, tool: 'Read', input: { file_path: '/repo/a.ts' } }
	expect(await drawnGroup($, [read])).toContain('engine group')
})

test('a live group with a failed call still draws the description, not the command', async ($, on) => {
	groupWorld(on)
	const text = await drawnGroup($, [{ ...longCall, isRunning: false, isErrored: true }, longCall])
	expect(text).toContain(DESCRIPTION)
	expect(text).not.toContain('python3')
})

test('a live group that loaded a CLAUDE.md or ran a hook still hides the command', async ($, on) => {
	groupWorld(on)
	const text = await drawnGroup($, [longCall], { isCallsOnly: false })
	expect(text).toContain(DESCRIPTION)
	expect(text).not.toContain('python3')
})

test('a live group hides a short described command too', async ($, on) => {
	groupWorld(on)
	const short = { ...longCall, input: { command: 'grep -n x a.ts', description: 'Find the x' } }
	const text = await drawnGroup($, [short])
	expect(text).toContain('Find the x')
	expect(text).not.toContain('grep')
})

test('a live group running an undescribed command draws the engine line', async ($, on) => {
	groupWorld(on)
	expect(await drawnGroup($, [{ ...longCall, input: { command: LONG } }])).toContain('engine group')
})

test('ctrl+o draws the engine group line', async ($, on) => {
	groupWorld(on)
	expect(await drawnGroup($, [longCall], { isExpanded: true })).toContain('engine group')
})

test(
	'transcriptCommands: show draws the engine group line',
	{ options: { transcriptCommands: 'show' } },
	async ($, on) => {
		groupWorld(on)
		expect(await drawnGroup($, [longCall])).toContain('engine group')
		expect(await drawnGroup($, [longCall], { isActive: false })).toContain('engine group')
	},
)

const ANSWERS = {
	questions: [{ question: 'Which footer?', header: 'Footer', options: [{ label: 'Running' }], multiSelect: false }],
	answers: { 'Which footer?': 'Only while running' },
	annotations: { 'Which footer?': { notes: 'keep it short' } },
}

// The engine's answers row, standing in for Claude Code's: it shows the questions and answers it was handed.
function answersWorld(on: On) {
	on('session.cwd', () => ({ value: CWD }))
	on('ui.render', { component: 'ToolResult' }, ($, e) => {
		const { Text } = $.ui.resolve(e)
		return <Text>{`User answered Claude's questions: ${JSON.stringify(e.props.output)}`}</Text>
	})
}

test('the answers row keeps its header without the questions', async ($, on) => {
	answersWorld(on)
	const text = await drawnResult($, 'AskUserQuestion', ANSWERS)
	expect(text).toContain("● User answered Claude's questions")
	expect(text).not.toContain('Which footer?')
	expect(text).not.toContain('Only while running')
})

test('ctrl+o shows the answers', async ($, on) => {
	answersWorld(on)
	expect(await drawnResult($, 'AskUserQuestion', ANSWERS, { isExpanded: true })).toContain('Only while running')
})

test('transcriptCommands: show keeps the answers', { options: { transcriptCommands: 'show' } }, async ($, on) => {
	answersWorld(on)
	expect(await drawnResult($, 'AskUserQuestion', ANSWERS)).toContain('Only while running')
})

const WRITE_OUTPUT = { type: 'create', filePath: '/repo/b.md', content: 'one\ntwo\nthree\n', structuredPatch: [] }

test('fileRow titles a finished Edit as Update and a Write as Write, with one file', () => {
	expect(fileRow('Edit', EDIT_OUTPUT, CWD)).toEqual({
		name: 'Update',
		summary: { verb: 'Updated', path: 'src/a.ts', added: 1, deleted: 1 },
	})
	expect(fileRow('Write', WRITE_OUTPUT, CWD)).toEqual({
		name: 'Write',
		summary: { verb: 'Created', path: 'b.md', added: 3 },
	})
	expect(fileRow('Bash', { stdout: '' }, CWD)).toBeUndefined()
	expect(fileRow('Edit', undefined, CWD)).toBeUndefined()
})

async function drawnFileRow($: Engine, tool: string, output: unknown, state: RowState = {}) {
	const ui = await $.ui.mount({
		plugin: 'sideline',
		surface: 'terminal',
		component: 'ToolUse',
		requestId: 'toolu_1',
		props: {
			tool_use_id: 'toolu_1',
			tool,
			input: { file_path: '/repo/src/a.ts' },
			output,
			isRunning: state.isRunning ?? false,
			isErrored: state.isErrored ?? false,
			isInterrupted: state.isInterrupted ?? false,
			isExpanded: state.isExpanded ?? false,
		},
	})
	const text = JSON.stringify(await ui.drawn())
	await ui.unmount()
	return text
}

test('a finished Edit row draws Update(path) with its counts on the same line', async ($, on) => {
	world(on)
	commandWorld(on)
	const text = await drawnFileRow($, 'Edit', EDIT_OUTPUT)
	expect(text).toContain('Update')
	expect(text).toContain('(src/a.ts) ')
	expect(text).toContain('(+1 -1)')
	expect(text).not.toContain('engine')
})

test('a finished Write that created a file draws Write(path) (+N)', async ($, on) => {
	world(on)
	commandWorld(on)
	const text = await drawnFileRow($, 'Write', WRITE_OUTPUT)
	expect(text).toContain('(b.md) ')
	expect(text).toContain('(+3)')
})

test('a running, errored or expanded Edit row is the engine row', async ($, on) => {
	world(on)
	commandWorld(on)
	expect(await drawnFileRow($, 'Edit', undefined, { isRunning: true })).toContain('engine')
	expect(await drawnFileRow($, 'Edit', 'File has not been read yet', { isErrored: true })).toContain('engine')
	expect(await drawnFileRow($, 'Edit', EDIT_OUTPUT, { isExpanded: true })).toContain('engine')
})

test('transcriptDiffs: show keeps the engine Edit row', { options: { transcriptDiffs: 'show' } }, async ($, on) => {
	world(on)
	commandWorld(on)
	expect(await drawnFileRow($, 'Edit', EDIT_OUTPUT)).toContain('engine')
})
