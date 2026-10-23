# Changelog

All notable changes to sideline are listed here. The format follows [Keep a Changelog](https://keepachangelog.com),
and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

## [0.1.0] - 2026-10-23

The first release.

### The conversation

- A shell command Claude described shows its description instead of the whole script, and a live group's line shows
  the description without the command under it.
- An edit or a new file is one line with its counts, `Update(src/greet.js) (+4 -0)`, instead of the diff.
- A shell command that changed files lists them with their counts instead of the diff.
- Finished "Ran 1 shell command" and "Read 2 files" lines go, failed calls included.
- The answers to Claude's questions fold into one line.
- ctrl+o still shows everything, and the `transcriptCommands` and `transcriptDiffs` options turn the hiding off.

### The pane

- A `SIDELINE · IDLE / WORKING / WAITING` title, `WAITING` while a question or a plan waits for an answer, and the key
  hints under it.
- `SESSION`: the branch with Starship-style git status symbols, the model and effort, a context bar, and the 5-hour and
  7-day usage. The `sessionBox` option hides it.
- `CHANGES`: the changed files as a tree with `+N -N` counts and file icons, a shimmer on the file Claude is editing,
  and each file's diff on a click or `l`. It scrolls on its own, with the wheel, the keys and a `↑ ↓` count on its
  border.
- With no uncommitted changes, `CHANGES` lists the recent commits; each opens as its own tree, with each file's diff in
  that commit.
- `COMMANDS`: the latest shell commands, `●` running, `✓` done, `✗` failed; a click opens one whole in `CHANGES`. `c`
  moves the keys into the box, and the `commandRows` option sets its height, `0` hiding it.
- Outside a git repository, `CHANGES` says so in one line and `COMMANDS` takes the room.
- `/sideline` toggles the pane, `/sideline open` and `/sideline close` do one or the other, and a pane you close stays
  closed through a reload of the mod.
- It opens by itself in the terminal and in Claude Code Desktop; VS Code and the mobile app aren't supported yet.
- Options: `glyphs`, `background`, `transcriptDiffs`, `transcriptCommands`, `sessionBox`, `commandRows`.

[Unreleased]: https://github.com/artberri/sideline/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/artberri/sideline/releases/tag/v0.1.0
