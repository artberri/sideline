---
name: create-plan
description: >-
    Create a multi-phase implementation plan file in `.agents/plans/` for a feature, refactor or fix of the vacuo
    Claude Code mod. Use this skill whenever the user wants to plan, design, or scope out a piece of work before
    writing code — including the explicit `/create-plan` invocation, phrasings like "create a plan", "draft a plan",
    "plan out this task", "let's plan this", "write an implementation plan", or when the user describes a non-trivial
    change and asks how to break it down. For small, single-phase, or decision-free work it will suggest executing
    directly instead of writing a file. This skill covers ONLY plan creation, not executing a plan.
---

# Creating a Plan

This skill produces an implementation plan file in `.agents/plans/` that a later session (or the same one) executes
phase by phase. Plans are multi-phase, each phase is a vertical slice the user can see working in the pane, and every
phase is small enough to review in one sitting.

**Don't start writing the file until the user has agreed** on the task, the contracts, and the phase breakdown. The
file is the artifact — the conversation before it is where the thinking happens.

**Not every plan needs a file.** Small, single-phase work with no decisions worth recording is better executed than
written down — Step 4 is the gate where you check that and ask the user.

## What vacuo is

vacuo is a Claude Code mod (a plugin with a hooks module) kept in this repository and loaded from the working copy
through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`. Saving a file hot-reloads it in any interactive session,
so a phase is checked by looking at the running session, not only by tests.

- Manifest: `.claude-plugin/plugin.json` (the plugin's `name` is `vacuo`, even though the folder is `vacuo2`).
- Hooks: `hooks/hooks.json` lists the module, `hooks/register.tsx` exports `register: Register`.
- Typings: once the mod has loaded, `.claude-plugin/types/claude-code/index.d.ts` is the engine API (generated,
  gitignored). Grep it for the event, noun or element you plan to use; it is ~20,000 lines, so never read it whole.
- Authoring guidance: the `plugin-authoring` skill. Load it before planning anything that touches the engine API.

## Step 1: Capture the Task

Gather these inputs from the user. Don't grill them round after round — when something is missing, propose a
reasonable default and let them course-correct.

1. **What's the task?** A 1-3 sentence description of what they want to build, fix, or change. If they already
   described it, confirm your understanding back to them.
2. **What are the contracts involved?** The observable surfaces the change affects. Suggest a list if the user doesn't:
    - Engine events hooked (`session.start`, `tool.call`, `ui.render` on a `Pane`, `command.run`, ...)
    - Panes, bands, status entries, toasts, slash commands the person sees
    - `$.state` / `$.store` values and their contract in `types/index.d.ts`
    - `userConfig` options in `plugin.json` (they show up in `/config`)
    - External commands run through `$.process.run` (git, ...) and the output format parsed
    - Test suites (`*.test.ts(x)` run by `claude plugin test`)
3. **What must be true when it's done?** The behaviour, as rules a test or a look at the pane can check: what shows,
   when it updates, what happens in edge cases (not a git repo, detached HEAD, narrow terminal, no Nerd Font). Draft
   them yourself from the request rather than asking the user to write them.

## Step 2: Research Before Drafting

Read the code the task will touch. Without this, the plan is generic and the phase breakdown won't match reality.

- Read `hooks/` and any existing plan in `.agents/plans/`.
- Check the engine API in the typings for every event, `$` method and element the plan will name. If the mod has not
  loaded yet, the `plugin-authoring` skill names a typings file for this build.
- When the user points at another mod as a reference, read its source (clone it into the scratchpad, never into this
  repo) and note what to borrow and what to leave out. Link the file and line in the plan.

**Verify every symbol you quote against the typings or the code.** Execution follows the plan literally, so a plan
that names an event, prop or `$` method that doesn't exist fails mid-phase. Copy real identifiers; don't write the
one you expect.

## Step 3: Propose the Phase Breakdown

Before writing the file, walk the user through your proposed phases. Each phase should be a **vertical slice**:

- It ends with something the user can see in a running session (hot reload), plus the tests that pin it.
- It's independently committable: `bun run check` is green (format, lint, types, plugin validation, tests).
- It touches a handful of files, so review stays manageable.
- It has a single responsibility. Drawing data and gathering it can share a phase; a new interaction (keys, clicks) is
  its own phase.
- For feature / behaviour-change / fix phases, include a **Test Checklist**: the `claude plugin test` cases in
  `tests/` worth writing (what the pane draws for a repo state, parsers, tree building), each naming the behaviour
  rules it proves (`B1`, `B2`). A rule no test can prove is listed as a manual check in the live session, with the
  reason.

Present the breakdown and ask for approval. **Do not create the plan file yet.** If the user pushes back on a phase
boundary or a contract, iterate on the proposal in-chat before anything hits disk.

## Step 4: Decide Whether the Plan Deserves a File

A plan file earns its keep when it records decisions worth coming back to: a multi-phase breakdown executed across
several sessions, contracts that were debated, an ordering constraint that isn't obvious from the code. When none of
that is true, the file is pure overhead.

Check the approved breakdown against these signals:

- It's a **single phase**, or two phases that would realistically land in one sitting.
- Each phase is one commit's worth of work.
- **No real decisions were made** — the shape was obvious and never debated.
- **No alternatives were weighed.**

If most hold, **ask the user before writing the file** (use `AskUserQuestion`), offering to execute directly instead
and citing the concrete reasons. Recommend executing directly, but it's the user's call. If they choose it, restate the
phases as an in-chat checklist and proceed. Don't re-ask later in the same session.

If the plan is genuinely multi-phase or decision-heavy, skip this gate and go straight to Step 5.

## Step 5: Write the Plan File

Pick the filename:

```
.agents/plans/YYYY-MM-DD-<semantic-name>.md
```

Use today's date (`date +%Y-%m-%d` if unsure) and a hyphenated slug.

**Plan mode caveat:** inside Claude Code's plan mode the harness restricts edits to its own plan file. Still attempt
`.agents/plans/...` and let the permission prompt ask; only if the user rejects it, fall back to the harness path.

Use this structure:

```markdown
# <Title>

