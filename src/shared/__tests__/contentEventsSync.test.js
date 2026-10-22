import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EVENTS } from '../events.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function parseContentEventsSource() {
  const source = readFileSync(join(root, 'src/content/index.js'), 'utf8')
  const match = source.match(/const EVENTS = \{([\s\S]*?)\n\}/)
  if (!match) throw new Error('Could not parse content EVENTS block')
  const events = {}
  for (const line of match[1].split('\n')) {
    const m = line.match(/^\s*([A-Z_]+):\s*'([^']+)'/)
    if (m) events[m[1]] = m[2]
  }
  return events
}

describe('content script EVENTS sync', () => {
  it('matches shared events for every type used in the content script', () => {
    const contentEvents = parseContentEventsSource()
    for (const [key, value] of Object.entries(contentEvents)) {
      expect(EVENTS[key], `missing shared EVENTS.${key}`).toBe(value)
    }
  })
})
