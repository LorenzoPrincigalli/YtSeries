import { describe, it, expect, vi } from 'vitest'
import { Store } from '../store.js'

const sample = () => ({ playlistId: 'PL1', title: 'Series', videos: [
  { id: 'v1', title: 'Episode', duration: 100 }, { id: 'v2', title: 'Next' }
] })
const storage = () => ({
  get: vi.fn().mockResolvedValue({}), getLocal: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(), setLocal: vi.fn().mockResolvedValue()
})

describe('store mutation and persistence regressions', () => {
  it('persists the read cursor without deleting history and leaves later events unread', async () => {
    const store = new Store();
    store.recordActivity('series_added');
    const through = store.getState().activity[0].at;
    store.recordActivity('episode_watched');
    store.markActivityRead(through);
    const service = storage();
    await store.saveToStorage(service);
    const saved = service.setLocal.mock.calls[0][0];
    const restored = new Store();
    service.getLocal.mockResolvedValue(saved);
    await restored.loadFromStorage(service);
    expect(restored.getState().activity).toHaveLength(2);
    expect(restored.getState().activityReadAt).toBe(through);
    expect(restored.getState().activity.filter(e => e.at > through)).toHaveLength(1);
    restored.markActivityRead(0);
    expect(restored.getState().activityReadAt).toBe(through);
  });

  it('does not let future or invalid cursors suppress new notifications', () => {
    const store = new Store();
    expect(() => store.markActivityRead(NaN)).toThrow();
    expect(() => store.markActivityRead(-1)).toThrow();
    store.recordActivity('series_added');
    const latest = store.getState().activity[0].at;
    expect(store.markActivityRead(Number.MAX_SAFE_INTEGER)).toBe(latest);
    store.recordActivity('episode_watched');
    expect(store.getState().activity[0].at).toBeGreaterThan(latest);
    store.reset();
    expect(store.getState().activityReadAt).toBe(0);
  });
  it('timestamps unwatch even when watchedAt becomes null, and preserves clocks on refresh', () => {
    const store = new Store()
    store.addSeries(sample())
    store.markEpisodeWatched('PL1', 'v1')
    const watchedAt = store.getSeriesById('PL1').videos[0].progressUpdatedAt
    store.markEpisodeUnwatched('PL1', 'v1')
    const changed = store.getSeriesById('PL1')
    expect(changed.videos[0].progressUpdatedAt).toBeGreaterThan(watchedAt)
    expect(changed.videos[0].watchedAt).toBeNull()
    store.addSeries(sample())
    expect(store.getSeriesById('PL1').videos[0].progressUpdatedAt).toBe(changed.videos[0].progressUpdatedAt)
  })

  it('records the first newly discovered episode for a grouped notification target', () => {
    const store = new Store()
    store.addSeries(sample())
    const refreshed = sample()
    refreshed.videos.push({ id: 'v3', title: 'New episode' })
    expect(store.addSeries(refreshed).newVideoIds).toEqual(['v3'])
    expect(store.getSeriesById('PL1')).toMatchObject({ newEpisodesCount: 1, latestNewVideoId: 'v3' })
  })

  it('keeps completion clock independent from playback and metadata clocks', () => {
    const store = new Store()
    store.addSeries(sample())
    store.toggleSeriesComplete('PL1')
    const at = store.getSeriesById('PL1').completedUpdatedAt
    store.updateEpisodeProgress('PL1', 'v1', 10, 10, 100)
    store.addSeries(sample())
    expect(store.getSeriesById('PL1').completedUpdatedAt).toBe(at)
  })

  it('persists a collection as a normal local mutation', () => {
    const store = new Store()
    store.addSeries(sample())
    expect(store.setSeriesCollection('PL1', 'Documentaries')).toBe(true)
    const saved = store.getSeriesById('PL1')
    expect(saved.collection).toBe('Documentaries')
    expect(saved.collectionUpdatedAt).toBeGreaterThan(0)
    expect(store.setSeriesCollection('missing', 'Other')).toBe(false)
  })

  it('keeps a bounded local activity feed in the serialized state', async () => {
    const store = new Store()
    for (let index = 0; index < 103; index++) store.recordActivity('episode_watched', { title: `Episode ${index}` })
    expect(store.getState().activity).toHaveLength(100)
    expect(store.getState().activity[0].title).toBe('Episode 102')
    const service = storage()
    await store.saveToStorage(service)
    expect(service.setLocal.mock.calls[0][0].activity).toHaveLength(100)
  })

  it('restores watched and partial progress from a backup', () => {
    const store = new Store()
    const backup = sample()
    Object.assign(backup.videos[0], { watched: true, progress: 100, resumeTime: 100, watchedAt: 12 })
    Object.assign(backup.videos[1], { watched: false, progress: 45, resumeTime: 90 })
    store.importSeries(backup)
    const restored = store.getSeriesById('PL1')
    expect(restored.videos[0]).toMatchObject({ watched: true, progress: 100, watchedAt: 12 })
    expect(restored.videos[1]).toMatchObject({ progress: 45, resumeTime: 90 })
    expect(restored.lastEpisodeIndex).toBe(1)
    expect(restored.videos[1].progressUpdatedAt).toBeGreaterThan(0)
  })

  it('replaces the library when restoring an automatic backup', () => {
    const store = new Store()
    store.addSeries(sample())
    const restored = { PL2: { playlistId: 'PL2', title: 'Restored', videos: [{ id: 'v3' }] } }
    store.replaceSeries(restored)
    expect(store.getSeriesById('PL1')).toBeNull()
    expect(store.getSeriesById('PL2')).toMatchObject({ title: 'Restored' })
  })

  it('does not allow snapshots to mutate nested store state', () => {
    const store = new Store()
    store.addSeries(sample())
    store.getState().series.PL1.videos[0].watched = true
    store.getSeries().PL1.videos[0].title = 'Mutated'
    store.getSeriesById('PL1').videos[0].progress = 99
    expect(store.getSeriesById('PL1').videos[0]).toMatchObject({ watched: false, title: 'Episode', progress: 0 })
  })

  it('serializes concurrent snapshots and avoids rewriting unchanged settings', async () => {
    const store = new Store()
    const service = storage()
    let release
    service.setLocal.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    store.addSeries(sample())
    const first = store.saveToStorage(service)
    store.markEpisodeWatched('PL1', 'v1')
    const second = store.saveToStorage(service)
    await Promise.resolve()
    expect(service.setLocal).toHaveBeenCalledTimes(1)
    expect(service.setLocal.mock.calls[0][0].series.PL1.videos[0].watched).toBe(false)
    release()
    await Promise.all([first, second])
    expect(service.setLocal.mock.calls[1][0].series.PL1.videos[0].watched).toBe(true)
    expect(service.set).toHaveBeenCalledTimes(1)
  })

  it('recovers the save queue after a failed write and exposes the error', async () => {
    const store = new Store()
    const service = storage()
    service.setLocal.mockRejectedValueOnce(new Error('disk full'))
    await expect(store.saveToStorage(service)).rejects.toThrow('disk full')
    await expect(store.saveToStorage(service)).resolves.toBeUndefined()
  })

  it('fails loading unreadable or malformed libraries before any save', async () => {
    const store = new Store()
    const service = storage()
    service.getLocal.mockRejectedValueOnce(new Error('read failed'))
    await expect(store.loadFromStorage(service)).rejects.toThrow('read failed')
    service.getLocal.mockResolvedValueOnce({ series: { PL1: { playlistId: 'PL1', videos: {} } } })
    await expect(store.loadFromStorage(service)).rejects.toThrow('Stored library is invalid')
    expect(service.setLocal).not.toHaveBeenCalled()
  })

  it('reset persists enabled defaults even after clearing storage with identical settings', async () => {
    const store = new Store()
    const service = storage()
    await store.saveToStorage(service)
    store.reset()
    await store.saveToStorage(service)
    expect(service.set).toHaveBeenCalledTimes(2)
    expect(store.getSettings()).toMatchObject({ nextEpisodeOverlay: true, autoRefresh: true, language: 'system' })
  })

  it('ignores invalid progress and never downgrades a watched episode from a late progress event', () => {
    const store = new Store()
    store.addSeries(sample())
    store.updateEpisodeProgress('PL1', 'v1', NaN, Infinity, 100)
    expect(store.getSeriesById('PL1').videos[0].progress).toBe(0)
    store.markEpisodeWatched('PL1', 'v1')
    store.updateEpisodeProgress('PL1', 'v1', 98, 98, 100)
    expect(store.getSeriesById('PL1').videos[0]).toMatchObject({ watched: true, progress: 100 })
  })
})
