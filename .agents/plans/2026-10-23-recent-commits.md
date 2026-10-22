# Recent commits in the changes box

## Goal

When there are no changes, `CHANGES` says so and lists the most recent commits. Clicking one opens it inside the box:
the files it changed as the usual tree, and each file's diff in that commit. The box shows that you are inside a commit,
and `h` or `← back` steps out one level at a time.

## Behaviour

- **B1.** With no changes, `CHANGES` reads "No uncommitted changes" and, under a "Recent commits" heading, lists as many recent commits as the box fits, one
  line each: `abc1234 subject` with the age (`2h`) on the right, cut to the width. A repo with no commits reads "no commits yet". — _proved by:_ `tests/pane.test.ts` › "with no changes the box says so and lists the recent commits under a heading", "a short pane lists only the commits that fit", "a repo with no commits reads no commits yet", "with changes no git log runs and no commits show"; `tests/git.test.ts` › "parseLog reads each commit line, and nothing from an empty log", "shortAge is the largest whole unit, now under a minute"
- **B2.** Clicking a commit opens it in `CHANGES`: a first row `← back  abc1234 subject`, the top-right border label
  reads `abc1234` in place of the file count, and the box lists the files the commit changed as the usual tree, with
  icons, status colours and `+N -N`. The first commit of a repo opens too. — _proved by:_ `tests/pane.test.ts` › "pressing a commit opens its files in CHANGES under a header, with its hash on the border"; `tests/git.test.ts` › "parseNameStatus reads each status and path, a rename under its new path"; the first commit: manual
- **B3.** Clicking a file of the commit opens its diff in that commit. `h` or `← back` steps out one level: from the
  diff to the commit's files, from the files to the list. — _proved by:_ `tests/pane.test.ts` › "a commit's file opens its diff from that commit; h steps back to the files, then to the list"
- **B4.** Changes appearing while a commit is open don't pull the box away; it shows the working changes once you step
  back out of the commit. — _proved by:_ `tests/pane.test.ts` › "changes appearing while a commit is open leave the commit on screen"
- **B5.** `j`/`k` move through the commit list and `l` opens the selected commit; the selection stays in the box's
  window. — _proved by:_

## Context

Decisions (2026-10-23, with the user):

- **How many:** as many commits as the box's window fits (`changesRows` less the status line, the blank under it and
  the heading). The mod reads a fixed 50 with one `git log` and draws the ones that fit, so the pane's height needs no
  new read.
- **Wording** (asked live): "No uncommitted changes", not "no changes", and a bold "Recent commits" heading over the
  list.
- **Opening a commit** shows its files as the tree, then a file's diff, the way working changes do, not the whole
  commit's diff at once.
