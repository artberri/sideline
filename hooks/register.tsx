import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { ActiveEdit, ChangedFile, FileStatus, Snapshot } from '../types'
import { readSnapshot } from './git'
import { rowIcon } from './icons'
import { drawRows } from './rows'
import type { RowSpec } from './rows'
import { countsLabel, summarize } from './summary'
import { BRANCH_ICON, backgroundOption, resolveGlyphs, statusSymbols } from './symbols'
import { treeRows } from './tree'

const PANE = 'vacuo'
const TITLE = 'Changes'
const POLL_MS = 2_000
const REFRESH_AFTER = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash'])
const FLASH_MS = 1_500
// Claude Code's own result gutter, which a row drawn in place of a ToolResult does not get.
const RESULT_GUTTER = '  ⎿  '

const snapshot = atom({ plugin: 'vacuo', key: 'snapshot' } as const, { kind: 'loading' } as Snapshot)
const glyphs = atom({ plugin: 'vacuo', key: 'glyphs' } as const, 'plain')
const edits = atom({ plugin: 'vacuo', key: 'edits' } as const, [] as ActiveEdit[])

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

function editedPath(e: { tool: string } & Record<string, unknown>): string | undefined {
	if (e.tool === 'NotebookEdit' && typeof e.notebook_path === 'string') return e.notebook_path
	if ((e.tool === 'Edit' || e.tool === 'Write') && typeof e.file_path === 'string') return e.file_path
	return undefined
}

// Files Claude is editing that git does not list yet (a new file, or one that was clean) still get a row.
function withEditedFiles(files: ChangedFile[], edited: Map<string, ActiveEdit>): ChangedFile[] {
	const listed = new Set(files.map((file) => file.path))
	const extra = [...edited]
		.filter(([path]) => !listed.has(path))
		.map(([path, edit]): ChangedFile => ({
			path,
			status: edit.isNewFile ? 'added' : 'modified',
			isUntracked: edit.isNewFile,
			added: 0,
			deleted: 0,
			isBinary: false,
		}))
	return [...files, ...extra]
}

export const register: Register = (on, options) => {
	const background = backgroundOption(options.background)
	const isHidingDiffs = options.transcriptDiffs !== 'show'

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
		const path = editedPath(e)
		if (!path) {
			const result = await next(e)
			if (REFRESH_AFTER.has(String(e.tool))) void refresh($)
			return result
		}
		const edit: ActiveEdit = { id: e.tool_use_id, path, state: 'running', isNewFile: e.tool === 'Write' }
		await update($, edits, (list) => [...list.filter((one) => one.path !== path), edit])
		const result = await next(e)
		if (result.deny || result.isError) {
			await update($, edits, (list) => list.filter((one) => one.id !== edit.id))
		} else {
			await update($, edits, (list) => list.map((one) => (one.id === edit.id ? { ...one, state: 'done' } : one)))
			$.clock.after(FLASH_MS, () => void update($, edits, (list) => list.filter((one) => one.id !== edit.id)))
		}
		void refresh($)
		return result
	})

	on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
		if (!isHidingDiffs || e.props.isExpanded === true || e.props.isErrored) return next(e)
		const summaries = summarize(e.props.tool, e.props.output, await $.session.cwd())
		if (!summaries) return next(e)
		const { Box, Text } = $.ui.resolve(e)
		return (
			<Box flexDirection="column">
				{summaries.map((summary) => (
					<Box key={summary.path}>
						<Text>
							<Text dimColor>{RESULT_GUTTER}</Text>
							{`${summary.verb} `}
							<Text bold>{summary.path}</Text>
							<Text dimColor>{` ${countsLabel(summary)}`}</Text>
						</Text>
					</Box>
				))}
			</Box>
		)
	})

	on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
		const elements = $.ui.resolve(e)
		const { Box, Text } = elements
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
		if (shown.kind === 'loading') return fill(<Text> </Text>)
		if (shown.kind === 'none') return fill(<Text dimColor>not a git repo</Text>)
		const symbols = statusSymbols(shown.status)
		const root = `${shown.root}/`
		const edited = new Map(
			(await read($, edits))
				.filter((edit) => edit.path.startsWith(root))
				.map((edit) => [edit.path.slice(root.length), edit]),
		)
		const rows = treeRows(withEditedFiles(shown.files, edited)).map((row): RowSpec => ({
			id: row.id,
			indent: '  '.repeat(row.depth),
			icon: rowIcon(row.kind, row.name, glyphSet),
			iconColor: row.status ? STATUS_COLOR[row.status] : null,
			name: row.name,
			isStruck: row.status === 'deleted',
			lit: (row.kind === 'file' && edited.get(row.id)?.state) || null,
			added: row.added,
			deleted: row.deleted,
			isBinary: row.isBinary,
		}))
		return fill(
			<Box flexDirection="column">
				<Text>
					<Text color="magenta" bold>{`${icon} ${shown.branch}`}</Text>
					{symbols && <Text color="red" bold>{` [${symbols}]`}</Text>}
				</Text>
				<Box flexDirection="column" marginTop={1}>
					{rows.length === 0 ? (
						<Text dimColor>no changes</Text>
					) : 'Client' in elements ? (
						<elements.Client key="rows" module="./rows.tsx" props={{ rows }} />
					) : (
						drawRows(rows, elements, 0)
					)}
				</Box>
			</Box>,
		)
	})
}
