import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Header } from '../types'
import { readHeader } from './git'
import { BRANCH_ICON, resolveGlyphs, statusSymbols } from './symbols'

const PANE = 'vacuo'
const TITLE = 'Changes'
const POLL_MS = 2_000

const header = atom({ plugin: 'vacuo', key: 'header' } as const, { kind: 'loading' } as Header)
const glyphs = atom({ plugin: 'vacuo', key: 'glyphs' } as const, 'plain')

async function refresh($: EngineInterface): Promise<void> {
	const next = await readHeader($, await $.session.cwd())
	const current = await read($, header)
	if (JSON.stringify(current) !== JSON.stringify(next)) await update($, header, () => next)
}

export const register: Register = (on, options) => {
	on('session.start', async ($, e, next) => {
		await $.command.register({ name: 'vacuo', description: 'Show the changed-files pane' })
		const resolved = await resolveGlyphs($, options.glyphs)
		await update($, glyphs, () => resolved)
		await refresh($)
		void $.ui.open({ id: PANE, title: TITLE })
		$.clock.every(POLL_MS, () => void refresh($))
		return next(e)
	})

	on('command.run', { command: 'vacuo' }, async ($) => {
		await refresh($)
		await $.ui.open({ id: PANE, title: TITLE })
		return { text: 'Changes pane opened.' }
	})

	on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
		const { Box, Text } = $.ui.resolve(e)
		const shown = await read($, header)
		const icon = BRANCH_ICON[await read($, glyphs)]
		if (shown.kind === 'loading') return <Box />
		if (shown.kind === 'none') return <Text dimColor>not a git repo</Text>
		const symbols = statusSymbols(shown.status)
		return (
			<Box flexDirection="column">
				<Text>
					<Text color="magenta" bold>{`${icon} ${shown.branch}`}</Text>
					{symbols && <Text color="red" bold>{` [${symbols}]`}</Text>}
				</Text>
			</Box>
		)
	})
}
