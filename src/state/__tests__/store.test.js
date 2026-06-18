import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { store } from '../store.js'

beforeAll(() => {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue()
      }
    }
  })
})

describe('store', () => {
  beforeEach(() => {
    // Reset store state by recreating
    store._state.series = {}
    store._state.settings = {
      theme: 'classic-red',
      autoRefresh: false,
      lastRefreshCheck: 0,
      nextEpisodeOverlay: true
    }
    store._state.license = { isPro: true }
    store._listeners = new Map()
  })

  describe('addSeries', () => {
    const sampleSeries = {
      playlistId: 'PL123',
      title: 'Test Series',
      description: 'A test',
      thumbnail: 'thumb.jpg',
      channelTitle: 'Channel',
      channelId: 'UC123',
      videoCount: 2,
      videos: [
        { id: 'v1', title: 'Video 1', duration: 120 },
        { id: 'v2', title: 'Video 2', duration: 240 }
      ]
    }

    it('adds a new series to the store', () => {
      store.addSeries(sampleSeries)
      const s = store.getSeriesById('PL123')
      expect(s).not.toBeNull()
      expect(s.title).toBe('Test Series')
      expect(s.videos).toHaveLength(2)
    })

    it('preserves existing watched state on re-add', () => {
      store.addSeries(sampleSeries)
      store.markEpisodeWatched('PL123', 'v1')
      store.addSeries(sampleSeries)
      const s = store.getSeriesById('PL123')
      expect(s.videos[0].watched).toBe(true)
      expect(s.videos[1].watched).toBe(false)
    })

    it('counts new episodes on re-add', () => {
      store.addSeries(sampleSeries)
      const updated = {
        ...sampleSeries,
        videos: [
          ...sampleSeries.videos,
          { id: 'v3', title: 'Video 3', duration: 180 }
        ]
      }
      store.addSeries(updated)
      const s = store.getSeriesById('PL123')
      expect(s.newEpisodesCount).toBe(1)
    })
  })

  describe('markEpisodeWatched', () => {
    it('marks a video as watched', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', videos: [{ id: 'v1', title: 'V1' }],
        videoCount: 1, channelTitle: 'C', channelId: 'UC'
      })
      store.markEpisodeWatched('PL1', 'v1')
      const s = store.getSeriesById('PL1')
      expect(s.videos[0].watched).toBe(true)
      expect(s.videos[0].progress).toBe(100)
    })

    it('does nothing for non-existent series', () => {
      expect(() => store.markEpisodeWatched('NONEXIST', 'v1')).not.toThrow()
    })
  })

  describe('markEpisodeUnwatched', () => {
    it('resets a watched video to unwatched', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 2,
        videos: [
          { id: 'v1', title: 'V1', duration: 120 },
          { id: 'v2', title: 'V2', duration: 240 }
        ]
      })
      store.markEpisodeWatched('PL1', 'v1')
      store.markEpisodeUnwatched('PL1', 'v1')
      const s = store.getSeriesById('PL1')
      expect(s.videos[0].watched).toBe(false)
      expect(s.videos[0].progress).toBe(0)
      expect(s.videos[0].watchedAt).toBeNull()
      expect(s.videos[0].resumeTime).toBe(0)
    })

    it('updates lastEpisodeIndex after unwatch', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 2,
        videos: [
          { id: 'v1', title: 'V1' },
          { id: 'v2', title: 'V2' }
        ]
      })
      store.markEpisodeWatched('PL1', 'v1')
      store.markEpisodeWatched('PL1', 'v2')
      store.markEpisodeUnwatched('PL1', 'v2')
      const s = store.getSeriesById('PL1')
      expect(s.lastEpisodeIndex).toBe(1)
    })

    it('does nothing for already unwatched video', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v1', title: 'V1' }]
      })
      store.markEpisodeUnwatched('PL1', 'v1')
      const s = store.getSeriesById('PL1')
      expect(s.videos[0].watched).toBe(false)
    })

    it('does nothing for non-existent series', () => {
      expect(() => store.markEpisodeUnwatched('NONEXIST', 'v1')).not.toThrow()
    })

    it('does nothing for non-existent video', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v1', title: 'V1' }]
      })
      expect(() => store.markEpisodeUnwatched('PL1', 'nonexistent')).not.toThrow()
    })
  })

  describe('getNextEpisode', () => {
    it('returns the next unwatched episode', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 3,
        videos: [
          { id: 'v1', title: 'V1' },
          { id: 'v2', title: 'V2' },
          { id: 'v3', title: 'V3' }
        ]
      })
      store.markEpisodeWatched('PL1', 'v1')
      const next = store.getNextEpisode('PL1', 'v1')
      expect(next.id).toBe('v2')
    })

    it('returns null when no more unwatched', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 2,
        videos: [
          { id: 'v1', title: 'V1' },
          { id: 'v2', title: 'V2' }
        ]
      })
      store.markEpisodeWatched('PL1', 'v1')
      store.markEpisodeWatched('PL1', 'v2')
      const next = store.getNextEpisode('PL1', 'v2')
      expect(next).toBeNull()
    })
  })

  describe('playlistExists', () => {
    it('returns true when playlist exists', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v1', title: 'V1' }]
      })
      expect(store.playlistExists('PL1')).toBe(true)
    })

    it('returns false when playlist does not exist', () => {
      expect(store.playlistExists('NONEXIST')).toBe(false)
    })
  })

  describe('deleteSeries', () => {
    it('removes a series from the store', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v1', title: 'V1' }]
      })
      store.deleteSeries('PL1')
      expect(store.playlistExists('PL1')).toBe(false)
    })
  })

  describe('updateSettings', () => {
    it('merges new settings into existing', () => {
      store.updateSettings({ theme: 'ocean-blue' })
      expect(store.getSettings().theme).toBe('ocean-blue')
      expect(store.getSettings().nextEpisodeOverlay).toBe(true)
    })
  })

  describe('toggleSeriesComplete', () => {
    it('toggles the completed flag', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v1', title: 'V1' }]
      })
      store.toggleSeriesComplete('PL1')
      expect(store.getSeriesById('PL1').completed).toBe(true)
      store.toggleSeriesComplete('PL1')
      expect(store.getSeriesById('PL1').completed).toBe(false)
    })
  })

  describe('canAddSeries', () => {
    it('allows adding when under free limit', () => {
      expect(store.canAddSeries()).toBe(true)
    })

    it('allows adding without limit', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v1', title: 'V1' }]
      })
      store.addSeries({
        playlistId: 'PL2', title: 'S2', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v2', title: 'V2' }]
      })
      store.addSeries({
        playlistId: 'PL3', title: 'S3', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v3', title: 'V3' }]
      })
      store.addSeries({
        playlistId: 'PL4', title: 'S4', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v4', title: 'V4' }]
      })
      // Pro user can exceed free limit
      expect(store.canAddSeries()).toBe(true)
    })
  })

  describe('getState', () => {
    it('returns a snapshot of state', () => {
      store._state.settings.theme = 'forest'
      const state = store.getState()
      expect(state.settings.theme).toBe('forest')
      // Mutating snapshot should not affect store
      state.settings.theme = 'classic-red'
      expect(store.getState().settings.theme).toBe('forest')
    })
  })

  describe('findPlaylistByVideoId', () => {
    it('finds the playlist containing a given video', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S1', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v1', title: 'V1' }]
      })
      expect(store.findPlaylistByVideoId('v1')).toBe('PL1')
    })

    it('returns null when video not in any playlist', () => {
      expect(store.findPlaylistByVideoId('nonexistent')).toBeNull()
    })
  })

  describe('updateEpisodeProgress', () => {
    it('updates progress values', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v1', title: 'V1', duration: 200 }]
      })
      store.updateEpisodeProgress('PL1', 'v1', 50, 100, 200)
      const s = store.getSeriesById('PL1')
      expect(s.videos[0].progress).toBe(50)
      expect(s.videos[0].resumeTime).toBe(100)
    })

    it('does not mark as watched', () => {
      store.addSeries({
        playlistId: 'PL1', title: 'S', channelTitle: 'C', channelId: 'UC',
        videoCount: 1, videos: [{ id: 'v1', title: 'V1', duration: 200 }]
      })
      store.updateEpisodeProgress('PL1', 'v1', 95, 190, 200)
      const s = store.getSeriesById('PL1')
      expect(s.videos[0].watched).toBe(false)
    })
  })
})
