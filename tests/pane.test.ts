import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import { logLine } from '../hooks/commands'
import { cutDiff } from '../hooks/rows'
import type { Engine } from 'claude-code/testing'

type World = {
	status?: string
	numstat?: string
	untracked?: Record<string, string>
	hasStash?: boolean
	hasNerdFont?: boolean
	tool?: () => unknown
	diffs?: Record<string, string>
	ran?: string[][]
	surfaces?: ('terminal' | 'desktop' | 'vscode' | 'mobile')[]
	log?: string
	logExit?: number
}

const PANE = {
	plugin: 'sideline',
	component: 'Pane',
	requestId: 'sideline',
	props: {
		title: 'Changes',
		isFocused: false,
		bodyColumns: 40,
		placement: 'dock',
		scroll: { offset: 0, bodyRows: 60 },
		view: {},
	},
} as const

const STATUS = [
	'# branch.oid 0123456789abcdef',
	'# branch.head main',
	'1 M. N... 100644 100644 100644 a a staged.ts',
	'1 .M N... 100644 100644 100644 a a modified.ts',
	'? fresh.ts',
	'',
].join('\0')

const done = (exitCode: number, stdout = '') => ({
	value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

function world(on: On, w: World, opens: string[]) {
	const clock = mock.clock(on, { now: 1_800_000_000_000 })
	on('session.start', (_, e) => ({ cwd: e.cwd }))
	on('session.cwd', () => ({ value: '/repo' }))
	on('session.surfaces', () => ({ value: w.surfaces ?? ['terminal'] }))
	on('session.model', () => ({ value: 'claude-opus-5-5' }))
	on('command.register', () => ({ value: { command: 'sideline' } }))
	on('ui.open', (_, e) => {
		opens.push(e.id)
		return { value: { isPlaced: true } }
	})
	on('process.run', (_, e) => {
		const argv = [...e.argv]
		if (argv[0] === 'sh') return done(0, w.hasNerdFont ? 'nerd\n' : 'plain\n')
		if (argv.includes('status')) return w.status === undefined ? done(128) : done(0, w.status)
		if (argv.includes('refs/stash')) return done(w.hasStash ? 0 : 1)
		if (argv.includes('--show-toplevel')) return done(0, '/repo\n')
		w.ran?.push(argv)
		if (argv.includes('log')) return done(w.logExit ?? 0, w.log ?? '')
		if (argv.includes('diff') && !argv.includes('--numstat')) return done(0, w.diffs?.[argv.at(-1) ?? ''] ?? '')
		if (argv.includes('--no-index')) return done(1, w.untracked?.[argv.at(-1) ?? ''] ?? '')
		if (argv.includes('diff')) return done(0, w.numstat ?? '')
		return done(0)
	})
	on('tool.call', () => (w.tool?.() ?? { result: {} }) as { result: Record<string, never> })
	on('turn.start', (_, e) => ({ turnId: e.turnId }))
	on('turn.complete', () => ({ text: '' }))
	return clock
}

async function drawn($: Engine, surface: 'terminal' | 'desktop') {
	const ui = await $.ui.mount({ ...PANE, surface })
	const text = JSON.stringify(await ui.drawn()) + JSON.stringify(await ui.drawn({ in: 'rows' }).catch(() => null))
	await ui.unmount()
	return text
}

test('the pane opens at session start and again on /sideline', async ($, on) => {
	const opens: string[] = []
	world(on, { status: STATUS }, opens)
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(opens).toEqual(['sideline'])
	await $.command.run({
		command: 'sideline',
		args: '',
		origin: { kind: 'composer' },
		presentation: { isFullscreen: true, columns: 160 },
	})
	expect(opens).toEqual(['sideline', 'sideline'])
})

test('the header shows the branch and starship symbols, on every surface', async ($, on) => {
	world(on, { status: STATUS, hasStash: true }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	for (const surface of ['terminal', 'desktop'] as const) {
		const text = await drawn($, surface)
		expect(text).toContain('⎇ main')
		expect(text).toContain(' [$!+?]')
	}
})

test('outside a git repo the header says so', async ($, on) => {
	world(on, {}, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(await drawn($, 'terminal')).toContain('not a git repo')
})

test('glyphs: auto uses the Nerd Font branch icon when one is installed', async ($, on) => {
	world(on, { status: STATUS, hasNerdFont: true }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(await drawn($, 'terminal')).toContain('\u{e0a0} main')
})

test('glyphs: plain forces the plain icon', { options: { glyphs: 'plain' } }, async ($, on) => {
	world(on, { status: STATUS, hasNerdFont: true }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(await drawn($, 'terminal')).toContain('⎇ main')
})

test('glyphs: nerd forces the Nerd Font icon', { options: { glyphs: 'nerd' } }, async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(await drawn($, 'terminal')).toContain('\u{e0a0} main')
})

test('background paints the pane with the given color', { options: { background: '#1e2030' } }, async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(await drawn($, 'terminal')).toContain('"backgroundColor":"#1e2030"')
})

test(
	'an empty or invalid background leaves the pane to Claude Code',
	{ options: { background: 'navy' } },
	async ($, on) => {
		world(on, { status: STATUS }, [])
		await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
		expect(await drawn($, 'terminal')).not.toContain('backgroundColor')
	},
)

const NESTED = [
	'# branch.oid 0123456789abcdef',
	'# branch.head main',
	'1 .M N... 100644 100644 100644 a a .ai/plans/plan.md',
	'1 .D N... 100644 100644 000000 a a src/gone.ts',
	'1 .M N... 100644 100644 100644 a a src/logo.png',
	'2 R. N... 100644 100644 100644 a a R100 src/new.ts',
	'src/old.ts',
	'? src/fresh.ts',
	'',
].join('\0')

const NESTED_NUMSTAT = [
	'3\t1\t.ai/plans/plan.md',
	'0\t5\tsrc/gone.ts',
	'-\t-\tsrc/logo.png',
	'0\t0\t',
	'src/old.ts',
	'src/new.ts',
	'',
].join('\0')

test('the tree lists changed files under compacted folders, with counts and status colors', async ($, on) => {
	world(
		on,
		{ status: NESTED, numstat: NESTED_NUMSTAT, untracked: { 'src/fresh.ts': '4\t0\t\0/dev/null\0src/fresh.ts\0' } },
		[],
	)
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const text = async (re: RegExp) => (await ui.find({ type: 'Text', text: re, in: 'rows' }))?.text
	expect(await text(/\.ai\/plans\//)).toContain('.ai/plans/')
	expect(await text(/plan\.md/)).toContain('  · plan.md')
	expect(await text(/^src\/$/)).toBe('src/')
	const tree = JSON.stringify(await ui.drawn({ in: 'rows' }))
	expect(tree).toContain('" +3"')
	expect(tree).toContain('" -1"')
	expect(tree).toContain('" +4"')
	expect(tree).toContain('" -5"')
	expect(tree).toContain('" bin"')
	const gone = await ui.find({ type: 'Text', text: /^gone\.ts$/, in: 'rows' })
	expect(gone?.props).toMatchObject({ strikethrough: true })
	expect(gone?.props.color).toBeUndefined()
	const iconColors = (await ui.findAll({ type: 'Text', text: /^· $/, in: 'rows' })).map((icon) => icon.props.color)
	expect(iconColors).toEqual(['warning', 'success', 'error', 'warning', 'blue'])
	await ui.unmount()
})

test('a Write is followed by a refresh that shows the new file', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(await drawn($, 'terminal')).not.toContain('written.ts')
	w.status = STATUS.replace('? fresh.ts', '? fresh.ts\0? written.ts')
	await $.tool.call({ tool: 'Write', file_path: '/repo/written.ts', content: 'x' })
	await clock.settle()
	expect(await drawn($, 'terminal')).toContain('written.ts')
})

type Child = { props?: { color?: string } }

// What a file's row shows: the shimmer paints its icon in Claude's color, the flash paints only its name in it.
async function litOf($: Engine, name: string): Promise<'running' | 'done' | null | 'absent'> {
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const escaped = name.replaceAll('.', '\\.')
	const row = await ui.find({ type: 'Text', text: new RegExp(`^\\s*\\S+ ${escaped}$`), in: 'rows' })
	await ui.unmount()
	if (!row) return 'absent'
	const [, icon, label] = (row.children ?? []) as Child[]
	if (icon?.props?.color === 'claude') return 'running'
	if (label?.props?.color === 'claude') return 'done'
	return null
}

const ignore = (): void => undefined

// Holds the next tool call open until the returned function answers it.
function held(w: World) {
	let release: (answer: unknown) => void = ignore
	w.tool = () => new Promise((resolve) => (release = resolve))
	return (answer: unknown) => release(answer)
}

test('a quick edit shimmers for a moment, then flashes once and settles', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const finish = held(w)
	const call = $.tool.call({ tool: 'Edit', file_path: '/repo/modified.ts', old_string: 'a', new_string: 'b' })
	await clock.settle()
	expect(await litOf($, 'modified.ts')).toBe('running')
	finish({ result: {} })
	await call
	await clock.settle()
	expect(await litOf($, 'modified.ts')).toBe('running')
	await clock.advance(1_200)
	expect(await litOf($, 'modified.ts')).toBe('done')
	await clock.advance(1_600)
	expect(await litOf($, 'modified.ts')).toBeNull()
})

test('files a Bash command changed shimmer and flash too', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	w.tool = () => ({
		result: {
			stdout: '',
			stderr: '',
			interrupted: false,
			bashEditDiff: { moreFiles: 0, files: [{ filePath: '/repo/modified.ts', hunks: [] }] },
		},
	})
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	await $.tool.call({ tool: 'Bash', command: "sed -i '' s/a/b/ modified.ts" })
	await clock.settle()
	expect(await litOf($, 'modified.ts')).toBe('running')
	await clock.advance(1_200)
	expect(await litOf($, 'modified.ts')).toBe('done')
})

test('a file Claude is writing appears before git lists it', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const finish = held(w)
	const call = $.tool.call({ tool: 'Write', file_path: '/repo/src/brand-new.ts', content: 'x' })
	await clock.settle()
	expect(await litOf($, 'brand-new.ts')).toBe('running')
	finish({ result: {} })
	await call
})

test('a denied edit stops the shimmer without a flash', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const finish = held(w)
	const call = $.tool.call({ tool: 'Edit', file_path: '/repo/modified.ts', old_string: 'a', new_string: 'b' })
	await clock.settle()
	finish({ deny: 'not now' })
	await call
	await clock.settle()
	expect(await litOf($, 'modified.ts')).toBeNull()
})

test('the shimmer moves across the name on the frame clock', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const finish = held(w)
	const call = $.tool.call({ tool: 'Edit', file_path: '/repo/modified.ts', old_string: 'a', new_string: 'b' })
	await clock.settle()
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const bright = async () => JSON.stringify(await ui.findAll({ type: 'Text', in: 'rows' }))
	const before = await bright()
	await ui.advance(300)
	expect(await bright()).not.toBe(before)
	await ui.unmount()
	finish({ result: {} })
	await call
})

