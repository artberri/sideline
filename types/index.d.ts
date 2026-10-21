export type Glyphs = 'nerd' | 'plain'

export type BranchStatus = {
	conflicted: number
	stashed: boolean
	deleted: number
	renamed: number
	modified: number
	staged: number
	untracked: number
	ahead: number
	behind: number
}

export type Header =
	| { kind: 'loading' }
	| { kind: 'none' }
	| { kind: 'repo'; branch: string; isDetached: boolean; status: BranchStatus }

declare module 'claude-code' {
	interface PluginState {
		vacuo: { header: Header; glyphs: Glyphs }
	}
}
