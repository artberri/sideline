# Fixed boxes and a scrolling changes box

## Goal

Lay the pane out in fixed boxes: `COMMANDS` always five lines at the bottom, `CHANGES` taking every row left, with no
outer padding. `CHANGES` scrolls on its own (wheel and keys) whatever it shows: the tree, a file's diff, or a clicked
command, which now opens there instead of unfolding in the log.

## Behaviour

- **B1.** The pane has no outer padding: the title is its first row and the boxes reach its edges. — _proved by:_ `tests/pane.test.ts` › "the pane has no outer padding and fills its rows exactly"
- **B2.** `COMMANDS` is always five lines tall, padded when fewer commands have run; `CHANGES` takes every other row,
  so the pane itself never scrolls. — _proved by:_ `tests/pane.test.ts` › "COMMANDS is always five lines tall and CHANGES takes the rest"
- **B3.** Clicking a log line opens the whole command inside `CHANGES` in place of the tree, with `← back`, as a
  file's diff opens; clicking the same line again, `h` or `← back` returns to the tree. — _proved by:_ `tests/pane.test.ts` › "pressing a log line opens the whole command in CHANGES; pressing it again, or h, goes back"
- **B4.** The wheel over `CHANGES` scrolls what it shows (tree, diff or command) by its own lines; the wheel over
  `COMMANDS` moves nothing. — _proved by:_
- **B5.** While `CHANGES` has lines above or below its window, its bottom-right border reads `↑ 4 ↓ 12` (only the
  sides that apply); nothing shows when it all fits. — _proved by:_
- **B6.** `j`/`k` keep the selected row in view, the arrow and page keys scroll `CHANGES`, and opening a diff or a
  command starts at its top. — _proved by:_
- **B7.** The hint line under the title stays one row on a narrow pane (cut, not wrapped), so the boxes' rows add
  up. — _proved by:_

## Context

Decisions (2026-10-22, with the user):

- **Fixed heights** replace the growing layout: `COMMANDS` 5 lines (7 rows with its border), `CHANGES`
  `flexGrow={1}` with `overflow="hidden"`. With the pane filled exactly, the engine never scrolls the pane, so all
  scrolling is the mod's.
- **No blank rows between boxes** either (asked live): a box has no `marginTop`.
- **No outer padding:** the `fill` Box in the `Pane` render drops `paddingX={1} paddingY={1}`; the boxes give the
  spacing. Every width that subtracts the pane's padding (`bodyColumns - 2 - BOX_FRAME`) loses the `- 2`.
- **A clicked command opens in `CHANGES`** (like a diff, with `← back`), reversing the command-log plan's "unfold in
  place" ([done/2026-10-22-command-log.md](done/2026-10-22-command-log.md)): a 5-line box can't hold a script.
- **Indicators** `↑ N` / `↓ N` are laid over the `CHANGES` box's bottom-right border, as the titles are laid over the
  top-left (a sibling after the box, `position="absolute"`).