const MODIFIED_DIFF =
	'diff --git a/modified.ts b/modified.ts\nindex 1..2 100644\n--- a/modified.ts\n+++ b/modified.ts\n@@ -1 +1 @@\n-old\n+new\n'

async function openFile($: Engine, path: string, kind: 'file' | 'dir' = 'file') {
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	await ui.post({ press: path, kind }, { in: 'rows' })
	return ui
}

test('clicking a file opens its diff inside the rows Client, without git headers', async ($, on) => {
	world(on, { status: STATUS, diffs: { 'modified.ts': MODIFIED_DIFF } }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await openFile($, 'modified.ts')
	const code = await ui.find({ type: 'Code', in: 'rows' })
	expect(code?.props).toMatchObject({ source: '@@ -1 +1 @@\n-old\n+new\n', format: 'diff', path: 'modified.ts' })
	expect(await ui.find({ type: 'Button', key: 'back', in: 'rows' })).toBeDefined()
	await ui.unmount()
})

test('clicking a folder does nothing', async ($, on) => {
	world(on, { status: NESTED, numstat: NESTED_NUMSTAT }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await openFile($, 'src/', 'dir')
	expect(await ui.find({ type: 'Code', in: 'rows' })).toBeUndefined()
	await ui.unmount()
})

test('an untracked file shows its diff against /dev/null', async ($, on) => {
	const ran: string[][] = []
	world(on, { status: STATUS, diffs: { 'fresh.ts': '@@ -0,0 +1 @@\n+hello\n' }, ran }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await openFile($, 'fresh.ts')
	expect((await ui.find({ type: 'Code', in: 'rows' }))?.props).toMatchObject({ source: '@@ -0,0 +1 @@\n+hello\n' })
	expect(
		ran.some((argv) => argv.includes('--no-index') && !argv.includes('--numstat') && argv.at(-1) === 'fresh.ts'),
	).toBe(true)
	await ui.unmount()
})

test('the back button returns to the tree', async ($, on) => {
	world(on, { status: STATUS, diffs: { 'modified.ts': MODIFIED_DIFF } }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await openFile($, 'modified.ts')
	await ui.press({ key: 'back' })
	expect(await ui.find({ type: 'Code', in: 'rows' })).toBeUndefined()
	await ui.unmount()
	expect(await drawn($, 'terminal')).toContain('modified.ts')
})

test('the open diff follows the file and closes once it is no longer changed', async ($, on) => {
	const w: World = { status: STATUS, diffs: { 'modified.ts': MODIFIED_DIFF } }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await openFile($, 'modified.ts')
	w.diffs = { 'modified.ts': '@@ -1 +1,2 @@\n-old\n+new\n+more\n' }
	await clock.advance(2_100)
	expect((await ui.find({ type: 'Code', in: 'rows' }))?.props).toMatchObject({
		source: '@@ -1 +1,2 @@\n-old\n+new\n+more\n',
	})
	w.status = STATUS.replace('1 .M N... 100644 100644 100644 a a modified.ts\0', '')
	await clock.advance(2_100)
	expect(await ui.find({ type: 'Code', in: 'rows' })).toBeUndefined()
	await ui.unmount()
})

test(
	'a file row lights up and underlines its name on hover; a folder does not',
	{ options: { background: '#1e1e3f' } },
	async ($, on) => {
		world(on, { status: NESTED, numstat: NESTED_NUMSTAT }, [])
		await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
		const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
		const hoverRow = async (y: number) => {
			await ui.pointer({ type: 'move', x: 2, y, in: 'rows' })
			return ui.findAll({ type: 'Box', in: 'rows' })
		}
		// Rows: .ai/plans/, plan.md, src/, fresh.ts, gone.ts, ...
		const overFile = await hoverRow(4)
		expect(overFile.find((box) => box.key === 'src/gone.ts')?.props).toMatchObject({ backgroundColor: '#393956' })
		expect((await ui.find({ type: 'Text', text: /^gone\.ts$/, in: 'rows' }))?.props).toMatchObject({
			underline: true,
		})
		const overFolder = await hoverRow(2)
		expect(overFolder.some((box) => box.props.backgroundColor === '#393956')).toBe(false)
		await ui.unmount()
	},
)

const hunk = (n: number) => `@@ -${n} +${n} @@\n-${'a'.repeat(30)}\n+${'b'.repeat(30)}\n`

test('the diff is cut to fit a Client and says so', () => {
	const big = Array.from({ length: 10 }, (_, i) => hunk(i + 1)).join('')
	const { hunks, isTruncated } = cutDiff(big, 200)
	expect(isTruncated).toBe(true)
	expect(hunks.length).toBeLessThanOrEqual(200)
	expect(hunks.startsWith('@@ -1 +1 @@')).toBe(true)
	expect(hunks.endsWith('\n')).toBe(true)
	expect(hunks.endsWith(`+${'b'.repeat(30)}\n`)).toBe(true)
	expect(cutDiff('@@ -1 +1 @@\n-a\n+b\n')).toEqual({ hunks: '@@ -1 +1 @@\n-a\n+b\n', isTruncated: false })
})

test('a truncated diff ends with a note', async ($, on) => {
	const huge = `@@ -1 +1 @@\n-old\n+new\n${`@@ -2 +2 @@\n+${'x'.repeat(70)}\n`.repeat(1_000)}`
	world(on, { status: STATUS, diffs: { 'modified.ts': huge } }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await openFile($, 'modified.ts')
	expect((await ui.find({ type: 'Text', text: /diff truncated/, in: 'rows' }))?.text).toBe('… diff truncated')
	await ui.unmount()
})

async function mountPane($: Engine) {
	return $.ui.mount({ ...PANE, surface: 'terminal' })
}

// The selected row's name is drawn inverted when no background option is set.
async function selectedOf(ui: Awaited<ReturnType<typeof mountPane>>): Promise<string | undefined> {
	const texts = await ui.findAll({ type: 'Text', in: 'rows' })
	return texts.find((text) => (text.props as { inverse?: boolean }).inverse === true)?.text
}

test('j/k and the arrows move the selection through the rows', async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await mountPane($)
	expect(await selectedOf(ui)).toBeUndefined()
	await ui.key({ key: 'j', in: 'rows' })
	expect(await selectedOf(ui)).toBe('fresh.ts')
	await ui.key({ key: 'down', in: 'rows' })
	expect(await selectedOf(ui)).toBe('modified.ts')
	await ui.key({ key: 'j', in: 'rows' })
	await ui.key({ key: 'j', in: 'rows' })
	expect(await selectedOf(ui)).toBe('staged.ts')
	await ui.key({ key: 'k', in: 'rows' })
	await ui.key({ key: 'up', in: 'rows' })
	expect(await selectedOf(ui)).toBe('fresh.ts')
	await ui.unmount()
})

test(
	'with a background, the selected row takes the hover background',
	{ options: { background: '#1e1e3f' } },
	async ($, on) => {
		world(on, { status: STATUS }, [])
		await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
		const ui = await mountPane($)
		await ui.key({ key: 'j', in: 'rows' })
		expect((await ui.find({ type: 'Box', key: 'fresh.ts', in: 'rows' }))?.props).toMatchObject({
			backgroundColor: '#393956',
		})
		await ui.unmount()
	},
)

test('enter opens the selected file; h goes back with it still selected', async ($, on) => {
	world(on, { status: STATUS, diffs: { 'modified.ts': MODIFIED_DIFF } }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await mountPane($)
	await ui.key({ key: 'j', in: 'rows' })
	await ui.key({ key: 'j', in: 'rows' })
	await ui.key({ key: 'return', in: 'rows' })
	expect((await ui.find({ type: 'Code', in: 'rows' }))?.props).toMatchObject({ path: 'modified.ts' })
	await ui.key({ key: 'h', in: 'rows' })
	expect(await ui.find({ type: 'Code', in: 'rows' })).toBeUndefined()
	expect(await selectedOf(ui)).toBe('modified.ts')
	await ui.unmount()
})

test('enter on a folder does nothing; a click on it only selects it', async ($, on) => {
	world(on, { status: NESTED, numstat: NESTED_NUMSTAT }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await mountPane($)
	await ui.key({ key: 'j', in: 'rows' })
	await ui.key({ key: 'return', in: 'rows' })
	expect(await ui.find({ type: 'Code', in: 'rows' })).toBeUndefined()
	await ui.pointer({ type: 'down', button: 'left', x: 2, y: 2, in: 'rows' })
	expect(await selectedOf(ui)).toBe('src/')
	expect(await ui.find({ type: 'Code', in: 'rows' })).toBeUndefined()
	await ui.unmount()
})

test('the selection stays on its file across a refresh, and moves to the nearest row when it leaves', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await mountPane($)
	await ui.key({ key: 'j', in: 'rows' })
	await ui.key({ key: 'j', in: 'rows' })
	w.status = STATUS.replace('? fresh.ts', '? fresh.ts\0? another.ts')
	await clock.advance(2_100)
	expect(await selectedOf(ui)).toBe('modified.ts')
	w.status = STATUS.replace('1 .M N... 100644 100644 100644 a a modified.ts\0', '')
	await clock.advance(2_100)
	expect(await selectedOf(ui)).toBe('staged.ts')
	await ui.unmount()
})

test('a legend of hotkey buttons explains the keys while there are changes', async ($, on) => {
	const w: World = { status: STATUS, diffs: { 'modified.ts': MODIFIED_DIFF } }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await mountPane($)
	const keys = async () => (await ui.findAll({ type: 'Button' })).map((button) => button.props.hotkey).filter(Boolean)
	expect(await keys()).toEqual(['j', 'k', 'l'])
	await ui.post({ press: 'modified.ts', kind: 'file' }, { in: 'rows' })
	expect(await keys()).toEqual(['h', 'j', 'k'])
	await ui.unmount()
	w.status = ['# branch.oid 0123456789abcdef', '# branch.head main', ''].join('\0')
	await clock.advance(2_100)
	expect(await drawn($, 'terminal')).not.toContain('esc prompt')
})

test('the legend hotkeys drive the same selection as the tree keys', async ($, on) => {
	world(on, { status: STATUS, diffs: { 'modified.ts': MODIFIED_DIFF } }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await mountPane($)
	await ui.press({ key: 'nav-j' })
	await ui.key({ key: 'j', in: 'rows' })
	expect(await selectedOf(ui)).toBe('modified.ts')
	await ui.press({ key: 'nav-l' })
	expect((await ui.find({ type: 'Code', in: 'rows' }))?.props).toMatchObject({ path: 'modified.ts' })
	await ui.press({ key: 'nav-h' })
	expect(await selectedOf(ui)).toBe('modified.ts')
	await ui.unmount()
})

test('in a diff, j/k open the next or previous changed file, and h lands on the last one shown', async ($, on) => {
	const diffs = {
		'fresh.ts': '@@ -0,0 +1 @@\n+fresh\n',
		'modified.ts': MODIFIED_DIFF,
		'staged.ts': '@@ -1 +1 @@\n-s\n+t\n',
	}
	world(on, { status: STATUS, diffs }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await openFile($, 'modified.ts')
	const shown = async () => (await ui.find({ type: 'Code', in: 'rows' }))?.props.path
	await ui.key({ key: 'j', in: 'rows' })
	expect(await shown()).toBe('staged.ts')
	await ui.key({ key: 'j', in: 'rows' })
	expect(await shown()).toBe('staged.ts')
	await ui.press({ key: 'nav-k' })
	await ui.key({ key: 'up', in: 'rows' })
	expect(await shown()).toBe('fresh.ts')
	await ui.key({ key: 'k', in: 'rows' })
	expect(await shown()).toBe('fresh.ts')
	await ui.key({ key: 'h', in: 'rows' })
	expect(await ui.find({ type: 'Code', in: 'rows' })).toBeUndefined()
	expect(await selectedOf(ui)).toBe('fresh.ts')
	await ui.unmount()
})

const SCRIPT = 'sleep 8\ndate > /tmp/now.txt && git branch --show-current'

test('logLine is the first line after $, cut to the width, with … for a script', () => {
	expect(logLine('git status', 40)).toBe('$ git status')
	expect(logLine('\n  a   b\nc', 40)).toBe('$ a b …')
	expect(logLine('x'.repeat(50), 10)).toBe('$ xxxxxxx…')
})

async function logged($: Engine) {
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const text = JSON.stringify(await ui.find({ key: 'commands' }))
	await ui.unmount()
	return text
}

test('the COMMANDS box is always at the bottom, empty at first', async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const text = await logged($)
	expect(text).toContain(' COMMANDS ')
	expect(text).toContain('no commands yet')
	expect(text).toContain('"borderColor":"inactive"')
})

test('a running command reads ●, then ✓ once it ends, and stays in the log', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const finish = held(w)
	const call = $.tool.call({ tool: 'Bash', command: SCRIPT, description: 'Wait, then save the date' })
	await clock.settle()
	const during = await logged($)
	expect(during).toContain('● ')
	expect(during).toContain('$ sleep 8 …')
	expect(during).not.toContain('date > /tmp/now.txt')
	finish({ result: { stdout: '', stderr: '', interrupted: false } })
	await call
	await clock.settle()
	const after = await logged($)
	expect(after).toContain('✓ ')
	expect(after).toContain('$ sleep 8 …')
})

test('a failed or interrupted command reads ✗', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	w.tool = () => ({ result: { stdout: '', stderr: '', interrupted: true } })
	await $.tool.call({ tool: 'Bash', command: 'sleep 60' })
	await clock.settle()
	expect(await logged($)).toContain('✗ ')
})

test('the log keeps the last five commands, oldest first', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	for (const n of [1, 2, 3, 4, 5, 6]) await $.tool.call({ tool: 'Bash', command: `echo step${n}` })
	await clock.settle()
	const text = await logged($)
	expect(text).not.toContain('step1')
	const at = [2, 3, 4, 5, 6].map((n) => text.indexOf(`step${n}`))
	expect(at.every((index) => index >= 0)).toBe(true)
	expect(at.toSorted((a, b) => a - b)).toEqual(at)
})

test('a long command line is cut to the width inside its box', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	held(w)
	void $.tool.call({ tool: 'Bash', command: `echo ${'y'.repeat(100)}` })
	await clock.settle()
	const text = await logged($)
	// 40 columns, less the box's border and padding (4) and the state glyph (2).
	expect(text).toContain(`$ echo ${'y'.repeat(26)}…`)
	expect(text).not.toContain('y'.repeat(27))
})

test('transcriptCommands: show still logs the command', { options: { transcriptCommands: 'show' } }, async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	held(w)
	void $.tool.call({ tool: 'Bash', command: SCRIPT })
	await clock.settle()
	expect(await logged($)).toContain('$ sleep 8 …')
})

const TURN = { turnId: 't1', text: 'go' }
const ENDED = { turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'answer' } as const

test('the title reads SIDELINE · IDLE, and WORKING while a main turn runs', async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(await drawn($, 'terminal')).toContain('SIDELINE')
	expect(await drawn($, 'terminal')).toContain('IDLE')
	await $.turn.start(TURN)
	expect(await drawn($, 'terminal')).toContain('WORKING')
	await $.turn.complete(ENDED)
	const text = await drawn($, 'terminal')
	expect(text).toContain('IDLE')
	expect(text).not.toContain('WORKING')
})

