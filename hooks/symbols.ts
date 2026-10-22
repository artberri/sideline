import type { EngineInterface } from 'claude-code'

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

const NERD_FONT_CHECK =
	'if command -v fc-list >/dev/null 2>&1 && [ -n "$(fc-list ":charset=e0a0" file | grep -vi lastresort | head -n1)" ]; then echo nerd; exit 0; fi; ' +
	'ls "$HOME"/Library/Fonts/*Nerd* /Library/Fonts/*Nerd* >/dev/null 2>&1 && echo nerd || echo plain'

export async function resolveGlyphs($: EngineInterface, option: unknown): Promise<Glyphs> {
	if (option === 'nerd' || option === 'plain') return option
	try {
		const run = await $.process.run(['sh', '-c', NERD_FONT_CHECK], { timeoutMs: 5_000 })
		return run.stdout.trim() === 'nerd' ? 'nerd' : 'plain'
	} catch {
		return 'plain'
	}
}

// The dot Claude Code puts before a row: ⏺ on macOS, ● elsewhere. A row vacuo draws in place of the engine's uses it.
export const rowDotFor = (system: string) => (system.trim() === 'Darwin' ? '⏺' : '●')

export async function resolveRowDot($: EngineInterface): Promise<string> {
	try {
		return rowDotFor((await $.process.run(['uname', '-s'], { timeoutMs: 5_000 })).stdout)
	} catch {
		return rowDotFor('')
	}
}

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
