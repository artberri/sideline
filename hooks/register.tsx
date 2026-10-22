import { atom, read, update } from 'claude-code'
import type { ClientElements, Color, EngineInterface, Register } from 'claude-code'

import type {
	ActiveEdit,
	ChangedFile,
	Cursor,
	FileDiff,
	FileStatus,
	LoggedCommand,
	SessionInfo,
	Snapshot,
	TurnState,
} from '../types'
import { LOG_SIZE, commandStep, hiddenCommandInput, logLine, runningDescription } from './commands'
import { readDiff, readSnapshot } from './git'
import { modelName } from './meter'
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
import { changesRows, clampOffset, hiddenAround, hiddenLabel, isOverCommands, revealOffset, wrapLines } from './window'
import type { TreeRow } from './tree'

const PANE = 'sideline'
const TITLE = 'Changes'
const NAME = 'SIDELINE'
const CHANGES_COLOR = 'merged'
const SESSION_COLOR = 'yellow'
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
const DOWN = new Set(['j', 'down'])
const UP = new Set(['k', 'up'])
const OPEN = new Set(['l', 'right', 'return'])
const BACK = new Set(['h', 'left', 'backspace'])
// The key that puts the focus ring on the newest command in the log.
const COMMANDS_KEY = 'c'
const COMMAND_KEY_PREFIX = 'command-'
// The tools whose call waits on the person: a question, a plan to approve.
const DIALOG_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

const snapshot = atom({ plugin: 'sideline', key: 'snapshot' } as const, { kind: 'loading' } as Snapshot)
const glyphs = atom({ plugin: 'sideline', key: 'glyphs' } as const, 'plain')
const edits = atom({ plugin: 'sideline', key: 'edits' } as const, [] as ActiveEdit[])
const selected = atom({ plugin: 'sideline', key: 'selected' } as const, null as string | null)
const diff = atom({ plugin: 'sideline', key: 'diff' } as const, null as FileDiff | null)
const cursor = atom({ plugin: 'sideline', key: 'cursor' } as const, null as Cursor | null)
const commands = atom({ plugin: 'sideline', key: 'commands' } as const, [] as LoggedCommand[])
// The log line unfolded to its whole command, by tool_use_id.
const openCommand = atom({ plugin: 'sideline', key: 'openCommand' } as const, null as string | null)
// The first line the changes box shows of its tree, diff or command.
const changesOffset = atom({ plugin: 'sideline', key: 'changesOffset' } as const, 0)
// The logged command whose line holds the pane's focus ring, by tool_use_id: while set, j/k move between commands.
const session = atom(
	{ plugin: 'sideline', key: 'session' } as const,
	{
		model: null,
		effort: null,
		context: null,
		fiveHour: null,
		sevenDay: null,
	} as SessionInfo,
)
const focusedCommand = atom({ plugin: 'sideline', key: 'focusedCommand' } as const, null as string | null)
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
// The changes box's last drawn window, which a scroll clamps to: its content's lines and the rows it shows.
let changesWindow = { lines: 0, rows: 0 }
// Claude Code's row dot on this machine, read at session start.
let rowDot = rowDotFor('')

async function readAndStore($: EngineInterface): Promise<void> {
	const next = await readSnapshot($, await $.session.cwd())
	const current = await read($, snapshot)
	if (JSON.stringify(current) !== JSON.stringify(next)) await update($, snapshot, () => next)
	await readSelectedDiff($, next)
}

async function closeDiff($: EngineInterface): Promise<void> {
	await update($, changesOffset, () => 0)
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
	await update($, openCommand, () => null)
	await update($, changesOffset, () => 0)
	await update($, selected, () => path)
	await refresh($)
}

// Opens a logged command in the changes box in place of the tree or a diff, or closes it when it is the one open.
async function toggleCommand($: EngineInterface, id: string): Promise<void> {
	const isOpen = (await read($, openCommand)) === id
	if (!isOpen) await closeDiff($)
	await update($, changesOffset, () => 0)
	await update($, openCommand, () => (isOpen ? null : id))
}

