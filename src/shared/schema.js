// @ts-check
import { AppError } from './errors.js'

/**
 * Minimal declarative validator for message payloads (and the Worker's query
 * strings). A schema is a function `(value, path) => parsed`; it returns the
 * sanitized value or throws AppError('INVALID_PAYLOAD'). Objects are rebuilt
 * from the declared shape only, so unknown keys and prototype keys never pass.
 */

/** @typedef {(value: unknown, path: string) => any} Schema */

const YT_ID = /^[A-Za-z0-9_-]{1,200}$/
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** @param {string} path @param {string} reason */
function fail(path, reason) {
  throw new AppError('INVALID_PAYLOAD', `${path || 'payload'} ${reason}`)
}

/** @param {{ min?: number, max?: number, pattern?: RegExp, trim?: boolean }} [opts] @returns {Schema} */
function string({ min = 0, max = 10_000, pattern, trim = true } = {}) {
  return (value, path) => {
    if (typeof value !== 'string') fail(path, 'must be a string')
    const text = trim ? /** @type {string} */ (value).trim() : /** @type {string} */ (value)
    if (text.length < min) fail(path, min === 1 ? 'is required' : `must be at least ${min} characters`)
    if (text.length > max) fail(path, `must be at most ${max} characters`)
    if (pattern && !pattern.test(text)) fail(path, 'has an invalid format')
    return text
  }
}

/** A YouTube playlist/video/channel id. @returns {Schema} */
function id() {
  const base = string({ min: 1, max: 200, pattern: YT_ID })
  return (value, path) => {
    const parsed = base(value, path)
    if (FORBIDDEN_KEYS.has(parsed.toLowerCase())) fail(path, 'is reserved')
    return parsed
  }
}

/** @param {{ min?: number, max?: number, integer?: boolean }} [opts] @returns {Schema} */
function number({ min = -Infinity, max = Infinity, integer = false } = {}) {
  return (value, path) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number')
    if (integer && !Number.isSafeInteger(value)) fail(path, 'must be an integer')
    if (/** @type {number} */ (value) < min || /** @type {number} */ (value) > max) fail(path, `must be between ${min} and ${max}`)
    return value
  }
}

/** @returns {Schema} */
function boolean() {
  return (value, path) => {
    if (typeof value !== 'boolean') fail(path, 'must be a boolean')
    return value
  }
}

/** @param {readonly unknown[]} allowed @returns {Schema} */
function oneOf(allowed) {
  return (value, path) => {
    if (!allowed.includes(value)) fail(path, `must be one of ${allowed.join(', ')}`)
    return value
  }
}

/** @param {Schema} item @param {{ min?: number, max?: number }} [opts] @returns {Schema} */
function array(item, { min = 0, max = 1000 } = {}) {
  return (value, path) => {
    if (!Array.isArray(value)) fail(path, 'must be an array')
    const list = /** @type {unknown[]} */ (value)
    if (list.length < min || list.length > max) fail(path, `must contain ${min}-${max} items`)
    return list.map((entry, index) => item(entry, `${path}[${index}]`))
  }
}

/** @param {Schema} schema @returns {Schema} */
function optional(schema) {
  return (value, path) => (value === undefined || value === null ? undefined : schema(value, path))
}

/**
 * @param {Record<string, Schema>} shape
 * @returns {Schema}
 */
function object(shape) {
  return (value, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object')
    const source = /** @type {Record<string, unknown>} */ (value)
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const [key, schema] of Object.entries(shape)) {
      const parsed = schema(Object.hasOwn(source, key) ? source[key] : undefined, path ? `${path}.${key}` : key)
      if (parsed !== undefined) out[key] = parsed
    }
    return out
  }
}

/** Accepts any value unchanged; for payloads validated by a dedicated normalizer. @returns {Schema} */
function any() {
  return value => value
}

/**
 * @param {Schema} schema
 * @param {unknown} value
 */
function parse(schema, value) {
  return schema(value, '')
}

const s = { string, id, number, boolean, oneOf, array, optional, object, any }

export { s, parse, YT_ID }
