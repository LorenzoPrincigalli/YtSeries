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
  const sources = walk(join(root, 'src/tab')).filter(file => /\.(js|html)$/.test(file)).map(file => readFileSync(file, 'utf8'))
  const keys = new Set()
  for (const source of sources) {
    for (const match of source.matchAll(/\bt\(\s*['"]([a-z0-9_]+)['"]/g)) keys.add(match[1])
    for (const match of source.matchAll(/data-i18n="([a-z0-9_]+)"/g)) keys.add(match[1])
  }

  it('finds the keys used by the dashboard', () => {
    expect(keys.size).toBeGreaterThan(100)
  })

  for (const language of ['en', 'it']) {
    it(`translates every key used in src/tab into ${language}`, () => {
      const missing = [...keys].filter(key => !hasTranslation(key, language))
      expect(missing).toEqual([])
    })
  }
})
