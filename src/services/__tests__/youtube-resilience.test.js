import { describe, it, expect, vi } from 'vitest'
import { YouTubeApiService } from '../youtube.js'

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const sleep = () => Promise.resolve()

const playlistResponse = { items: [{ id: 'PL1', snippet: { title: 'T', thumbnails: { high: { url: 'https://i/1.jpg' } } }, contentDetails: { itemCount: 2 } }] }
const itemsResponse = {
  items: [
    { snippet: { title: 'A', position: 0, resourceId: { videoId: 'v1' } } },
    { snippet: { title: 'dup', position: 1, resourceId: { videoId: 'v1' } } },
    { snippet: { title: 'Private video', position: 2, resourceId: {} } },
    { snippet: { title: 'B', position: 3, resourceId: { videoId: 'v2' } } }
  ]
}
const durationsResponse = { items: [{ id: 'v1', contentDetails: { duration: 'PT1M' } }, { id: 'v2', contentDetails: { duration: 'P1DT1S' } }] }

function routedFetch(overrides = {}) {
  return vi.fn(async url => {
    const path = new URL(url).pathname
    for (const [suffix, handler] of Object.entries(overrides)) if (path.endsWith(suffix)) return handler()
    if (path.endsWith('/playlistItems')) return json(200, itemsResponse)
    if (path.endsWith('/playlists')) return json(200, playlistResponse)
    if (path.endsWith('/videos')) return json(200, durationsResponse)
    return json(404, {})
  })
}

describe('YouTubeApiService resilience', () => {
  it('dedupes and skips unavailable videos, parses day durations', async () => {
    const api = new YouTubeApiService({ fetchImpl: routedFetch(), sleep })
    const result = await api.refreshPlaylist('PL1')
    expect(result.videos.map(v => [v.id, v.duration])).toEqual([['v1', 60], ['v2', 86401]])
    expect(result.thumbnail).toBe('https://i/1.jpg')
  })

  it('retries transient 5xx failures', async () => {
    let calls = 0
    const fetchImpl = routedFetch({ '/playlists': () => (++calls === 1 ? json(503, {}) : json(200, playlistResponse)) })
    const api = new YouTubeApiService({ fetchImpl, sleep })
    await expect(api.refreshPlaylist('PL1')).resolves.toMatchObject({ playlistId: 'PL1' })
    expect(calls).toBe(2)
  })

  it('reports quota exhaustion without retrying', async () => {
    const fetchImpl = routedFetch({ '/search': () => json(403, { error: { errors: [{ reason: 'quotaExceeded' }] } }) })
    const api = new YouTubeApiService({ fetchImpl, sleep })
    await expect(api.search('cats')).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('propagates search failures instead of returning empty results', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    const api = new YouTubeApiService({ fetchImpl, sleep })
    await expect(api.search('cats')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('opens the circuit after repeated infrastructure failures', async () => {
    const fetchImpl = vi.fn(async () => json(500, {}))
    const api = new YouTubeApiService({ fetchImpl, sleep })
    for (let i = 0; i < 5; i++) await expect(api.search('x')).rejects.toMatchObject({ code: 'API_UNAVAILABLE' })
    const callsBefore = fetchImpl.mock.calls.length
    await expect(api.search('x')).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' })
    expect(fetchImpl.mock.calls.length).toBe(callsBefore)
  })

  it('rejects unsafe ids before any network call', async () => {
    const fetchImpl = vi.fn()
    const api = new YouTubeApiService({ fetchImpl, sleep })
    await expect(api.refreshPlaylist('../../search?q=x')).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' })
    await expect(api.fetchChannelPlaylists('__proto__')).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
