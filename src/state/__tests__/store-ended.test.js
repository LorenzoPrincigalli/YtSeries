import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { Store } from '../store.js'
import { seriesToFirestorePayload, mergeRemoteIntoSeries } from '../../services/sync/FirebaseSyncService.js'
import { normalizeSeriesBackup } from '../../shared/seriesValidation.js'

beforeAll(() => {
  vi.stubGlobal('chrome', { runtime: { getURL: () => '' } })
})

const fetched = ids => ({ playlistId: 'PL1', title: 'S', videos: ids.map(id => ({ id, title: id, duration: 60 })) })

describe('followed channels', () => {
  it('can never be marked as ended, but a stray flag can still be cleared', () => {
    const store = new Store()
    store.addSeries({ playlistId: 'UULFHnyfMqiRRG1u-2MsSQLbXA', title: 'Channel', videos: [{ id: 'v1', title: 'v1' }] })
    expect(() => store.setSeriesEnded('UULFHnyfMqiRRG1u-2MsSQLbXA', true)).toThrow(/keeps publishing/)
    expect(store.getSeriesById('UULFHnyfMqiRRG1u-2MsSQLbXA').ended).toBeFalsy()
    store._getSeriesMutable('UULFHnyfMqiRRG1u-2MsSQLbXA').ended = true
    expect(store.setSeriesEnded('UULFHnyfMqiRRG1u-2MsSQLbXA', false)).toBe(true)
  })
})

describe('ended series', () => {
  /** @type {Store} */
  let store
  beforeEach(() => {
    store = new Store()
    store.addSeries(fetched(['e1', 'e2']))
  })

  it('marks and unmarks a series as ended, reporting only real changes', () => {
    const before = store.getSeriesById('PL1').localUpdatedAt
    expect(store.setSeriesEnded('PL1', true)).toBe(true)
    expect(store.setSeriesEnded('PL1', true)).toBe(false)
    const series = store.getSeriesById('PL1')
    expect(series.ended).toBe(true)
    expect(series.endedUpdatedAt).toBeGreaterThan(before)
    expect(series.completed).toBe(false) // ended is not the same as watched to the end
    expect(store.setSeriesEnded('PL1', false)).toBe(true)
    expect(store.getSeriesById('PL1').ended).toBe(false)
    expect(store.setSeriesEnded('missing', true)).toBe(false)
  })

  it('survives a refresh from YouTube', () => {
    store.setSeriesEnded('PL1', true)
    store.addSeries(fetched(['e1', 'e2', 'e3']))
    expect(store.getSeriesById('PL1').ended).toBe(true)
  })

  it('round-trips through backups', () => {
    store.setSeriesEnded('PL1', true)
    const [restored] = Object.values(normalizeSeriesBackup({ PL1: store.getSeriesById('PL1') }))
    expect(restored.ended).toBe(true)
    expect(restored.endedUpdatedAt).toBeGreaterThan(0)
  })

  it('syncs only once toggled, and the newer side wins', () => {
    expect(seriesToFirestorePayload(store.getSeriesById('PL1'))).not.toHaveProperty('ended')
    store.setSeriesEnded('PL1', true)
    const local = store.getSeriesById('PL1')
    const payload = seriesToFirestorePayload(local)
    expect(payload).toMatchObject({ ended: true, endedAt: local.endedUpdatedAt })

    const other = { ...fetched(['e1', 'e2']), videos: [], endedUpdatedAt: 0 }
    mergeRemoteIntoSeries(other, payload)
    expect(other).toMatchObject({ ended: true, endedUpdatedAt: local.endedUpdatedAt })

    mergeRemoteIntoSeries(other, { ended: false, endedAt: local.endedUpdatedAt - 1 })
    expect(other.ended).toBe(true)
    mergeRemoteIntoSeries(other, { ended: false, endedAt: local.endedUpdatedAt + 1 })
    expect(other.ended).toBe(false)
  })
})
