# Hide long Bash commands in the transcript

## Goal

Keep the conversation readable: a Bash call the model described shows its description, not a multi-line command that
is hard to read, and the answers to Claude's questions fold into one line. The command being run is still visible, at
the bottom of vacuo's pane, while it runs.

## Behaviour

- **B1.** A finished Bash call whose command is long and that has a description shows `Bash(<description>)` on one
  line, not the command. — _proved by:_ `tests/transcript.test.tsx` › a finished long described Bash row draws the description, not the command; hiddenCommandInput puts the description in the command place
- **B2.** A running Bash call whose command is long and that has a description shows the description and its timing,
  with no `$ command` line under it. — _proved by:_ `tests/transcript.test.tsx` › a running long described Bash row draws no command
- **B3.** A Bash row (not a live group) with a short command (one line, at most 80 characters), or any Bash call with
  no description, is drawn as Claude Code draws it; vacuo never makes up a description. — _proved by:_ `tests/transcript.test.tsx` › isLongCommand is true for a newline or past 80 characters; a short command, or one without a description, keeps its row
- **B4.** An errored or interrupted Bash call is drawn as Claude Code draws it. — _proved by:_ `tests/transcript.test.tsx` › an errored or interrupted row keeps its command
- **B5.** The "User answered Claude's questions" row shows its header line only, without the questions and answers
  under it. — _proved by:_ `tests/transcript.test.tsx` › the answers row keeps its header without the questions
- **B6.** While a folded group of calls is live and its current call is a Bash call with a description (any length),
  the group's line shows the description with no `$ command` under it; once the group is done it reads `Ran N shell
  commands` as before. — _proved by:_ `tests/transcript.test.tsx` › a live group running a long described command draws the description, not the command; a live group hides a short described command too; a finished group draws the engine line
- **B7.** A live group whose running call is not Bash (a Read, a Grep) is drawn as Claude Code draws it. — _proved by:_ `tests/transcript.test.tsx` › a live group running a Read, or not calls-only, draws the engine line
- **B8.** While a Bash command runs, the bottom of the pane shows it dimmed as `$ <command>`, cut to the pane's width;
  the line is gone once no Bash command is running. — _proved by:_ `tests/pane.test.ts` › a running Bash command shows at the bottom of the pane until it ends; a long command line is cut to the pane width; commandLines shows up to three lines, cut to the width, and counts the rest
- **B9.** The ctrl+o view shows every command and answer in full. — _proved by:_ `tests/transcript.test.tsx` › ctrl+o shows the command (Bash rows); ctrl+o shows the answers
- **B10.** With the `transcriptCommands` option set to `show`, the transcript shows commands and answers as Claude
  Code draws them, and the pane has no command line. — _proved by:_ `tests/transcript.test.tsx` › transcriptCommands: show keeps the command (Bash rows); transcriptCommands: show keeps the answers

## Context

### Decisions

- **Only the model's own `description` is used.** No model call to summarise a command: a call without a description
  keeps its command.
- **A live group hides any described command, short ones too.** Seen live: under the line the engine prints the
  turn's latest command, even one outside the group (a `sed` after a short `grep`), so passing a short call's line
  to the engine leaked the next one.
- **While the next call is being written, the group line keeps the last description.** Seen live: a Bash call joins
  the group with an empty input while the model writes it, and the engine's line then shows the previous description
  with a command under it.
- **Rows vacuo draws use Claude Code's dot:** `⏺` on macOS, `●` elsewhere, read once from `uname -s` at session start;
  a plain `●` looked smaller next to the engine's rows on macOS.
- **Short one-liners stay** in finished rows. `Bash(git status)` reads fine; a command is "long" when it has a newline
  or is over 80 characters. 80 is a fixed limit since `ToolUse` carries no width.
- **One option, `transcriptCommands: hide | show`** (default `hide`), next to `transcriptDiffs`, for the Bash rows, the
  live group line, the answers row and the pane footer. The answers row joins it because it is the same kind of noise:
  the transcript repeating input the person just saw or typed.
- **The answers row keeps its header** (`User answered Claude's questions:`) and drops the question → answer lines;
  the person just picked them.
- **The footer shows up to three of the command's lines** (`$ ` before the first, `… N more lines` after), each cut to
  the pane's width: the first line alone is often just `sleep 8` or `cd …`.
- **The pane footer shows the command only while it runs.** No history: once it ends the footer goes, so the pane
  doesn't grow a stale line.
- **ctrl+o keeps everything:** every hook passes through when `isExpanded` is true, as the `ToolResult` hook for
  diffs does ([hooks/register.tsx](../../hooks/register.tsx), `on('ui.render', { component: 'ToolResult' }, …)`).
