import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { Store } from '../store.js'
import { seriesToFirestorePayload, mergeRemoteIntoSeries } from '../../services/sync/FirebaseSyncService.js'
import { normalizeSeriesBackup } from '../../shared/seriesValidation.js'

beforeAll(() => {
  vi.stubGlobal('chrome', { runtime: { getURL: () => '' } })
})

const fetched = ids => ({ playlistId: 'PL1', title: 'S', videos: ids.map(id => ({ id, title: id, duration: 60 })) })

describe('episode exclusion', () => {
  /** @type {Store} */
  let store
  beforeEach(() => {
    store = new Store()
    store.addSeries(fetched(['trailer', 'e1', 'e2']))
  })

  it('excludes and re-includes episodes, reporting only real changes', () => {
    expect(store.setEpisodesExcluded('PL1', ['trailer', 'missing'], true)).toEqual(['trailer'])
    expect(store.setEpisodesExcluded('PL1', ['trailer'], true)).toEqual([])
    expect(store.getSeriesById('PL1').videos[0].excluded).toBe(true)
    expect(store.setEpisodesExcluded('PL1', ['trailer'], false)).toEqual(['trailer'])
  })

  it('makes the change syncable and moves the resume pointer past excluded episodes', () => {
    const before = store.getSeriesById('PL1').localUpdatedAt
    store.setEpisodesExcluded('PL1', ['trailer'], true)
    const series = store.getSeriesById('PL1')
    expect(series.localUpdatedAt).toBeGreaterThan(before)
    expect(series.videos[0].progressUpdatedAt).toBe(series.localUpdatedAt)
    expect(series.lastEpisodeIndex).toBe(1)
  })

  it('never offers an excluded episode as the next one', () => {
    store.setEpisodesExcluded('PL1', ['e1'], true)
    expect(store.getNextEpisode('PL1', 'trailer').id).toBe('e2')
  })

  it('survives a refresh from YouTube', () => {
    store.setEpisodesExcluded('PL1', ['trailer'], true)
    store.addSeries(fetched(['trailer', 'e1', 'e2', 'e3']))
    expect(store.getSeriesById('PL1').videos[0].excluded).toBe(true)
  })

  it('rejects an unknown series', () => {
    expect(() => store.setEpisodesExcluded('nope', ['x'], true)).toThrow()
  })

  it('round-trips through cloud sync and backups', () => {
    store.setEpisodesExcluded('PL1', ['trailer'], true)
    const payload = seriesToFirestorePayload(store.getSeriesById('PL1'))
    expect(payload.progress.trailer.x).toBe(true)

    const other = new Store()
    other.addSeries(fetched(['trailer', 'e1', 'e2']))
    const mutable = other._getSeriesMutable('PL1')
    mergeRemoteIntoSeries(mutable, payload)
    expect(mutable.videos[0].excluded).toBe(true)
    expect(mutable.lastEpisodeIndex).toBe(1)

    const restored = normalizeSeriesBackup({ PL1: store.getSeriesById('PL1') })
    expect(restored.PL1.videos[0].excluded).toBe(true)
  })
})

describe('new episodes in a fixed-size window', () => {
  it('counts new ids even when the number of videos does not change', () => {
    const store = new Store()
    store.addSeries(fetched(['a', 'b', 'c']))
    store.addSeries(fetched(['b', 'c', 'd']))
    expect(store.getSeriesById('PL1')).toMatchObject({ newEpisodesCount: 1, latestNewVideoId: 'd' })
  })
})
