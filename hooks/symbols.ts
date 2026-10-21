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

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function backgroundOption(option: unknown): string | undefined {
	return typeof option === 'string' && HEX_COLOR.test(option.trim()) ? option.trim() : undefined
}