- **Rewrite before redraw.** Where a rewritten prop gets the engine to draw what we want, it keeps the engine's dot,
  timing and colours; vacuo draws its own row only where a rewrite can't do it. Phase 1 starts by finding which.
- **Other tools with long inputs** (Agent prompts, MCP calls) are left out; see Follow-ups.
- **Most Bash calls are drawn as a group, not a row.** Seen live: a command that doesn't change repo files (even one
  writing outside the repo) folds into `Ran 1 shell command`, and while it runs the group's live line shows the
  description reworded (`Waiting eight seconds, …`) with the `$ command` lines under it. Only calls that change files
  in the repo get a standalone `Bash(…)` row. So Phase 3 (the group line) is what hides the command in most cases.
- **Phase 1 rewrites the row's `input`** (the description as `command`, no `description` field) and lets the engine
  draw it: seen live, a file-changing Bash call reads `Bash(<description>)` with its `Updated …` lines.

### Engine API (checked in the 2.1.306 typings)

- `ui.render` on `ToolUse`: props `tool_use_id`, `tool`, `input` (as the model sent it), `isRunning`, `isErrored`,
  `isInterrupted`, `isExpanded?`, `output?`. "The call was decided by `tool.call`, so a rewrite here changes the row
  alone." A rewritten `input` with a field left `undefined` can throw while drawn (the engine then draws its own and
  logs `ui.render (ToolUse) threw while drawn`), so a rewrite sets every field.
- `ui.render` on `ToolResult`: `tool`, `output`, `isErrored`, `isExpanded?`. A rewritten `output` is checked against
  the tool's output schema.
- `ui.render` on `ToolGroup`: `calls: ToolGroupCall[]` (`tool_use_id?`, `tool`, `input`, `isRunning`, `isErrored`,
  `isInterrupted`, `output?`), `isActive`, `isExpanded`, `isCallsOnly?`. `isExpanded` is "the only prop a rewrite
  changes on the screen", and the live line's text is no prop, so hiding its command means vacuo draws the line.
  "A hook that draws a group of its own calls in its own way checks [`isCallsOnly`] is true."
- `Bash` input: `command`, `description?` (`.claude-plugin/types/claude-code-tools/index.d.ts`).
- `AskUserQuestion` result: `questions[]` with `question`, `header`, …, plus the answers
  (`BuiltinToolResults['AskUserQuestion']`), with `answers` and `annotations` keyed by question. Seen with a probe: the
  `⎿ · question → answer` lines are the `ToolResult`, drawn from `output.questions` and `output.answers`.
- The `ToolProgress` row (`(ctrl+b to run in background)`) stays as it is.

### Key files

| Area              | Files                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Hooks             | [hooks/register.tsx](../../hooks/register.tsx)                                                               |
| Result summaries  | [hooks/summary.ts](../../hooks/summary.ts)                                                                   |
| Options and state | [.claude-plugin/plugin.json](../../.claude-plugin/plugin.json), [types/index.d.ts](../../types/index.d.ts)   |
| Tests             | [tests/transcript.test.tsx](../../tests/transcript.test.tsx), [tests/pane.test.ts](../../tests/pane.test.ts) |

### Contracts

- **Engine events:** `ui.render` on `ToolUse`, `ToolResult` (`AskUserQuestion`), `ToolGroup`; the existing `tool.call`
  hook records running Bash calls.
- **UI:** the Bash row, the answers row, the live group line, a footer line under the pane's tree.
- **State:** `running: RunningCommand[]` (`{ id, command }`, by `tool_use_id`) in `PluginState.vacuo`.
- **Options:** `transcriptCommands` (`hide` | `show`, default `hide`) in `plugin.json`.
- **Test suites:** `tests/transcript.test.tsx` (rows, group line, answers), `tests/pane.test.ts` (footer).

## Phase 1: Hide long Bash commands in tool rows ✅

**Description:** A described Bash call with a long command shows `Bash(<description>)` once done and the description
alone while running, under a new `transcriptCommands` option.

**Test Checklist:**

- [x] Unit test (B1, B3): `isLongCommand` is true for a newline or over 80 characters, false otherwise.
- [x] Transcript test (B1): a finished long described Bash row draws the description, not the command.
- [x] Transcript test (B2): a running long described Bash row draws no command.
- [x] Transcript test (B3): a short command, and a call without a description, draw the engine's row.
- [x] Transcript test (B4): an errored and an interrupted row draw the engine's row.
- [x] Transcript test (B9): an expanded row draws the engine's row.
- [x] Transcript test (B10): `transcriptCommands: show` draws the engine's row.
- [x] Manual, live session (B1, B2): the row keeps the engine's dot, colour and `· 2s` timing — a test sees the props,
      not the paint.

