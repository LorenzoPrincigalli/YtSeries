import { describe, it, expect, beforeAll, vi } from 'vitest'

// FirebaseSyncService imports getFirebaseConfig which reads from chrome.runtime.getURL
// We only test the pure exported functions, not the class
import {
  seriesToFirestorePayload,
  mergeRemoteIntoSeries,
  seriesLocalUpdatedAt,
  applyMetadataFromRemote
} from '../FirebaseSyncService.js'

beforeAll(() => {
  vi.stubGlobal('chrome', { runtime: { getURL: () => '' } })
})

describe('seriesLocalUpdatedAt', () => {
  it('returns syncUpdatedAt when present', () => {
    expect(seriesLocalUpdatedAt({ syncUpdatedAt: 500 })).toBe(500)
  })

  it('falls back to lastRefreshedAt', () => {
    expect(seriesLocalUpdatedAt({ lastRefreshedAt: 300, addedAt: 100 })).toBe(300)
  })

  it('falls back to addedAt', () => {
    expect(seriesLocalUpdatedAt({ addedAt: 100 })).toBe(100)
  })

  it('returns 0 when no timestamps exist', () => {
    expect(seriesLocalUpdatedAt({})).toBe(0)
  })
})

describe('applyMetadataFromRemote', () => {
  it('overwrites fields from metadata', () => {
    const series = { title: 'Old', thumbnail: '' }
    applyMetadataFromRemote(series, { title: 'New', thumbnail: 'thumb.jpg' })
    expect(series.title).toBe('New')
    expect(series.thumbnail).toBe('thumb.jpg')
  })

  it('does not overwrite with undefined values', () => {
    const series = { title: 'Keep', thumbnail: 'old.jpg' }
    applyMetadataFromRemote(series, { title: undefined })
    expect(series.title).toBe('Keep')
  })

  it('handles null metadata gracefully', () => {
    const series = { title: 'Stay' }
    applyMetadataFromRemote(series, null)
    expect(series.title).toBe('Stay')
  })

  it('sets videoCount when present', () => {
    const series = { videoCount: 0 }
    applyMetadataFromRemote(series, { videoCount: 5 })
    expect(series.videoCount).toBe(5)
  })
})

describe('seriesToFirestorePayload', () => {
  it('includes metadata from series', () => {
    const series = {
      title: 'Test Series',
      thumbnail: 'thumb.jpg',
      channelTitle: 'Test Channel',
      channelId: 'UC123',
      videoCount: 5,
      videos: [],
      lastEpisodeIndex: 0,
      completed: false
    }
    const payload = seriesToFirestorePayload(series)
    expect(payload.metadata.title).toBe('Test Series')
    expect(payload.metadata.channelTitle).toBe('Test Channel')
  })

  it('includes progress for watched videos only', () => {
    const now = Date.now()
    const series = {
      title: 'Test',
      videos: [
        { id: 'v1', watched: true, progress: 100, watchedAt: now },
        { id: 'v2', watched: false, progress: 0 },
        { id: 'v3', watched: false, progress: 50, watchedAt: null }
      ],
      lastEpisodeIndex: 1,
      completed: false
    }
    const payload = seriesToFirestorePayload(series)
    expect(payload.progress.v1).toEqual({ w: true, p: 100, a: now })
    // v2 has no watched/progress/watchedAt
    expect(payload.progress.v2).toBeUndefined()
    // v3 has progress > 0
    expect(payload.progress.v3).toEqual({ w: false, p: 50, a: 0 })
  })

  it('includes updatedAt as Date.now()', () => {
    const before = Date.now()
    const payload = seriesToFirestorePayload({
      title: 'T', videos: [], lastEpisodeIndex: 0, completed: false
    })
    const after = Date.now()
    expect(payload.updatedAt).toBeGreaterThanOrEqual(before)
    expect(payload.updatedAt).toBeLessThanOrEqual(after)
  })
})

describe('mergeRemoteIntoSeries', () => {
  function makeSeries(videos = [], overrides = {}) {
    return {
      playlistId: 'PL123',
      title: 'Test',
      videos: videos.map(v => ({ id: v.id, watched: false, progress: 0, watchedAt: 0, ...v })),
      lastEpisodeIndex: 0,
      completed: false,
      syncUpdatedAt: 0,
      ...overrides
    }
  }

  it('marks videos as watched when remote has newer watchedAt', () => {
    const series = makeSeries([{ id: 'v1', watched: false, watchedAt: 0 }])
    const remote = {
      updatedAt: 200,
      completed: true,
      lastEpisodeIndex: 0,
      progress: { v1: { w: true, p: 100, a: 100 } }
    }
    mergeRemoteIntoSeries(series, remote)
    expect(series.videos[0].watched).toBe(true)
    expect(series.videos[0].watchedAt).toBe(100)
  })

  it('does not overwrite local watched if local is newer', () => {
    const series = makeSeries([{ id: 'v1', watched: true, watchedAt: 500 }])
    const remote = {
      updatedAt: 100,
      progress: { v1: { w: false, p: 0, a: 50 } }
    }
    mergeRemoteIntoSeries(series, remote)
    expect(series.videos[0].watched).toBe(true)
    expect(series.videos[0].watchedAt).toBe(500)
  })

  it('updates lastEpisodeIndex to next unwatched', () => {
    const series = makeSeries([
      { id: 'v1', watched: true },
      { id: 'v2', watched: false },
      { id: 'v3', watched: false }
    ])
    const remote = { updatedAt: 100, progress: {} }
    mergeRemoteIntoSeries(series, remote)
    expect(series.lastEpisodeIndex).toBe(1)
  })

  it('sets syncUpdatedAt to max of remote and local', () => {
    const series = makeSeries([], { syncUpdatedAt: 50 })
    mergeRemoteIntoSeries(series, { updatedAt: 100, progress: {} })
    expect(series.syncUpdatedAt).toBe(100)
  })

  it('handles empty progress', () => {
    const series = makeSeries([{ id: 'v1' }])
    mergeRemoteIntoSeries(series, { updatedAt: 100, progress: {} })
    expect(series.videos[0].watched).toBe(false)
  })
})