- **Indicator:** a header row `← back  abc1234 subject` and the commit's short hash as the top-right border label
  (`titled`'s `label`, where the file count sits now); `h` also goes back.
- Only shown when there are no working changes; with changes, `CHANGES` is unchanged.

Reuse: the tree builder (`treeRows(files: ChangedFile[])` in `hooks/tree.ts`), the rows `Client` and `drawDiff` in
`hooks/rows.tsx`, the window and scroll (`changesOffset`, `changesWindow`), and `hunksOnly` in `hooks/git.ts`. A commit
is one more source of files and diffs next to the working tree: the selection, cursor and open diff work the same.

Git (checked when the phase is built, against a real repo, not only canned output):

- List: `git log -n50 --format=%h%x00%s%x00%ct%x00` (NUL-separated fields, one commit per line). `%ct`, not `%cr`:
  the age is written from the mod's clock when it draws (`2h`, `3d`, `shortAge` in `hooks/commits.ts`), short and
  never stale.
- A commit's files: `git diff-tree -r --root --no-commit-id --numstat -z <sha>` for counts, with `--name-status` for the
  status; `--root` covers the first commit. A merge commit shows nothing without `-m --first-parent`; use that.
- A file's diff in a commit: `git show --format= <sha> -- <path>`, through `hunksOnly`.
- Every call through the existing `git()` helper (`--no-optional-locks`).

### Key files

| Area                    | Files                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Git reads and parsers   | [hooks/git.ts](../../hooks/git.ts) (`readSnapshot`, `readDiff`, `hunksOnly`)                             |
| Pane render, navigation | [hooks/register.tsx](../../hooks/register.tsx) (`titled`, `navigate`, `select`, `openFile`, `closeDiff`) |
| Tree and diff drawing   | [hooks/tree.ts](../../hooks/tree.ts), [hooks/rows.tsx](../../hooks/rows.tsx)                             |
| State contract          | [types/index.d.ts](../../types/index.d.ts)                                                               |
| Tests                   | [tests/pane.test.ts](../../tests/pane.test.ts), [tests/git.test.ts](../../tests/git.test.ts)             |

### Contracts

- **Engine events:** none new; `ui.render` on the `Pane`, `ui.message` from the rows `Client`.
- **UI:** a plain `Button` per commit line (as the `COMMANDS` lines); `← back` as a `Button`; the border label.
- **State:** `Snapshot` (repo) gains `commits: Commit[]` (`{ sha, subject, time }`), filled only while `files` is empty;
  a new `viewing: { sha: string; subject: string; files: ChangedFile[] } | null`.
- **External commands:** `git log`, `git diff-tree`, `git show`, parsed as above.
- **Test suites:** `tests/pane.test.ts` (the world's canned `git` output gains `log`, `diff-tree` and `show`),
  `tests/git.test.ts` (parsers).

## Phase 1: List the recent commits when there are no changes ✅

**Description:** With nothing changed, `CHANGES` shows "no changes" and the recent commits under it.

**Test Checklist:**

- [x] Unit test (B1): the `git log` parser reads hash, subject and age, and an empty output is no commits.
- [x] Pane test (B1): with no changes, the box lists the commits; with a short pane, only the ones that fit.
- [x] Pane test (B1): a repo with no commits reads "no commits yet".
- [x] Pane test (B1): with changes, no `git log` runs and no commits show.

**To-do:**

- [x] Add `Commit` and `commits` to the `Snapshot` contract.
- [x] In `readSnapshot`, when `files` is empty, run `git log` and parse it into `commits`.
- [x] Draw the list under "no changes": hash dim, subject, age dim, cut to the inner width; as many as fit.
- [x] Run `bun run format` and `bun run check`.

## Phase 2: Open a commit's files and their diffs in the changes box ✅

**Description:** Clicking a commit shows its files as the tree, a file opens its diff in that commit, and `h` or
`← back` steps back out.

**Test Checklist:**

- [x] Unit test (B2): the `diff-tree` numstat and name-status read into `ChangedFile`s.
- [x] Pane test (B2): pressing a commit draws the header row, the `abc1234` border label and the commit's files.
- [x] Pane test (B3): a file press opens its diff from `git show`; `h` closes it; `h` again goes back to the list.
- [x] Pane test (B4): files appearing in the working tree while a commit is open leave the commit on screen.
- [x] Manual, live session (B2, B3): a real repo's commits, a merge and the first commit.

**To-do:**

- [x] Add `viewing` to the state contract and an atom; set it on a commit press (reading `diff-tree`), clear it on back.
- [x] Add `readCommitFiles($, root, sha)` and `readCommitDiff($, root, sha, path)` to `hooks/git.ts`.
- [x] While `viewing` is set, build the tree from its files, read the open file's diff from the commit, and draw the
      header row and the border label.
- [x] Teach `navigate`'s back key the order: diff, then commit, then nothing.
- [x] Run `bun run format` and `bun run check`.

## Phase 3: Move through the commit list with j/k

**Description:** The keys work on the commit list as on the tree.

**Test Checklist:**

- [ ] Pane test (B5): `j`/`k` move the selected commit, `l` opens it; the selection stays in the window.

**To-do:**

- [ ] Give the list a cursor (reuse `cursor` with commit ids) and route `j`/`k`/`l` to it while the list shows.
- [ ] Run `bun run format` and `bun run check`.

## Next step

Phase 3: a cursor on the commit list, with `j`/`k` moving it and `l` opening the selected commit.
