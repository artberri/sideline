# Follow-ups and ideas

Work that came out of a plan or a conversation but wasn't done yet. Pick one up with `/create-plan`, then remove it
here (or move it into the plan) once it is planned.

## Follow-ups

- **Cache untracked line counts.** The 2-second poll runs one `git diff --no-index` per untracked file (up to 60);
  caching the counts by file modification time would keep it light in a repo with many new files. _From: the
  changed-files pane plan._
- **Check the selection scrolls into view.** `$.ui.scroll({ to: { key } })` is called on each move, but nobody has seen
  the selected row scroll into view in a tree longer than the pane, and it may not reach rows inside a `Client`.
  _From: the keyboard-navigation plan._
- **Clicks and keys on mobile and VS Code.** Those surfaces have no `Client`, so the tree can't be clicked or driven by
  keys there; it draws, but without interaction. _From: the transcript-diffs and keyboard-navigation plans._
- **Write a `README.md`.** `claude plugin validate` reports a missing README as the one problem left for submitting
  the mod to the plugin directory (the license is in place); it should say what the mod does, how to install it and its
  options (`glyphs`, `background`, `transcriptDiffs`). _From: the validator's output since the scaffold._
- **Check the file icons on a real Nerd Font.** The table in `hooks/icons.ts` was built from nerd-fonts'
  `glyphnames.json` but never reviewed in the pane; swap any glyph that draws as a box or a blank. _From: adding the
  file-type icons._
- **Fold other tools' long inputs.** Agent prompts and MCP calls can print long inputs in the transcript too; they
  could show a short label the way Bash rows show their description. _From: the hide-bash-commands plan._
- **`tsc` fails on the first `$.tool.call` it checks.** Any test file that sorts before `tests/pane.test.ts` makes
  `tsc -p .` hit TS2589 at its first `$.tool.call`, even an empty file; typing the call's argument doesn't help. New
  test suites go in a file that sorts after it, until the cause is found. _From: the hide-bash-commands plan._

## Ideas

- **Search the changed files**, filtering the tree by name. _Left out of the changed-files pane plan._
- **Preview a file** in the pane, not only its diff, and open it in an editor. _Left out of the changed-files pane
  plan._
- **Read highlights:** show the files Claude reads, not only the ones it edits. _Left out of the changed-files pane
  plan._
- **Git action animations** for commits, pushes and checkouts in the header. _Left out of the changed-files pane plan._
- **Diff against the branch's merge-base** (everything on the branch, like a PR) as an option next to `HEAD`. _From:
  the changed-files pane plan's decisions._
