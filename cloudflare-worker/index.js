// YT Series — Cloudflare Worker
// Allowlisted YouTube Data API proxy with edge + KV caching.

import { validateApiRequest, validateOrigin, validateWorkerClient, checkRateLimit, CLIENT_HEADER } from './security.js'

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3'
const UPSTREAM_TIMEOUT_MS = 10_000

const EDGE_TTL = { search: 3600, playlists: 3600, playlistItems: 120, videos: 604800, channels: 86400 }
const KV_TTL = { search: 86400, playlists: 21600, channels: 604800 }

function log(level, msg, data = {}) {
  console.log(JSON.stringify({ level, msg, ...data }))
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, ${CLIENT_HEADER}`,
    Vary: 'Origin'
  }
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': status === 200 ? 'private, max-age=0' : 'no-store',
      ...extraHeaders
    }
  })
}

/**
 * Forwards only what the client needs from a YouTube error (the reason code
 * used to detect quota exhaustion) — never upstream messages.
 */
function sanitizeUpstreamError(status, text) {
  let reason = null
  try { reason = JSON.parse(text)?.error?.errors?.[0]?.reason || null } catch { /* non-JSON upstream body */ }
  return { error: { code: status, errors: reason ? [{ reason }] : [] } }
}

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx
 * @param {{ fetch: typeof fetch, cache: Cache }} deps
 */
async function handleRequest(request, env, ctx, deps) {
  const url = new URL(request.url)

  const origin = validateOrigin(request, env)
  if (!origin.ok) return json(origin.status, { error: origin.error })
  const cors = corsHeaders(origin.origin)

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (url.pathname === '/' && request.method === 'GET') return json(200, { status: 'ok' }, cors)
  if (request.method !== 'GET') return json(405, { error: 'METHOD_NOT_ALLOWED' }, cors)

  if (!env.YT_API_KEY) {
    log('error', 'YT_API_KEY secret missing')
    return json(500, { error: 'SERVER_MISCONFIGURED' }, cors)
  }

  const client = validateWorkerClient(request, env)
  if (!client.ok) return json(client.status, { error: 'FORBIDDEN' }, cors)

  const api = validateApiRequest(url)
  if (!api.ok) return json(api.status, { error: api.error }, cors)

  const rate = await checkRateLimit(request, env)
  if (!rate.ok) return json(rate.status, { error: rate.error }, { ...cors, 'Retry-After': '3600' })

  const { endpoint, query } = api
  const ttl = EDGE_TTL[endpoint]
  const canonical = `${endpoint}?${query}`
  const cacheKey = new Request(`https://cache.yt-series.internal/${canonical}`, { method: 'GET' })
  const kv = env.CACHE_KV && KV_TTL[endpoint] ? env.CACHE_KV : null
  const kvKey = `${endpoint}:${query}`
  const ok = (body, cacheState) => new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': `public, max-age=${ttl}`, 'X-Cache': cacheState, ...cors }
  })

  const edgeHit = await deps.cache.match(cacheKey)
  if (edgeHit) return ok(edgeHit.body, 'HIT-EDGE')

  if (kv) {
    try {
      const cached = await kv.get(kvKey)
      if (cached) {
        ctx.waitUntil(deps.cache.put(cacheKey, ok(cached, 'HIT-KV')).catch(err => log('warn', 'edge cache put failed', { err: err.message })))
        return ok(cached, 'HIT-KV')
      }
    } catch (err) {
      log('warn', 'KV read failed', { err: err.message })
    }
  }

  const target = `${YOUTUBE_BASE}/${endpoint}?${query}&key=${encodeURIComponent(env.YT_API_KEY)}`
  let upstream
  try {
    upstream = await deps.fetch(target, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
  } catch (err) {
    log('error', 'upstream fetch failed', { endpoint, err: err.name })
    return json(502, { error: 'UPSTREAM_UNAVAILABLE' }, cors)
  }

  const body = await upstream.text()
  if (upstream.status !== 200) {
    log('warn', 'upstream error', { endpoint, status: upstream.status })
    return json(upstream.status >= 500 ? 502 : upstream.status, sanitizeUpstreamError(upstream.status, body), cors)
  }

  ctx.waitUntil(deps.cache.put(cacheKey, ok(body, 'MISS')).catch(err => log('warn', 'edge cache put failed', { err: err.message })))
  if (kv) {
    ctx.waitUntil(kv.put(kvKey, body, { expirationTtl: KV_TTL[endpoint] }).catch(err => log('warn', 'KV put failed', { err: err.message })))
  }
  return ok(body, 'MISS')
}

export { handleRequest }

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx, { fetch: (input, init) => fetch(input, init), cache: caches.default })
    } catch (err) {
      log('error', 'unhandled worker error', { err: err?.message })
      return json(500, { error: 'INTERNAL_ERROR' })
    }
  }
}
