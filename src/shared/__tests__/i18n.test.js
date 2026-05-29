import { describe, it, expect, beforeEach, vi } from 'vitest'

// The i18n module reads navigator.language at import time and on setLanguage
// We need to mock navigator before importing
beforeEach(() => {
  vi.stubGlobal('navigator', { language: 'en' })
})

async function getI18n() {
  const mod = await import('../i18n.js')
  mod.setLanguage('en')
  return mod
}

describe('i18n', () => {
  it('returns English string by default', async () => {
    const { t } = await getI18n()
    expect(t('watched')).toBe('Watched')
  })

  it('returns the key when translation is missing', async () => {
    const { t } = await getI18n()
    expect(t('nonexistent_key')).toBe('nonexistent_key')
  })

  it('switches to Italian', async () => {
    const { setLanguage, t } = await getI18n()
    setLanguage('it')
    expect(t('watched')).toBe('Visto')
    expect(t('unwatched')).toBe('Non visto')
  })

  it('interpolates params in strings', async () => {
    const { t } = await getI18n()
    expect(t('new_badge', { n: '3' })).toBe('+3 new')
  })

  it('returns English for unsupported language', async () => {
    const { setLanguage, t } = await getI18n()
    setLanguage('fr')
    expect(t('watched')).toBe('Watched')
  })
})
