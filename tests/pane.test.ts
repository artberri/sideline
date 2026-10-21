import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

type World = { status?: string; hasStash?: boolean; hasNerdFont?: boolean }

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
	mock.clock(on, { now: 1_800_000_000_000 })
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
		return done(0)
	})
}

async function drawn($: Engine, surface: 'terminal' | 'desktop') {
	const ui = await $.ui.mount({ ...PANE, surface })
	const text = JSON.stringify(await ui.drawn())
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
