// @ts-check
import { EVENTS } from '../shared/events.js'
import { THEMES } from '../shared/constants.js'
import { logger } from '../shared/logger.js'
import { send } from './core/api.js'

const log = logger.child('theme')
const CACHE_KEY = 'yts-theme'
const DEFAULT_THEME = 'classic-red'

/** Applies the cached theme before the first state round-trip to avoid a flash. */
export function applyCachedTheme() {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached && THEMES.includes(cached)) document.documentElement.dataset.theme = cached
  } catch {
    // Storage can be unavailable (e.g. blocked site data); the default theme still applies.
  }
}

/**
 * Colours live in variables.css; this only flips the attribute and updates
 * the few things CSS cannot reach (logo asset, browser chrome, toolbar icon).
 * @param {string | undefined} themeName
 */
export function applyTheme(themeName) {
  const theme = themeName && THEMES.includes(themeName) ? themeName : DEFAULT_THEME
  const root = document.documentElement
  const changed = root.dataset.theme !== theme
  root.dataset.theme = theme
  const isDark = theme !== 'light'

  const logo = /** @type {HTMLImageElement | null} */ (document.querySelector('.header-logo-icon'))
  if (logo) logo.src = isDark ? '../../icons/icon_full_128.png' : '../../icons/icon_full_128_light.png'

  let meta = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="theme-color"]'))
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
  }
  meta.content = getComputedStyle(root).getPropertyValue('--bg').trim()

  try { localStorage.setItem(CACHE_KEY, theme) } catch { /* per-viewer cache only */ }

  if (changed) {
    send(EVENTS.SET_ICON_THEME, { suffix: isDark ? '_light' : '' }).then(response => {
      if (!response.success) log.warn('Toolbar icon not updated', response.error)
    })
  }
}
