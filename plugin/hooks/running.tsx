import type { ClientModule } from 'claude-code'

import { TICK_MS, isInBand } from './rows'

export type RunningProps = { text: string }

type Local = { phase: number; stop?: () => void }

// An opened command's `running…` line, with the band the tree sweeps across a file Claude is editing. A Client owns
// the frame timer, so the shimmer never makes the pane's hook redraw; it stops when the line leaves the tree.
export const Running: ClientModule<RunningProps, Local> = (props, surface) => {
	const state = surface.state ?? { phase: 0 }
	if (!state.stop) {
		const stop = surface.every(TICK_MS, () => {
			const current = surface.state
			if (current) surface.setState({ ...current, phase: current.phase + 1 })
		})
		surface.setState({ ...state, stop })
	}
	const { Text } = surface.elements
	const chars = [...props.text]
	return (
		<Text>
			{chars.map((char, i) =>
				isInBand(i, state.phase, chars.length) ? (
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
