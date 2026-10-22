# Pane boxes and Claude's state

## Goal

Give the pane the look of [claude-flightdeck](https://github.com/scasella/claude-flightdeck): the mod's name and
Claude's state centred on top, the keyboard hints right under it, and each section in its own rounded, titled box: the
changes (branch, tree, diff) in an orange box and the running command in a grey one.

## Behaviour

- **B1.** The pane's first line, centred, reads `SIDELINE · IDLE` while Claude waits for a prompt and
  `SIDELINE · WORKING` while a main turn runs. — _proved by:_ `tests/pane.test.ts` › "the title reads SIDELINE · IDLE, and WORKING while a main turn runs", "an interrupted turn sets the title back to IDLE"
- **B2.** A subagent's turn ending doesn't switch the state to `IDLE` while the main turn still runs. — _proved by:_ `tests/pane.test.ts` › "a subagent's turn ending leaves the title WORKING"
- **B3.** The keyboard hints (`j down k up l open`, or `h back j next file k previous file` with a diff open) and the
  focus hint sit right under the title line, centred, and only when there are changes or an open diff. — _proved by:_ `tests/pane.test.ts` › "the hints sit under the title, above the tree, and only with changes", "with no changes the pane shows no hints"
- **B4.** The branch line, the tree and the open diff are drawn inside a rounded box in the theme's `claude` colour
  (orange). The branch line is the box's first row, with the number of changed files on its right. — _proved by:_
- **B5.** "no changes" and "not a git repo" show inside the same box; while the first snapshot loads, the box is
  empty. — _proved by:_
- **B6.** While a Bash command runs, its lines show at the bottom of the pane in a rounded box in the theme's
  `inactive` colour (grey); no box shows when none runs. — _proved by:_
- **B7.** The command's lines are cut to the width inside the box, so the box never wraps. — _proved by:_
- **B8.** Each box has a caps title at its top left, `CHANGES` and `COMMAND`: on the border (`╭─ CHANGES ───╮`) when
  the overlay draws cleanly, else as the box's first row. — _proved by:_
- **B9.** While Claude waits on the person (a permission prompt, a question), the state reads `WAITING`, and goes back
  to `WORKING` once the tool runs or is refused. — _proved by:_
- **B10.** The pane keeps its `background` option behind the boxes, and ctrl+x tab, clicks and the `j k l h` keys
  work as before. — _proved by:_ manual

## Context

flightdeck's header and legend are at
[hooks/register.tsx:1103-1123](https://github.com/scasella/claude-flightdeck/blob/main/hooks/register.tsx#L1103-L1123):
a centred bold `FLIGHTDECK · <MODEL> IDLE|WORKS` line, a centred legend row, then panels as
`<Box borderStyle="round" borderColor={C.main} paddingX={1} width={w}>` with theme colours (`claude`, `inactive`,
`subtle`; its `PALETTES.theme` in `hooks/core.ts:155`). Its working state comes from `turn.start` / `turn.complete`
on the main loop (`register.tsx:294`, `:497`). MIT licensed; nothing is copied, only the look.

Decisions (2026-10-22, with the user):

- **States:** `IDLE` and `WORKING` first, like flightdeck; no model, no architect. `WAITING` is its own last phase,
  because no event says a dialog is open: the closest is a main-loop `tool.check` whose result is `ask`, which needs a
  live probe before it is trusted.
- **Legend:** the row under the title is the keyboard hints, not a colour legend (no `■ changes ■ command`). They move
  up from the bottom of the pane.
- **Box titles:** each box has a caps title at its top left. The engine's `Box` has no border-title prop (only
  `borderStyle`, `borderColor`, `borderDimColor`), but it has `position="absolute"` with `top`, so the title is first
  laid over the top border; if that draws badly (over the `background` colour, or cut), it becomes the box's first row.
- **Command box:** at the bottom of the pane, where the footer is now; the changes box stays at the top.
- **Branch line:** inside the changes box as its first row, like flightdeck's card titles, with the file count on the
  right. With the fallback title, title and branch may share one row (`CHANGES · main [!?]   3 files`); pick live.
- The pane title is `SIDELINE` (the plugin name in capitals), not the pane's `Changes` title.

### Key files

| Area                       | Files                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| Pane render, hooks         | [hooks/register.tsx](../../hooks/register.tsx) (`ui.render` on `Pane`) |
| Footer lines               | [hooks/commands.ts](../../hooks/commands.ts) (`commandLines`)          |
| Rows drawn in the `Client` | [hooks/rows.tsx](../../hooks/rows.tsx)                                 |
| State contract             | [types/index.d.ts](../../types/index.d.ts)                             |
| Pane tests                 | [tests/pane.test.ts](../../tests/pane.test.ts)                         |

### Contracts

- **Engine events:** `turn.start` (`{ text, turnId, agentId? }`) and `turn.complete` (`TurnCompleteFields`:
  `turnId`, `agentId?`, `isAborted`, ...); only events without `agentId` change the state. Phase 3 adds `tool.check`
  (result `decision`: `allow | ask | deny`) and `tool.call`.
- **UI:** the `Pane` render; `Box` `borderStyle="round"`, `borderColor`, `justifyContent="center"`,
  `position="absolute"` / `top`; theme colours `claude` and `inactive` (`ThemeKey`).
- **State:** a new `sideline.turn` atom: `'idle' | 'working'`, then `'waiting'` in Phase 3, in `types/index.d.ts`.
- **Test suites:** `tests/pane.test.ts`.

## Phase 1: Show the mod name and Claude's state on top ✅

**Description:** The pane opens with a centred `SIDELINE · IDLE` line that turns to `WORKING` while Claude works, and
the keyboard hints move up under it.

**Test Checklist:**

- [x] Pane test (B1): the pane draws `SIDELINE` and `IDLE` at start, `WORKING` after a main `turn.start`, `IDLE`
      after its `turn.complete`.
- [x] Pane test (B2): a `turn.complete` with an `agentId` leaves `WORKING`.
- [x] Pane test (B3): the hints draw before the first tree row, and not at all with no changes.

**To-do:**

- [x] Add `turn: 'idle' | 'working'` to `PluginState.sideline` in `types/index.d.ts` and a `turn` atom.
- [x] Hook `turn.start` and `turn.complete` (main loop only) to set it; call `next(e)` first on `turn.complete`.
- [x] Draw the title line: bold `SIDELINE`, a dim `·`, the state (`WORKING` in `claude`, `IDLE` dim), centred.
- [x] Move the hint buttons and `FOCUS_HINT` from the bottom block to under the title, centred.
- [x] Run `bun run format` and `bun run check`.

## Phase 2: Draw the changes and the running command in titled boxes

**Description:** The branch line, tree and diff sit in an orange rounded box titled `CHANGES`; the running command
sits in a grey rounded box titled `COMMAND` at the bottom of the pane.

**Test Checklist:**

- [ ] Pane test (B4): the changes box is drawn with `borderStyle` `round` and `borderColor` `claude`, the branch line
      and `3 files` inside it.
- [ ] Pane test (B5): "no changes" and "not a git repo" are inside the box.
- [ ] Pane test (B6): while a command runs, a box with `borderColor` `inactive` holds its lines; none after it ends.
- [ ] Pane test (B7): a long command line is cut to `bodyColumns - 6` (pane padding 2, border 2, box padding 2).
- [ ] Pane test (B8): the drawn tree holds `CHANGES` and, while a command runs, `COMMAND`.
- [ ] Manual, live session (B8): the title sits on the border cleanly — only a look shows how the overlay draws.
- [ ] Manual, live session (B10): background, focus, clicks and keys — the `Client` rows and hotkeys can't be driven
      from a test.

**To-do:**

- [ ] Wrap the branch line and the rows / diff / empty text in `<Box borderStyle="round" borderColor="claude"
      paddingX={1} flexDirection="column">`; put the file count on the branch line's right.
- [ ] Move "not a git repo" and the loading state into the same box, under the title and hints.
- [ ] Wrap the footer in `<Box borderStyle="round" borderColor="inactive" paddingX={1}>`, still pushed to the bottom.
- [ ] Give each box its caps title: a `position="absolute"` `top={0}` overlay at the top-left of the border
      (`CHANGES`, `COMMAND` in the border's colour, on the pane's background); check it live, and fall back to a
      bold first row inside the box if it draws badly.
- [ ] Pass the inner width to `commandLines`, and check rows in `hooks/rows.tsx` don't overflow the box.
- [ ] Run `bun run format` and `bun run check`.

## Phase 3: Show when Claude waits on the person

**Description:** The title reads `WAITING` while a permission prompt or a question waits for an answer.

**Test Checklist:**

- [ ] Pane test (B9): after a main-loop `tool.check` resolves to `ask`, the title reads `WAITING`; after the call's
      `tool.call` starts, or the turn completes, it doesn't.
- [ ] Manual, live session (B9): a real permission prompt and an `AskUserQuestion` — whether `tool.check` resolves
      before the dialog closes is what the probe finds out.

**To-do:**

- [ ] Probe live: log when a main-loop `tool.check` resolves to `ask` and when that call's `tool.call` starts, for a
      permission prompt, a classifier-allowed call in auto mode and an `AskUserQuestion`.
- [ ] If the probe shows a usable window, add `'waiting'` to the `turn` atom and set it there (`WAITING` in
      `warning`); otherwise record what was found in `.agents/follow-ups.md` and drop the rule.
- [ ] Run `bun run format` and `bun run check`.

## Next step

Phase 2: wrap the branch line, tree and diff in the orange `CHANGES` box and the running command in the grey
`COMMAND` box, and try the titles on the border.
