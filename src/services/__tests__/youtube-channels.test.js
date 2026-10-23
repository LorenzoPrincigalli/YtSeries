import { describe, it, expect, vi } from 'vitest'
import { YouTubeApiService, isChannelSeries } from '../youtube.js'

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const sleep = () => Promise.resolve()
const CHANNEL = 'UCHnyfMqiRRG1u-2MsSQLbXA'
const LONG_FORM = `UULF${CHANNEL.slice(2)}`
const ALL_UPLOADS = `UU${CHANNEL.slice(2)}`

/** Uploads newest first, like YouTube: video 129 is the latest. */
const page = (start, count, nextPageToken) => ({
  nextPageToken,
  items: Array.from({ length: count }, (_, i) => {
    const n = start - i
    return { snippet: { title: `Video ${n}`, position: start - n, publishedAt: new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString(), resourceId: { videoId: `vid${n}` } } }
  })
})

function channelFetch({ longFormMissing = false } = {}) {
  return vi.fn(async url => {
    const { pathname, searchParams } = new URL(url)
    if (pathname.endsWith('/channels')) {
      return json(200, searchParams.get('forHandle') === '@veritasium' ? { items: [{ id: CHANNEL }] } : { items: [] })
    }
    if (pathname.endsWith('/playlists')) {
      const id = searchParams.get('id')
      if (id === LONG_FORM && longFormMissing) return json(200, { items: [] })
      return json(200, { items: [{ id, snippet: { title: id === LONG_FORM ? 'Videos' : 'Uploads from Veritasium', channelTitle: 'Veritasium', channelId: CHANNEL }, contentDetails: { itemCount: 130 } }] })
    }
    if (pathname.endsWith('/playlistItems')) {
      const token = searchParams.get('pageToken')
      return json(200, !token ? page(129, 50, 'p2') : token === 'p2' ? page(79, 50, 'p3') : page(29, 30))
    }
    if (pathname.endsWith('/videos')) return json(200, { items: searchParams.get('id').split(',').map(id => ({ id, contentDetails: { duration: 'PT10M' } })) })
    return json(404, {})
  })
}

describe('channels as series', () => {
  it('recognises uploads playlists', () => {
    expect(isChannelSeries(LONG_FORM)).toBe(true)
    expect(isChannelSeries(ALL_UPLOADS)).toBe(true)
    expect(isChannelSeries('PL50KW6aT4UgzeTkqx8arOeJp4MtgpIEn2')).toBe(false)
  })

  it('follows the long-form uploads: latest 100, oldest first, named after the channel', async () => {
    const fetchImpl = channelFetch()
    const api = new YouTubeApiService({ fetchImpl, sleep })
    const series = await api.followChannel({ channelId: CHANNEL })
    expect(series.playlistId).toBe(LONG_FORM)
    expect(series.title).toBe('Veritasium')
    expect(series.videos).toHaveLength(100)
    expect(series.videos[0]).toMatchObject({ id: 'vid30', position: 0 })
    expect(series.videos[99]).toMatchObject({ id: 'vid129', position: 99, duration: 600 })
    // Two pages are enough for the window: the third is never requested.
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes('pageToken=p3'))).toHaveLength(0)
  })

  it('falls back to all uploads when the long-form playlist does not exist', async () => {
    const api = new YouTubeApiService({ fetchImpl: channelFetch({ longFormMissing: true }), sleep })
    expect((await api.followChannel({ channelId: CHANNEL })).playlistId).toBe(ALL_UPLOADS)
  })

  it('accepts channel links in "Add via link", resolving @handles', async () => {
    const api = new YouTubeApiService({ fetchImpl: channelFetch(), sleep })
    expect((await api.fetchPlaylist('https://www.youtube.com/@veritasium/videos')).playlistId).toBe(LONG_FORM)
    expect((await api.fetchPlaylist(`https://www.youtube.com/channel/${CHANNEL}`)).playlistId).toBe(LONG_FORM)
    await expect(api.fetchPlaylist('https://www.youtube.com/@nobody-here')).rejects.toMatchObject({ code: 'PLAYLIST_NOT_FOUND' })
  })

  it('rejects anything that is not a YouTube channel link', async () => {
    const api = new YouTubeApiService({ fetchImpl: channelFetch(), sleep })
    for (const url of ['https://evil.example/@veritasium', 'https://www.youtube.com/channel/not-a-channel', 'https://www.youtube.com/%E0%A4%A', 'https://www.youtube.com/feed']) {
      await expect(api.fetchPlaylist(url)).rejects.toMatchObject({ code: 'INVALID_URL' })
    }
    await expect(api.followChannel({ channelId: '../../etc' })).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' })
  })

  it('refreshes a followed channel with the same window (auto-refresh, sync hydration)', async () => {
    const api = new YouTubeApiService({ fetchImpl: channelFetch(), sleep })
    const series = await api.refreshPlaylist(LONG_FORM)
    expect(series.videos).toHaveLength(100)
    expect(series.title).toBe('Veritasium')
  })
})
