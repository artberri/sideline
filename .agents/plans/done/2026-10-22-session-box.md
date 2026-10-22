# Session box

## Goal

Add a `SESSION` box at the top of the pane, after flightdeck's main box: the branch and its status (moved out of
`CHANGES`), the model and the effort on one line; the context used with a small bar and the 5-hour and 7-day usage on
the next. An option hides it, shown by default.

## Behaviour

- **B1.** Under the title and the hints, a rounded `SESSION` box reads, on its first line, the branch with its status
  symbols, the model (`Opus 5.5`) and the effort (`high`); before Claude's first request the effort reads `—`. —
  _proved by:_ `tests/pane.test.ts` › "the yellow SESSION box reads the branch, the model, and the effort once a request brings it"; `tests/session.test.ts` › "modelName shortens a model id to its family and version"
- **B2.** With the box shown, `CHANGES` no longer has the branch line; its file count (`3 files`) sits on its top-right
  border. — _proved by:_ `tests/pane.test.ts` › "the file count and the tree sit in the purple CHANGES box"
- **B3.** The second line reads `context ▰▰▰▱▱▱▱▱ 34% · 5h 23% · 7d 13%` (the bar as wide as the line allows); a value nobody has reported yet reads `—`. —
  _proved by:_
- **B4.** Each of the three turns orange over 75% and red over 90%: the context bar and its number, and the 5h and 7d
  numbers. — _proved by:_ `tests/pane.test.ts` › "the SESSION box reads the context bar and the 5h and 7d usage, and follows each measure"; `tests/session.test.ts` › "level is plain up to 75%, orange past it, red past 90%" `tests/pane.test.ts` › "the SESSION box reads the context bar and the 5h and 7d usage, and follows each measure", "before any reading the usage line reads —"; `tests/session.test.ts` › "bar fills a share of its cells, clamped at 0 and 100", "readings picks the context and the five-hour and seven-day windows, null when missing"
- **B5.** The numbers follow the session: a new context measure or rate-limit reading redraws them, and a model or
  effort change shows from the next request. — _proved by:_ `tests/pane.test.ts` › "the SESSION box reads the context bar and the 5h and 7d usage, and follows each measure", "the yellow SESSION box reads the branch, the model, and the effort once a request brings it"
- **B6.** With the `sessionBox` option set to `hide`, there is no `SESSION` box and the branch line is back as the
  first row of `CHANGES`, as before. — _proved by:_ `tests/pane.test.ts` › "sessionBox: hide draws no SESSION box and puts the branch line back in CHANGES"
- **B7.** Outside a git repo the first line reads `not a git repo` in place of the branch. — _proved by:_ `tests/pane.test.ts` › "outside a git repo the SESSION box says so"
- **B8.** `CHANGES` keeps its window right: its rows add up with the box shown or hidden. — _proved by:_ `tests/window.test.ts` › "changesRows leaves the title, hints, the session box or branch line, borders and commands box out"; `tests/pane.test.ts` › "a short pane shows a window of the tree and counts the rest on the border"

## Context

Decisions (2026-10-22, with the user):

- **Name** `SESSION`; **position** under the hints (title, hints, `SESSION`, `CHANGES`, `COMMANDS`), as flightdeck's
  main box sits under its legend.
- **File count** moves to the `CHANGES` top-right border (`╭─ CHANGES ──── 3 files ─╮`), laid over it as the title is;
  the `↑ ↓` count stays bottom-right.
- **Bar width** follows the pane (asked live): whatever the usage line leaves after its text and the numbers as
  printed, so `7d` ends at the box's right edge; never under 3 cells (`barWidth` in `hooks/meter.ts`). The model and
  effort read in the box's yellow.
