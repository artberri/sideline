import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { FileStatus, Snapshot } from '../types'
import { readSnapshot } from './git'
import { rowIcon } from './icons'
import { BRANCH_ICON, backgroundOption, resolveGlyphs, statusSymbols } from './symbols'
import { treeRows } from './tree'
import type { TreeRow } from './tree'

const PANE = 'vacuo'
const TITLE = 'Changes'
const POLL_MS = 2_000
const REFRESH_AFTER = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash'])

const snapshot = atom({ plugin: 'vacuo', key: 'snapshot' } as const, { kind: 'loading' } as Snapshot)
const glyphs = atom({ plugin: 'vacuo', key: 'glyphs' } as const, 'plain')

const STATUS_COLOR: Record<FileStatus, Color> = {
	added: 'success',
	modified: 'warning',
	deleted: 'error',
	renamed: 'blue',
	conflicted: 'error',
}

let refreshing: Promise<void> | null = null
let isRefreshQueued = false

async function readAndStore($: EngineInterface): Promise<void> {
	const next = await readSnapshot($, await $.session.cwd())
	const current = await read($, snapshot)
	if (JSON.stringify(current) !== JSON.stringify(next)) await update($, snapshot, () => next)
}

// The poll and tool calls overlap; one read runs at a time, and a request during it runs once more afterwards.
function refresh($: EngineInterface): Promise<void> {
	if (refreshing) {
		isRefreshQueued = true
		return refreshing
	}
	refreshing = readAndStore($)
		.catch(() => undefined)
		.finally(() => {
			refreshing = null
			if (isRefreshQueued) {
				isRefreshQueued = false
				void refresh($)
			}
		})
	return refreshing
}

export const register: Register = (on, options) => {
	const background = backgroundOption(options.background)

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

	on('tool.call', async ($, e, next) => {
		const result = await next(e)
		if (REFRESH_AFTER.has(String(e.tool))) void refresh($)
		return result
	})

	on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
		const { Box, Text } = $.ui.resolve(e)
		const shown = await read($, snapshot)
		const glyphSet = await read($, glyphs)
		const icon = BRANCH_ICON[glyphSet]
		const fill = (body: JSX.Element) => (
			<Box
				flexDirection="column"
				backgroundColor={background}
				width={e.props.bodyColumns}
				minHeight={e.props.scroll.bodyRows}
				paddingX={1}
				paddingY={1}
			>
				{body}
			</Box>
		)
		// oxlint-disable-next-line unicorn/consistent-function-scoping -- it reads Box and Text from $.ui.resolve through JSX
		const line = (row: TreeRow) => (
			<Box key={row.id} flexDirection="row">
				<Box flexGrow={1} flexShrink={1} overflow="hidden">
					<Text wrap="truncate-end">
						{'  '.repeat(row.depth)}
						<Text
							color={row.status ? STATUS_COLOR[row.status] : undefined}
						>{`${rowIcon(row.kind, row.name, glyphSet)} `}</Text>
						<Text strikethrough={row.status === 'deleted'}>{row.name}</Text>
					</Text>
				</Box>
				{row.isBinary ? (
					<Text dimColor> bin</Text>
				) : (
					<Text>
						{row.added > 0 && <Text color="success">{` +${row.added}`}</Text>}
						{row.deleted > 0 && <Text color="error">{` -${row.deleted}`}</Text>}
					</Text>
				)}
			</Box>
		)
		if (shown.kind === 'loading') return fill(<Text> </Text>)
		if (shown.kind === 'none') return fill(<Text dimColor>not a git repo</Text>)
		const symbols = statusSymbols(shown.status)
		const rows = treeRows(shown.files)
		return fill(
			<Box flexDirection="column">
				<Text>
					<Text color="magenta" bold>{`${icon} ${shown.branch}`}</Text>
					{symbols && <Text color="red" bold>{` [${symbols}]`}</Text>}
				</Text>
				<Box flexDirection="column" marginTop={1}>
					{rows.length === 0 ? <Text dimColor>no changes</Text> : rows.map(line)}
				</Box>
			</Box>,
		)
	})
}