async function select($: EngineInterface, id: string, index: number): Promise<void> {
	await update($, focusedCommand, () => null)
	await update($, cursor, () => ({ id, index }))
	// The pane never scrolls; the changes box's own window follows the selection.
	const { lines, rows } = changesWindow
	await update($, changesOffset, (offset) => revealOffset(clampOffset(offset, lines, rows), index, rows))
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
// Puts the pane's focus ring on a logged command's line, and j/k on the commands box until h or the person moves the
// ring elsewhere.
async function focusCommand($: EngineInterface, id: string): Promise<void> {
	await update($, focusedCommand, () => id)
	await $.ui.focus({ requestId: PANE, key: `${COMMAND_KEY_PREFIX}${id}` }).catch(() => undefined)
}

// In the commands box j/k step through the log, l opens the command, h leaves for the tree.
async function navigateCommands($: EngineInterface, id: string, key: string): Promise<void> {
	const ids = (await read($, commands)).map((one) => one.id)
	const step = commandStep(
		ids,
		id,
		DOWN.has(key) ? 'down' : UP.has(key) ? 'up' : OPEN.has(key) ? 'open' : BACK.has(key) ? 'leave' : null,
	)
	if (step?.kind === 'focus') await focusCommand($, step.id)
	else if (step?.kind === 'open') await toggleCommand($, id)
	else if (step?.kind === 'leave') {
		await update($, focusedCommand, () => null)
		await $.ui.focus({ requestId: PANE, key: 'nav-l' }).catch(() => undefined)
	}
}

async function navigate($: EngineInterface, key: string): Promise<void> {
	const focused = await read($, focusedCommand)
	// c toggles: into the commands box on the newest command, and from there back to the changes box, as h does.
	if (key === COMMANDS_KEY) {
		const newest = (await read($, commands)).at(-1)
		if (focused !== null) await navigateCommands($, focused, 'h')
		else if (newest) await focusCommand($, newest.id)
		return
	}
	if (focused !== null && (await read($, openCommand)) === null) {
		await navigateCommands($, focused, key)
		return
	}
	if ((await read($, openCommand)) !== null) {
		if (BACK.has(key)) {
			await update($, openCommand, () => null)
			await update($, changesOffset, () => 0)
		}
		return
	}
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

type TitledBox = {
	name: string
	color: Color
	key: string
	rows?: number
	label?: string
	footer?: string
	background?: string
}

// A rounded box with its caps title laid over the top border, at the left, `label` over it at the right, and `footer`
// over the bottom border, at the right: each a sibling drawn after the box, so it paints over the border rather than inside the box's clip. `rows`
// fixes the box's content rows; without it the box takes every row left.
function titled(
	{ Box, Text }: Pick<ClientElements, 'Box' | 'Text'>,
	{ name, color, key, rows, label = '', footer = '', background }: TitledBox,
	body: JSX.Element,
) {
	return (
		<Box key={key} flexDirection="column" flexGrow={rows === undefined ? 1 : 0} flexShrink={0}>
			<Box
				key={`${key}-box`}
				flexDirection="column"
				borderStyle="round"
				borderColor={color}
				paddingX={1}
				overflow="hidden"
				flexGrow={rows === undefined ? 1 : 0}
				height={rows === undefined ? undefined : rows + 2}
			>
				{body}
			</Box>
			<Box position="absolute" top={0} left={2}>
				<Text color={color} bold backgroundColor={background}>{` ${name} `}</Text>
			</Box>
			{label !== '' && (
				<Box position="absolute" top={0} right={2}>
					<Text color={color} backgroundColor={background}>{` ${label} `}</Text>
				</Box>
			)}
			{footer !== '' && (
				<Box position="absolute" bottom={0} right={2}>
					<Text color={color} backgroundColor={background}>{` ${footer} `}</Text>
				</Box>
			)}
		</Box>
	)
}

export const register: Register = (on, options) => {
	const background = backgroundOption(options.background)
	const hoverBackground = background ? lighten(background) : null
	const isHidingDiffs = options.transcriptDiffs !== 'show'
	const isHidingCommands = options.transcriptCommands !== 'show'
	const isShowingSession = options.sessionBox !== 'hide'

	on('session.start', async ($, e, next) => {
		await $.command.register({ name: 'sideline', description: 'Show the changed-files pane' })
		const resolved = await resolveGlyphs($, options.glyphs)
		await update($, glyphs, () => resolved)
		rowDot = await resolveRowDot($)
		// A host without a bound session (headless, an SDK host) has no model yet; the first request brings it.
		const model = await $.session.model().catch(() => null)
		if (model) await update($, session, (info) => ({ ...info, model }))
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

	// The main loop's model and effort as each of its requests goes out: /model and /effort show from the next one.
	on('turn.step', async function* ($, e, next) {
		if (e.agentId === undefined) {
			const effort = e.effort === undefined ? null : String(e.effort)
			await update($, session, (info) =>
				info.model === e.model && info.effort === effort ? info : { ...info, model: e.model, effort },
			)
		}
		return yield* next(e)
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
			if (command !== undefined) {
				await update($, commands, (list) =>
					[...list, { id, command, state: 'running' as const }].slice(-LOG_SIZE),
				)
				const kept = new Set((await read($, commands)).map((one) => one.id))
				await update($, openCommand, (open) => (open !== null && kept.has(open) ? open : null))
			}
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

	// The person's own Tab or click onto a log line puts j/k on the commands box, and onto anything else but the hint
	// buttons (which j/k/l press) takes them back to the tree. The mod's own moves set it where they happen.
	on('ui.focus', { requestId: PANE }, async ($, e, next) => {
		const element = e.element ?? ''
		const isCommand = element.startsWith(COMMAND_KEY_PREFIX) && element !== 'command-back'
		if (e.origin.kind === 'person' && !element.startsWith('nav-'))
			await update($, focusedCommand, () => (isCommand ? element.slice(COMMAND_KEY_PREFIX.length) : null))
		return next(e)
	})

	// The pane always fits its rows, so the engine never scrolls it: a wheel tick over the changes box moves that box's
	// own window, and the scroll keys (no pointer) move it too. A tick over the commands box moves nothing.
	on('ui.scroll', { requestId: PANE }, async ($, e) => {
		if (!isOverCommands(e.pointer?.row, e.bodyRows)) {
			const { lines, rows } = changesWindow
			await update($, changesOffset, (offset) =>
				clampOffset(clampOffset(offset, lines, rows) + e.by, lines, rows),
			)
		}
		return {}
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
				height={e.props.scroll.bodyRows}
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
		const changes = (body: JSX.Element, footer = '', label = '') =>
			titled(elements, { name: 'CHANGES', color: CHANGES_COLOR, key: 'changes', label, footer, background }, body)
		const info = await read($, session)
		// The session box: the branch line, then the model and effort, on its first line.
		const sessionBox = (branch: JSX.Element) =>
			isShowingSession &&
			titled(
				elements,
				{ name: 'SESSION', color: SESSION_COLOR, key: 'session', rows: 2, background },
				<Box flexDirection="column">
					<Box justifyContent="space-between">
						{branch}
						<Text wrap="truncate">
							{` ${info.model ? modelName(info.model) : '—'}`}
							<Text dimColor>{' · '}</Text>
							{info.effort ?? '—'}
						</Text>
					</Box>
					<Text> </Text>
				</Box>,
			)
		const logged = await read($, commands)
		const isInCommands = (await read($, focusedCommand)) !== null
		const open = await read($, openCommand)
		const logColumns = e.props.bodyColumns - BOX_FRAME
		const log = titled(
			elements,
			{ name: 'COMMANDS', color: COMMAND_COLOR, key: 'commands', rows: LOG_SIZE, background },
			<Box flexDirection="column">
				{logged.length === 0 && <Text dimColor>no commands yet</Text>}
				{logged.map((entry) => (
					<Box key={`log-${entry.id}`} flexDirection="row">
						<Text color={LOG_GLYPH_COLOR[entry.state]}>{`${LOG_GLYPH[entry.state]} `}</Text>
						<elements.Button
							key={`command-${entry.id}`}
							plain
							dimColor={entry.state !== 'running' || undefined}
							label={logLine(entry.command, logColumns - 2)}
							onPress={() => void toggleCommand($, entry.id)}
						/>
					</Box>
				))}
			</Box>,
		)
		if (shown.kind === 'loading')
			return fill(
				<Box flexDirection="column" flexGrow={1}>
					{title}
					{sessionBox(<Text> </Text>)}
					{changes(<Text> </Text>)}
					{log}
				</Box>,
			)
		if (shown.kind === 'none')
			return fill(
				<Box flexDirection="column" flexGrow={1}>
					{title}
					{sessionBox(<Text dimColor>not a git repo</Text>)}
					{changes(isShowingSession ? <Text> </Text> : <Text dimColor>not a git repo</Text>)}
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
		const commandView = logged.find((entry) => entry.id === open) ?? null
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
		const hints = (rows.length > 0 || diffView || commandView || logged.length > 0) && (
			<Box flexDirection="column" alignItems="center" marginTop={1}>
				<Box flexDirection="row">
					{commandView ? (
						<elements.Button
							key="nav-h"
							plain
							dimColor
							autoFocus
							hotkey="h"
							label="back"
							onPress={() => navigate($, 'h')}
						/>
					) : diffView ? (
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
							{logged.length > 0 && <Text> </Text>}
							{logged.length > 0 && (
								<elements.Button
									key="nav-c"
									plain
									dimColor
									hotkey={COMMANDS_KEY}
									label={isInCommands ? 'changes' : 'commands'}
									onPress={() => navigate($, COMMANDS_KEY)}
								/>
							)}
						</Box>
					)}
				</Box>
			</Box>
		)
		const branchLine = (
			<Text wrap="truncate">
				<Text color="magenta" bold>{`${icon} ${shown.branch}`}</Text>
				{symbols && <Text color="red" bold>{` [${symbols}]`}</Text>}
			</Text>
		)
		const filesLabel = `${fileCount} file${fileCount === 1 ? '' : 's'}`
		const windowRows = changesRows(e.props.scroll.bodyRows, Boolean(hints), isShowingSession)
		const innerColumns = e.props.bodyColumns - BOX_FRAME
		const commandRows = commandView ? wrapLines(commandView.command, innerColumns) : []
		const diffLines = diffView && diffView.hunks !== '' ? diffView.hunks.replace(/\n$/, '').split('\n') : []
		// A diff or a command keeps its header row and the blank row under it above the window.
		const shownRows = commandView || diffView ? Math.max(1, windowRows - 2) : windowRows
		const lineCount = commandView ? commandRows.length : diffView ? diffLines.length : rows.length
		changesWindow = { lines: lineCount, rows: shownRows }
		const offset = clampOffset(await read($, changesOffset), lineCount, shownRows)
		const footer = hiddenLabel(hiddenAround(offset, lineCount, shownRows))
		const windowDiff = diffView && {
			...diffView,
			hunks: diffView.hunks === '' ? '' : diffLines.slice(offset, offset + shownRows).join('\n') + '\n',
		}
		const windowTree = rows.slice(offset, offset + shownRows)
		return fill(
			<Box flexDirection="column" flexGrow={1}>
				{title}
				{hints}
				{sessionBox(branchLine)}
				{changes(
					<Box flexDirection="column">
						{!isShowingSession && (
							<Box justifyContent="space-between">
								{branchLine}
								{fileCount > 0 && <Text dimColor>{` ${filesLabel}`}</Text>}
							</Box>
						)}
						<Box flexDirection="column" marginTop={isShowingSession ? 0 : 1}>
							{commandView ? (
								<Box flexDirection="column">
									<elements.Button
										key="command-back"
										plain
										label="← back"
										onPress={() => void toggleCommand($, commandView.id)}
									/>
									<Box flexDirection="column" marginTop={1}>
										{commandRows.slice(offset, offset + shownRows).map((line, index) => (
											<Text key={`command-line-${offset + index}`}>{line}</Text>
										))}
									</Box>
								</Box>
							) : rows.length === 0 && !diffView ? (
								<Text dimColor>no changes</Text>
							) : 'Client' in elements ? (
								<elements.Client
									key="rows"
									module="./rows.tsx"
									props={{
										rows: windowTree,
										hoverBackground,
										diff: windowDiff,
										cursor: cursorId,
										offset,
									}}
								/>
							) : windowDiff ? (
								drawDiff(windowDiff, elements, () => void closeDiff($))
							) : (
								drawRows({ rows: windowTree, hoverBackground }, elements, 0, -1, cursorId)
							)}
						</Box>
					</Box>,
					footer,
					isShowingSession && fileCount > 0 ? filesLabel : '',
				)}
				{log}
			</Box>,
		)
	})
}
