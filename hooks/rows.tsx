import type { ClientElements, ClientModule, Color } from 'claude-code'

export type RowSpec = {
	id: string
	kind: 'dir' | 'file'
	indent: string
	icon: string
	iconColor: Color | null
	name: string
	isStruck: boolean
	lit: 'running' | 'done' | null
	added: number
	deleted: number
	isBinary: boolean
}

// The open file's diff as the rows Client draws it, cut to fit a Client's props.
export type DiffView = { path: string; hunks: string; isTruncated: boolean }

export type RowsProps = { rows: RowSpec[]; hoverBackground: string | null; diff: DiffView | null }

type Local = { phase: number; hovered: number; stop?: () => void }

const TICK_MS = 50
const BAND = 3

// A band of bright characters sweeps across the name; the rest stays dim, both in Claude's own accent color.
function isInBand(index: number, phase: number, length: number): boolean {
	const position = (phase % (length + BAND * 2)) - BAND
	return Math.abs(index - position) < BAND / 2 + 0.5
}

// A Client's props are capped at 100,000 characters; a diff past this is cut at the last hunk that fits.
export const DIFF_LIMIT = 60_000

export function cutDiff(hunks: string, limit = DIFF_LIMIT): { hunks: string; isTruncated: boolean } {
	if (hunks.length <= limit) return { hunks, isTruncated: false }
	const lastHunk = hunks.lastIndexOf('\n@@', limit)
	const end = lastHunk > 0 ? lastHunk + 1 : hunks.lastIndexOf('\n', limit) + 1
	return { hunks: hunks.slice(0, end), isTruncated: true }
}

export function drawDiff(
	diff: DiffView,
	{ Box, Text, Button, Code }: Pick<ClientElements, 'Box' | 'Text' | 'Button' | 'Code'>,
	onBack: () => void,
) {
	return (
		<Box flexDirection="column">
			<Box flexDirection="row">
				<Button key="back" plain label="← files" onPress={onBack} />
				<Text bold>{`  ${diff.path}`}</Text>
			</Box>
			<Box flexDirection="column" marginTop={1}>
				{diff.hunks === '' ? (
					<Text dimColor>no text diff (binary file)</Text>
				) : (
					<Code source={diff.hunks} path={diff.path} format="diff" wrap="truncate-end" />
				)}
				{diff.isTruncated && <Text dimColor>… diff truncated</Text>}
			</Box>
		</Box>
	)
}

export function drawRows(
	{ rows, hoverBackground }: Pick<RowsProps, 'rows' | 'hoverBackground'>,
	{ Box, Text }: Pick<ClientElements, 'Box' | 'Text'>,
	phase: number,
	hovered = -1,
) {
	const isHovered = (row: RowSpec) => row.kind === 'file' && rows[hovered]?.id === row.id
	const name = (row: RowSpec) => {
		if (row.lit === 'done') {
			return (
				<Text color="claude" bold>
					{row.name}
				</Text>
			)
		}
		if (row.lit === 'running') {
			const chars = [...row.name]
			return (
				<Text>
					{chars.map((char, i) =>
						isInBand(i, phase, chars.length) ? (
							<Text color="claude" bold>
								{char}
							</Text>
						) : (
							<Text color="claude" dimColor>
								{char}
							</Text>
						),
					)}
				</Text>
			)
		}
		return (
			<Text strikethrough={row.isStruck} underline={isHovered(row)}>
				{row.name}
			</Text>
		)
	}

	return (
		<Box flexDirection="column">
			{rows.map((row) => (
				<Box
					key={row.id}
					flexDirection="row"
					backgroundColor={isHovered(row) && hoverBackground ? hoverBackground : undefined}
				>
					<Box flexGrow={1} flexShrink={1} overflow="hidden">
						<Text wrap="truncate-end">
							{row.indent}
							<Text
								color={row.lit === 'running' ? 'claude' : (row.iconColor ?? undefined)}
							>{`${row.icon} `}</Text>
							{name(row)}
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
			))}
		</Box>
	)
}

// The animated rows: a Client owns the frame timer, so the shimmer never makes the pane's hook redraw.
export const Rows: ClientModule<RowsProps, Local> = (props, surface) => {
	const state = surface.state ?? { phase: 0, hovered: -1 }
	const isRunning = props.rows.some((row) => row.lit === 'running')
	if (isRunning && !state.stop) {
		const stop = surface.every(TICK_MS, () => {
			const current = surface.state
			if (current) surface.setState({ ...current, phase: current.phase + 1 })
		})
		surface.setState({ ...state, stop })
	} else if (!isRunning && state.stop) {
		state.stop()
		surface.setState({ phase: 0, hovered: state.hovered })
	}
	if (props.diff) {
		surface.onPointer(() => undefined)
		return drawDiff(props.diff, surface.elements, () => surface.post({ back: true }))
	}
	surface.onPointer((event) => {
		const current = surface.state ?? state
		const hovered = event.type === 'leave' || !props.rows[event.y] ? -1 : event.y
		if (hovered !== current.hovered) surface.setState({ ...current, hovered })
		if (event.type !== 'down' || (event.button ?? 'left') !== 'left') return
		const row = props.rows[event.y]
		if (row) surface.post({ press: row.id, kind: row.kind })
	})
	return drawRows(props, surface.elements, state.phase, state.hovered)
}
