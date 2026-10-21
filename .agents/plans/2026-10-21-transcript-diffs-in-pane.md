# Diffs in the pane, not the transcript

## Goal

Keep the conversation readable: a file edit shows one summary line instead of an inline diff, and the full diff of a
changed file is one click away in vacuo's pane, always current against `HEAD` however many times Claude or the user
edited the file.

## Behaviour

- **B1.** An Edit or Write result in the conversation shows only `Updated <path> (+N -M)`, or `Created <path> (+N)` for
  a new file. No diff. — _proved by:_ `tests/transcript.test.tsx` › summarize counts an Edit patch…; summarize reads a new file from Write…; an Edit result draws one summary line instead of the diff
- **B2.** A Bash command that changed files shows the same one-line summary for each file it changed. — _proved by:_ `tests/transcript.test.tsx` › summarize lists each file a Bash command changed; a Bash result without file changes draws the engine row
- **B3.** The ctrl+o view still shows the full diffs. — _proved by:_ `tests/transcript.test.tsx` › ctrl+o shows the engine diff
- **B4.** With the `transcriptDiffs` option set to `show`, the conversation shows the diffs as before. — _proved by:_ `tests/transcript.test.tsx` › transcriptDiffs: show keeps the engine diff
- **B5.** Clicking a file in the pane replaces the tree with that file's diff against `HEAD`; an untracked file shows
  as all added, a deleted file as all removed. — _proved by:_
- **B6.** A `← files` button above the diff goes back to the tree. — _proved by:_
- **B7.** The open diff follows the file: it updates when the file changes, and the pane goes back to the tree once the
  file is no longer changed (after a commit, say). — _proved by:_
- **B8.** Clicking a folder does nothing. — _proved by:_

## Context

### Decisions

- **vacuo draws the summary line itself** (option b), rather than handing Claude Code the result with its diff
  removed (option a). The line's counts come from the tool's own patch; the real, complete diff lives in the pane, read
  from git, so it stays right however many edits (Claude's or the user's) went into the file.
- **The diff in the pane is `git diff HEAD`**, the same base as the tree, so the counts in the tree and the diff agree.
- **vacuo draws Claude Code's `  ⎿  ` result gutter** before every summary line, since a row drawn in place of a
  `ToolResult` loses the engine's own; one per file, like a Web Search result's lines.
- **ctrl+o keeps the engine's full result:** the `ToolResult` hook passes through when `isExpanded` is true.
- **Keyboard navigation is a follow-up** (see below): it needs a selected row in the tree first.

### Engine API (checked in the 2.1.306 typings)

- `ui.render` on `ToolResult`: props `tool`, `output` (the tool's result: `BuiltinToolResults[tool]`), `isErrored`,
  `isExpanded`. A hook that returns its own tree replaces the row; `next(e)` draws the engine's.
- `Edit` result: `filePath`, `structuredPatch` (hunks with `lines` prefixed `+`, `-` or ` `). `Write` result: `type`
  (`create` | `update`), `filePath`, `structuredPatch`. `Bash` result: `bashEditDiff?.files[]` with `filePath`,
  `hunks`, `created`, `deleted` (marked `@internal` in the typings, so treat its absence as "no summary").
- Clicks: a `Client` module's `surface.onPointer` and `surface.post(data)`; the post reaches the hooks as `ui.message`
  (`requestId`, `element`, `data`).
- Diff view: the `Code` element with `format="diff"`, on every surface.

### Key files

| Area               | Files                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Hooks              | [hooks/register.tsx](../../hooks/register.tsx)                                                             |
| Tree rows (Client) | [hooks/rows.tsx](../../hooks/rows.tsx)                                                                     |
| Git                | [hooks/git.ts](../../hooks/git.ts)                                                                         |
| Options and state  | [.claude-plugin/plugin.json](../../.claude-plugin/plugin.json), [types/index.d.ts](../../types/index.d.ts) |

### Contracts

- **Engine events:** `ui.render` on `{ component: 'ToolResult' }` for `Edit`, `Write` and `Bash`; `ui.message` from
  the rows `Client`.
- **UI:** a summary row in the transcript; a diff view with a `← files` button in the pane.
- **State:** `selected` (the repo-relative path whose diff is open, or `null`).
- **Options:** `transcriptDiffs`: `hide` (default) | `show`.
- **External commands:** `git diff HEAD -- <path>`, and `git diff --no-index -- /dev/null <path>` for untracked files.
- **Test suites:** `tests/transcript.test.tsx` (new), `tests/pane.test.ts`.

## Phase 1: Show only a summary line for file edits in the conversation ✅

**Description:** Edit, Write and file-changing Bash results draw one summary line per file; ctrl+o and
`transcriptDiffs: show` keep the full diff.

**Test Checklist:**

- [x] Unit test (B1, B2): the summary is built from a patch: counts, `Updated` vs `Created`, paths relative to the
      session directory.
- [x] Render test (B1): an Edit and a Write `ToolResult` draw one summary line and no diff.
- [x] Render test (B2): a Bash `ToolResult` with `bashEditDiff` draws a line per file; without it, the engine's row.
- [x] Render test (B3, B4): `isExpanded` and `transcriptDiffs: show` draw the engine's row.
- [x] Manual, live session (B1–B3): the summary sits where the diff was and reads like Claude Code's own line. The kit
      can't show the engine's styling.

**To-do:**

- [x] Add `transcriptDiffs` to `userConfig` in `plugin.json`.
- [x] Add `hooks/summary.ts`: count a patch, and build the summary lines for Edit, Write and Bash outputs.
- [x] In `hooks/register.tsx`: a `ui.render` hook on `ToolResult` that draws the summary, passing through when expanded,
      errored, disabled by the option, or when there's nothing to summarize.
- [x] Run `bun run format` and `bun run check`.

## Phase 2: Click a file in the pane to see its diff

**Description:** A click on a file row opens its diff against `HEAD` in the pane, with a `← files` button back to the
tree.

**Test Checklist:**

- [ ] Pane test (B5, B8): a posted press on a file opens its diff; on a folder it does nothing.
- [ ] Pane test (B5): an untracked file's diff comes from `--no-index`.
- [ ] Pane test (B6): pressing `← files` goes back to the tree.
- [ ] Pane test (B7): a refresh redraws the diff; a file that leaves the tree closes the diff view.
- [ ] Manual, live session (B5): clicking a row opens its diff. The kit posts the message; only a real pointer proves
      the click lands on the right row.

**To-do:**

- [ ] Add `selected` to the state contract.
- [ ] In `hooks/rows.tsx`: an `onPointer` listener that posts the clicked row's id on a left press.
- [ ] Handle `ui.message` from the rows `Client` and set `selected` for files.
- [ ] Read the selected file's diff in `hooks/git.ts` (tracked and untracked), refreshed with the snapshot.
- [ ] Draw the diff view: `← files` button, path, `Code format="diff"`.
- [ ] Run `bun run format` and `bun run check`.

## Follow-ups

- **Keyboard navigation:** a selected row in the tree, `j`/`k` or arrows to move, Enter to open the diff, `h`/left to go
  back. Needs its own plan.

## Next step

Phase 2: post the clicked row from the rows `Client`, then open the file's diff in the pane.
