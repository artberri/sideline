# Contributing to sideline

Help is welcome and much appreciated, whether you are an experienced developer or about to send your first pull
request. Have a look at the [open issues](https://github.com/artberri/sideline/issues), and please follow the
[code of conduct](CODE_OF_CONDUCT.md).

sideline is a Claude Code mod: a hooks module that draws a pane beside the conversation (the session, the changed files
and the commands Claude runs) and tidies the transcript. This file covers how to set it up, run it while you change it,
and send a change.

For anything bigger than a small fix, open an issue first and say what you'd like to change, so we can agree on the
shape before you spend time on it.

## Setting up

You need **Claude Code**, recent enough to load mods (`claude --version`), and **Bun**, the version pinned in
[`.prototools`](.prototools): with [proto](https://moonrepo.dev/proto), `proto use` installs it.

1. Fork the repository, and clone your fork:

    ```sh
    git clone https://github.com/YOUR_USERNAME/sideline.git
    cd sideline
    ```

2. Install the dev tools:

    ```sh
    bun install --frozen-lockfile
    ```

`package.json` holds dev tools only (oxfmt, oxlint, TypeScript). The mod itself has no dependencies and no build step:
Claude Code loads `hooks/register.tsx` as it is.

## Running it while you work

Claude Code loads the mod straight from your clone, and reloads it as you change it. Either for one session:

```sh
claude --plugin-dir /path/to/sideline
```

or for every session, by adding the folder to `CLAUDE_CODE_PLUGIN_DIRS` in your `~/.claude/settings.json` (several
folders are separated by `:`):

```json
{
	"env": {
		"CLAUDE_CODE_PLUGIN_DIRS": "/path/to/sideline"
	}
}
```

To check it loaded: in a terminal wide enough, the `Changes` pane opens by itself at the start of a session;
`/sideline` opens it otherwise.

In an interactive session, saving a file reloads the mod; an edit Claude makes reloads when its turn ends. Each reload
leaves a dim `sideline: reloaded (…)` line in the transcript. A reload runs `register` again: module variables start
over, `$.state` and `$.store` survive. A hook that fails, or a module that doesn't load, leaves a dim line naming
`sideline` instead; `claude --debug` has the full log. An option changed in `/config` reaches the mod on its next load
(`/reload-plugins` forces one).

The first time the mod loads, Claude Code writes its typings to `.claude-plugin/types/` (gitignored). They are the
engine's API, and `tsc` needs them.

Options go under `pluginConfigs` → `sideline` → `options` in settings, or through `/config`; the `userConfig` in
[`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) says what each does.

## Where things are

```
.claude-plugin/plugin.json   manifest: name, version, options (userConfig), state contract
hooks/register.tsx           the hooks: export const register: Register = (on, options) => { ... }
hooks/*.ts(x)                small modules with pure helpers (git parsers, tree, rows, window, meters)
types/index.d.ts             the $.state contract
tests/*.test.ts(x)           test suites run by `claude plugin test`
.agents/plans/               implementation plans; finished ones in done/
.agents/follow-ups.md        follow-ups and ideas not planned yet
```

[AGENTS.md](AGENTS.md) has more on the engine API and the conventions; it is also what an AI agent working in the repo
reads first.

## The engine API

- Everything outside the module goes through `$` (`$.process.run`, `$.clock`, `$.state`, `$.ui`): there is no DOM and
  no Node.
- The API is `.claude-plugin/types/claude-code/index.d.ts`, about 20,000 lines. Search it for the event, `$` method or
  element at hand (`'tool.call'`, `Pane: {`, `every:`) rather than reading it whole, and check a shape there instead
  of guessing it.
- Run git with `--no-optional-locks` (the `git()` helper in `hooks/git.ts` does), so polling never blocks Claude's own
  git commands.

## Checks

Run both before you send a change:

```sh
bun run format   # oxfmt, writes
bun run check    # oxfmt --check, oxlint, tsc -p ., claude plugin validate ., claude plugin test .
```

`tsc` needs the generated typings, so load the mod once first. CI (`.github/workflows/check.yml`) runs the same checks
except `tsc`, against the pinned Claude Code build and the latest one; only the pinned one has to pass.

## Tests

Tests use `claude-code/testing`. Fake the world once in a helper (session, clock, canned stdout for each `git`
command), then assert on what the hooks draw or store; `tests/pane.test.ts` is the example to follow.

- Fixing a bug, start with a test that fails because it reproduces the bug, then fix it and watch the test pass; it
  keeps the bug from coming back.
- Test what can break quietly: parsers of git output, the tree builder, the window maths, what the pane draws for a
  given repo state.
- Keep helpers pure and export them from their module, so a unit test can reach them.
- Skip tests for plumbing a look at the live pane proves. A few things can't be tested at all (the focus ring, how a
  surface really draws); say what you checked by hand instead.

## Code style

- TypeScript, strictly typed, no `any`.
- Tabs for indentation, JSON included. oxfmt formats; don't fight it.
- Comments explain why, not what, in full sentences.
- Every glyph has a plain fallback (the `glyphs` option: `auto`, `nerd`, `plain`). File icons need Nerd Fonts 3.0 or
  later.

## Commits and pull requests

- Small commits, one topic each, with [Conventional Commits](https://www.conventionalcommits.org) subjects:
  `feat: draw the branch header`, `fix: …`, `docs: …`, `test: …`, `build: …`.
- A pull request says what changed, why, and how you checked it: the tests you added and, for anything the pane draws,
  what you looked at in a live session (a screenshot helps).
- Keep `bun run check` green in every commit.
- Never commit secrets, tokens, local paths or anything personal; check the diff before you push.

## Releasing

sideline is installed from the [artberri marketplace](https://github.com/artberri/claude-plugins), which points at this
repository's default branch. Claude Code decides what to hand out by the `version` in
[`.claude-plugin/plugin.json`](.claude-plugin/plugin.json):

- **A new install** gets whatever is on `main` at that moment, so keep `main` working.
- **An existing install** gets a new copy only when `version` changes: when the user updates (`claude plugin update
  sideline@artberri`), or on their next session start if they turned on auto-update for the marketplace. Commits pushed
  without a version change don't reach them.

To release (maintainers):

1. Make sure `bun run check` is green on `main`.
2. Bump `version` in `.claude-plugin/plugin.json` ([Semantic Versioning](https://semver.org): a fix bumps the patch, a
   new feature or option the minor, a change that breaks an option or a setting the major).
3. Commit it alone as `chore: release <version>`, tag that commit `v<version>`, and push both:

    ```sh
    git tag -s v0.2.0 -m "sideline 0.2.0"
    git push origin main v0.2.0
    ```

4. Write the release notes on GitHub from the conventional commits since the last tag.

Keep `version` only in `plugin.json`: the marketplace entry has none, and setting it in both makes Claude Code use
`plugin.json`'s without a word.

## Plans

Changes of more than one step are planned in `.agents/plans/` before they are built: the behaviour as rules a test or a
look can check, the decisions with their reasons, and phases that each end in something visible. The `create-plan` and
`execute-plan` skills in `.claude/skills/` do this with Claude Code; you can write a plan by hand in the same shape, or
skip it for a small fix.

## Licence

sideline is under the [MIT licence](LICENSE); by contributing you agree your work is licensed the same way.
[ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) credits the projects it learned from.
