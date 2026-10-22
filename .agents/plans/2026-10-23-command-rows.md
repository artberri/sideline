# Command rows option

## Goal

Let the person choose how many lines the `COMMANDS` box shows (5 by default, 0 for none), and outside a git repo give
`COMMANDS` the room `CHANGES` has nothing to fill, with `CHANGES` saying "Not a git repository".

## Behaviour

- **B1.** A `commandRows` option (`/config` → "Commands box rows") sets how many lines `COMMANDS` shows, 5 by default;
  `CHANGES` takes the rest of the pane, and its window, scroll and `↑ ↓` count follow. — _proved by:_ `tests/pane.test.ts` › "commandRows: 3 makes the COMMANDS box three lines tall, the newest three"; `tests/window.test.ts` › "changesRows leaves the title, hints, the session box or branch line, borders and commands box out"
- **B2.** With `commandRows` at `0` there is no `COMMANDS` box: `CHANGES` reaches the bottom of the pane and the
  `c commands` hint isn't drawn. — _proved by:_ `tests/pane.test.ts` › "commandRows: 0 draws no COMMANDS box and no c hint"
- **B3.** A value that isn't a whole number from 0 to 20 counts as 5. — _proved by:_ `tests/window.test.ts` › "commandRowsOption takes a whole number from 0 to 20, else 5"
- **B4.** Outside a git repo `CHANGES` is one line, "Not a git repository", and `COMMANDS` takes every row left,
  showing as many of the latest commands as fit; with `commandRows` at `0`, `CHANGES` keeps the space. — _proved by:_
- **B5.** The wheel over `COMMANDS` still moves nothing, at any height of the box. — _proved by:_ `tests/window.test.ts` › "isOverCommands is true on the commands box rows, false above, for a key, and with no box"

## Context

Decisions (2026-10-23, with the user):

- **Option** `commandRows`, a number from 0 to 20, default 5; outside that range or not whole, 5. `0` hides the box.
- **Wording** outside a repo: "Not a git repository" (git's own phrase), dim like "No uncommitted changes".
- **The log keeps 20 commands**, not 5: the option's most, so any box height has history to show, and a taller box
  outside a repo shows up to 20 (first planned as 50; cut to 20 live). The box draws the newest that fit.

Today `LOG_SIZE = 5` in [hooks/commands.ts](../../hooks/commands.ts) is both the log's length and the box's lines,
and `COMMANDS_ROWS = LOG_SIZE + 2` in [hooks/window.ts](../../hooks/window.ts) feeds `changesRows` and
`isOverCommands`. Both become values computed from the option (and, outside a repo, from the pane's height).

`userConfig` fields may be numbers (`PluginOptions` is `string | number | boolean | readonly string[]`); check
`claude plugin validate` accepts `"type": "number"` with a `default` when the option is added.

### Key files

| Area                      | Files                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Option                    | [.claude-plugin/plugin.json](../../.claude-plugin/plugin.json)                                     |
| Log length, command lines | [hooks/commands.ts](../../hooks/commands.ts) (`LOG_SIZE`, `logLine`)                               |
| Rows and the wheel        | [hooks/window.ts](../../hooks/window.ts) (`COMMANDS_ROWS`, `changesRows`, `isOverCommands`)        |
| Pane render               | [hooks/register.tsx](../../hooks/register.tsx) (`titled`, the `COMMANDS` box, the `none` snapshot) |
| Tests                     | [tests/pane.test.ts](../../tests/pane.test.ts), [tests/window.test.ts](../../tests/window.test.ts) |

### Contracts

- **Options:** `commandRows` (number, default 5).
- **UI:** the `COMMANDS` box's height; `CHANGES` with a fixed one-line body outside a repo.
- **State:** `sideline.commands` keeps up to 20 entries.
- **Test suites:** `tests/pane.test.ts` (`test(name, { options: { commandRows } }, ...)`), `tests/window.test.ts`.

## Phase 1: Set how many rows the commands box shows ✅

**Description:** `commandRows` sizes `COMMANDS`; `0` hides it; `CHANGES` and its scrolling follow.

**Test Checklist:**

- [x] Unit test (B3): `commandRowsOption` turns `5`, `0`, `20`, `-1`, `21`, `2.5` and `'x'` into 5, 0, 20, 5, 5, 5, 5.
- [x] Unit test (B1, B5): `changesRows` and `isOverCommands` with 3 and 0 command rows.
- [x] Pane test (B1): with `commandRows: 3` the box's height is 5 (3 lines and the border).
- [x] Pane test (B2): with `commandRows: 0` there is no `commands` box and no `c` hint.

**To-do:**

- [x] Add `commandRows` to `plugin.json` (number, default 5) and a pure `commandRowsOption(value)` that clamps it.
- [x] Give `changesRows` and `isOverCommands` the command rows instead of `COMMANDS_ROWS`; pass the option's.
- [x] Draw `COMMANDS` with that many rows, the newest that fit; no box and no `c` hint at `0`.
- [x] Keep up to 20 commands in the log, the option's most (moved here from Phase 2: a box of up to 20 lines needs
      more than 5).
- [x] Run `bun run format` and `bun run check`.

## Phase 2: Give the commands box the room outside a git repo

**Description:** Outside a repo, `CHANGES` is one line saying "Not a git repository" and `COMMANDS` grows to fill the
pane.

**Test Checklist:**

- [ ] Pane test (B4): outside a repo `CHANGES` reads "Not a git repository" and has a one-line body; `COMMANDS` takes
      the rest, showing more than 5 commands when they were logged.
- [ ] Pane test (B4): outside a repo with `commandRows: 0`, `CHANGES` keeps the space.
- [ ] Manual, live session (B4): a folder that isn't a repo.

**To-do:**

- [x] Keep up to 20 commands in the log (done in Phase 1).
- [ ] For the `none` snapshot: a one-line `CHANGES` ("Not a git repository") and a `COMMANDS` box with every row
      left, unless `commandRows` is `0`.
- [ ] Run `bun run format` and `bun run check`.

## Next step

Phase 2: outside a repo, a one-line `CHANGES` reading "Not a git repository" and `COMMANDS` taking every row left.