- **Colours:** context, 5h and 7d all turn orange (`warning`) over 75% and red (`error`) over 90%.
- **Option** `sessionBox`: `show` (default) or `hide`; hidden, the branch line goes back into `CHANGES`.
- **Colours of the boxes:** `SESSION` yellow (asked live, after trying green `success`, the branch's magenta, white and the hotkeys' `suggestion`), and `CHANGES` moves from orange (`claude`) to purple
  (theme `merged`, the purple flightdeck's architect box uses); `COMMANDS` stays grey.

Where the numbers come from (checked in the typings):

- **Model:** `$.session.model()` at session start ("the main loop's model, as `/model` shows it"); then `turn.step`'s
  `e.model` on each main-loop request (`agentId` absent). Shown short, as flightdeck's `prettyModel`
  ([hooks/core.ts:193](https://github.com/scasella/claude-flightdeck/blob/main/hooks/core.ts#L193)) does:
  `claude-opus-5-5` → `Opus 5.5`, `[1m]` → ` 1M`.
- **Effort:** only `turn.step`'s `e.effort` (`'low' | 'medium' | 'high' | 'xhigh' | 'max' | number`); nothing reads
  it before the first request.
- **Context and limits:** `$.session.usage()` at session start, then `session.measure` (`context.percent`,
  `rateLimits[]` of `{ kind, percentUsed }`, `kind` `five_hour` / `seven_day`), as flightdeck does
  ([hooks/register.tsx:231](https://github.com/scasella/claude-flightdeck/blob/main/hooks/register.tsx#L231), `:349`).
  `rateLimits` is empty until an API response reports them.

### Key files

| Area               | Files                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Hooks, pane render | [hooks/register.tsx](../../hooks/register.tsx) (`titled`, branch line, `changesRows` call) |
| Row arithmetic     | [hooks/window.ts](../../hooks/window.ts) (`changesRows`)                                   |
| New pure helpers   | `hooks/meter.ts` (model name, bar, level colour)                                           |
| Option             | [.claude-plugin/plugin.json](../../.claude-plugin/plugin.json)                             |
| State contract     | [types/index.d.ts](../../types/index.d.ts)                                                 |
| Tests              | [tests/pane.test.ts](../../tests/pane.test.ts), `tests/session.test.ts`                    |

### Contracts

- **Engine events:** `session.start` (`$.session.model()`, `$.session.usage()`), `turn.step` (model, effort; a
  streaming hook: `async function*` that yields `next(e)`'s chunks), `session.measure`.
- **UI:** the `Pane` render; a third `titled` box.
- **State:** `sideline.session: { model: string | null; effort: string | null; context: number | null; fiveHour:
  number | null; sevenDay: number | null }`.
- **Options:** `sessionBox`: `"show" | "hide"`, default `"show"`, title "Session box".
- **Test suites:** `tests/pane.test.ts` and a new `tests/session.test.ts` (sorts after `pane.test.ts`, see the `tsc`
  follow-up).

## Phase 1: Draw the session box with the branch, model and effort ✅

**Description:** A `SESSION` box under the hints shows the branch and its status, the model and the effort; the branch
line leaves `CHANGES`, whose file count moves to its border. The `sessionBox` option hides the box and puts the branch
back.

**Test Checklist:**

- [x] Unit test (B1): `modelName` shortens `claude-opus-5-5`, `claude-opus-5-5[1m]`, an older `claude-3-5-sonnet` id,
      and leaves an unknown one as it is.
- [x] Pane test (B1): the box reads the branch, `Opus 5.5` from `session.model`, and `—` effort until a `turn.step`
      brings `high`.
- [x] Pane test (B2): `CHANGES` has no branch line, and `3 files` is drawn in its top-right overlay.
- [x] Pane test (B6): with `sessionBox: hide` there is no `SESSION` box and the branch line is in `CHANGES`.
- [x] Pane test (B7): outside a repo the box reads `not a git repo`.
- [x] Unit test (B8): `changesRows` with and without the session box.
- [x] Manual, live session (B1): the yellow and purple read well, and how the line truncates on a narrow pane.

**To-do:**

- [x] Add the `sessionBox` option to `plugin.json`.
- [x] Add `session` to the state contract and an atom; fill `model` from `$.session.model()` in `session.start`, and
      `model` / `effort` from main-loop `turn.step` (yield every chunk of `next(e)` unchanged).
- [x] Add `hooks/meter.ts` with `modelName(id)` (named `meter`, not `session`: `hooks/session.ts` trips the `tsc`
      TS2589 follow-up).
- [x] Set `CHANGES_COLOR` to `merged` and add `SESSION_COLOR` = `yellow` (tried `success`, `magenta`, `white`, `suggestion`).
- [x] Draw the `SESSION` box (two content rows; the second empty until Phase 2) with the branch line, model and effort.
- [x] Move the file count to a top-right overlay on `CHANGES` (`titled` gains a top-right label) and drop the branch
      line from `CHANGES` while the box shows.
- [x] Teach `changesRows` about the box (4 rows) and about the branch line it takes out of `CHANGES` (2 rows).
- [x] Run `bun run format` and `bun run check`.

## Phase 2: Show the context and the 5h and 7d usage ✅

**Description:** The box's second line shows the context used with a bar, and the 5-hour and 7-day usage, orange over
75% and red over 90%.

**Test Checklist:**

- [x] Unit test (B3): `bar(34, 8)` is `▰▰▰▱▱▱▱▱`, clamped at 0 and 100.
- [x] Unit test (B4): `level(75)` is plain, `level(76)` `warning`, `level(91)` `error`.
- [x] Pane test (B3, B5): `session.usage` at start fills the line; a `session.measure` redraws it; no reading reads `—`.
- [x] Pane test (B4): a 92% context draws its bar and number in `error`.

**To-do:**

- [x] Fill `context`, `fiveHour`, `sevenDay` from `$.session.usage()` in `session.start` and from `session.measure`
      (`kind` `five_hour` / `seven_day`); call `next(e)` and return its result.
- [x] Add `bar(percent, width)`, `barWidth(columns)` and `level(percent)` to `hooks/meter.ts`.
- [x] Draw the second line: `context`, the bar and its percent, `5h` and `7d` percents, each in its level's colour.
- [x] Run `bun run format` and `bun run check`.

## Next step

Done: both phases are in.
