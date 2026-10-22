const capital = (family: string) => family.charAt(0).toUpperCase() + family.slice(1).toLowerCase()

// A model id as the session box shows it: `claude-opus-5-5` is `Opus 5.5`, `claude-3-5-sonnet-20241022` is
// `Sonnet 3.5`, and a 1M-context id (`[1m]`, `-1m`) gains ` 1M`; any other id stays as it is.
export function modelName(id: string): string {
	const big = /\[1m\]|-1m\b/i.test(id) ? ' 1M' : ''
	const current = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?!\d)/i.exec(id)
	if (current?.[1] && current[2])
		return `${capital(current[1])} ${current[2]}${current[3] ? `.${current[3]}` : ''}${big}`
	const older = /claude-(\d+)(?:-(\d))?-([a-z]+)/i.exec(id)
	if (older?.[1] && older[3]) return `${capital(older[3])} ${older[1]}${older[2] ? `.${older[2]}` : ''}${big}`
	return id
}
