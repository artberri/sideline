import { expect, test } from 'claude-code/testing'

import { modelName } from '../hooks/meter'

test('modelName shortens a model id to its family and version', () => {
	expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
	expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
	expect(modelName('claude-sonnet-4-20250514')).toBe('Sonnet 4')
	expect(modelName('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
	expect(modelName('some-gateway-model')).toBe('some-gateway-model')
})
