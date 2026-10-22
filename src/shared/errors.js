// @ts-check

/**
 * The single error type thrown across the extension. `code` is a stable,
 * machine-readable identifier the UI maps to a translated message; `message`
 * is for logs only and must never be shown verbatim to users.
 */
class AppError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   * @param {{ cause?: unknown, context?: Record<string, unknown>, retryable?: boolean, status?: number }} [options]
   */
  constructor(code, message = code, { cause, context, retryable = false, status } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'AppError'
    this.code = code
    this.context = context
    this.retryable = retryable
    this.status = status
  }
}

/**
 * Wraps anything thrown into an AppError, preserving an existing code.
 * @param {unknown} err
 * @param {string} [fallbackCode]
 * @returns {AppError}
 */
function toAppError(err, fallbackCode = 'UNKNOWN_ERROR') {
  if (err instanceof AppError) return err
  if (err instanceof Error) {
    const code = /** @type {any} */ (err).code
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return new AppError('NETWORK_TIMEOUT', err.message, { cause: err, retryable: true })
    }
    if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
      return new AppError('NETWORK_ERROR', err.message, { cause: err, retryable: true })
    }
    return new AppError(typeof code === 'string' ? code : fallbackCode, err.message, { cause: err })
  }
  if (err && typeof err === 'object' && typeof (/** @type {any} */ (err).code) === 'string') {
    const plain = /** @type {any} */ (err)
    return new AppError(plain.code, typeof plain.message === 'string' ? plain.message : plain.code)
  }
  return new AppError(fallbackCode, String(err))
}

/**
 * Message-protocol error envelope. Never leaks stack traces or causes.
 * @param {unknown} err
 */
function toErrorResponse(err) {
  const error = toAppError(err)
  return { success: false, error: error.code, message: error.message }
}

export { AppError, toAppError, toErrorResponse }
