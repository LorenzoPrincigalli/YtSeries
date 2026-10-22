// @ts-check
// Messaging from the YouTube page to the service worker. After an extension
// update/reload the old content script is orphaned ("context invalidated"):
// every call then resolves with CONTEXT_INVALIDATED and the script shuts
// itself down instead of throwing on every tick.
import { logger } from '../shared/logger.js'

const log = logger.child('content')

/** @param {unknown} err */
const isInvalidation = err => /Extension context invalidated|message port closed/i.test(String(/** @type {any} */ (err)?.message ?? err))

/** @param {{ onInvalidated: () => void }} options */
export function createMessenger({ onInvalidated }) {
  let valid = true

  const invalidate = () => {
    if (!valid) return
    valid = false
    log.warn('Extension context invalidated; stopping YouTube integration until reload')
    onInvalidated()
  }

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [payload]
   * @returns {Promise<any>} never rejects
   */
  function send(type, payload = {}) {
    if (!valid || !chrome.runtime?.id) {
      invalidate()
      return Promise.resolve({ success: false, error: 'CONTEXT_INVALIDATED' })
    }
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type, payload }, response => {
          const error = chrome.runtime.lastError
          if (error) {
            if (isInvalidation(error)) invalidate()
            else log.warn(`${type} failed`, error.message)
            resolve({ success: false, error: isInvalidation(error) ? 'CONTEXT_INVALIDATED' : 'RUNTIME_ERROR' })
          } else {
            resolve(response ?? { success: false, error: 'NO_RESPONSE' })
          }
        })
      } catch (err) {
        if (isInvalidation(err)) invalidate()
        else log.warn(`${type} threw`, err)
        resolve({ success: false, error: 'CONTEXT_INVALIDATED' })
      }
    })
  }

  return {
    send,
    get valid() { return valid }
  }
}