test("a subagent's turn ending leaves the title WORKING", async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	await $.turn.start(TURN)
	await $.turn.start({ ...TURN, turnId: 't2', agentId: 'a1' })
	await $.turn.complete({ ...ENDED, turnId: 't2', agentId: 'a1' })
	expect(await drawn($, 'terminal')).toContain('WORKING')
})

test('the hints sit under the title, above the tree, and only with changes', async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const text = JSON.stringify(await ui.drawn())
	await ui.unmount()
	const hint = text.indexOf('"label":"down"')
	expect(text.indexOf('IDLE')).toBeLessThan(hint)
	expect(hint).toBeLessThan(text.indexOf('main'))
})

test('with no changes the pane shows no hints', async ($, on) => {
	world(on, { status: ['# branch.oid 0123456789abcdef', '# branch.head main', ''].join('\0') }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const text = await drawn($, 'terminal')
	expect(text).toContain('no changes')
	expect(text).not.toContain('"label":"down"')
})

test('an interrupted turn sets the title back to IDLE', async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	await $.turn.start(TURN)
	await $.turn.complete({ ...ENDED, isAborted: true, reason: 'aborted' })
	expect(await drawn($, 'terminal')).toContain('IDLE')
})

test('the file count and the tree sit in the purple CHANGES box', async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const box = await ui.find({ key: 'changes-box' })
	const text = JSON.stringify(await ui.find({ key: 'changes' }))
	await ui.unmount()
	expect(box?.props.borderStyle).toBe('round')
	expect(box?.props.borderColor).toBe('merged')
	expect(text).toContain(' CHANGES ')
	expect(text).not.toContain('⎇ main')
	// The file count is laid over the box's top-right border.
	expect(text).toContain('"top":0,"right":2')
	expect(text).toContain(' 3 files ')
	expect(text).toContain('"name":"staged.ts"')
})

