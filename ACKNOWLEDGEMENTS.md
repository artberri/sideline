# Acknowledgements

## claude-code-filetree

sideline is a smaller take on [claude-code-filetree](https://github.com/data-goblin/claude-code-filetree) by Kurt
Buhler (MIT), and leans on it heavily as inspiration and as a reference for how a Claude Code mod is built:

- the idea of a docked sidebar pane that follows what Claude reads and writes, with git status and `+N -N` line
  counts per file and folder;
- running git with `--no-optional-locks` and `GIT_OPTIONAL_LOCKS=0`, so polling never blocks Claude's own git
  commands;
- reading `git diff HEAD --numstat -z` for line counts and `git diff --no-index` for untracked files;
- the Nerd Font detection behind the `glyphs` option, and a plain fallback for every glyph;
- the shape of the `tool.call` hooks and the shimmer animation in a `Client` module;
- the test style: one helper that fakes the environment and canned `git` output, then asserts on what the pane draws.

sideline's code and its icon table are written from scratch; none of filetree's source is copied.

## claude-flightdeck

The pane's look follows [claude-flightdeck](https://github.com/scasella/claude-flightdeck) by Stephen Casella (MIT):

- the centred title naming the mod and Claude's state (`IDLE`, `WORKING`), read from the main loop's `turn.start`
  and `turn.complete`;
- the line under the title (flightdeck's legend; sideline's keyboard hints);
- each section in its own rounded box in a theme colour, with a caps title.

None of flightdeck's source is copied.

## Starship

The branch header uses the default symbols and order of [Starship](https://starship.rs)'s `git_branch` and
`git_status` modules.

## Nerd Fonts

The file-type icons in `plugin/hooks/icons.ts` are code points looked up in
[Nerd Fonts](https://github.com/ryanoasis/nerd-fonts)' `glyphnames.json`. sideline only names code points; it ships no
font files.
