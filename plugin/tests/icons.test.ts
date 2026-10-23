import { expect, test } from 'claude-code/testing'

import { rowIcon } from '../hooks/icons'

const nerd = (name: string, kind: 'dir' | 'file' = 'file') => rowIcon(kind, name, 'nerd').codePointAt(0)?.toString(16)

test('rowIcon picks a Nerd Font icon by file name first, then by extension', () => {
	expect(nerd('package.json')).toBe('e616')
	expect(nerd('tsconfig.json')).toBe('e69d')
	expect(nerd('data.json')).toBe('e60b')
	expect(nerd('register.tsx')).toBe('e625')
	expect(nerd('README.MD')).toBe('e609')
	expect(nerd('.gitignore')).toBe('e65d')
	expect(nerd('src/', 'dir')).toBe('e5fe')
})

test('rowIcon falls back to a generic file icon', () => {
	expect(nerd('notes.unknownext')).toBe('e64e')
	expect(nerd('Procfile')).toBe('e64e')
	expect(nerd('.env')).toBe('e64e')
})

test('rowIcon draws plain marks without a Nerd Font', () => {
	expect(rowIcon('dir', 'src/', 'plain')).toBe('▾')
	expect(rowIcon('file', 'a.ts', 'plain')).toBe('·')
})
