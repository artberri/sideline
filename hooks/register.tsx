import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { ActiveEdit, ChangedFile, Cursor, FileDiff, FileStatus, RunningCommand, Snapshot } from '../types'
import { commandLines, hiddenCommandInput, runningDescription } from './commands'
import { readDiff, readSnapshot } from './git'
import { rowIcon } from './icons'
import { cutDiff, drawDiff, drawRows } from './rows'
import type { RowSpec } from './rows'
import { bashChangedFiles, countsLabel, summarize } from './summary'
import {
	BRANCH_ICON,
	backgroundOption,
	lighten,
	resolveGlyphs,
	resolveRowDot,
	rowDotFor,
	statusSymbols,
} from './symbols'
import { resolveCursor, treeRows } from './tree'
import type { TreeRow } from './tree'

const PANE = 'vacuo'
const TITLE = 'Changes'
const POLL_MS = 2_000
const REFRESH_AFTER = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash'])
const FLASH_MS = 100
// Most edits take milliseconds; the shimmer plays at least this long so it can be seen, without delaying the tool.
const MIN_SHIMMER_MS = 1_200
// Claude Code's own result gutter, which a row drawn in place of a ToolResult does not get.
const RESULT_GUTTER = '  ⎿  '
const ANSWERS_HEADER = "User answered Claude's questions"
const FOCUS_HINT = 'click or ctrl+x tab to focus · esc prompt'
const DOWN = new Set(['j', 'down'])
const UP = new Set(['k', 'up'])
const OPEN = new Set(['l', 'right', 'return'])
const BACK = new Set(['h', 'left', 'backspace'])

const snapshot = atom({ plugin: 'vacuo', key: 'snapshot' } as const, { kind: 'loading' } as Snapshot)
const glyphs = atom({ plugin: 'vacuo', key: 'glyphs' } as const, 'plain')
const edits = atom({ plugin: 'vacuo', key: 'edits' } as const, [] as ActiveEdit[])
const selected = atom({ plugin: 'vacuo', key: 'selected' } as const, null as string | null)
const diff = atom({ plugin: 'vacuo', key: 'diff' } as const, null as FileDiff | null)
const cursor = atom({ plugin: 'vacuo', key: 'cursor' } as const, null as Cursor | null)
const running = atom({ plugin: 'vacuo', key: 'running' } as const, [] as RunningCommand[])

const STATUS_COLOR: Record<FileStatus, Color> = {
	added: 'success',
	modified: 'warning',
	deleted: 'error',
	renamed: 'blue',
	conflicted: 'error',
}

let refreshing: Promise<void> | null = null
let isRefreshQueued = false
// The last description a live group's line showed, for the moment the next call's input is still being written.
let lastDescription: string | undefined
// Claude Code's row dot on this machine, read at session start.
let rowDot = rowDotFor('')

async function readAndStore($: EngineInterface): Promise<void> {
	const next = await readSnapshot($, await $.session.cwd())
	const current = await read($, snapshot)
	if (JSON.stringify(current) !== JSON.stringify(next)) await update($, snapshot, () => next)
	await readSelectedDiff($, next)
}

async function closeDiff($: EngineInterface): Promise<void> {
	await update($, selected, () => null)
	await update($, diff, () => null)
}

