// Request validation for the YouTube proxy. Everything not explicitly allowed
// is rejected: the Worker must never become a general-purpose YouTube API
// proxy paid for by our key.

/**
 * Shared client token. It ships inside the extension bundle, so it is NOT a
 * secret — it only filters casual scanners. Real protection is the endpoint/
 * parameter allowlist, the Origin check and per-IP rate limiting.
 * Must match WORKER_CLIENT_TOKEN in src/shared/constants.js.
 */
const DEFAULT_CLIENT_TOKEN = 'yt-series-extension-v1'

const CLIENT_HEADER = 'X-YT-Series-Client'
const RATE_LIMIT_PER_DAY = 3000

const ID = /^[A-Za-z0-9_-]{1,64}$/
const PAGE_TOKEN = /^[A-Za-z0-9_-]{1,256}$/

const part = allowed => value => value.split(',').every(p => allowed.includes(p))
const intRange = (min, max) => value => /^\d{1,3}$/.test(value) && Number(value) >= min && Number(value) <= max
const matches = regex => value => regex.test(value)
const idList = max => value => {
  const ids = value.split(',')
  return ids.length >= 1 && ids.length <= max && ids.every(id => ID.test(id))
}

/**
 * Per endpoint: allowed query parameters with validators, and parameters that
 * must be present. `oneOf` lists mutually exclusive selectors (exactly one).
 */
const ROUTES = {
  search: {
    params: {
      part: part(['snippet']),
      type: part(['playlist', 'channel']),
      q: value => value.length >= 1 && value.length <= 200,
      maxResults: intRange(1, 50),
      pageToken: matches(PAGE_TOKEN)
    },
    required: ['part', 'q']
  },
  playlists: {
    params: {
      part: part(['snippet', 'contentDetails']),
      id: idList(50),
      channelId: matches(ID),
      maxResults: intRange(1, 50),
      pageToken: matches(PAGE_TOKEN)
    },
    required: ['part'],
    oneOf: ['id', 'channelId']
  },
  playlistItems: {
    params: {
      part: part(['snippet', 'contentDetails']),
      playlistId: matches(ID),
      maxResults: intRange(1, 50),
      pageToken: matches(PAGE_TOKEN)
    },
    required: ['part', 'playlistId']
  },
  videos: {
    params: {
      part: part(['contentDetails', 'snippet']),
      id: idList(50)
    },
    required: ['part', 'id']
  }
}

/**
 * Validates path and query against the allowlist and returns a canonical,
 * sorted query (stable cache keys, no duplicate parameters).
 * @param {URL} url
 * @returns {{ ok: true, endpoint: string, query: URLSearchParams } | { ok: false, status: number, error: string }}
 */
function validateApiRequest(url) {
  const endpoint = url.pathname.replace(/^\/+|\/+$/g, '')
  const route = Object.hasOwn(ROUTES, endpoint) ? ROUTES[endpoint] : null
  if (!route) return { ok: false, status: 404, error: 'UNKNOWN_ENDPOINT' }

  const query = new URLSearchParams()
  const seen = new Set()
  for (const [name, value] of url.searchParams) {
    if (seen.has(name)) return { ok: false, status: 400, error: 'DUPLICATE_PARAM' }
    seen.add(name)
    const validator = Object.hasOwn(route.params, name) ? route.params[name] : null
    if (!validator) return { ok: false, status: 400, error: 'PARAM_NOT_ALLOWED' }
    const normalized = name === 'q' ? value.toLowerCase().trim().replace(/\s+/g, ' ') : value
    if (!validator(normalized)) return { ok: false, status: 400, error: 'INVALID_PARAM' }
    query.set(name, normalized)
  }
  if (!route.required.every(name => query.has(name))) return { ok: false, status: 400, error: 'MISSING_PARAM' }
  if (route.oneOf && route.oneOf.filter(name => query.has(name)).length !== 1) {
    return { ok: false, status: 400, error: 'INVALID_SELECTOR' }
  }
  query.sort()
  return { ok: true, endpoint, query }
}

/** Only Cloudflare's own header is trusted; X-Forwarded-For is client-controlled. */
function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown'
}

function allowedOrigins(env) {
  return String(env?.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean)
}

/**
 * Browser pages cannot forge Origin, so this blocks other websites from
 * spending our quota. When ALLOWED_ORIGINS is unset (local dev) it is skipped.
 */
function validateOrigin(request, env) {
  const allowed = allowedOrigins(env)
  if (!allowed.length) return { ok: true, origin: '*' }
  const origin = request.headers.get('Origin')
  if (origin && allowed.includes(origin)) return { ok: true, origin }
  return { ok: false, status: 403, error: 'ORIGIN_NOT_ALLOWED' }
}

function validateWorkerClient(request, env) {
  const expected = env?.YT_SERIES_CLIENT_TOKEN || DEFAULT_CLIENT_TOKEN
  const token = request.headers.get(CLIENT_HEADER)
  if (!token || token !== expected) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  return { ok: true }
}

/**
 * Prefers the atomic Workers Rate Limiting binding (RATE_LIMITER). Falls back
 * to a best-effort daily KV counter, which is eventually consistent and may
 * let a burst slightly exceed the limit.
 */
/**
 * Rate-limit key for a client: a salted SHA-256 of the IP, so no IP address is
 * ever written to KV or sent to the limiter in clear (privacy policy promise).
 * The salt comes from the RATE_LIMIT_SALT secret.
 */
async function clientKey(request, env) {
  const data = new TextEncoder().encode(`${env?.RATE_LIMIT_SALT || ''}:${getClientIp(request)}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return [...digest.slice(0, 16)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function checkRateLimit(request, env) {
  const key = await clientKey(request, env)
  if (env?.RATE_LIMITER?.limit) {
    const { success } = await env.RATE_LIMITER.limit({ key })
    return success ? { ok: true } : { ok: false, status: 429, error: 'RATE_LIMITED' }
  }
  if (!env?.CACHE_KV) return { ok: true }
  const kvKey = `rl:${key}:${new Date().toISOString().slice(0, 10)}`
  const count = parseInt(await env.CACHE_KV.get(kvKey) || '0', 10)
  if (count >= RATE_LIMIT_PER_DAY) return { ok: false, status: 429, error: 'RATE_LIMITED' }
  await env.CACHE_KV.put(kvKey, String(count + 1), { expirationTtl: 86400 })
  return { ok: true }
}

export {
  CLIENT_HEADER,
  DEFAULT_CLIENT_TOKEN,
  RATE_LIMIT_PER_DAY,
  ROUTES,
  getClientIp,
  validateApiRequest,
  validateOrigin,
  validateWorkerClient,
  checkRateLimit,
  clientKey
}
