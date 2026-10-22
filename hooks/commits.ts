const UNITS: [number, string][] = [
	[365 * 24 * 3600, 'y'],
	[30 * 24 * 3600, 'mo'],
	[7 * 24 * 3600, 'w'],
	[24 * 3600, 'd'],
	[3600, 'h'],
	[60, 'm'],
]

// How long ago `then` was, as a commit line shows it: `now` under a minute, else the largest whole unit (`2h`, `3d`).
export function shortAge(now: number, then: number): string {
	const seconds = Math.max(0, Math.floor((now - then) / 1000))
	for (const [size, unit] of UNITS) if (seconds >= size) return `${Math.floor(seconds / size)}${unit}`
	return 'now'
}
