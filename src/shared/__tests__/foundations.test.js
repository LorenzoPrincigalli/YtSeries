import { describe, it, expect, vi } from 'vitest'
import { AppError, toAppError, toErrorResponse } from '../errors.js'
import { withRetry, CircuitBreaker, mapLimit } from '../resilience.js'
import { s, parse } from '../schema.js'
import { logger } from '../logger.js'

describe('errors', () => {
  it('keeps codes from AppError and legacy plain objects', () => {
    expect(toAppError(new AppError('X')).code).toBe('X')
    expect(toAppError({ code: 'LEGACY', message: 'm' })).toMatchObject({ code: 'LEGACY', message: 'm' })
  })

  it('classifies timeouts and fetch failures as retryable', () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' })
    expect(toAppError(timeout)).toMatchObject({ code: 'NETWORK_TIMEOUT', retryable: true })
    expect(toAppError(new TypeError('Failed to fetch'))).toMatchObject({ code: 'NETWORK_ERROR', retryable: true })
  })

  it('builds a response envelope without leaking causes', () => {
    const response = toErrorResponse(new AppError('BAD', 'msg', { cause: new Error('secret') }))
    expect(response).toEqual({ success: false, error: 'BAD', message: 'msg' })
  })
})

describe('withRetry', () => {
  const sleep = () => Promise.resolve()

  it('retries retryable errors then succeeds', async () => {
    const op = vi.fn()
      .mockRejectedValueOnce(new AppError('NET', 'x', { retryable: true }))
      .mockResolvedValueOnce('ok')
    await expect(withRetry(op, { retries: 2, sleep })).resolves.toBe('ok')
    expect(op).toHaveBeenCalledTimes(2)
  })

  it('does not retry permanent errors', async () => {
    const op = vi.fn().mockRejectedValue(new AppError('NOT_FOUND'))
    await expect(withRetry(op, { retries: 3, sleep })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('gives up after the retry budget', async () => {
    const op = vi.fn().mockRejectedValue(new AppError('NET', 'x', { retryable: true }))
    await expect(withRetry(op, { retries: 2, sleep })).rejects.toMatchObject({ code: 'NET' })
    expect(op).toHaveBeenCalledTimes(3)
  })
})

describe('CircuitBreaker', () => {
  it('opens after threshold retryable failures and half-opens after cooldown', async () => {
    let now = 0
    const breaker = new CircuitBreaker('yt', { threshold: 2, cooldownMs: 1000, now: () => now })
    const failing = () => Promise.reject(new AppError('NET', 'x', { retryable: true }))
    await expect(breaker.exec(failing)).rejects.toMatchObject({ code: 'NET' })
    await expect(breaker.exec(failing)).rejects.toMatchObject({ code: 'NET' })
    expect(breaker.state).toBe('open')
    await expect(breaker.exec(() => Promise.resolve(1))).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' })
    now = 1000
    expect(breaker.state).toBe('half-open')
    await expect(breaker.exec(() => Promise.resolve(1))).resolves.toBe(1)
    expect(breaker.state).toBe('closed')
  })

  it('ignores non-retryable failures', async () => {
    const breaker = new CircuitBreaker('yt', { threshold: 1 })
    await expect(breaker.exec(() => Promise.reject(new AppError('NOT_FOUND')))).rejects.toBeTruthy()
    expect(breaker.state).toBe('closed')
  })
})

describe('mapLimit', () => {
  it('never rejects and caps concurrency', async () => {
    let active = 0
    let peak = 0
    const results = await mapLimit([1, 2, 3, 4], 2, async n => {
      active++; peak = Math.max(peak, active)
      await Promise.resolve()
      active--
      if (n === 3) throw new Error('boom')
      return n * 2
    })
    expect(peak).toBeLessThanOrEqual(2)
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled'])
  })
})

describe('schema', () => {
  const payload = s.object({ playlistId: s.id(), progress: s.optional(s.number({ min: 0, max: 100 })) })

  it('trims and strips unknown keys', () => {
    expect(parse(payload, { playlistId: ' PL1 ', extra: 1 })).toEqual({ playlistId: 'PL1' })
  })

  it('rejects bad ids, prototype keys and out-of-range numbers', () => {
    expect(() => parse(payload, { playlistId: 'a b' })).toThrow(AppError)
    expect(() => parse(payload, { playlistId: '__proto__' })).toThrow(/reserved/)
    expect(() => parse(payload, { playlistId: 'PL', progress: 101 })).toThrow(/progress/)
    expect(() => parse(payload, null)).toThrow(/object/)
  })

  it('validates arrays and enums', () => {
    expect(parse(s.array(s.oneOf(['a', 'b']), { max: 2 }), ['a'])).toEqual(['a'])
    expect(() => parse(s.array(s.id(), { max: 1 }), ['a', 'b'])).toThrow(/1 items/)
  })
})

describe('logger', () => {
  it('keeps structured recent entries', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.child('test').warn('hello', new AppError('X', 'boom'))
    const last = logger.recent().at(-1)
    expect(last).toMatchObject({ level: 'WARN', scope: 'app:test', msg: 'hello' })
    expect(last.data[0]).toEqual({ name: 'AppError', message: 'boom', code: 'X' })
  })
})
