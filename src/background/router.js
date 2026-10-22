// @ts-check
import { AppError, toErrorResponse } from '../shared/errors.js'
import { parse } from '../shared/schema.js'
import { logger } from '../shared/logger.js'

const log = logger.child('router')

/**
 * `contexts` lists who may call a route. Extension pages (dashboard, popup)
 * are trusted; content scripts run inside youtube.com's renderer, so a
 * compromised page must not be able to wipe data, import libraries or read
 * the full library — only the handful of routes the YouTube integration needs.
 * @typedef {'extension' | 'content'} SenderContext
 * @typedef {{
 *   handler: (ctx: any, payload: any) => any,
 *   schema?: import('../shared/schema.js').Schema,
 *   mode?: 'read' | 'command',
 *   contexts?: SenderContext[]
 * }} Route
 */

const DEFAULT_CONTEXTS = ['extension']

/**
 * Serializes commands so concurrent messages never interleave a
 * read-modify-save cycle. A failed command never blocks the next one.
 */
function createCommandQueue() {
  let chain = Promise.resolve()
  /** @template T @param {() => Promise<T>} operation @returns {Promise<T>} */
  return function runCommand(operation) {
    const result = chain.then(operation)
    chain = result.then(() => undefined, () => undefined)
    return result
  }
}

/**
 * Builds the message dispatcher. Every route declares a payload schema;
 * handlers receive only the parsed, sanitized payload. Any error becomes the
 * uniform `{ success: false, error, message }` envelope.
 * @param {Record<string, Route>} routes
 * @param {(operation: () => Promise<any>) => Promise<any>} runCommand
 */
function createRouter(routes, runCommand) {
  /** @param {any} message @param {any} ctx @param {SenderContext} [sender] */
  return async function dispatch(message, ctx, sender = 'extension') {
    const route = Object.hasOwn(routes, message.type) ? routes[message.type] : null
    if (!route) {
      log.warn('Unknown message type', message.type)
      return toErrorResponse(new AppError('UNKNOWN_TYPE', `Unknown message type: ${message.type}`))
    }
    if (!(route.contexts || DEFAULT_CONTEXTS).includes(sender)) {
      log.warn(`${message.type} rejected from ${sender} context`)
      return toErrorResponse(new AppError('FORBIDDEN', 'Not allowed from this context'))
    }
    try {
      const payload = route.schema ? parse(route.schema, message.payload ?? {}) : undefined
      const run = async () => route.handler(ctx, payload)
      return await (route.mode === 'read' ? run() : runCommand(run))
    } catch (err) {
      const response = toErrorResponse(err)
      const level = response.error === 'INVALID_PAYLOAD' ? 'warn' : 'error'
      log[level](`${message.type} failed`, err)
      return response
    }
  }
}

export { createRouter, createCommandQueue }