test('no changes and not a git repo show inside the CHANGES box', async ($, on) => {
	world(on, { status: ['# branch.oid 0123456789abcdef', '# branch.head main', ''].join('\0') }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	expect(JSON.stringify(await ui.find({ key: 'changes' }))).toContain('no changes')
	await ui.unmount()
})

test('outside a git repo the SESSION box says so', async ($, on) => {
	world(on, {}, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	expect(JSON.stringify(await ui.find({ key: 'session' }))).toContain('not a git repo')
	expect(JSON.stringify(await ui.find({ key: 'commands' }))).toContain('no commands yet')
	await ui.unmount()
})

const QUESTION = {
	tool: 'AskUserQuestion' as const,
	questions: [
		{
			question: 'Which one?',
			header: 'Pick',
			multiSelect: false,
			options: [
				{ label: 'A', description: 'The first' },
				{ label: 'B', description: 'The second' },
			],
		},
	],
}

test('the title reads WAITING while a question waits for an answer, then WORKING', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	await $.turn.start(TURN)
	const answer = held(w)
	const call = $.tool.call(QUESTION)
	await clock.settle()
	expect(await drawn($, 'terminal')).toContain('WAITING')
	answer({ result: {} })
	await call
	await clock.settle()
	const text = await drawn($, 'terminal')
	expect(text).toContain('WORKING')
	expect(text).not.toContain('WAITING')
})

test("a subagent's question leaves the title WORKING", async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	await $.turn.start(TURN)
	const answer = held(w)
	const call = $.tool.call({ ...QUESTION, agentId: 'a1' })
	await clock.settle()
	expect(await drawn($, 'terminal')).not.toContain('WAITING')
	answer({ result: {} })
	await call
})

