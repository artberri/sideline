# sideline

A Claude Code mod. Its pane, beside the conversation, stacks a `SIDELINE · IDLE/WORKING/WAITING` title and the key
hints over three boxes:

- `SESSION`: the branch with starship-style git status symbols, the model and effort, the context bar and the 5-hour
  and 7-day usage.
- `CHANGES`: the tree of changed files with line counts and a shimmer on the file Claude is editing, a file's diff, a
  clicked command; with no changes, the recent commits, each of which opens as its own tree and diffs. It scrolls on
  its own (wheel, keys, `↑ ↓` count on its border).
- `COMMANDS`: a log of the latest shell commands, `●` running, `✓` done, `✗` failed.

It also tidies the transcript: a described Bash command shows its description instead of the script, an edit's diff
folds into its `+N -N`, and finished "Ran 1 shell command" lines go (ctrl+o shows all). It started as a smaller take on
[claude-code-filetree](https://github.com/data-goblin/claude-code-filetree), with its look from
[claude-flightdeck](https://github.com/scasella/claude-flightdeck).

Options (`userConfig` in `plugin.json`, under `pluginConfigs` → `sideline` in settings): `glyphs`, `background`,
`transcriptDiffs`, `transcriptCommands`, `sessionBox`, `commandRows`. Transcript errors name `sideline`.

Contributor-facing setup, style and pull requests are in [CONTRIBUTING.md](CONTRIBUTING.md); this file is the brief for
an agent working in the repo.

## Layout

```
plugin/                             the mod: the only folder users install (a git-subdir source) and the directory reads
plugin/.claude-plugin/plugin.json   manifest: name, version, userConfig options, types contract
plugin/.claude-plugin/types/        typings Claude Code generates on every load (gitignored)
plugin/hooks/hooks.json             lists the hooks module
plugin/hooks/register.tsx           export const register: Register: the hooks, every engine call, the pane render
plugin/hooks/*.ts(x)                pure helpers: git (parsers, readers over a Git), tree, rows (the Client), window
                                    (rows, scroll), commands, commits, meter (session box), summary, symbols, icons
plugin/types/index.d.ts             $.state contract
plugin/tests/*.test.ts(x)           claude plugin test suites
plugin/README.md                    the user README; README.md at the root is a symlink to it
plugin/LICENSE                      a copy of LICENSE, so the installed plugin carries it
.agents/plans/                      implementation plans; finished ones in done/
.agents/follow-ups.md               follow-ups and ideas not planned yet
.claude/skills/                     create-plan and execute-plan
demo/                               the README's GIF and the VHS tape that records it
CONTRIBUTING.md                     for contributors: setup, checks, tests, commits, pull requests
CODE_OF_CONDUCT.md                  Contributor Covenant 2.0
CHANGELOG.md                        Keep a Changelog: a line under Unreleased for each user-facing change
```

## Running it

The working copy's `plugin/` folder is loaded through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`. In an
interactive session, saving a file hot-reloads the mod (edits Claude makes reload when its turn ends). A reload runs
`register` again: module variables start over, `$.state` and `$.store` survive. A hook that fails or a module that
doesn't load shows a dim line in the transcript; `claude --debug` has the full log.

## Engine API

- Load the `plugin-authoring` skill before writing or changing hooks.
- The API is `plugin/.claude-plugin/types/claude-code/index.d.ts` (~20,000 lines). Grep it for the event, `$` method or
  element at hand (`'tool.call'`, `Pane: {`, `every:`); never read it whole, and never guess a shape.
- No DOM, no Node: everything outside the module goes through `$` (`$.process.run`, `$.clock`, `$.state`, `$.ui`).

## Engine gotchas

Each of these cost a round to find:

- A second hook on the same event with no matcher makes the whole module fail to load; give each a matcher, or fold
  them into one.
- A function `$` is passed to must be declared at the top of the module (not inside `register`), or validation
  refuses it.
- VS Code's element table answers `'Client' in elements` at run time though it draws no `Client`; decide by surface
  name (`HAS_CLIENT`: terminal and desktop).
- A box title laid over a border only shows as a sibling drawn after the box (`position="absolute"`), not as a child.
- A `Button`'s children wrap instead of truncating: cut the text to the width yourself (`fitSubject`, `logLine`).
- A permission dialog can't be detected: `tool.check`'s `ask` means "the mode decides" (also in auto mode, with no
  dialog), and `classic.PermissionRequest` can be swallowed by another plugin first.
- An option's change reaches the mod on its next load.
- In tests: `$.ui.scroll` takes the raw `ui.scroll` event (`pointer` included); `$.ui.focus` has no implementation;
  an event the hooks pass on (`session.measure`, `turn.complete`) needs the test to answer it with `on(...)`.
- To see a transcript row live, edit a file inside the repo: edits to the scratchpad fold into a group line.

## Tooling

Bun is pinned with proto in `.prototools`; `proto use` installs it, then `bun install`. `package.json` holds dev tools
only (oxlint, oxfmt, TypeScript): the mod itself has no dependencies and no build step. `package.json` and `bun.lock`
stay at the repository root, outside `plugin/`: there, the pair would make Claude Code install the packages for every
user who installs the plugin.

`plugin/tsconfig.json` leaves out the generated MCP tool typings (`claude-code-mcp`): the mod calls no MCP tool, and
with many MCP servers connected their union made the first `$.tool.call` tsc checked fail with TS2589, depending on file
order. Don't add them back.

## Checks

Run before each commit:

```sh
bun run format      # oxfmt, writes
bun run check       # oxfmt --check, oxlint, tsc -p plugin, claude plugin validate plugin, claude plugin test plugin
```

`tsc -p plugin` needs the generated typings, so the mod must have loaded once.

CI (`.github/workflows/check.yml`) runs the same checks but `tsc` on every push and pull request to `main`, against
the pinned Claude Code build and the latest one; only the pinned one has to pass. To move the pin, change it there.

## Conventions

- Only what the installed mod needs goes in `plugin/`: every file there reaches each user and is scanned by the
  plugin directory. Tooling, plans, the demo and contributor docs stay at the root.
- TypeScript, strictly typed, no `any`. Small modules under `plugin/hooks/` with pure helpers exported so tests can
  reach them.
- Tabs for indentation, including JSON.
- Tests use `claude-code/testing` and fake the world once in a helper (env, clock, canned stdout per `git` command), as
  filetree's `tests/surfaces.test.tsx` does (ours are in `plugin/tests/`). Test parsers, the tree builder and what the
  pane draws; skip what a look at the live pane proves.
- Run git with `--no-optional-locks` so polling never blocks Claude's own git commands.
- Every glyph has a plain fallback (the `glyphs` option: `auto`, `nerd`, `plain`). The file icons need Nerd Fonts 3.0
  or later.
- Live check first, commit after: a change to what the pane or the transcript draws stays uncommitted until the user
  has looked at it in a running session and says it works (or says "commit").
- Conventional commits, small and one topic each. Plans are worked with `/create-plan` and `/execute-plan`.
- To create a plan, always invoke the `create-plan` skill first; to work on one (start, continue or resume a phase),
  always invoke the `execute-plan` skill first, even when the request doesn't name it.
