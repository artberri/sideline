import type { Glyphs } from '../types'

// Nerd Font code points, named as in nerd-fonts' glyphnames.json. Nerd Fonts v3 or later: 33 were added in 3.0, and
// U+E76F was another glyph in 2.x.
const GLYPH = {
	folderOpen: 0xe5fe, // custom-folder_open
	file: 0xe64e, // seti-default
	typescript: 0xe628, // seti-typescript
	tsconfig: 0xe69d, // seti-tsconfig
	javascript: 0xe60c, // seti-javascript
	react: 0xe625, // seti-react
	json: 0xe60b, // seti-json
	markdown: 0xe609, // seti-markdown
	yaml: 0xe6a8, // seti-yml
	toml: 0xe6b2, // custom-toml
	shell: 0xe691, // seti-shell
	powershell: 0xe683, // seti-powershell
	html: 0xe60e, // seti-html
	css: 0xe614, // seti-css
	sass: 0xe603, // seti-sass
	go: 0xe627, // seti-go
	rust: 0xe68b, // seti-rust
	python: 0xe606, // seti-python
	ruby: 0xe605, // seti-ruby
	php: 0xe608, // seti-php
	java: 0xe66d, // seti-java
	kotlin: 0xe634, // seti-kotlin
	swift: 0xe699, // seti-swift
	c: 0xe649, // seti-c
	cpp: 0xe646, // seti-cpp
	lua: 0xe620, // seti-lua
	elixir: 0xe62d, // seti-elixir
	vue: 0xe6a0, // seti-vue
	svelte: 0xe697, // seti-svelte
	graphql: 0xe662, // seti-graphql
	sql: 0xe706, // dev-database
	prisma: 0xe684, // seti-prisma
	terraform: 0xe69a, // seti-terraform
	xml: 0xe619, // seti-xml
	csv: 0xe64a, // seti-csv
	image: 0xe60d, // seti-image
	svg: 0xe698, // seti-svg
	pdf: 0xe67d, // seti-pdf
	video: 0xe69f, // seti-video
	audio: 0xe638, // seti-audio
	font: 0xe659, // seti-font
	archive: 0xe6aa, // seti-zip
	config: 0xe615, // seti-config
	lock: 0xe672, // seti-lock
	git: 0xe65d, // seti-git
	npm: 0xe616, // seti-npm
	yarn: 0xe6a7, // seti-yarn
	bun: 0xe76f, // dev-bun
	docker: 0xe650, // seti-docker
	makefile: 0xe673, // seti-makefile
	license: 0xe60a, // seti-license
} as const

type GlyphName = keyof typeof GLYPH

const BY_NAME: Record<string, GlyphName> = {
	'package.json': 'npm',
	'package-lock.json': 'npm',
	'tsconfig.json': 'tsconfig',
	'yarn.lock': 'yarn',
	'bun.lock': 'bun',
	'bun.lockb': 'bun',
	dockerfile: 'docker',
	'docker-compose.yml': 'docker',
	makefile: 'makefile',
	license: 'license',
	'license.md': 'license',
	'.gitignore': 'git',
	'.gitattributes': 'git',
	'.gitmodules': 'git',
	'.prototools': 'config',
	'.editorconfig': 'config',
}

const BY_EXTENSION: Record<string, GlyphName> = {
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	tsx: 'react',
	jsx: 'react',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	json: 'json',
	jsonc: 'json',
	md: 'markdown',
	mdx: 'markdown',
	yaml: 'yaml',
	yml: 'yaml',
	toml: 'toml',
	sh: 'shell',
	bash: 'shell',
	zsh: 'shell',
	fish: 'shell',
	ps1: 'powershell',
	html: 'html',
	htm: 'html',
	css: 'css',
	scss: 'sass',
	sass: 'sass',
	go: 'go',
	rs: 'rust',
	py: 'python',
	rb: 'ruby',
	php: 'php',
	java: 'java',
	kt: 'kotlin',
	swift: 'swift',
	c: 'c',
	h: 'c',
	cpp: 'cpp',
	cc: 'cpp',
	hpp: 'cpp',
	lua: 'lua',
	ex: 'elixir',
	exs: 'elixir',
	vue: 'vue',
	svelte: 'svelte',
	graphql: 'graphql',
	gql: 'graphql',
	sql: 'sql',
	prisma: 'prisma',
	tf: 'terraform',
	tfvars: 'terraform',
	xml: 'xml',
	csv: 'csv',
	png: 'image',
	jpg: 'image',
	jpeg: 'image',
	gif: 'image',
	webp: 'image',
	ico: 'image',
	svg: 'svg',
	pdf: 'pdf',
	mp4: 'video',
	mov: 'video',
	webm: 'video',
	mp3: 'audio',
	wav: 'audio',
	ttf: 'font',
	otf: 'font',
	woff: 'font',
	woff2: 'font',
	zip: 'archive',
	gz: 'archive',
	tar: 'archive',
	lock: 'lock',
	env: 'config',
	ini: 'config',
	conf: 'config',
}

const PLAIN = { dir: '▾', file: '·' } as const

export function rowIcon(kind: 'dir' | 'file', name: string, glyphs: Glyphs): string {
	if (glyphs === 'plain') return PLAIN[kind]
	if (kind === 'dir') return String.fromCodePoint(GLYPH.folderOpen)
	const lower = name.toLowerCase()
	const dot = lower.lastIndexOf('.')
	const named = BY_NAME[lower] ?? (dot > 0 ? BY_EXTENSION[lower.slice(dot + 1)] : undefined)
	return String.fromCodePoint(GLYPH[named ?? 'file'])
}