test('pressing a log line opens the whole command in CHANGES; pressing it again, or h, goes back', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	await $.tool.call({ tool: 'Bash', command: SCRIPT, tool_use_id: 'toolu_script' })
	await clock.settle()
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const changes = async () => JSON.stringify(await ui.find({ key: 'changes' }))
	expect(await changes()).not.toContain('date > /tmp/now.txt')
	await ui.press({ key: 'command-toolu_script' })
	await clock.settle()
	const open = await changes()
	expect(open).toContain('date > /tmp/now.txt && git branch --show-current')
	expect(open).toContain('← back')
	expect(open).not.toContain('"module"')
	expect(JSON.stringify(await ui.find({ key: 'commands' }))).not.toContain('date > /tmp/now.txt')
	await ui.press({ key: 'command-toolu_script' })
	await clock.settle()
	expect(await changes()).not.toContain('date > /tmp/now.txt')
	await ui.press({ key: 'command-toolu_script' })
	await clock.settle()
	await ui.press({ key: 'nav-h' })
	await clock.settle()
	expect(await changes()).not.toContain('date > /tmp/now.txt')
	await ui.unmount()
})

test('the pane has no outer padding and fills its rows exactly', async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const outer = (await ui.drawn()) as { props: Record<string, unknown> }
	await ui.unmount()
	expect(outer.props.paddingX).toBeUndefined()
	expect(outer.props.paddingY).toBeUndefined()
	expect(outer.props.height).toBe(60)
})

