# Follow-ups and ideas

Work that came out of a plan or a conversation but wasn't done yet. Pick one up with `/create-plan`, then remove it
here (or move it into the plan) once it is planned.

## Follow-ups

- **Write a `README.md`.** `claude plugin validate` reports a missing README as the one problem left for submitting
  the mod to the plugin directory (the license is in place); it should say what the mod does, how to install it and its
  options (`glyphs`, `background`, `transcriptDiffs`, `transcriptCommands`, `sessionBox`). It should say the icons need
  Nerd Fonts v3 (3.0 or later): 33 of them were added in 3.0, and `dev-bun` (U+E76F) was another glyph in 2.x.
  _From: the validator's output since the scaffold, and the Nerd Font icon review._
- **Fold other tools' long inputs.** Agent prompts and MCP calls can print long inputs in the transcript too; they
  could show a short label the way Bash rows show their description. _From: the hide-bash-commands plan._
    - **Measure first (in progress).** Branch `probe/tool-input-lengths` (pushed) has a temporary probe: each finished
      standalone tool row logs its tool name, parameter names and input length, never values, to `.probe.log` in the
      mod's folder (gitignored there). To run it: `git switch probe/tool-input-lengths`, work as usual for a session or
      two with some MCP calls (Notion, Slack, Jira) and subagents, then read `.probe.log`: one line per tool with rows
      seen, how many were over 120 characters, the longest and the parameter names. Grouped calls draw no row of their
      own, so they don't show; the long ones expected (MCP, `Agent`) are standalone.
    - **Then the fix**, for the tools the log shows long: a `ToolUse` hook rewrites `input` for the row only (the call is
      untouched), keeping every parameter name, cutting string values to about 40 characters with `…` and nested values
      to `{…}` / `[…]`; no LLM summaries; ctrl+o and `transcriptCommands: show` keep it whole. Probably one phase if it
      is mostly MCP. Trade-off: a cut MCP row can hide the detail you'd check before a write (a channel, a JQL clause);
      the permission dialog still shows it whole.
    - **Afterwards** delete the branch (`git push origin --delete probe/tool-input-lengths`); the probe is never merged.
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
- **The pane in VS Code and the mobile app.** It opens there only on `/sideline`, and is laid out for the terminal:
  the box titles fall outside their boxes (no overlay), it doesn't take the pane's width, and those surfaces have no
  `Client`, so the tree can't be clicked (row Buttons drew as yellow chips and didn't respond). _From: trying the pane
  in VS Code._

## Ideas

- **Search the changed files**, filtering the tree by name. _Left out of the changed-files pane plan._
- **Preview a file** in the pane, not only its diff, and open it in an editor. _Left out of the changed-files pane
  plan._
- **Read highlights:** show the files Claude reads, not only the ones it edits. _Left out of the changed-files pane
  plan._
- **Git action animations** for commits, pushes and checkouts in the header. _Left out of the changed-files pane plan._
- **Diff against the branch's merge-base** (everything on the branch, like a PR) as an option next to `HEAD`. _From:
  the changed-files pane plan's decisions._
