# Records demo/sideline.gif: Claude adds a function and a test to a throwaway repo while sideline's pane follows along.
# Run from the repository's root with `vhs demo/demo.tape`; see demo/README.md for what it needs.

Output demo/sideline.gif

Require claude
Require git
Require bun

Set Shell "bash"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 14
Set Width 1800
Set Height 1000
Set Padding 12
Set Theme "Catppuccin Mocha"
Set TypingSpeed 30ms

# Off camera: build the repo, start Claude Code in it, and accept the folder-trust question.
Hide
# A Claude Code started from inside another one inherits its session markers and warns about them on screen; drop the
# per-session ones (CLAUDE_CODE_PLUGIN_DIRS, which loads sideline, stays).
Type "unset CLAUDECODE CLAUDE_PID CLAUDE_EFFORT CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_CODE_SESSION_ID CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_SSE_PORT" Enter
Type "bash demo/setup.sh /tmp/sideline-demo && cd /tmp/sideline-demo && clear" Enter
Sleep 2s
# sideline's options at their defaults for the take, whatever your own settings say (no `background`, for one).
Type `claude --permission-mode acceptEdits --allowedTools "Bash(bun test)" --settings '{"pluginConfigs":{"sideline":{"options":{"glyphs":"auto","background":"","transcriptDiffs":"hide","transcriptCommands":"hide","sessionBox":"show","commandRows":5}}}}'` Enter
# The first take asks whether to trust the folder, defaulting to "No, exit": pick "Yes, I trust this folder". Later
# takes skip the question; Down and Enter on an empty prompt then do nothing.
Wait+Screen@30s /trust this folder|SIDELINE/
Sleep 1s
Down
Enter
Wait+Screen@30s /SIDELINE/
Sleep 1s
Show

# A clean repo: the session, no uncommitted changes, and the recent commits.
Sleep 3s

Type "Add a farewell(name) function to src/greet.js next to greet, add a test for it in src/greet.test.js, then run bun test"
Sleep 500ms
Enter

# Claude works: the title reads WORKING, the edited files shimmer in the tree, bun test runs in the commands box.
Wait+Screen@180s /✓ \$ bun test/
Sleep 4s

# Back to idle, with the tidy transcript and the counts in the pane.
Wait+Screen@60s /IDLE/
Sleep 4s
