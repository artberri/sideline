import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type {
	ActiveEdit,
	ChangedFile,
	Cursor,
	FileDiff,
	FileStatus,
	LoggedCommand,
	Snapshot,
	TurnState,
} from '../types'
import { LOG_SIZE, hiddenCommandInput, logLine, runningDescription } from './commands'
import { readDiff, readSnapshot } from './git'
import { rowIcon } from './icons'
import { cutDiff, drawDiff, drawRows } from './rows'
import type { RowSpec } from './rows'
import { bashChangedFiles, countsLabel, fileRow, summarize } from './summary'
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

const PANE = 'sideline'
const TITLE = 'Changes'
const NAME = 'SIDELINE'
const CHANGES_COLOR = 'claude'
const COMMAND_COLOR = 'inactive'
// Each log line starts with its command's state.
const LOG_GLYPH: Record<LoggedCommand['state'], string> = { running: '●', done: '✓', failed: '✗' }
const LOG_GLYPH_COLOR: Record<LoggedCommand['state'], Color> = { running: 'claude', done: 'success', failed: 'error' }
// What a titled box takes from the width inside the pane: its border and its padding, each side.
const BOX_FRAME = 4
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
// The tools whose call waits on the person: a question, a plan to approve.
const DIALOG_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

const snapshot = atom({ plugin: 'sideline', key: 'snapshot' } as const, { kind: 'loading' } as Snapshot)
const glyphs = atom({ plugin: 'sideline', key: 'glyphs' } as const, 'plain')
const edits = atom({ plugin: 'sideline', key: 'edits' } as const, [] as ActiveEdit[])
const selected = atom({ plugin: 'sideline', key: 'selected' } as const, null as string | null)
const diff = atom({ plugin: 'sideline', key: 'diff' } as const, null as FileDiff | null)
const cursor = atom({ plugin: 'sideline', key: 'cursor' } as const, null as Cursor | null)
const commands = atom({ plugin: 'sideline', key: 'commands' } as const, [] as LoggedCommand[])
const turn = atom({ plugin: 'sideline', key: 'turn' } as const, 'idle' as TurnState)

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
		await $.command.register({ name: 'sideline', description: 'Show the changed-files pane' })
		const resolved = await resolveGlyphs($, options.glyphs)
		await update($, glyphs, () => resolved)
		rowDot = await resolveRowDot($)
		await refresh($)
		void $.ui.open({ id: PANE, title: TITLE })
		$.clock.every(POLL_MS, () => void refresh($))
		return next(e)
	})

	on('command.run', { command: 'sideline' }, async ($) => {
		await refresh($)
		await $.ui.open({ id: PANE, title: TITLE })
		return { text: 'Changes pane opened.' }
	})

	// Only the main loop's turns: a subagent's start and end (`agentId`) come and go inside them.
	on('turn.start', async ($, e, next) => {
		if (e.agentId === undefined) await update($, turn, () => 'working')
		return next(e)
	})

	on('turn.complete', async ($, e, next) => {
		if (e.agentId !== undefined) return next(e)
		return next(e).finally(() => update($, turn, () => 'idle'))
	})

	on('tool.call', async ($, e, next) => {
		// A question or a plan to approve keeps its call open exactly as long as its dialog waits for the person.
		if (DIALOG_TOOLS.has(String(e.tool)) && e.agentId === undefined) {
			await update($, turn, () => 'waiting')
			return next(e).finally(() => update($, turn, (state) => (state === 'waiting' ? 'working' : state)))
		}
		const path = editedPath(e)
		if (!path) {
			const command = e.tool === 'Bash' ? e.command : undefined
			const id = e.tool_use_id
			const settle = (state: LoggedCommand['state']) =>
				update($, commands, (list) => list.map((one) => (one.id === id ? { ...one, state } : one)))
			if (command !== undefined)
				await update($, commands, (list) =>
					[...list, { id, command, state: 'running' as const }].slice(-LOG_SIZE),
				)
			const result = await next(e).catch(async (error: unknown) => {
				if (command !== undefined) await settle('failed')
				throw error
			})
			if (command !== undefined) {
				const output: unknown = result.result
				const isInterrupted =
					typeof output === 'object' &&
					output !== null &&
					'interrupted' in output &&
					output.interrupted === true
				await settle(result.deny || result.isError || isInterrupted ? 'failed' : 'done')
			}
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

	// A finished Edit or Write row carries its counts on its title line, and its result line (the same path again) is
	// drawn as nothing below.
	on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
		const { tool, output, isRunning, isErrored, isInterrupted, isExpanded } = e.props
		const isFileTool = tool === 'Edit' || tool === 'Write'
		if (!isHidingDiffs || !isFileTool || isRunning || isErrored || isInterrupted || isExpanded === true)
			return next(e)
		const row = fileRow(tool, output, await $.session.cwd())
		if (!row) return next(e)
		const { Box, Text } = $.ui.resolve(e)
		// Engine rows keep a blank line above them; a row drawn in their place doesn't get it.
		return (
			<Box marginTop={1}>
				<Text>
					<Text color="success">{`${rowDot} `}</Text>
					<Text bold>{row.name}</Text>
					{`(${row.summary.path}) `}
					<Text dimColor>{countsLabel(row.summary)}</Text>
				</Text>
			</Box>
		)
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
		const { calls, isActive, isExpanded, isCallsOnly } = e.props
		const isFailed = calls.some((call) => call.isErrored || call.isInterrupted)
		if (!isHidingCommands || isExpanded || isFailed) return next(e)
		// A finished group's count line (`Ran 1 shell command`) says nothing the rows around it don't; one that also
		// loaded a CLAUDE.md or ran a hook keeps it.
		if (!isActive && isCallsOnly !== true) return next(e)
		const { Box, Text } = $.ui.resolve(e)
		if (!isActive) return <Box />
		const description = runningDescription(calls, lastDescription)
		if (!description) return next(e)
		lastDescription = description
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
		const cwd = await $.session.cwd()
		const summaries = summarize(e.props.tool, e.props.output, cwd)
		if (!summaries) return next(e)
		const { Box, Text } = $.ui.resolve(e)
		if (fileRow(e.props.tool, e.props.output, cwd)) return <Box />
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
		const state = await read($, turn)
		const title = (
			<Box justifyContent="center">
				<Text bold wrap="truncate">
					{NAME}
					<Text dimColor>{' · '}</Text>
					{state === 'waiting' ? (
						<Text color="warning">WAITING</Text>
					) : state === 'working' ? (
						<Text color="claude">WORKING</Text>
					) : (
						<Text dimColor>IDLE</Text>
					)}
				</Text>
			</Box>
		)
		// A rounded box with its caps title laid over the top border, at the left: the title is a sibling drawn after the
		// box, so it paints over the border rather than inside the box's clip.
		const titled = (name: string, color: Color, body: JSX.Element, key: string) => (
			<Box key={key} flexDirection="column" marginTop={1}>
				<Box key={`${key}-box`} flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
					{body}
				</Box>
				<Box position="absolute" top={0} left={2}>
					<Text color={color} bold backgroundColor={background}>{` ${name} `}</Text>
				</Box>
			</Box>
		)
		const changes = (body: JSX.Element) => titled('CHANGES', CHANGES_COLOR, body, 'changes')
		const logged = await read($, commands)
		const log = titled(
			'COMMANDS',
			COMMAND_COLOR,
			<Box flexDirection="column">
				{logged.length === 0 ? (
					<Text dimColor>no commands yet</Text>
				) : (
					logged.map((entry) => (
						<Text key={`command-${entry.id}`} wrap="truncate">
							<Text color={LOG_GLYPH_COLOR[entry.state]}>{`${LOG_GLYPH[entry.state]} `}</Text>
							<Text dimColor={entry.state !== 'running'}>
								{logLine(entry.command, e.props.bodyColumns - 2 - BOX_FRAME - 2)}
							</Text>
						</Text>
					))
				)}
			</Box>,
			'commands',
		)
		if (shown.kind === 'loading')
			return fill(
				<Box flexDirection="column" flexGrow={1}>
					{title}
					{changes(<Text> </Text>)}
					<Box flexGrow={1} />
					{log}
				</Box>,
			)
		if (shown.kind === 'none')
			return fill(
				<Box flexDirection="column" flexGrow={1}>
					{title}
					{changes(<Text dimColor>not a git repo</Text>)}
					<Box flexGrow={1} />
					{log}
				</Box>,
			)
		const symbols = statusSymbols(shown.status)
		const tree = await currentTree($)
		const edited = tree?.edited ?? new Map<string, ActiveEdit>()
		const treeRowsShown = tree?.rows ?? []
		const openPath = await read($, selected)
		const openDiff = await read($, diff)
		const opened = openPath !== null && openDiff?.path === openPath ? openDiff : null
		const diffView = opened ? { path: opened.path, ...cutDiff(opened.hunks) } : null
		const at = resolveCursor(treeRowsShown, await read($, cursor))
		const cursorId = treeRowsShown[at]?.id ?? null
		const fileCount = treeRowsShown.filter((row) => row.kind === 'file').length
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
		const hints = (rows.length > 0 || diffView) && (
			<Box flexDirection="column" alignItems="center" marginTop={1}>
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
		)
		return fill(
			<Box flexDirection="column" flexGrow={1}>
				{title}
				{hints}
				{changes(
					<Box flexDirection="column">
						<Box justifyContent="space-between">
							<Text wrap="truncate">
								<Text color="magenta" bold>{`${icon} ${shown.branch}`}</Text>
								{symbols && <Text color="red" bold>{` [${symbols}]`}</Text>}
							</Text>
							{fileCount > 0 && <Text dimColor>{` ${fileCount} file${fileCount === 1 ? '' : 's'}`}</Text>}
						</Box>
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
					</Box>,
				)}
				<Box flexGrow={1} />
				{log}
			</Box>,
		)
	})
}