test('COMMANDS is always five lines tall and CHANGES takes the rest', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const boxes = async () => {
		const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
		const found = [await ui.find({ key: 'commands-box' }), await ui.find({ key: 'changes-box' })]
		await ui.unmount()
		return found.map((box) => box?.props)
	}
	for (const count of [0, 2, 6]) {
		for (let n = 0; n < count; n++) await $.tool.call({ tool: 'Bash', command: `echo ${n}` })
		await clock.settle()
		const [commands, changes] = await boxes()
		expect(commands?.height).toBe(7)
		expect(changes?.flexGrow).toBe(1)
		expect(changes?.overflow).toBe('hidden')
	}
})

test('an errored command reads ✗', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	w.tool = () => ({ result: 'Exit code 1', isError: true })
	await $.tool.call({ tool: 'Bash', command: 'false' })
	await clock.settle()
	expect(await logged($)).toContain('✗ ')
})

const MANY = [
	'# branch.oid 0123456789abcdef',
	'# branch.head main',
	...Array.from({ length: 12 }, (_, n) => `? file${String(n).padStart(2, '0')}.ts`),
	'',
].join('\0')

async function shortPane($: Engine) {
	const ui = await $.ui.mount({
		...PANE,
		surface: 'terminal',
		props: { ...PANE.props, scroll: { offset: 0, bodyRows: 20 } },
	})
	const box = JSON.stringify(await ui.find({ key: 'changes' }))
	await ui.unmount()
	return box
}

