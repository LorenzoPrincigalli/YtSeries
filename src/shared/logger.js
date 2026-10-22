// @ts-check

/**
 * Structured logger. Each entry is `{ at, level, scope, msg, data }`; entries
 * are mirrored to the console and kept in a bounded in-memory ring buffer so
 * a bug report can include recent diagnostics without persisting anything.
 */

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
const BUFFER_SIZE = 200

/** @typedef {{ at: number, level: keyof typeof LOG_LEVELS, scope: string, msg: string, data?: unknown[] }} LogEntry */

/** @type {LogEntry[]} */
const buffer = []
let threshold = LOG_LEVELS.INFO

/** Errors are not JSON-serializable; keep the useful fields only. */
function serialize(value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: /** @type {any} */ (value).code }
  }
  return value
}

class Logger {
  /** @param {string} scope */
  constructor(scope = 'app') {
    this.scope = scope
  }

  /** @param {string} scope */
  child(scope) {
    return new Logger(`${this.scope}:${scope}`)
  }

  /** @param {number} level */
  setLevel(level) {
    threshold = level
  }

  /**
   * @param {keyof typeof LOG_LEVELS} level
   * @param {unknown} msg
   * @param {unknown[]} data
   */
  _log(level, msg, data) {
    if (LOG_LEVELS[level] < threshold) return
    const entry = { at: Date.now(), level, scope: this.scope, msg: String(msg), data: data.length ? data.map(serialize) : undefined }
    buffer.push(entry)
    if (buffer.length > BUFFER_SIZE) buffer.shift()
    const method = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : level === 'DEBUG' ? 'debug' : 'info'
    console[method](`[YT Series][${level}][${this.scope}]`, msg, ...data)
  }

  /** @param {unknown} msg @param {...unknown} data */
  debug(msg, ...data) { this._log('DEBUG', msg, data) }
  /** @param {unknown} msg @param {...unknown} data */
  info(msg, ...data) { this._log('INFO', msg, data) }
  /** @param {unknown} msg @param {...unknown} data */
  warn(msg, ...data) { this._log('WARN', msg, data) }
  /** @param {unknown} msg @param {...unknown} data */
  error(msg, ...data) { this._log('ERROR', msg, data) }

  /** Recent entries, newest last. */
  recent() {
    return buffer.map(entry => ({ ...entry }))
  }
}

const logger = new Logger()

export { logger, Logger, LOG_LEVELS }
