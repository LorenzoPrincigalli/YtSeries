import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (name === '__tests__') return []
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

let hasTranslation

beforeAll(async () => {
  vi.stubGlobal('navigator', { language: 'en-US' })
  ;({ hasTranslation } = await import('../i18n.js'))
})

describe('i18n coverage', () => {
  const sources = ['src/tab', 'src/popup', 'src/content'].flatMap(dir => walk(join(root, dir))).filter(file => /\.(js|html)$/.test(file)).map(file => readFileSync(file, 'utf8'))
  const keys = new Set()
  for (const source of sources) {
    for (const match of source.matchAll(/\bt\(\s*['"]([a-z0-9_]+)['"]/g)) keys.add(match[1])
    for (const match of source.matchAll(/data-i18n="([a-z0-9_]+)"/g)) keys.add(match[1])
  }

  // Keys built dynamically (t(`popup_sync_${mode}`)) cannot be found by the regex above.
  for (const mode of ['connected', 'error', 'syncing', 'offline', 'logged_out']) keys.add(`popup_sync_${mode}`)

  it('finds the keys used by the UI', () => {
    expect(keys.size).toBeGreaterThan(100)
  })

  for (const language of ['en', 'it']) {
    it(`translates every UI key into ${language}`, () => {
      const missing = [...keys].filter(key => !hasTranslation(key, language))
      expect(missing).toEqual([])
    })
  }
})
