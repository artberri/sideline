import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { countPatch, summarize } from '../hooks/summary'

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
		plugin: 'vacuo',
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

test('an Edit result draws one summary line instead of the diff', async ($, on) => {
	world(on)
	const text = await drawnResult($, 'Edit', EDIT_OUTPUT)
	expect(text).toContain('  ⎿  ')
	expect(text).toContain('Updated ')
	expect(text).toContain('src/a.ts')
	expect(text).toContain(' (+1 -1)')
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
