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

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'conflicted'

export type LineCounts = { added: number; deleted: number; isBinary: boolean }

export type ChangedFile = LineCounts & { path: string; status: FileStatus; isUntracked: boolean }

export type Snapshot =
	| { kind: 'loading' }
	| { kind: 'none' }
	| {
			kind: 'repo'
			root: string
			branch: string
			isDetached: boolean
			status: BranchStatus
			files: ChangedFile[]
	  }

// A file Claude is editing (`running`) or just finished editing (`done`, shown as a flash until it expires), by
// absolute path.
export type ActiveEdit = { id: string; path: string; state: 'running' | 'done'; isNewFile: boolean }

declare module 'claude-code' {
	interface PluginState {
		vacuo: { snapshot: Snapshot; glyphs: Glyphs; edits: ActiveEdit[] }
	}
}
