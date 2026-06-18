// YT Series — Cloudflare Worker
// YouTube API proxy with 3-layer caching

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3'

const EDGE_TTL = {
  search: 3600, playlists: 3600, playlistItems: 120, videos: 604800
}
const KV_TTL = {
  search: 86400, playlists: 21600
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

function normalizeForCache(url) {
  if (url.pathname.includes('/search')) {
    const q = url.searchParams.get('q')
    if (q) url.searchParams.set('q', q.toLowerCase().trim().replace(/\s+/g, ' '))
  }
  return url
}

function makeCacheKey(request) {
  const url = new URL(request.url)
  const clean = normalizeForCache(url)
  return new Request(clean.origin + clean.pathname + clean.search, { method: 'GET' })
}

function makeKvKey(endpointType, request) {
  const url = new URL(request.url)
  const clean = normalizeForCache(url)
  return endpointType + ':' + clean.pathname + clean.search
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname + url.search
    const API_KEY = env.YT_API_KEY

    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      })
    }

    // Health check
    if (path === '/') {
      return new Response(JSON.stringify({ status: 'ok', service: 'YT Series API Proxy' }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // YouTube API proxy
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const endpointType = getEndpointType(url.pathname)
    const ttl = endpointType ? EDGE_TTL[endpointType] : 60
    const bypassCache = url.searchParams.has('refresh')
    const hasKv = !!(env.CACHE_KV && useKv(endpointType))
    const cache = caches.default
    const cacheKey = makeCacheKey(request)

    // Edge cache
    if (!bypassCache && endpointType) {
      const edgeHit = await cache.match(cacheKey)
      if (edgeHit) {
        const headers = new Headers(edgeHit.headers)
        headers.set('X-Cache', 'HIT-EDGE')
        return new Response(edgeHit.body, { status: edgeHit.status, headers })
      }
    }

    // KV cache
    if (hasKv && !bypassCache) {
      try {
        const cached = await env.CACHE_KV.get(makeKvKey(endpointType, request))
        if (cached) {
          const resp = new Response(cached, {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=' + ttl,
              'X-Cache': 'HIT-KV'
            }
          })
          ctx.waitUntil(cache.put(cacheKey, resp.clone()).catch(() => {}))
          return resp
        }
      } catch (err) { console.error('KV read error:', err.message) }
    }

    // YouTube API
    const separator = path.includes('?') ? '&' : '?'
    const target = YOUTUBE_BASE + path + separator + 'key=' + API_KEY

    try {
      const response = await fetch(target, { method: 'GET', headers: { 'Accept': 'application/json' } })
      const body = await response.text()
      const isCacheable = endpointType && response.status === 200 && !bypassCache

      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=' + ttl,
        'X-Cache': isCacheable ? 'MISS' : 'BYPASS'
      }

      if (isCacheable) {
        const cacheResponse = new Response(body, { headers })
        ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()).catch(() => {}))
        if (hasKv) {
          ctx.waitUntil(
            env.CACHE_KV.put(makeKvKey(endpointType, request), body, { expirationTtl: KV_TTL[endpointType] || ttl }).catch(() => {})
          )
        }
      }

      return new Response(body, { status: response.status, headers })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Upstream fetch failed', message: err.message }), {
        status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }
  }
}
