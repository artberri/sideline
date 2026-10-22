#!/usr/bin/env bash
# Builds the throwaway repo the demo records in: a tiny Bun project in plain JavaScript (no TypeScript check to flag a
# missing `bun:test` type in the take) with three commits, an hour, a day and three days
# old, so the pane's recent commits read the same on every take. Removes and rebuilds the folder each time.
set -euo pipefail

target="${1:-/tmp/sideline-demo}"
marker=".sideline-demo"

# Only ever remove a folder this script made.
if [ -e "$target" ]; then
	if [ ! -e "$target/$marker" ]; then
		echo "setup.sh: $target exists and isn't a sideline demo folder; not touching it" >&2
		exit 1
	fi
	rm -rf "$target"
fi
mkdir -p "$target/src"
cd "$target"
touch "$marker"
printf '%s\n' "$marker" >.gitignore

now="$(date +%s)"
commit() {
	local age_seconds="$1" message="$2"
	local when="@$((now - age_seconds)) +0000"
	git add -A
	GIT_AUTHOR_DATE="$when" GIT_COMMITTER_DATE="$when" \
		git -c user.name="Demo" -c user.email="demo@example.com" commit --no-verify -m "$message"
}

git init --quiet -b main

cat >package.json <<'JSON'
{
	"name": "greeter",
	"private": true,
	"type": "module",
	"scripts": { "test": "bun test" }
}
JSON
printf '# greeter\n\nA tiny greeter.\n' >README.md
commit $((3 * 86400)) "chore: start the greeter"

cat >src/greet.js <<'JS'
export function greet(name) {
	return `Hello, ${name}!`
}
JS
cat >src/greet.test.js <<'JS'
import { expect, test } from 'bun:test'

import { greet } from './greet'

test('greet says hello by name', () => {
	expect(greet('Ada')).toBe('Hello, Ada!')
})
JS
commit 86400 "feat: greet by name"

printf '# greeter\n\nA tiny greeter. Run its tests with `bun test`.\n' >README.md
commit 3600 "docs: say how to run the tests"

echo "Demo repo ready in $target"
