import type { BranchStatus, Glyphs } from '../types'

export const BRANCH_ICON: Record<Glyphs, string> = { nerd: '\u{e0a0}', plain: '⎇' }

// Starship's git_status defaults, in its `$all_status$ahead_behind` order, except that diverged also shows both
// counts (the common `diverged = '⇕⇡${ahead_count}⇣${behind_count}'` override) instead of a bare `⇕`.
export function statusSymbols(s: BranchStatus): string {
	const all = [
		s.conflicted ? '=' : '',
		s.stashed ? '$' : '',
		s.deleted ? '✘' : '',
		s.renamed ? '»' : '',
		s.modified ? '!' : '',
		s.staged ? '+' : '',
		s.untracked ? '?' : '',
	].join('')
	const aheadBehind =
		s.ahead && s.behind ? `⇕⇡${s.ahead}⇣${s.behind}` : s.ahead ? `⇡${s.ahead}` : s.behind ? `⇣${s.behind}` : ''
	return all + aheadBehind
}

// `fc-list :charset=e0a0 file` lists the font files with the branch glyph, which every Nerd Font has; macOS's
// LastResort font claims every code point, so it doesn't count.
export const hasNerdFont = (fcList: string) =>
	fcList.split('\n').some((line) => line.trim() !== '' && !/lastresort/i.test(line))

// A Nerd Font's file name says so: `JetBrainsMonoNerdFont-Regular.ttf`.
export const isNerdFontFile = (name: string) => name.includes('Nerd')

// The dot Claude Code puts before a row: ⏺ on macOS, ● elsewhere. A row sideline draws in place of the engine's uses it.
export const rowDotFor = (system: string) => (system.trim() === 'Darwin' ? '⏺' : '●')

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function backgroundOption(option: unknown): string | undefined {
	return typeof option === 'string' && HEX_COLOR.test(option.trim()) ? option.trim() : undefined
}

// A hovered row's background: the pane's own background with a little white mixed in.
export function lighten(hex: string, amount = 0.12): string {
	const full =
		hex.length === 4
			? `#${hex
					.slice(1)
					.split('')
					.map((c) => c + c)
					.join('')}`
			: hex
	const channel = (i: number) => {
		const value = Number.parseInt(full.slice(i, i + 2), 16)
		return Math.round(value + (255 - value) * amount)
			.toString(16)
			.padStart(2, '0')
	}
	return `#${channel(1)}${channel(3)}${channel(5)}`
}