**To-do:**

- [x] Spike: in a live session, rewrite `input.command` to the description in a `ToolUse` hook and look at a running
      and a finished row; if the running row still draws a `$ …` line or the title reads wrong, draw the row in vacuo
      instead (dot, description, timing). Record the choice in Decisions.
- [x] Add `transcriptCommands` to `userConfig` in `plugin.json`, as `transcriptDiffs` is.
- [x] Add `isLongCommand(command)` and a `describedCommand(input)` reader (description and command, or nothing) to a
      pure helper module, `hooks/commands.ts`.
- [x] Add the `ui.render` hook on `{ component: 'ToolUse' }` in `register.tsx`, passing through for anything but a
      Bash call that is long, described, not errored or interrupted, and not expanded.
- [x] Write the tests above in `tests/transcript.test.tsx` (not a new `tests/commands.test.tsx`: any test file sorting before
      `pane.test.ts` makes `tsc` hit TS2589 on its first `$.tool.call`).
- [x] Run `bun run format` and `bun run check`.

## Phase 2: Fold the answers to Claude's questions into one line ✅

**Description:** The "User answered Claude's questions" row keeps its header and drops the question → answer lines.

**Test Checklist:**

- [x] Transcript test (B5): an `AskUserQuestion` row draws the header without the questions.
- [x] Transcript test (B9, B10): expanded, and with `show`, it draws the engine's row.
- [x] Manual, live session (B5): the header line looks as the engine's did.

**To-do:**

- [x] Find which component draws the answer lines (`ToolUse` or `ToolResult` for `AskUserQuestion`) with a hook that
      logs its props in a live session.
- [x] Hook that component for `AskUserQuestion` and draw the header alone, after a blank line, as
      `● User answered Claude's questions` (no colon, since nothing follows). A rewrite with empty `questions` and
      `answers` was tried first: the engine then drew no row at all.
- [x] Write the tests above.
- [x] Run `bun run format` and `bun run check`.

## Phase 3: Hide the command under the live group line ✅

**Description:** While a folded group runs a long described Bash command, its line shows the description alone.

**Test Checklist:**

- [x] Transcript test (B6): an active, calls-only group whose running call is a long described Bash call draws the
      description and no command.
- [x] Transcript test (B6): an inactive group draws the engine's line.
- [x] Transcript test (B7): an active group running a Read draws the engine's line; so does one that isn't calls-only.
- [x] Transcript test (B3): an active group running a short Bash command draws the engine's line.
- [x] Transcript test (B9, B10): expanded, and with `show`, the engine's line.
- [x] Manual, live session (B6): the line looks like the engine's (no dot, normal text) and turns into `Ran N shell
      commands` when the group ends.

**To-do:**

- [x] Add the `ui.render` hook on `{ component: 'ToolGroup' }`, drawing the running call's description when
      `isActive`, `isCallsOnly`, not `isExpanded`, and the running call is a long described Bash call.
- [x] Draw the line after a blank one, as engine rows have, and keep it from before the call runs until the group
      folds (the current call is the running one, else the last).
- [x] Reuse `describedCommand` and `isLongCommand` from `hooks/commands.ts` (as `runningDescription(calls)`).
- [x] Write the tests above.
- [x] Run `bun run format` and `bun run check`.

## Phase 4: Show the running command at the bottom of the pane

**Description:** A dim `$ <command>` line under the tree while a Bash command runs, gone when it ends.

**Test Checklist:**

- [ ] Manual, live session (B8): the footer sits at the bottom of the pane while a command runs.

- [x] Pane test (B8): while a Bash call runs, the pane draws `$ <command>` under the tree.
- [x] Pane test (B8): after the call resolves, the line is gone.
- [x] Pane test (B8): a multi-line or long command draws on one line, cut to the pane's width.
- [x] Pane test (B10): with `show`, no command line.

**To-do:**

- [x] Add `RunningCommand` and `running` to `types/index.d.ts`, and its atom in `register.tsx`.
- [x] In the `tool.call` hook, add a Bash call to `running` before `next(e)` and remove it once `next` resolves (or
      throws).
- [x] Add `commandLines(command, columns)` to `hooks/commands.ts`: up to three lines, whitespace squeezed, cut with `…`.
- [x] Draw the footer in the `Pane` hook, below the tree and diff views, when `running` holds a call.
- [x] Write the tests above in `tests/pane.test.ts`.
- [x] Run `bun run format` and `bun run check`.

## Follow-ups

Moved to [.agents/follow-ups.md](../follow-ups.md): other tools' long inputs, and the `tsc` failure that depends on
test file order.

## Next step

Phase 4: live check of the pane footer; then the plan is done.
