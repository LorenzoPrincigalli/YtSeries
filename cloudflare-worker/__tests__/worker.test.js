import { describe, it, expect, vi } from 'vitest'
import { handleRequest } from '../index.js'
import { validateApiRequest, DEFAULT_CLIENT_TOKEN, clientKey } from '../security.js'

const ORIGIN = 'chrome-extension://abcdefghijklmnop'

function memoryCache() {
  const store = new Map()
  return {
    store,
    match: vi.fn(async req => { const hit = store.get(req.url); return hit ? hit.clone() : undefined }),
    put: vi.fn(async (req, res) => { store.set(req.url, res.clone()) })
  }
}

function setup({ env = {}, upstream } = {}) {
  const cache = memoryCache()
  const fetchMock = vi.fn(upstream || (async () => new Response('{"items":[]}', { status: 200 })))
  const waits = []
  const ctx = { waitUntil: p => waits.push(p) }
  const fullEnv = { YT_API_KEY: 'SECRET_KEY', ALLOWED_ORIGINS: ORIGIN, ...env }
  const call = async (path, { headers = {}, method = 'GET' } = {}) => {
    const request = new Request(`https://worker.test${path}`, {
      method,
      headers: { Origin: ORIGIN, 'X-YT-Series-Client': DEFAULT_CLIENT_TOKEN, 'CF-Connecting-IP': '1.2.3.4', ...headers }
    })
    const response = await handleRequest(request, fullEnv, ctx, { fetch: fetchMock, cache })
    await Promise.all(waits)
    return response
  }
  return { call, fetchMock, cache }
}

describe('validateApiRequest', () => {
  const check = path => validateApiRequest(new URL(`https://w${path}`))

  it('accepts the exact requests the extension makes', () => {
    expect(check('/search?part=snippet&type=playlist,channel&maxResults=15&q=Lo-Fi  Beats').ok).toBe(true)
    expect(check('/playlists?part=snippet,contentDetails&id=PL123').ok).toBe(true)
    expect(check('/playlists?part=snippet,contentDetails&channelId=UC1&maxResults=10').ok).toBe(true)
    expect(check('/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=PL1&pageToken=EAAaBlBUOkNESQ').ok).toBe(true)
    expect(check('/videos?part=contentDetails&id=a,b,c').ok).toBe(true)
    expect(check('/channels?part=snippet,contentDetails&forHandle=@veritasium').ok).toBe(true)
    expect(check('/channels?part=snippet,contentDetails&id=UCHnyfMqiRRG1u-2MsSQLbXA').ok).toBe(true)
  })

  it('accepts exactly one channel selector with a safe handle', () => {
    expect(check('/channels?part=snippet').error).toBe('INVALID_SELECTOR')
    expect(check('/channels?part=snippet&id=UC1&forHandle=@abc').error).toBe('INVALID_SELECTOR')
    expect(check('/channels?part=snippet&forHandle=@a').error).toBe('INVALID_PARAM')
    expect(check('/channels?part=snippet&forHandle=@a%2Fb%3Fc').error).toBe('INVALID_PARAM')
    expect(check('/channels?part=statistics&id=UC1').error).toBe('INVALID_PARAM')
  })

  it('normalizes and sorts the query for stable cache keys', () => {
    const result = check('/search?q=Lo-Fi  Beats&part=snippet')
    expect(String(result.query)).toBe('part=snippet&q=lo-fi+beats')
  })

  it('rejects endpoints, params and values outside the allowlist', () => {
    expect(check('/comments?part=snippet&id=UC1')).toMatchObject({ ok: false, error: 'UNKNOWN_ENDPOINT' })
    expect(check('/search?part=snippet&q=x&key=attacker')).toMatchObject({ ok: false, error: 'PARAM_NOT_ALLOWED' })
    expect(check('/search?part=snippet&q=x&refresh=1')).toMatchObject({ ok: false, error: 'PARAM_NOT_ALLOWED' })
    expect(check('/search?part=snippet,statistics&q=x')).toMatchObject({ ok: false, error: 'INVALID_PARAM' })
    expect(check('/videos?part=contentDetails&id=../../etc')).toMatchObject({ ok: false, error: 'INVALID_PARAM' })
    expect(check('/search?part=snippet&q=x&maxResults=500')).toMatchObject({ ok: false, error: 'INVALID_PARAM' })
    expect(check('/search?part=snippet&part=snippet&q=x')).toMatchObject({ ok: false, error: 'DUPLICATE_PARAM' })
    expect(check('/playlists?part=snippet&id=PL1&channelId=UC1')).toMatchObject({ ok: false, error: 'INVALID_SELECTOR' })
    expect(check('/playlistItems?part=snippet')).toMatchObject({ ok: false, error: 'MISSING_PARAM' })
    expect(check('/__proto__?x=1')).toMatchObject({ ok: false, error: 'UNKNOWN_ENDPOINT' })
  })
})

