# Command log

## Goal

Turn the bottom box, which shows only the command running now, into a `COMMANDS` log that is always there: the last
five shell commands, one line each with their state, where clicking a line shows the whole command in place.

## Behaviour

- **B1.** A `COMMANDS` box is always at the bottom of the pane; before the first command it reads "no commands yet".
  — _proved by:_ `tests/pane.test.ts` › "the COMMANDS box is always at the bottom, empty at first", "outside a git repo the CHANGES box says so"
- **B2.** It lists the last five Bash commands, oldest at the top and newest at the bottom, one line each: a script
  shows its first line, and each line is cut with `…` to the width inside the box. — _proved by:_ `tests/pane.test.ts` › "the log keeps the last five commands, oldest first", "logLine is the first line after $, cut to the width, with … for a script", "a long command line is cut to the width inside its box"
- **B3.** Each line starts with its state: `●` running (orange), `✓` finished, `✗` failed, refused or interrupted
  (red). — _proved by:_ `tests/pane.test.ts` › "a running command reads ●, then ✓ once it ends, and stays in the log", "a failed or interrupted command reads ✗", "an errored command reads ✗"
- **B4.** The log shows whatever `transcriptCommands` is set to. — _proved by:_ `tests/pane.test.ts` › "transcriptCommands: show still logs the command"
- **B5.** Clicking a line shows the whole command in place, inside the box (every line, wrapped), with the other lines
  still listed; clicking it again folds it back to one line (no `h`: it already means back from a diff). — _proved by:_ `tests/pane.test.ts` › "pressing a log line unfolds the whole command, and pressing it again folds it"; clicks: manual
- **B6.** The log lasts for the session and survives a reload of the mod; a new session starts it empty. — _proved
  by:_ manual

## Context

Decisions (2026-10-22, with the user):

- **Full view:** inline in the box, the clicked line growing into the whole command, not a view in the main area like
  the diff; the box grows upward and the tree stays.
- **Line text:** the command (`$ git status --short`, a script's first line), not its description, which the
  transcript already shows.
- **Option:** the log no longer depends on `transcriptCommands`; that option only governs the transcript. Today the
  footer only shows with `hide` (`tests/pane.test.ts` › "transcriptCommands: show keeps the command out of the pane"),
  and that test changes.
- Every Bash call is logged, a subagent's too, as the running footer does now.
- Clicks use the `Button` element (`key`, `label`, `plain`, `dimColor`, `onPress`): a `plain` button draws its label
  alone, as the hint buttons under the title do. The label is plain text, so the state glyph's colour sits in a `Text`
  beside it.
- Kept in `$.state` (session-long, survives a reload), not `$.store`.

### Key files

| Area                   | Files                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Tool hook, pane render | [hooks/register.tsx](../../hooks/register.tsx) (`running` atom, `tool.call`, `COMMAND`) |
| Command lines          | [hooks/commands.ts](../../hooks/commands.ts) (`commandLines`)                           |
| State contract         | [types/index.d.ts](../../types/index.d.ts) (`RunningCommand`)                           |
| Pane tests             | [tests/pane.test.ts](../../tests/pane.test.ts)                                          |

### Contracts

- **Engine events:** `tool.call` for `Bash` (start: `e.command`, `e.tool_use_id`; end: `result.deny`,
  `result.isError`, `result.result.interrupted`).
- **UI:** the `Pane` render; `Button` with `plain`, `onPress`.
- **State:** `sideline.commands: LoggedCommand[]` (`{ id, command, state: 'running' | 'done' | 'failed' }`, at most
  five) replaces `sideline.running`; `sideline.openCommand: string | null` for the line shown in full.
- **Test suites:** `tests/pane.test.ts`.

## Phase 1: Keep a log of the last five commands in the pane ✅

**Description:** The bottom box is always there, titled `COMMANDS`, listing the last five commands with their state.

**Test Checklist:**

- [x] Pane test (B1): with no commands, the box reads "no commands yet".
- [x] Pane test (B2): after six commands, the box lists the last five, oldest first.
- [x] Unit test (B2): a log line is the first line of the command after `$ `, cut with `…` to the width.
- [x] Pane test (B3): a held call reads `●`; a finished one `✓`; an errored or denied one `✗`.
- [x] Pane test (B4): with `transcriptCommands: show` the log still lists the command.

**To-do:**

- [x] Replace `RunningCommand` / `running` with `LoggedCommand` / `commands` in `types/index.d.ts` and
      `hooks/register.tsx`.
- [x] In `tool.call`, for every Bash call: add `{ id, command, state: 'running' }` (keeping the last five) before
      `next(e)`, and set `done` or `failed` from the result, `failed` on a throw.
- [x] Add `logLine(command, columns)` to `hooks/commands.ts` (first non-blank line, whitespace squeezed, `$ `, cut
      with `…`); drop `commandLines` and `FOOTER_LINES` if nothing else uses them.
- [x] Draw the `COMMANDS` box always, at the bottom, with a line per entry: the state glyph in its colour, then the
      line, dim when finished.
- [x] Run `bun run format` and `bun run check`.

## Phase 2: Show a whole command when its line is clicked ✅

**Description:** Clicking a log line unfolds the whole command in place; clicking it again folds it.

**Test Checklist:**

- [x] Pane test (B5): pressing a line's button draws every line of the command; pressing it again draws one line.
- [x] Manual, live session (B5): clicking with the mouse and after ctrl+x tab — the pointer can't be driven from a
      test.
- [x] Manual, live session (B6): the log is still there after a reload, empty in a new session.

**To-do:**

- [x] Add `openCommand: string | null` to the state contract and an atom.
- [x] Draw each log line as a `plain` `Button` (`key` `command-<id>`) whose `onPress` toggles `openCommand`.
- [x] Under the open line, draw the whole command: every line, wrapped to the box's width, dim.
- [x] Clear `openCommand` when its command leaves the log.
- [x] Run `bun run format` and `bun run check`.

## Next step

Done: both phases are in. A follow-up: scroll an unfolded command inside the box.
