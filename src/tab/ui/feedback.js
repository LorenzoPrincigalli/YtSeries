// @ts-check
import { t } from '../../shared/i18n.js'
import { toAppError } from '../../shared/errors.js'
import { h } from '../../shared/dom.js'

const TOAST_MS = 5000
// Codes whose translated message is more useful than the action's generic one.
const SPECIFIC_ERRORS = new Set([
  'NETWORK_ERROR', 'NETWORK_TIMEOUT', 'QUOTA_EXCEEDED', 'RATE_LIMITED', 'CIRCUIT_OPEN', 'API_UNAVAILABLE',
  'PLAYLIST_NOT_FOUND', 'INVALID_URL', 'STORAGE_QUOTA_EXCEEDED', 'CONTEXT_INVALIDATED', 'INIT_FAILED',
  'COLLECTION_EXISTS', 'UNDO_EXPIRED', 'INVALID_BACKUP', 'NOTES_LIMIT'
])

/**
 * User-facing message for an error: a translated message for known codes,
 * otherwise the caller's fallback. Raw backend messages are never shown.
 * @param {unknown} err @param {string} fallbackKey
 */
export function errorMessage(err, fallbackKey = 'something_wrong') {
  const { code } = toAppError(err)
  return SPECIFIC_ERRORS.has(code) ? t(`error_${code.toLowerCase()}`) : t(fallbackKey)
}

function region() {
  let el = document.getElementById('toastRegion')
  if (!el) {
    el = h('div', { id: 'toastRegion', class: 'toast-region', role: 'status', 'aria-live': 'polite' })
    document.body.append(el)
  }
  return el
}

/**
 * @param {string} message
 * @param {{ variant?: 'info' | 'success' | 'error', action?: { label: string, run: () => unknown }, duration?: number }} [options]
 */
export function toast(message, { variant = 'info', action, duration = TOAST_MS } = {}) {
  const host = region()
  host.replaceChildren() // one toast at a time keeps the undo action unambiguous
  const el = h('div', { class: ['toast', `toast-${variant}`] },
    h('span', { class: 'toast-message' }, message),
    action && h('button', {
      type: 'button',
      class: 'toast-action',
      onClick: event => { event.stopPropagation(); el.remove(); action.run() }
    }, action.label))
  host.append(el)
  setTimeout(() => el.remove(), duration)
  return el
}

/** @param {unknown} err @param {string} [fallbackKey] */
export function toastError(err, fallbackKey) {
  return toast(errorMessage(err, fallbackKey), { variant: 'error' })
}