- **How the box scrolls:** the engine scrolls sites (the pane body), not boxes; `Box` has only
  `overflow: 'visible' | 'hidden'`. A `ui.scroll` hook on the pane (`on('ui.scroll', { requestId: PANE }, ...)`)
  sees each wheel tick with `e.by` and `e.pointer` (`{ column, row }`, the body cell under the wheel; absent for keys
  and `$.ui.scroll`), and returning `{}` without `next` leaves the pane where it is ("a hook drawing its own rows under
  a header moves them by `e.by`"). It fires at the edges too. With fixed heights the rows `CHANGES` covers are known.
- The diff is one `Code` element with `wrap="truncate-end"`, one row per line, so windowing it is slicing its lines.
  The rows `Client` reports clicks as `event.y` within itself, so a windowed tree passes its offset for the index.
- `select` calls `$.ui.scroll({ to: { key: id }, in: PANE })` today; with the pane never scrolling, that becomes the
  mod's own offset. This closes the follow-up "Check the selection scrolls into view".

### Key files

| Area                    | Files                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Pane render, navigation | [hooks/register.tsx](../../hooks/register.tsx) (`fill`, `titled`, `select`, `navigate`) |
| Tree and diff Client    | [hooks/rows.tsx](../../hooks/rows.tsx) (`Rows`, `drawRows`, `drawDiff`)                 |
| Command log line        | [hooks/commands.ts](../../hooks/commands.ts) (`logLine`, `LOG_SIZE`)                    |
| State contract          | [types/index.d.ts](../../types/index.d.ts)                                              |
| Tests                   | [tests/pane.test.ts](../../tests/pane.test.ts)                                          |

### Contracts

- **Engine events:** `ui.render` on the `Pane`; `ui.scroll` on `{ requestId: PANE }` (`by`, `offset`, `bodyRows`,
  `pointer?`, `origin`); `ui.message` from the rows `Client`.
- **UI:** `Box` `height`, `flexGrow`, `overflow="hidden"`, `position="absolute"`; `Code` with a sliced `source`.
- **State:** `openCommand` keeps its meaning (the command shown, now in `CHANGES`); a new `changesOffset: number`.
- **Test suites:** `tests/pane.test.ts`.

## Phase 1: Give the boxes fixed heights ✅

**Description:** The pane loses its outer padding, `COMMANDS` is always five lines at the bottom, `CHANGES` fills the
rest, and a clicked command opens inside `CHANGES` with `← back`. Content taller than `CHANGES` is clipped for now.

**Test Checklist:**

- [x] Pane test (B1): the pane's outer Box has no padding.
- [x] Pane test (B2): `COMMANDS` holds five rows with no commands, two commands, and six.
- [x] Pane test (B3): pressing a log line draws the command in `CHANGES` and not the tree; pressing it again, or `h`,
      draws the tree.
- [x] Manual, live session (B1, B2): the boxes reach the pane's edges and the bottom, at a few pane heights.

**To-do:**

- [x] Drop `paddingX` / `paddingY` from `fill`, and the `- 2` from every width derived from `bodyColumns`.
- [x] Give the `COMMANDS` box a fixed height: five lines (`height` 7 with the border; no blank rows needed).
- [x] Give `CHANGES` `flexGrow={1}` and `overflow="hidden"`; drop the spacer Box between the two boxes.
- [x] Draw the open command in `CHANGES` in place of the tree or diff: a `← back` button and the command's path-like
      header (`$ first line`), then every line; `h` and `← back` close it, as for a diff.
- [x] Remove the inline unfold under the log line.
- [x] Run `bun run format` and `bun run check`.

## Phase 2: Scroll the changes box with the wheel

**Description:** The wheel over `CHANGES` scrolls the tree, a diff or a command inside the box, and its border says
how much is above and below.

**Test Checklist:**

- [ ] Unit test (B4): `changesRows(bodyRows, hasHints)` is the rows left for the box's content.
- [ ] Unit test (B4): an offset clamps to `[0, lines - rows]`.
- [ ] Pane test (B4): a `ui.scroll` with `pointer.row` over `CHANGES` moves the tree's window; one over `COMMANDS`
      moves nothing; both leave the pane where it is.
- [ ] Pane test (B5): the border reads `↓ N` at the top, `↑ N ↓ M` in the middle, nothing when it fits.
- [ ] Pane test (B7): the hint line is drawn with `wrap="truncate-end"`.
- [ ] Manual, live session (B4): the wheel over each box — a test can't drive the pointer.

**To-do:**

- [ ] Add `changesOffset: number` to the state contract and an atom; reset it to 0 when a diff or a command opens or
      closes.
- [ ] Add a pure `changesRows(bodyRows, hasHints)` for the content rows inside `CHANGES`, and cut the hint line to one
      row.
- [ ] Hook `ui.scroll` on the pane: with `pointer` over `CHANGES`, move `changesOffset` by `e.by`, clamped; return
      `{}` either way so the pane never moves.
- [ ] Draw a window of the tree (pass `offset` to the rows `Client` so clicks map to `offset + event.y`), the diff
      (slice its lines) and the command.
- [ ] Lay `↑ N ↓ M` over the bottom-right border of `CHANGES`.
- [ ] Run `bun run format` and `bun run check`.

## Phase 3: Keep the cursor in view and scroll changes with the keys

**Description:** Moving the selection with `j`/`k` keeps it inside the window, and the arrow and page keys scroll
`CHANGES` when the pane is focused.

**Test Checklist:**

- [ ] Pane test (B6): `j` past the window's last row moves the window by one; `k` above its first does the same up.
- [ ] Pane test (B6): a `ui.scroll` without `pointer` (a key) scrolls `CHANGES`.
- [ ] Manual, live session (B6): page keys and arrows while the pane is focused.

**To-do:**

- [ ] In `select`, replace `$.ui.scroll({ to: { key: id }, in: PANE })` with moving `changesOffset` so the row is in
      the window.
- [ ] Send `ui.scroll` events without `pointer` to `CHANGES`.
- [ ] Remove "Check the selection scrolls into view" from `.agents/follow-ups.md`.
- [ ] Run `bun run format` and `bun run check`.

## Next step

Phase 2: add `changesRows` and a `ui.scroll` hook so the wheel over `CHANGES` scrolls its tree, diff or command,
with `↑ N ↓ M` on its border.