test('a short pane shows a window of the tree and counts the rest on the border', async ($, on) => {
	world(on, { status: MANY }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	// 20 rows: title 1, hints 2, session box 4, the changes border 2, commands 7 leave 4.
	const box = await shortPane($)
	expect(box).toContain('file00.ts')
	expect(box).toContain('file03.ts')
	expect(box).not.toContain('file04.ts')
	expect(box).toContain(' ↓ 8 ')
})

// A wheel tick, or with no `row` a scroll key, on the 20-row pane.
const wheel = (by: number, row?: number) => ({
	component: 'Pane' as const,
	requestId: 'sideline',
	offset: 0,
	by,
	bodyRows: 20,
	contentRows: 20,
	origin: { kind: 'person' as const },
	...(row === undefined ? {} : { pointer: { column: 5, row } }),
})

test('the wheel over CHANGES moves its window, and never the pane', async ($, on) => {
	world(on, { status: MANY }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	await shortPane($)
	expect(await $.ui.scroll(wheel(3, 6))).toEqual({})
	const box = await shortPane($)
	expect(box).not.toContain('file02.ts')
	expect(box).toContain('file03.ts')
	expect(box).toContain(' ↑ 3 ↓ 5 ')
	await $.ui.scroll(wheel(50, 6))
	expect(await shortPane($)).toContain(' ↑ 8 ')
})

test('the wheel over COMMANDS moves nothing', async ($, on) => {
	world(on, { status: MANY }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	await shortPane($)
	expect(await $.ui.scroll(wheel(3, 15))).toEqual({})
	expect(await shortPane($)).toContain('file00.ts')
})

test('the pane has no focus hint line', async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(await drawn($, 'terminal')).not.toContain('to focus')
})

test('j past the window moves it down by one, and k above it moves it back up', async ($, on) => {
	world(on, { status: MANY }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await $.ui.mount({
		...PANE,
		surface: 'terminal',
		props: { ...PANE.props, scroll: { offset: 0, bodyRows: 20 } },
	})
	const box = async () => JSON.stringify(await ui.find({ key: 'changes' }))
	// The window shows four rows, file00 to file03; the first j selects file00, three more reach file03.
	for (let n = 0; n < 4; n++) await ui.key({ key: 'j', in: 'rows' })
	expect(await box()).toContain('file00.ts')
	await ui.key({ key: 'j', in: 'rows' })
	const down = await box()
	expect(down).not.toContain('file00.ts')
	expect(down).toContain('file04.ts')
	for (let n = 0; n < 4; n++) await ui.key({ key: 'k', in: 'rows' })
	expect(await box()).toContain('file00.ts')
	await ui.unmount()
})

test('a scroll key (no pointer) scrolls CHANGES', async ($, on) => {
	world(on, { status: MANY }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	await shortPane($)
	await $.ui.scroll(wheel(2))
	expect(await shortPane($)).toContain(' ↑ 2 ↓ 6 ')
})

test('the c commands hint shows only once a command is logged', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(await drawn($, 'terminal')).not.toContain('"hotkey":"c"')
	await $.tool.call({ tool: 'Bash', command: 'echo one' })
	await clock.settle()
	expect(await drawn($, 'terminal')).toContain('"hotkey":"c"')
})

test('the c hint reads commands, and changes once c has moved into the log', async ($, on) => {
	const w: World = { status: STATUS }
	const clock = world(on, w, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	await $.tool.call({ tool: 'Bash', command: 'echo one' })
	await clock.settle()
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const label = async () => (await ui.find({ key: 'nav-c' }))?.props.label
	expect(await label()).toBe('commands')
	await ui.press({ key: 'nav-c' })
	expect(await label()).toBe('changes')
	await ui.press({ key: 'nav-c' })
	expect(await label()).toBe('commands')
	await ui.unmount()
})

// One main-loop model request, as the engine raises it, read to its end.
async function requested($: Engine, model: string, effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max') {
	const stream = $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 1 })
	for await (const _ of stream);
	await stream.result
}

async function sessionBox($: Engine) {
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const box = await ui.find({ key: 'session-box' })
	const text = JSON.stringify(await ui.find({ key: 'session' }))
	await ui.unmount()
	return { box, text }
}

test('the yellow SESSION box reads the branch, the model, and the effort once a request brings it', async ($, on) => {
	world(on, { status: STATUS, hasStash: true }, [])
	// The model answers with no chunks; this test only needs the request to go out.
	on('turn.step', async function* (_, e) {
		yield* []
		return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
	})
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const before = await sessionBox($)
	expect(before.box?.props.borderColor).toBe('yellow')
	expect(before.text).toContain(' SESSION ')
	expect(before.text).toContain('⎇ main')
	expect(before.text).toContain(' [$!+?]')
	expect(before.text).toContain(' Opus 5.5')
	expect(before.text).toContain('—')
	await requested($, 'claude-sonnet-5-5', 'high')
	const after = await sessionBox($)
	expect(after.text).toContain(' Sonnet 5.5')
	expect(after.text).toContain('high')
})

test(
	'sessionBox: hide draws no SESSION box and puts the branch line back in CHANGES',
	{ options: { sessionBox: 'hide' } },
	async ($, on) => {
		world(on, { status: STATUS }, [])
		await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
		const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
		expect(await ui.find({ key: 'session' })).toBeUndefined()
		const changes = JSON.stringify(await ui.find({ key: 'changes' }))
		await ui.unmount()
		expect(changes).toContain('⎇ main')
		expect(changes).toContain(' 3 files')
	},
)

const USAGE = (percent: number, fiveHour: number, sevenDay: number) => ({
	context: { window: 200_000, tokens: percent * 2_000, percent },
	rateLimits: [
		{ kind: 'five_hour', percentUsed: fiveHour, source: 'api' },
		{ kind: 'seven_day', percentUsed: sevenDay, source: 'api' },
	],
})

test('the SESSION box reads the context bar and the 5h and 7d usage, and follows each measure', async ($, on) => {
	world(on, { status: STATUS }, [])
	on('session.usage', () => ({ value: { startedAt: 0, ...USAGE(34, 23, 13) } }))
	on('session.measure', (_, e) => ({ changed: e.changed }))
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const start = (await sessionBox($)).text
	expect(start).toContain('context ')
	// 36 cells inside the box, less 21 of text and 9 of numbers, leave a 6-cell bar.
	expect(start).toContain('▰▰▱▱▱▱ 34%')
	expect(start).toContain(' · 5h ')
	expect(start).toContain('23%')
	expect(start).toContain(' · 7d ')
	expect(start).toContain('13%')
	await $.session.measure({ ...USAGE(92, 80, 13), changed: ['context', 'rateLimits'] })
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const context = await ui.find({ type: 'Text', text: /^[▰▱]+ 92%$/ })
	const fiveHour = await ui.find({ type: 'Text', text: /^80%$/ })
	await ui.unmount()
	expect(context?.props.color).toBe('error')
	expect(fiveHour?.props.color).toBe('warning')
})

test('before any reading the usage line reads —', async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const text = (await sessionBox($)).text
	expect(text).toContain('▱▱▱ —')
	expect(text).toContain(' · 5h ')
})

test('an untracked file is counted again only after its size or modification time changes', async ($, on) => {
	const ran: string[][] = []
	const w: World = {
		status: ['# branch.oid 0123456789abcdef', '# branch.head main', '? fresh.ts', ''].join('\0'),
		untracked: { 'fresh.ts': '4\t0\t\0/dev/null\0fresh.ts\0' },
		ran,
	}
	const clock = world(on, w, [])
	let mtimeMs = 1_000
	on('fs.stat', () => ({ value: { kind: 'file' as const, size: 40, mtimeMs, isLink: false } }))
	const counted = () => ran.filter((argv) => argv.includes('--no-index') && argv.includes('--numstat')).length
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(counted()).toBe(1)
	await clock.advance(2_100)
	await clock.advance(2_100)
	expect(counted()).toBe(1)
	expect(await drawn($, 'terminal')).toContain(' +4')
	mtimeMs = 2_000
	await clock.advance(2_100)
	expect(counted()).toBe(2)
})

test('without a Client (VS Code, mobile) the tree still draws', async ($, on) => {
	world(on, { status: STATUS }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	for (const surface of ['vscode', 'mobile'] as const) {
		const ui = await $.ui.mount({ ...PANE, surface })
		expect(await ui.find({ type: 'Text', text: /modified\.ts/ })).toBeDefined()
		await ui.unmount()
	}
})

test('the pane opens by itself with a terminal or desktop attached, not in VS Code or mobile alone', async ($, on) => {
	const opens: string[] = []
	const w: World = { status: STATUS, surfaces: ['vscode'] }
	world(on, w, opens)
	await $.session.start({ cwd: '/repo', surface: 'vscode', isInteractive: true })
	expect(opens).toEqual([])
	await $.command.run({
		command: 'sideline',
		args: '',
		origin: { kind: 'composer' },
		presentation: { isFullscreen: false, columns: 100 },
	})
	expect(opens).toEqual(['sideline'])
})

test('the pane opens by itself when a terminal is attached alongside mobile', async ($, on) => {
	const opens: string[] = []
	world(on, { status: STATUS, surfaces: ['terminal', 'mobile'] }, opens)
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(opens).toEqual(['sideline'])
})

const CLEAN = ['# branch.oid 0123456789abcdef', '# branch.head main', ''].join('\0')
// Three commits, an hour, a day and a week before the world's clock.
const LOG = [
	['abc1234', 'feat: draw the tree', 1_800_000_000 - 3_600],
	['def5678', 'fix: count untracked files', 1_800_000_000 - 86_400],
	['0a1b2c3', 'docs: write the readme', 1_800_000_000 - 604_800],
]
	.map(([sha, subject, seconds]) => `${sha}\0${subject}\0${seconds}\0`)
	.join('\n')

test('with no changes the box lists the recent commits under no changes', async ($, on) => {
	world(on, { status: CLEAN, log: LOG }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const box = JSON.stringify(await ui.find({ key: 'changes' }))
	await ui.unmount()
	expect(box).toContain('no changes')
	expect(box).toContain('abc1234 ')
	expect(box).toContain('feat: draw the tree')
	expect(box).toContain(' 1h')
	expect(box).toContain(' 1d')
	expect(box).toContain(' 1w')
})

test('a short pane lists only the commits that fit', async ($, on) => {
	world(on, { status: CLEAN, log: LOG }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	// 18 rows, less the title and the box's border (3), SESSION (4) and COMMANDS (7), leave 4 content rows with no
	// hints: no changes, a blank, and two commits.
	const ui = await $.ui.mount({
		...PANE,
		surface: 'terminal',
		props: { ...PANE.props, scroll: { offset: 0, bodyRows: 18 } },
	})
	const box = JSON.stringify(await ui.find({ key: 'changes' }))
	await ui.unmount()
	expect(box).toContain('abc1234')
	expect(box).toContain('def5678')
	expect(box).not.toContain('0a1b2c3')
})

test('a repo with no commits reads no commits yet', async ($, on) => {
	world(on, { status: CLEAN, logExit: 128 }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(await drawn($, 'terminal')).toContain('no commits yet')
})

test('with changes no git log runs and no commits show', async ($, on) => {
	const ran: string[][] = []
	world(on, { status: STATUS, log: LOG, ran }, [])
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(ran.some((argv) => argv.includes('log'))).toBe(false)
	expect(await drawn($, 'terminal')).not.toContain('abc1234')
})
