// @ts-check
import { AppError } from '../../shared/errors.js'
import { logger } from '../../shared/logger.js'

const log = logger.child('api')

/**
 * Sends a message to the background and resolves with its response envelope.
 * Never rejects: transport failures become `{ success: false, error }`.
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 * @returns {Promise<any>}
 */
export function send(type, payload = {}) {
  return new Promise(resolve => {
    if (!chrome.runtime?.id) {
      resolve({ success: false, error: 'CONTEXT_INVALIDATED', message: 'Extension was reloaded' })
      return
    }
    chrome.runtime.sendMessage({ type, payload }, response => {
      const transportError = chrome.runtime.lastError
      if (transportError) {
        log.warn(`${type}: transport error`, transportError.message)
        resolve({ success: false, error: 'RUNTIME_ERROR', message: transportError.message })
      } else {
        resolve(response ?? { success: false, error: 'NO_RESPONSE' })
      }
    })
  })
}

/**
 * Like send(), but rejects with an AppError when the background reports a
 * failure — for callers that want try/catch control flow.
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 */
export async function request(type, payload = {}) {
  const response = await send(type, payload)
  if (!response?.success) {
    throw new AppError(response?.error || 'UNKNOWN_ERROR', response?.message || type, { context: { type, response } })
  }
  return response
}
