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

// The open file's diff against HEAD: unified hunks, or empty for a binary file.
export type FileDiff = { path: string; hunks: string }

// A Bash command in the pane's log of the last few, by its tool_use_id: still running, finished, or failed (an error,
// a refusal or an interruption).
export type LoggedCommand = { id: string; command: string; state: 'running' | 'done' | 'failed' }

// What Claude is doing, as the pane's title shows it: working through a turn, waiting on the person's answer to a
// question or a plan, or waiting for a prompt.
export type TurnState = 'idle' | 'working' | 'waiting'

// The selected row: its id, and its index so the selection can fall to the nearest row when it leaves the tree.
export type Cursor = { id: string; index: number }

declare module 'claude-code' {
	interface PluginState {
		sideline: {
			snapshot: Snapshot
			glyphs: Glyphs
			edits: ActiveEdit[]
			selected: string | null
			diff: FileDiff | null
			cursor: Cursor | null
			commands: LoggedCommand[]
			openCommand: string | null
			changesOffset: number
			focusedCommand: string | null
			turn: TurnState
		}
	}
}
