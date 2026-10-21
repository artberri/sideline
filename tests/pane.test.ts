import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

type World = {
	status?: string
	numstat?: string
	untracked?: Record<string, string>
	hasStash?: boolean
	hasNerdFont?: boolean
	tool?: () => unknown
}

const PANE = {
	plugin: 'vacuo',
	component: 'Pane',
	requestId: 'vacuo',
	props: {
		title: 'Changes',
		isFocused: false,
		bodyColumns: 40,
		placement: 'dock',
		scroll: { offset: 0, bodyRows: 20 },
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
	on('command.register', () => ({ value: { command: 'vacuo' } }))
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
		if (argv.includes('--no-index')) return done(1, w.untracked?.[argv.at(-1) ?? ''] ?? '')
		if (argv.includes('diff')) return done(0, w.numstat ?? '')
		return done(0)
	})
	on('tool.call', () => (w.tool?.() ?? { result: {} }) as { result: Record<string, never> })
	return clock
}

async function drawn($: Engine, surface: 'terminal' | 'desktop') {
	const ui = await $.ui.mount({ ...PANE, surface })
	const text = JSON.stringify(await ui.drawn()) + JSON.stringify(await ui.drawn({ in: 'rows' }).catch(() => null))
	await ui.unmount()
	return text
}

test('the pane opens at session start and again on /vacuo', async ($, on) => {
	const opens: string[] = []
	world(on, { status: STATUS }, opens)
	await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
	expect(opens).toEqual(['vacuo'])
	await $.command.run({
		command: 'vacuo',
		args: '',
		origin: { kind: 'composer' },
		presentation: { isFullscreen: true, columns: 160 },
	})
	expect(opens).toEqual(['vacuo', 'vacuo'])
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

// What a file's row shows: the shimmer paints its icon in Claude's color, the flash paints its name green.
async function litOf($: Engine, name: string): Promise<'running' | 'done' | null | 'absent'> {
	const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
	const escaped = name.replaceAll('.', '\\.')
	const row = await ui.find({ type: 'Text', text: new RegExp(`^\\s*\\S+ ${escaped}$`), in: 'rows' })
	await ui.unmount()
	if (!row) return 'absent'
	const [, icon, label] = (row.children ?? []) as Child[]
	if (icon?.props?.color === 'claude') return 'running'
	if (label?.props?.color === 'success') return 'done'
	return null
}

const ignore = (): void => undefined

// Holds the next tool call open until the returned function answers it.
function held(w: World) {
	let release: (answer: unknown) => void = ignore
	w.tool = () => new Promise((resolve) => (release = resolve))
	return (answer: unknown) => release(answer)
}

test('a file shimmers while Claude edits it, then flashes once and settles', async ($, on) => {
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
	expect(await litOf($, 'modified.ts')).toBe('done')
	await clock.advance(1_600)
	expect(await litOf($, 'modified.ts')).toBeNull()
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