// The open diff follows its file, and closes once the file is no longer changed.
async function readSelectedDiff($: EngineInterface, shown: Snapshot): Promise<void> {
	const path = await read($, selected)
	if (path === null) return
	const file = shown.kind === 'repo' ? shown.files.find((one) => one.path === path) : undefined
	if (!file || shown.kind !== 'repo') {
		await closeDiff($)
		return
	}
	const next: FileDiff = { path, hunks: await readDiff($, shown.root, file) }
	const current = await read($, diff)
	if (JSON.stringify(current) !== JSON.stringify(next)) await update($, diff, () => next)
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

// The tree as the pane draws it, with the files Claude is editing; null outside a repo.
async function currentTree($: EngineInterface): Promise<{ rows: TreeRow[]; edited: Map<string, ActiveEdit> } | null> {
	const shown = await read($, snapshot)
	if (shown.kind !== 'repo') return null
	const root = `${shown.root}/`
	const edited = new Map(
		(await read($, edits))
			.filter((edit) => edit.path.startsWith(root))
			.map((edit) => [edit.path.slice(root.length), edit]),
	)
	return { rows: treeRows(withEditedFiles(shown.files, edited)), edited }
}

async function openFile($: EngineInterface, path: string): Promise<void> {
	await update($, selected, () => path)
	await refresh($)
}

async function select($: EngineInterface, id: string, index: number): Promise<void> {
	await update($, cursor, () => ({ id, index }))
	await $.ui.scroll({ to: { key: id }, in: PANE }).catch(() => undefined)
}

// In a diff, j/k open the next or previous changed file's diff, and the selection follows it.
async function stepDiff($: EngineInterface, rows: TreeRow[], open: string, by: number): Promise<void> {
	if (by === 0) return
	const files = rows.flatMap((row, index) => (row.kind === 'file' ? [{ id: row.id, index }] : []))
	const target = files[files.findIndex((file) => file.id === open) + by]
	if (!target) return
	await select($, target.id, target.index)
	await openFile($, target.id)
}

// One key, from the rows Client or a legend hotkey: moves the selection, opens its file, or closes the diff.
async function navigate($: EngineInterface, key: string): Promise<void> {
	const open = await read($, selected)
	if (open !== null && BACK.has(key)) {
		await closeDiff($)
		return
	}
	const tree = await currentTree($)
	if (!tree || tree.rows.length === 0) return
	if (open !== null) {
		await stepDiff($, tree.rows, open, DOWN.has(key) ? 1 : UP.has(key) ? -1 : 0)
		return
	}
	const at = resolveCursor(tree.rows, await read($, cursor))
	const last = tree.rows.length - 1
	if (OPEN.has(key)) {
		const row = tree.rows[at]
		if (row?.kind === 'file') await openFile($, row.id)
		return
	}
	const index = DOWN.has(key)
		? at < 0
			? 0
			: Math.min(at + 1, last)
		: UP.has(key)
			? at < 0
				? 0
				: Math.max(at - 1, 0)
			: -1
	const row = tree.rows[index]
	if (row) await select($, row.id, index)
}

// Turns a finished edit into the flash once it has shimmered for MIN_SHIMMER_MS, then clears it.
async function finishEdit($: EngineInterface, id: string, startedAt: number): Promise<void> {
	const flash = () => {
		void update($, edits, (list) => list.map((one) => (one.id === id ? { ...one, state: 'done' } : one)))
		$.clock.after(FLASH_MS, () => void update($, edits, (list) => list.filter((one) => one.id !== id)))
	}
	const wait = MIN_SHIMMER_MS - ((await $.clock.now()) - startedAt)
	if (wait > 0) $.clock.after(wait, flash)
	else flash()
}

export const register: Register = (on, options) => {
	const background = backgroundOption(options.background)
	const hoverBackground = background ? lighten(background) : null
	const isHidingDiffs = options.transcriptDiffs !== 'show'
	const isHidingCommands = options.transcriptCommands !== 'show'

	on('session.start', async ($, e, next) => {
		await $.command.register({ name: 'vacuo', description: 'Show the changed-files pane' })
		const resolved = await resolveGlyphs($, options.glyphs)
		await update($, glyphs, () => resolved)
		rowDot = await resolveRowDot($)
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
			const command = isHidingCommands && e.tool === 'Bash' ? e.command : undefined
			if (command !== undefined) await update($, running, (list) => [...list, { id: e.tool_use_id, command }])
			const result = await next(e).finally(() =>
				command === undefined
					? undefined
					: update($, running, (list) => list.filter((one) => one.id !== e.tool_use_id)),
			)
			if (e.tool === 'Bash' && !result.deny && !result.isError) {
				const startedAt = await $.clock.now()
				for (const file of bashChangedFiles(result.result)) {
					const edit: ActiveEdit = { id: `${e.tool_use_id}:${file.path}`, state: 'running', ...file }
					await update($, edits, (list) => [...list.filter((one) => one.path !== file.path), edit])
					await finishEdit($, edit.id, startedAt)
				}
			}
			if (REFRESH_AFTER.has(String(e.tool))) void refresh($)
			return result
		}
		const startedAt = await $.clock.now()
		const edit: ActiveEdit = { id: e.tool_use_id, path, state: 'running', isNewFile: e.tool === 'Write' }
		await update($, edits, (list) => [...list.filter((one) => one.path !== path), edit])
		const result = await next(e)
		if (result.deny || result.isError) await update($, edits, (list) => list.filter((one) => one.id !== edit.id))
		else await finishEdit($, edit.id, startedAt)
		void refresh($)
		return result
	})

	on('ui.message', { requestId: PANE, element: 'rows' }, async ($, e) => {
		const data = e.data
		if (typeof data !== 'object' || data === null) return {}
		if ('back' in data) await closeDiff($)
		else if ('key' in data && typeof data.key === 'string') await navigate($, data.key)
		else if ('press' in data && typeof data.press === 'string') {
			await select($, data.press, 'index' in data && typeof data.index === 'number' ? data.index : 0)
			if ('kind' in data && data.kind === 'file') await openFile($, data.press)
		}
		return {}
	})

	on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
		const { tool, input, isErrored, isInterrupted, isExpanded } = e.props
		if (!isHidingCommands || tool !== 'Bash' || isErrored || isInterrupted || isExpanded === true) return next(e)
		const hidden = hiddenCommandInput(input)
		return hidden ? next({ ...e, props: { ...e.props, input: hidden } }) : next(e)
	})

	// The live line of a folded group draws a command under the description, and that text is no prop a rewrite
	// reaches, so the line is drawn here. Not only for a calls-only group: a nested CLAUDE.md the group loaded or a hook
	// row turns that off, and the engine still prints the command. Those rows come back once the group folds.
	on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
		const { calls, isActive, isExpanded } = e.props
		const isFailed = calls.some((call) => call.isErrored || call.isInterrupted)
		if (!isHidingCommands || !isActive || isExpanded || isFailed) return next(e)
		const description = runningDescription(calls, lastDescription)
		if (!description) return next(e)
		lastDescription = description
		const { Box, Text } = $.ui.resolve(e)
		// Engine rows keep a blank line above them; a row drawn in their place doesn't get it.
		return (
			<Box marginTop={1}>
				<Text>
					<Text dimColor>{`${rowDot} `}</Text>
					{description}
				</Text>
			</Box>
		)
	})

	// The person just picked the answers, so the row keeps its header and drops the question → answer lines. It is drawn
	// here: handed empty questions, the engine draws no row at all.
	on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
		const { tool, isErrored, isExpanded } = e.props
		if (!isHidingCommands || tool !== 'AskUserQuestion' || isErrored || isExpanded === true) return next(e)
		const { Box, Text } = $.ui.resolve(e)
		return (
			<Box marginTop={1}>
				<Text>{`${rowDot} ${ANSWERS_HEADER}`}</Text>
			</Box>
		)
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
		const tree = await currentTree($)
		const edited = tree?.edited ?? new Map<string, ActiveEdit>()
		const treeRowsShown = tree?.rows ?? []
		const openPath = await read($, selected)
		const openDiff = await read($, diff)
		const opened = openPath !== null && openDiff?.path === openPath ? openDiff : null
		const diffView = opened ? { path: opened.path, ...cutDiff(opened.hunks) } : null
		const at = resolveCursor(treeRowsShown, await read($, cursor))
		const commands = await read($, running)
		const runningCommand = commands.at(-1)
		const cursorId = treeRowsShown[at]?.id ?? null
		const rows = treeRowsShown.map((row): RowSpec => ({
			id: row.id,
			kind: row.kind,
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
			<Box flexDirection="column" flexGrow={1}>
				<Text>
					<Text color="magenta" bold>{`${icon} ${shown.branch}`}</Text>
					{symbols && <Text color="red" bold>{` [${symbols}]`}</Text>}
				</Text>
				<Box flexDirection="column" marginTop={1}>
					{rows.length === 0 && !diffView ? (
						<Text dimColor>no changes</Text>
					) : 'Client' in elements ? (
						<elements.Client
							key="rows"
							module="./rows.tsx"
							props={{ rows, hoverBackground, diff: diffView, cursor: cursorId }}
						/>
					) : diffView ? (
						drawDiff(diffView, elements, () => void closeDiff($))
					) : (
						drawRows({ rows, hoverBackground }, elements, 0, -1, cursorId)
					)}
				</Box>
				{(rows.length > 0 || diffView) && (
					<Box flexGrow={1} flexDirection="column" justifyContent="flex-end" marginTop={1}>
						<Box flexDirection="row">
							{diffView ? (
								<Box flexDirection="row">
									<elements.Button
										key="nav-h"
										plain
										dimColor
										autoFocus
										hotkey="h"
										label="back"
										onPress={() => navigate($, 'h')}
									/>
									<Text> </Text>
									<elements.Button
										key="nav-j"
										plain
										dimColor
										hotkey="j"
										label="next file"
										onPress={() => navigate($, 'j')}
									/>
									<Text> </Text>
									<elements.Button
										key="nav-k"
										plain
										dimColor
										hotkey="k"
										label="previous file"
										onPress={() => navigate($, 'k')}
									/>
								</Box>
							) : (
								<Box flexDirection="row">
									<elements.Button
										key="nav-j"
										plain
										dimColor
										hotkey="j"
										label="down"
										onPress={() => navigate($, 'j')}
									/>
									<Text> </Text>
									<elements.Button
										key="nav-k"
										plain
										dimColor
										hotkey="k"
										label="up"
										onPress={() => navigate($, 'k')}
									/>
									<Text> </Text>
									<elements.Button
										key="nav-l"
										plain
										dimColor
										autoFocus
										hotkey="l"
										label="open"
										onPress={() => navigate($, 'l')}
									/>
								</Box>
							)}
						</Box>
						<Text dimColor wrap="wrap">
							{FOCUS_HINT}
						</Text>
					</Box>
				)}
				{runningCommand && (
					<Box
						flexGrow={rows.length > 0 || diffView ? 0 : 1}
						flexDirection="column"
						justifyContent="flex-end"
						marginTop={1}
					>
						{commandLines(runningCommand.command, e.props.bodyColumns - 2).map((line, index) => (
							<Text key={`command-${index}`} dimColor>
								{line}
							</Text>
						))}
					</Box>
				)}
			</Box>,
		)
	})
}
