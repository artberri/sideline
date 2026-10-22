# Follow-ups and ideas

Work that came out of a plan or a conversation but wasn't done yet. Pick one up with `/create-plan`, then remove it
here (or move it into the plan) once it is planned.

## Follow-ups

- **Clicks and keys on mobile and VS Code.** Those surfaces have no `Client`, so the tree can't be clicked or driven by
  keys there; it draws, but without interaction. _From: the transcript-diffs and keyboard-navigation plans._
- **Write a `README.md`.** `claude plugin validate` reports a missing README as the one problem left for submitting
  the mod to the plugin directory (the license is in place); it should say what the mod does, how to install it and its
  options (`glyphs`, `background`, `transcriptDiffs`, `transcriptCommands`, `sessionBox`). It should say the icons need
  Nerd Fonts v3 (3.0 or later): 33 of them were added in 3.0, and `dev-bun` (U+E76F) was another glyph in 2.x.
  _From: the validator's output since the scaffold, and the Nerd Font icon review._
- **Fold other tools' long inputs.** Agent prompts and MCP calls can print long inputs in the transcript too; they
  could show a short label the way Bash rows show their description. _From: the hide-bash-commands plan._
- **`tsc` fails on the first `$.tool.call` it checks.** Any test file that sorts before `tests/pane.test.ts` makes
  `tsc -p .` hit TS2589 at its first `$.tool.call`, even an empty file; typing the call's argument doesn't help. New
  test suites go in a file that sorts after it, until the cause is found. A new module under `hooks/` can trigger it
  too, by its name alone: `hooks/session.ts` and `hooks/usage.ts` did (with nothing importing them), `hooks/model.ts`
  and `hooks/meter.ts` didn't. _From: the hide-bash-commands and session-box plans._
- **`WAITING` for permission prompts.** The title can't tell when a permission dialog is open: `tool.check` returns
  `ask` before any dialog (and in auto mode for calls the classifier decides), the prompt opens after the check
  ends, and `classic.PermissionRequest` is swallowed by `cc-plugin-sec-default` before sideline. Worth another look
  if the engine gains an event for a dialog opening and closing. _From: the pane-boxes-and-state plan's Phase 3
  probe._

## Ideas

- **Search the changed files**, filtering the tree by name. _Left out of the changed-files pane plan._
- **Preview a file** in the pane, not only its diff, and open it in an editor. _Left out of the changed-files pane
  plan._
- **Read highlights:** show the files Claude reads, not only the ones it edits. _Left out of the changed-files pane
  plan._
- **Git action animations** for commits, pushes and checkouts in the header. _Left out of the changed-files pane plan._
- **Diff against the branch's merge-base** (everything on the branch, like a PR) as an option next to `HEAD`. _From:
  the changed-files pane plan's decisions._
