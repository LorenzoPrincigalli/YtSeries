// @ts-check
import { t, setLanguage } from '../shared/i18n.js'

/** @param {string | undefined} language 'system' | 'en' | 'it' */
export function applyLanguage(language = 'system') {
  setLanguage(language === 'system' ? null : language)
  document.documentElement.lang = language !== 'system' ? language : (navigator.language.split('-')[0] || 'en')
}

/**
 * Translates static markup. Elements declare their key with data-i18n and,
 * optionally, data-i18n-attr="placeholder|title|aria-label" to translate an
 * attribute instead of text content.
 */
export function translateStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const key = /** @type {HTMLElement} */ (el).dataset.i18n
    if (!key) continue
    const attrs = /** @type {HTMLElement} */ (el).dataset.i18nAttr
    if (attrs) {
      for (const attr of attrs.split(',')) el.setAttribute(attr.trim(), t(key))
    } else if (el.children.length === 0) {
      el.textContent = t(key)
    } else {
      // Element with an icon: translate only its dedicated label span.
      const label = el.querySelector('[data-i18n-label]')
      if (label) label.textContent = t(key)
    }
  }
  for (const option of root.querySelectorAll('#themeSelect option')) {
    option.textContent = t(`theme_${/** @type {HTMLOptionElement} */ (option).value.replace(/-/g, '_')}`)
  }
  for (const option of root.querySelectorAll('#languageSelect option')) {
    option.textContent = t(`language_${/** @type {HTMLOptionElement} */ (option).value}`)
  }
}
