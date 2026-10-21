# vacuo

A Claude Code mod: a sidebar pane that shows the current branch with starship-style git status symbols and a tree of
the changed files, with line counts and a shimmer on the file Claude is editing. A smaller take on
[claude-code-filetree](https://github.com/data-goblin/claude-code-filetree).

The folder is `vacuo2`, but the plugin's name in `plugin.json` is `vacuo`: settings go under `pluginConfigs` → `vacuo`
and transcript errors name `vacuo`.

## Layout

```
.claude-plugin/plugin.json   manifest: name, version, userConfig options, types contract
.claude-plugin/types/        typings Claude Code generates on every load (gitignored)
hooks/hooks.json             lists the hooks module
hooks/register.tsx           export const register: Register = (on, options) => { ... }
types/index.d.ts             $.state contract (once the mod keeps state)
tests/*.test.ts(x)           claude plugin test suites
.agents/plans/               implementation plans; finished ones in done/
.claude/skills/              create-plan and execute-plan
```

## Running it

The working copy is loaded through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`. In an interactive session,
saving a file hot-reloads the mod (edits Claude makes reload when its turn ends). A reload runs `register` again: module
variables start over, `$.state` and `$.store` survive. A hook that fails or a module that doesn't load shows a dim line
in the transcript; `claude --debug` has the full log.

## Engine API

- Load the `plugin-authoring` skill before writing or changing hooks.
- The API is `.claude-plugin/types/claude-code/index.d.ts` (~20,000 lines). Grep it for the event, `$` method or
  element at hand (`'tool.call'`, `Pane: {`, `every:`); never read it whole, and never guess a shape.
- No DOM, no Node: everything outside the module goes through `$` (`$.process.run`, `$.clock`, `$.state`, `$.ui`).

## Tooling

Bun is pinned with proto in `.prototools`; `proto use` installs it, then `bun install`. `package.json` holds dev tools
only (oxlint, oxfmt, TypeScript): the mod itself has no dependencies and no build step.

## Checks

Run before each commit:

```sh
bun run format      # oxfmt, writes
bun run check       # oxfmt --check, oxlint, tsc -p ., claude plugin validate ., claude plugin test .
```

`tsc -p .` needs the generated typings, so the mod must have loaded once.

## Conventions

- TypeScript, strictly typed, no `any`. Small modules under `hooks/` with pure helpers exported so tests can reach
  them.
- Tabs for indentation, including JSON.
- Tests use `claude-code/testing` and fake the world once in a helper (env, clock, canned stdout per `git` command),
  as filetree's `tests/surfaces.test.tsx` does. Test parsers, the tree builder and what the pane draws; skip what a
  look at the live pane proves.
- Run git with `--no-optional-locks` so polling never blocks Claude's own git commands.
- Every glyph has a plain fallback (the `glyphs` option: `auto`, `nerd`, `plain`).
- Conventional commits, small and one topic each. Plans are worked with `/create-plan` and `/execute-plan`.
