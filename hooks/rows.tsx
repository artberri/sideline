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

export type RowsProps = { rows: RowSpec[] }

type Local = { phase: number; stop?: () => void }

const TICK_MS = 90
const BAND = 3

// A band of bright characters sweeps across the name; the rest stays dim, both in Claude's own accent color.
function isInBand(index: number, phase: number, length: number): boolean {
	const position = (phase % (length + BAND * 2)) - BAND
	return Math.abs(index - position) < BAND / 2 + 0.5
}

export function drawRows(rows: RowSpec[], { Box, Text }: Pick<ClientElements, 'Box' | 'Text'>, phase: number) {
	const name = (row: RowSpec) => {
		if (row.lit === 'done') {
			return (
				<Text color="success" bold>
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
		return <Text strikethrough={row.isStruck}>{row.name}</Text>
	}

	return (
		<Box flexDirection="column">
			{rows.map((row) => (
				<Box key={row.id} flexDirection="row">
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
	const state = surface.state ?? { phase: 0 }
	const isRunning = props.rows.some((row) => row.lit === 'running')
	if (isRunning && !state.stop) {
		const stop = surface.every(TICK_MS, () => {
			const current = surface.state
			if (current) surface.setState({ ...current, phase: current.phase + 1 })
		})
		surface.setState({ ...state, stop })
	} else if (!isRunning && state.stop) {
		state.stop()
		surface.setState({ phase: 0 })
	}
	surface.onPointer((event) => {
		if (event.type !== 'down' || (event.button ?? 'left') !== 'left') return
		const row = props.rows[event.y]
		if (row) surface.post({ press: row.id, kind: row.kind })
	})
	return drawRows(props.rows, surface.elements, state.phase)
}