## Goal

<1-3 sentences summarizing what this plan delivers and why.>

## Behaviour

<What the mod does once the plan is done, one observable rule per line. No file names, no phases. Execution fills in
each rule's proving test as it goes.>

- **B1.** <e.g. "The header shows `⇡2` when the branch is two commits ahead of its upstream."> — _proved by:_
- **B2.** ...

## Context

<Decisions with their reasons, references, and the files to read. Link files so the user can click through.>

### Key files

| Area | Files                                          |
| ---- | ---------------------------------------------- |
| ...  | [hooks/register.tsx](../../hooks/register.tsx) |

### Contracts

- **Engine events:** ...
- **UI:** ...
- **State:** ...
- **Options:** ...
- **External commands:** ...
- **Test suites:** ...

(Only include subsections that apply.)

## Phase 1: <Short phase title>

**Description:** <1-2 sentences on what this phase delivers and what the user will see.>

**Test Checklist** (omit for pure refactors or docs-only phases):

- [ ] Pane test (B1, B2): ...
- [ ] Unit test (B3): ...
- [ ] Manual, live session (B4): ... — <why a test can't prove it>

**To-do:**

- [ ] <Concrete action>
- [ ] Run `bun run format` and `bun run check`

## Phase 2: <Short phase title>

...

## Next step

Phase 1: <one-sentence reminder of what to do next>.
```

### Tips for good phases

- Phase titles read like conventional commit subjects: short, imperative.
- To-do items are specific enough for someone else to execute. Avoid "handle" or "support" without a concrete file or
  behaviour.
- More than ~10 to-dos means two phases in disguise.
- A behaviour rule that reads like a to-do ("add a numstat parser") is implementation; restate it as what the user sees
  ("a modified file shows `+3 -1` on the right").
- Decisions with a reason behind them stay in **Context**; the rule they produce goes in **Behaviour**.

## Step 6: Hand Off to Execution

After writing the file:

1. Show the user the path you wrote.
2. **Do not start executing the plan.** Wait for the user to ask for Phase 1.
3. Don't commit the plan unless the user asks.

## Edge Cases

- **Task is a one-liner** → tell the user a plan is overkill and suggest just making the change.
- **Scope is unclear, several valid approaches** → present the options briefly and ask the user to pick before drafting
  phases.
- **User insists on writing the file immediately** → explain once why the upfront conversation matters. If they still
  want to skip, draft with your best guess and flag the assumptions at the top of the file.
- **A plan for the same task already exists in `.agents/plans/`** → don't duplicate it. Ask whether to extend, revise,
  or replace it.
