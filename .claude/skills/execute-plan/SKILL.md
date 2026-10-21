---
name: execute-plan
description: >-
    Execute a plan from `.agents/plans/` one phase at a time, with tests where they pay off and small commits. Use this
    skill whenever the user wants to execute, run, resume, or continue a plan — including the explicit `/execute-plan`
    invocation, phrasings like "execute the plan", "start phase 1", "continue the plan", "work on the next phase", or
    when the user points at a file in `.agents/plans/` and asks to implement it. For creating a plan, use `/create-plan`.
---

# Executing a Plan

Plans in `.agents/plans/` are written by `/create-plan`. Each phase is a slice the user can see working in the pane.

**The one rule:** execute only the **current phase**, then stop and ask before the next one.

## Step 1: Find the plan and the phase

- Use the plan the user named; otherwise list `.agents/plans/` (not `done/`) and ask which one if there's more than one.
- The current phase is the **first** phase whose title doesn't end with ✅. Don't touch phases already marked ✅.
- If the `Next step` section disagrees with the ✅ marks, or the code already does what a to-do says, point out the
  mismatch and ask before editing.
- Stay on the current branch. Only create a branch if the user asks.

## Step 2: Build the phase

Work through the phase's to-dos in order.

- **Load the `plugin-authoring` skill first** in the session, and grep the typings
  (`.claude-plugin/types/claude-code/index.d.ts`) for each event, `$` method and element before using it. Don't guess an
  API shape.
- **Test what can break quietly:** parsers of git output, the tree builder, the symbol builder, and what the pane draws
  for a given repo state. Write the test alongside the code, before or after, whichever is quicker. Skip tests for
  plumbing a glance at the live pane proves.
- **Tests live in `tests/*.test.ts(x)`** and use `claude-code/testing` (`test`, `expect`, `mock`), like
  [claude-code-filetree's tests](https://github.com/data-goblin/claude-code-filetree/tree/main/tests): fake the
  environment once in a helper (`mock.env`, `mock.clock`, canned stdout for each `git` command `$.process.run` gets),
  then assert on what the hooks draw or store. Pure helpers are exported from their module and tested directly.
- **Check it live.** The mod hot-reloads on save in any session that loads `~/Pets/vacuo2`. When a to-do changes what the
  pane shows, ask the user to look, or say what they should see.
- Don't widen the scope. Anything the phase doesn't cover goes in the summary as a follow-up.

## Step 3: Before each commit

- [ ] `bun run format`, then `bun run check` (oxfmt check, oxlint, `tsc -p .`, `claude plugin validate .`,
      `claude plugin test .`; `tsc` needs the generated typings, so the mod must have loaded once)
- [ ] Update the plan: tick the to-dos this commit finishes, fill in _proved by:_ for each behaviour rule a test now
      proves (test file and title), mark the phase title ✅ only when every to-do is ticked, and update `Next step`.
- [ ] Stage the plan with the code, by explicit path.

**Live check first, commit after.** When the change is something the user checks in the pane (any phase with a manual
check, or a fix for something they reported), stop with it uncommitted, say exactly what to try, and commit only once
they confirm it works or say "commit". Tests-only or docs-only changes can be committed directly.

Commit small, one topic each, with conventional commit subjects (`feat: draw the branch header`). Check that
`git config user.email` is the personal address, never commit with `-q`, and if GPG signing fails, stop and tell the
user. Never pass `--no-gpg-sign`. Don't push unless asked.

## Step 4: End of the phase

1. Summarize: what changed (uncommitted, waiting on the live check), what the user should now see in the pane, any
   deviation from the plan.
2. List follow-ups and anything that surprised you, and offer to add the follow-ups to `.agents/follow-ups.md`
   (one bullet each, with where it came from). Add them only when the user says yes.
3. **Ask whether to go on to the next phase.** Don't continue on your own.

When the last phase is ✅, move the plan with `git mv .agents/plans/<plan>.md .agents/plans/done/<plan>.md` in that
same final commit, tell the user the plan is done, and offer to move the plan's own follow-ups section, if it has one,
into `.agents/follow-ups.md`.
