# Keyboard navigation in the pane

## Goal

Drive vacuo's pane from the keyboard: move a selection through the changed files, open a file's diff and go back, and
jump between changed files from the diff, with a legend that tells the user how.

## Behaviour

- **K1.** Once the tree has the keyboard, `j`/`↓` and `k`/`↑` move a selection highlight through the rows (the hover
  style: the Background option lightened, or inverted text without one). — _proved by:_
- **K2.** `Enter`, `l` or `→` on a selected file opens its diff; on a folder they do nothing. — _proved by:_
- **K3.** In the diff, `h`, `←` or `Backspace` goes back to the tree with that file still selected. — _proved by:_
- **K4.** In the diff, `j`/`k` open the next or previous changed file's diff; the diff itself scrolls with the wheel.
  — _proved by:_
- **K5.** The selected row stays in view while it moves, and stays on its file when the tree refreshes; if that file
  leaves the tree, the selection moves to the nearest row. — _proved by:_
- **K6.** A click selects the row it lands on and, on a file, opens its diff, as before. — _proved by:_
- **K7.** While there are changes, a dim legend at the bottom of the pane says how to use it: how to focus the pane from
  the keyboard (ctrl+x tab) or with a click, the keys that apply in the current view, and `esc` back to the prompt. It
  is hidden when there are no changes. — _proved by:_
- **K8.** Clicking a file keeps the keyboard in the pane: the diff opens in the same place, so the keys keep working.
  — _proved by:_ `tests/pane.test.ts` › clicking a file opens its diff inside the rows Client, without git headers (focus: manual)

## Context

### Decisions

- **The diff is drawn inside the rows `Client`**, not in place of it. Keys reach only a focused `Client`
  (`surface.onKey`, focused by a click), and swapping the `Client` out for the diff view unmounts it and drops the
  focus. filetree draws its preview in the same element for the same reason.
- **A diff larger than ~60,000 characters is cut** with a `… diff truncated` line, since a `Client`'s props are capped
  at 100,000 characters serialized.
- **The selection lives in the `Client`'s local state:** simpler and immediate; it is lost on a reload of the mod, which
  only happens while developing.
- **`j`/`k` in a diff move between files** (like filetree), not lines: scrolling by line would mean drawing the diff
  ourselves instead of with `Code`.
- **The legend is honest about focus:** if ctrl+x tab focuses the pane but doesn't hand keys to the `Client` (to check
  live in Phase 2), the legend says only "click to focus".

### Engine API (checked in the 2.1.306 typings)

- `ClientSurface.onKey(fn)`: keys while a click has given the `Client` the focus; `Escape` never arrives, it returns
  the focus to the prompt. `ClientKeyEvent.key` is a special key's name (`up`, `down`, `left`, `right`, `return`,
  `backspace`, …) or the character typed.
- `ClientSurface.post(data)` reaches the hooks as `ui.message`; a hook may answer `{ props }` to hand the instance new
  props.
- `$.ui.scroll({ to: { key }, in: 'vacuo', block: 'nearest' })` reveals an element by key (whether it reaches inside a
  `Client` is checked live in Phase 2).
- `ClientElements` (the terminal's table without `Client`, `Raster`, `Image`) includes `Code`, so the diff can move in.
- Test kit: a mounted drawing's `key`, `pointer`, `post` and `press` act on a `Client` by its key (`in: 'rows'`).

### Key files

| Area                    | Files                                          |
| ----------------------- | ---------------------------------------------- |
| Tree rows and diff view | [hooks/rows.tsx](../../hooks/rows.tsx)         |
| Hooks                   | [hooks/register.tsx](../../hooks/register.tsx) |
| Tests                   | [tests/pane.test.ts](../../tests/pane.test.ts) |

### Contracts

- **Engine events:** `ui.message` from the rows `Client` gains `{ key }`-driven posts (`open`, `back`, `step`).
- **UI:** the diff view moves into the `Client`; a legend row at the bottom of the pane.
- **State:** the `Client`'s local `cursor` (row id); the plugin's `selected`/`diff` stay as they are.
- **Test suites:** `tests/pane.test.ts`.

## Phase 1: Draw the diff inside the rows Client

**Description:** The diff view (`← files`, path, `Code format="diff"`) moves into the rows `Client`, so a click that opens
a diff keeps the keyboard in the pane. It looks the same.

**Test Checklist:**

- [x] Pane test (K8): after a posted press on a file, the `Client` stays mounted and draws the diff (`Code` in `rows`).
- [x] Pane test: `← files` inside the `Client` goes back to the tree.
- [x] Unit test: a diff over the limit is cut and ends with `… diff truncated`.
- [ ] Manual, live session (K8): click a file, then press a key; the pane still has the focus. The kit can't show
      focus.

**To-do:**

- [x] Pass the open diff to the `Client` as props (`diff: { path, hunks } | null`), cut to the limit.
- [x] Draw the diff view in `hooks/rows.tsx` (`drawRows` and the static fallback), with `← files` posting `back`.
- [x] Handle `{ back: true }` in the `ui.message` hook; drop the pane-level diff view.
- [x] Run `bun run format` and `bun run check`.

## Phase 2: Move a selection and open diffs from the keyboard

**Description:** `j`/`k`/arrows move a highlighted selection, `Enter`/`l`/`→` open a file's diff, `h`/`←`/`Backspace`
go back, and a legend explains the keys while there are changes.

**Test Checklist:**

- [ ] Pane test (K1): `j` and `↓` move the selection down, `k` and `↑` up; the selected row is highlighted.
- [ ] Pane test (K2): `Enter` on a file opens its diff; on a folder nothing happens.
- [ ] Pane test (K3): `h` in the diff goes back with the file still selected.
- [ ] Pane test (K5): a refresh keeps the selection on its file; a file that leaves moves it to the nearest row.
- [ ] Pane test (K6): a click selects the row.
- [ ] Pane test (K7): the legend shows with changes, hides with none, and lists the tree's keys.
- [ ] Manual, live session (K5, K7): the selected row scrolls into view in a long tree; ctrl+x tab hands keys to the
      tree (adjust the legend if not). The kit can't show focus or the pane's scroll.

**To-do:**

- [ ] `hooks/rows.tsx`: local `cursor` by row id, `onKey` for `j`/`k`/arrows/`Enter`/`l`/`→`/`h`/`←`/`Backspace`.
- [ ] Draw the selected row with the hover style; a click sets the cursor.
- [ ] Post `open`/`back` from keys; keep the cursor on its id across new props, falling back to the nearest index.
- [ ] Reveal the selected row with `$.ui.scroll` from the `ui.message` hook (or drop it if it can't reach inside a
      `Client`, and note it here).
- [ ] Draw the legend at the bottom of the pane when there are changes.
- [ ] Run `bun run format` and `bun run check`.

## Phase 3: Jump between changed files from the diff

**Description:** In the diff, `j`/`k` open the next or previous changed file's diff, and the legend shows the diff's
keys.

**Test Checklist:**

- [ ] Pane test (K4): `j` opens the next file's diff and `k` the previous; at either end nothing changes.
- [ ] Pane test (K7): the legend in the diff lists `h` back and `j`/`k` next/previous file.

**To-do:**

- [ ] In the diff view, `j`/`k` post a step to the next/previous file row; the hook opens that file's diff.
- [ ] Move the cursor with it, so going back lands on the last file shown.
- [ ] Legend text per view.
- [ ] Run `bun run format` and `bun run check`.

## Next step

Phase 1: click a file in a live session and press a key; the pane should keep the focus (the manual test), then mark the phase ✅.