describe('worker', () => {
  it('blocks foreign origins and missing client token', async () => {
    const { call, fetchMock } = setup()
    expect((await call('/videos?part=contentDetails&id=a', { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    expect((await call('/videos?part=contentDetails&id=a', { headers: { 'X-YT-Series-Client': 'nope' } })).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows the extension service worker, which sends no Origin header', async () => {
    const { call, fetchMock } = setup()
    const response = await call('/videos?part=contentDetails&id=a', { headers: { Origin: '' } })
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('without ALLOWED_ORIGINS, rejects web pages but accepts extension pages', async () => {
    const { call } = setup({ env: { ALLOWED_ORIGINS: '' } })
    expect((await call('/videos?part=contentDetails&id=a', { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    expect((await call('/videos?part=contentDetails&id=a', { headers: { Origin: 'chrome-extension://anyid' } })).status).toBe(200)
  })

  it('echoes the allowed origin instead of a wildcard', async () => {
    const { call } = setup()
    const response = await call('/videos?part=contentDetails&id=a')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
  })

  it('proxies allowed requests with the server key and serves repeats from cache', async () => {
    const { call, fetchMock } = setup()
    const first = await call('/playlists?part=snippet&id=PL1')
    expect(first.status).toBe(200)
    expect(first.headers.get('X-Cache')).toBe('MISS')
    expect(fetchMock.mock.calls[0][0]).toContain('key=SECRET_KEY')
    const second = await call('/playlists?id=PL1&part=snippet')
    expect(second.headers.get('X-Cache')).toBe('HIT-EDGE')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never leaks upstream messages or the key, but keeps the quota reason', async () => {
    const upstream = async () => new Response(JSON.stringify({ error: { message: 'key=SECRET_KEY exceeded', errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 })
    const { call } = setup({ upstream })
    const response = await call('/search?part=snippet&q=x')
    const text = await response.text()
    expect(response.status).toBe(403)
    expect(text).not.toContain('SECRET_KEY')
    expect(JSON.parse(text)).toEqual({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } })
  })

  it('maps upstream network failures to 502 without details', async () => {
    const { call } = setup({ upstream: async () => { throw new Error('connect ECONNREFUSED 10.0.0.1') } })
    const response = await call('/videos?part=contentDetails&id=a')
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'UPSTREAM_UNAVAILABLE' })
  })

  it('uses the atomic rate limiter binding when present', async () => {
    const limit = vi.fn(async () => ({ success: false }))
    const { call, fetchMock } = setup({ env: { RATE_LIMITER: { limit } } })
    const response = await call('/videos?part=contentDetails&id=a')
    expect(response.status).toBe(429)
    const [{ key }] = limit.mock.calls[0]
    expect(key).toMatch(/^[0-9a-f]{32}$/) // salted hash, never the raw IP
    expect(key).not.toContain('1.2.3.4')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores spoofable X-Forwarded-For for rate limiting', async () => {
    const limit = vi.fn(async () => ({ success: true }))
    const { call } = setup({ env: { RATE_LIMITER: { limit } } })
    await call('/videos?part=contentDetails&id=a', { headers: { 'CF-Connecting-IP': '', 'X-Forwarded-For': '9.9.9.9' } })
    const spoofed = await clientKey(new Request('https://x', { headers: { 'X-Forwarded-For': '9.9.9.9' } }), {})
    const unknown = await clientKey(new Request('https://x'), {})
    expect(spoofed).toBe(unknown)
    expect(limit.mock.calls[0][0].key).toBe(unknown)
  })

  it('rejects non-GET methods', async () => {
    const { call } = setup()
    expect((await call('/videos?part=contentDetails&id=a', { method: 'POST' })).status).toBe(405)
  })

  it('salts the client key so hashes cannot be reversed with a table of IPs', async () => {
    const request = () => new Request('https://x', { headers: { 'CF-Connecting-IP': '1.2.3.4' } })
    expect(await clientKey(request(), { RATE_LIMIT_SALT: 'a' })).not.toBe(await clientKey(request(), { RATE_LIMIT_SALT: 'b' }))
  })
})
