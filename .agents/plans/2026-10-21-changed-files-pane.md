# Changed-files pane

## Goal

A sidebar pane that shows only what changed in the current git repo: the branch with starship-style status symbols on
top, a tree of the changed files with `+N -N` on the right, and a shimmer on the file Claude is editing while the edit
runs. A smaller, focused take on [claude-code-filetree](https://github.com/data-goblin/claude-code-filetree).

## Behaviour

- **B1.** A `vacuo` pane opens when a session starts, and `/vacuo` opens it again after it was closed. — _proved by:_ `tests/pane.test.ts` › the pane opens at session start and again on /vacuo
- **B2.** The header shows a branch icon and the branch name, then the status symbols that apply, in starship's order
  and spelling: `=` conflicted, `⇡N` ahead, `⇣N` behind, `⇕⇡N⇣N` diverged, `?` untracked, `$` stashed, `!` modified,
  `+` staged, `»` renamed, `✘` deleted. A clean, up-to-date branch shows no symbols. — _proved by:_ `tests/git.test.ts` › statusSymbols follows starship order and spelling; `tests/pane.test.ts` › the header shows the branch and starship symbols, on every surface
- **B3.** On a detached HEAD the header shows the short commit hash where the branch name goes. — _proved by:_ `tests/git.test.ts` › parseStatus shows the short hash on a detached HEAD
- **B4.** Outside a git repo the header says `not a git repo` and the tree is empty. — _proved by:_ `tests/pane.test.ts` › outside a git repo the header says so
- **B5.** With a Nerd Font the branch icon is `` (U+E0A0); without one, or with the `glyphs` option set to `plain`,
  it is `⎇`. — _proved by:_ `tests/pane.test.ts` › the three `glyphs:` tests
- **B6.** The tree lists only changed files (modified, staged, untracked, deleted, renamed) against `HEAD`, under the
  folders that contain them. A folder with a single child folder and no files of its own is drawn as one row
  (`.ai/plans/`). — _proved by:_
- **B7.** Each file shows `+N -N` on the right; an untracked file counts all its lines as added; a folder shows the sum
  of everything under it. A binary file shows `bin`. — _proved by:_
- **B8.** File names are colored by status: added/untracked green, modified yellow, deleted red with strikethrough,
  renamed blue. — _proved by:_
- **B9.** The tree and header refresh after every Claude Edit, Write, NotebookEdit or Bash call, and every 2 seconds,
  so changes made outside Claude also show. — _proved by:_
- **B10.** While Claude's Edit, Write or NotebookEdit on a file runs, that file's row shimmers; a file that does not
  exist yet appears as a shimmering row immediately. — _proved by:_
- **B11.** When the edit finishes, the row flashes once and returns to its status color within about 2 seconds; a
  failed or denied edit stops the shimmer without a flash. — _proved by:_

## Context

### Decisions

- **Compare against `HEAD`**, not the merge-base with `master`: the pane shows uncommitted work, like filetree. A
  branch-wide view can be a later option.
- **Untracked files count as all added** (`+N`), so a new file reads the same as in a PR.
- **Collapse single-child folder chains**, like VS Code's compact folders, to keep deep monorepo paths to one row.
- **Nerd Font glyphs with plain fallbacks.** A `glyphs` `userConfig` option (`auto` default, `nerd`, `plain`). `auto`
  runs a light check: `fc-list ':charset=e0a0'`, then `~/Library/Fonts/*Nerd*` and `/Library/Fonts/*Nerd*`. This is
  the first half of filetree's `FONT_SCRIPT`, without its stale-terminal check.
- **Colors follow the user's terminal and theme:** ANSI names (`magenta`, `red`) or Claude Code theme keys
  (`success`, `warning`, `error`, `diffAdded`, `diffRemoved`), never hex, so the pane uses the person's own palette.
  The pane's background is drawn by Claude Code and can't be set by the mod.
- **Left out on purpose** (each can become its own plan): search, file preview, opening files, read highlights,
  git-action animations, themes and palettes, mouse and keyboard navigation, size/date columns.

### What to borrow from filetree

Clone into the scratchpad for reference; never copy it into this repo wholesale.

| What                             | Where in filetree                                 | Notes                                                                                                |
| -------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Running git without taking locks | `hooks/register.tsx`, `git()`                     | `--no-optional-locks` and `GIT_OPTIONAL_LOCKS=0`, so the poll never blocks Claude's own git commands |
| Numstat parsing                  | `hooks/register.tsx`, `parseNumstat`              | We read `git diff HEAD --numstat -z` the same way                                                    |
| Edit/Write hook shape            | `hooks/register.tsx`, the `tool.call` hook        | It marks the file _after_ `next(e)`. We mark it _before_ (B10) and flash after (B11)                 |
| Shimmer animation                | `hooks/rows.tsx`, `shimmer()` and `surface.every` | A `Client` module owns the frame timer so the pane hook doesn't redraw every tick                    |
| Tone palettes                    | `hooks/git.ts`, `TONES`                           | Only the `orange` tone is needed                                                                     |

### Key files

| Area                 | Files                                                                          |
| -------------------- | ------------------------------------------------------------------------------ |
| Hooks module         | [hooks/register.tsx](../../hooks/register.tsx)                                 |
| Manifest and options | [.claude-plugin/plugin.json](../../.claude-plugin/plugin.json)                 |
| State contract       | `types/index.d.ts` (new)                                                       |
| Engine API           | `.claude-plugin/types/claude-code/index.d.ts` (generated after the first load) |

### Contracts

- **Engine events:** `session.start` (register `/vacuo`, open the pane, start the poll), `command.run` for `vacuo`,
  `ui.render` on `{ component: 'Pane', requestId: 'vacuo' }`, `tool.call` for `Edit`, `Write`, `NotebookEdit` and
  `Bash`.
- **UI:** one pane, id `vacuo`, title `Changes`; one `Client` module for the animated rows.
- **State:** `$.state` holds the repo snapshot (`branch`, `status` counts, `files` with status and counts) and the
  active edits (`path`, `state: 'running' | 'done'`, `at`), declared in `types/index.d.ts`.
- **Options:** `glyphs`: `auto` | `nerd` | `plain`.
- **External commands:** `git status --porcelain=v2 --branch -z --untracked-files=all`,
  `git rev-parse --verify --quiet refs/stash`, `git diff HEAD --numstat -z`, and per untracked file
  `git diff --no-index --numstat -- /dev/null <file>` (capped, so a huge untracked folder can't stall the poll).
- **Test suites:** `tests/*.test.ts(x)` run by `claude plugin test .`.

## Phase 1: Open a pane with the branch header ✅

**Description:** The pane opens at session start and on `/vacuo`, showing the branch icon, name and starship status
symbols. The tree area is empty for now.

**Test Checklist:**

- [x] Pane test (B1): the pane is opened at `session.start`; `/vacuo` opens it again.
- [x] Pane test (B2): on a fixture repo with one staged, one modified, one untracked file and a stash, the header reads
      `⎇ main [$!+?]` (starship's `$all_status$ahead_behind` order, in brackets).
- [x] Unit test (B2, B3): the `porcelain=v2` header parser reads branch, ahead/behind and detached HEAD.
- [x] Unit test (B2): the symbol builder covers each symbol and diverged (`⇕`).
- [x] Pane test (B4): outside a git repo the header says `not a git repo`.
- [x] Pane test (B5): `glyphs: plain` draws `⎇`; `nerd` draws ``.

**To-do:**

- [x] Add `glyphs` to `userConfig` in `plugin.json`.
- [x] Add `types/index.d.ts` with the snapshot contract and name it in `plugin.json`.
- [x] Write the git runner and the `porcelain=v2` parser in `hooks/git.ts`.
- [x] Write the symbol builder and glyph table in `hooks/symbols.ts`.
- [x] In `hooks/register.tsx`: register `/vacuo`, open the pane at `session.start`, draw the header in `ui.render`.
- [x] Refresh the snapshot on a 2-second `$.clock.every` (B9, header half).
- [x] Run `bun run format` and `bun run check`.
- [x] Manual: check the header in a live session on the monorepo.

## Phase 2: List changed files with line counts

**Description:** The pane draws the tree of changed files under compacted folders, each with `+N -N`, colored by
status, refreshed after Claude's tool calls and on the poll.

**Test Checklist:**

- [ ] Pane test (B6, B7, B8): a fixture repo with nested changes draws the expected rows, counts and colors.
- [ ] Unit test (B6): the tree builder compacts single-child chains and keeps folders with files expanded.
- [ ] Unit test (B7): numstat parsing (including renames and `-` for binary) and folder roll-up.
- [ ] Pane test (B9): a `Write` through `$.tool.call` is followed by a refresh that shows the new file.
- [ ] Manual, live session (B9): an edit made in an editor outside Claude appears within 2 seconds. A test can't
      reproduce the timing of an outside writer.

**To-do:**

- [ ] Parse file entries from `porcelain=v2` (ordinary, renamed, unmerged, untracked) in `hooks/git.ts`.
- [ ] Read `git diff HEAD --numstat -z` and untracked line counts; merge them into the snapshot.
- [ ] Write the tree builder in `hooks/tree.ts`: build, compact, roll up counts, sort folders first.
- [ ] Draw the rows in the pane: indent, name colored by status, counts on the right.
- [ ] Refresh after `tool.call` for `Edit`, `Write`, `NotebookEdit` and `Bash`.
- [ ] Run `bun run format` and `bun run check`.

## Phase 3: Shimmer the file Claude is editing

**Description:** A row shimmers while Claude's edit on it runs and flashes once when it finishes.

**Test Checklist:**

- [ ] Pane test (B10): during a held `Edit` the row's segment is marked running; a path not yet in the tree appears.
- [ ] Pane test (B11): after the edit settles the row is marked done, then cleared after the flash; a denied edit
      clears it without a done mark.
- [ ] Client test (B10, B11): the rows module advances its shimmer phase on `surface.every` and stops its timer when
      nothing is lit.
- [ ] Manual, live session (B10): the shimmer shows during "Updating …" on a real edit. The kit can't show paint.

**To-do:**

- [ ] Record active edits in `$.state` from a `tool.call` hook before `next(e)`, resolving the path against the repo.
- [ ] Mark done or clear after `next(e)` resolves, and expire done marks after the flash.
- [ ] Add `hooks/rows.tsx`: a `Client` module that draws the rows and animates lit ones with a shimmer.
- [ ] Switch the pane's tree to the `Client` module.
- [ ] Run `bun run format` and `bun run check`.

## Next step

Phase 2: parse the file entries from `porcelain=v2` and read `git diff HEAD --numstat -z`, then build and draw the tree.
