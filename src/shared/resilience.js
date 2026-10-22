// @ts-check
import { AppError, toAppError } from './errors.js'
import { logger } from './logger.js'

const log = logger.child('resilience')

/** @param {number} ms */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Retries `operation` with exponential backoff and full jitter. Only errors
 * marked `retryable` (network failures, 429, 5xx) are retried by default.
 * @template T
 * @param {(attempt: number) => Promise<T>} operation
 * @param {{ retries?: number, baseMs?: number, maxMs?: number, retryOn?: (err: AppError) => boolean, sleep?: (ms: number) => Promise<unknown>, label?: string }} [options]
 * @returns {Promise<T>}
 */
async function withRetry(operation, { retries = 2, baseMs = 500, maxMs = 8000, retryOn = err => err.retryable, sleep = delay, label = 'operation' } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation(attempt)
    } catch (raw) {
      const err = toAppError(raw)
      if (attempt >= retries || !retryOn(err)) throw err
      const wait = Math.random() * Math.min(maxMs, baseMs * 2 ** attempt)
      log.warn(`${label} failed (${err.code}); retry ${attempt + 1}/${retries} in ${Math.round(wait)}ms`)
      await sleep(wait)
    }
  }
}

/**
 * Circuit breaker: after `threshold` consecutive failures the circuit opens and
 * calls fail fast with CIRCUIT_OPEN for `cooldownMs`; the next call after the
 * cooldown is a half-open probe. Only retryable (infrastructure) errors count,
 * so a 404 for one playlist never trips the circuit for everyone.
 */
class CircuitBreaker {
  /**
   * @param {string} name
   * @param {{ threshold?: number, cooldownMs?: number, now?: () => number }} [options]
   */
  constructor(name, { threshold = 5, cooldownMs = 60_000, now = Date.now } = {}) {
    this.name = name
    this.threshold = threshold
    this.cooldownMs = cooldownMs
    this.now = now
    this.failures = 0
    this.openedAt = 0
  }

  get state() {
    if (this.failures < this.threshold) return 'closed'
    return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open'
  }

  /**
   * @template T
   * @param {() => Promise<T>} operation
   * @returns {Promise<T>}
   */
  async exec(operation) {
    if (this.state === 'open') {
      throw new AppError('CIRCUIT_OPEN', `${this.name} is temporarily unavailable`, { retryable: false })
    }
    try {
      const result = await operation()
      this.failures = 0
      return result
    } catch (raw) {
      const err = toAppError(raw)
      if (err.retryable) {
        this.failures++
        if (this.failures >= this.threshold) {
          this.openedAt = this.now()
          log.warn(`circuit "${this.name}" opened after ${this.failures} failures`)
        }
      }
      throw err
    }
  }
}

/**
 * Runs `worker` over `items` with at most `limit` in flight. Never rejects:
 * returns per-item settled results so one failure cannot abort the batch.
 * @template I, R
 * @param {I[]} items
 * @param {number} limit
 * @param {(item: I) => Promise<R>} worker
 * @returns {Promise<PromiseSettledResult<R>[]>}
 */
async function mapLimit(items, limit, worker) {
  /** @type {PromiseSettledResult<R>[]} */
  const results = new Array(items.length)
  let next = 0
  async function lane() {
    while (next < items.length) {
      const index = next++
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return results
}

export { withRetry, CircuitBreaker, mapLimit, delay }
