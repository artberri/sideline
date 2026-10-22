# The demo GIF

`demo/sideline.gif`, at the top of the main README, is recorded with [VHS](https://github.com/charmbracelet/vhs) from
[`demo.tape`](demo.tape): Claude adds a function and its test to a throwaway repo while the pane follows along.

```sh
vhs demo/demo.tape
```

Run it from the repository's root. It needs:

- `vhs` (`brew install vhs`), `claude`, `git` and `bun` on your `PATH`;
- sideline loaded in Claude Code (`CLAUDE_CODE_PLUGIN_DIRS`, or installed), the fullscreen layout (`/tui fullscreen`),
  and a signed-in Claude Code;
- the `FiraCode Nerd Font Mono` font (Nerd Fonts 3), or change `FontFamily` in the tape.

The tape starts Claude Code with sideline's options at their defaults (`--settings`), so the GIF shows sideline as a new
user gets it, whatever your own `pluginConfigs` say.

[`setup.sh`](setup.sh) rebuilds `/tmp/sideline-demo` before each take: a tiny Bun project with three commits, three days,
a day and an hour old. It only ever removes a folder it made itself.

Everything but Claude's own replies is the same on every take; the tape waits for what appears on screen
(`Wait+Screen`), not for fixed times, so a slower reply still fits. Record two or three takes and keep the best.
