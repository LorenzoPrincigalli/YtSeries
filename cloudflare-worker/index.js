// YT Series — Cloudflare Worker
// Acts as a transparent proxy for YouTube Data API v3 with 3-layer caching:
//   1. Edge cache (caches.default) — 0ms, per-datacenter
//   2. KV (CACHE_KV) — global, cross-datacenter
//   3. YouTube Data API v3 — origin

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3'

const EDGE_TTL = {
  search: 3600,
  playlists: 3600,
  playlistItems: 120,
  videos: 604800
}

const KV_TTL = {
  search: 86400,
  playlists: 21600
}

function getEndpointType(pathname) {
  if (pathname.includes('/search')) return 'search'
  if (pathname.includes('/playlistItems')) return 'playlistItems'
  if (pathname.includes('/playlists')) return 'playlists'
  if (pathname.includes('/videos')) return 'videos'
  return null
}

function useKv(endpointType) {
  return endpointType === 'search' || endpointType === 'playlists'
}

function hasRefreshParam(url) {
  return url.searchParams.has('refresh')
}

function normalizeForCache(url) {
  if (url.pathname.includes('/search')) {
    const q = url.searchParams.get('q')
    if (q) {
      url.searchParams.set('q', q.toLowerCase().trim().replace(/\s+/g, ' '))
    }
  }
  return url
}

function makeCacheKey(request) {
  const url = new URL(request.url)
  const clean = normalizeForCache(url)
  const cacheUrl = clean.origin + clean.pathname + clean.search
  return new Request(cacheUrl, { method: 'GET' })
}

function makeKvKey(endpointType, request) {
  const url = new URL(request.url)
  const clean = normalizeForCache(url)
  return `${endpointType}:${clean.pathname}${clean.search}`
}

function buildHeaders(status, body, ttl, cacheStatus) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${ttl}`,
    'X-Cache': cacheStatus,
    'X-Cache-TTL': String(ttl)
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname + url.search
    const API_KEY = env.YT_API_KEY

    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: YT_API_KEY not set' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    if (path === '/') {
      return new Response(JSON.stringify({ status: 'ok', service: 'YT Series API Proxy' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const endpointType = getEndpointType(url.pathname)
    const ttl = endpointType ? EDGE_TTL[endpointType] : 60
    const bypassCache = hasRefreshParam(url)
    const cache = caches.default
    const cacheKey = makeCacheKey(request)
    const hasKv = !!(env.CACHE_KV && useKv(endpointType))

    // Layer 1: Edge cache
    if (!bypassCache && endpointType) {
      const edgeHit = await cache.match(cacheKey)
      if (edgeHit) {
        const headers = new Headers(edgeHit.headers)
        headers.set('X-Cache', 'HIT-EDGE')
        headers.set('X-Cache-TTL', String(ttl))
        return new Response(edgeHit.body, { status: edgeHit.status, headers })
      }
    }

    // Layer 2: KV global cache
    if (hasKv && !bypassCache) {
      const kvKey = makeKvKey(endpointType, request)
      try {
        const cached = await env.CACHE_KV.get(kvKey)
        if (cached) {
          const kvHeaders = buildHeaders(200, cached, ttl, 'HIT-KV')
          const kvResponse = new Response(cached, { headers: kvHeaders })
          ctx.waitUntil(cache.put(cacheKey, kvResponse.clone()).catch(() => {}))
          return kvResponse
        }
      } catch (err) {
        console.error('KV read error:', err.message)
      }
    }

    // Layer 3: YouTube Data API v3
    const separator = path.includes('?') ? '&' : '?'
    const target = `${YOUTUBE_BASE}${path}${separator}key=${API_KEY}`

    try {
      const response = await fetch(target, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      })

      const body = await response.text()
      const isCacheable = endpointType && response.status === 200 && !bypassCache
      let cacheStatus = isCacheable ? 'MISS' : 'BYPASS'
      if (!env.CACHE_KV && isCacheable) cacheStatus = 'NO-KV'

      const headers = buildHeaders(response.status, body, ttl, cacheStatus)

      if (isCacheable) {
        const cacheResponse = new Response(body, { headers })
        ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()).catch(() => {}))

        if (hasKv) {
          const kvKey = makeKvKey(endpointType, request)
          const kvTtl = KV_TTL[endpointType] || ttl
          ctx.waitUntil(
            env.CACHE_KV.put(kvKey, body, { expirationTtl: kvTtl }).catch((err) =>
              console.error('KV write error:', err.message)
            )
          )
        }
      }

      return new Response(body, {
        status: response.status,
        headers
      })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Upstream fetch failed', message: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }
  }
}
