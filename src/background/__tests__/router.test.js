import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EVENTS } from '../../shared/events.js'
import { AppError } from '../../shared/errors.js'
import { Store } from '../../state/store.js'
import { createRouter, createCommandQueue } from '../router.js'
import { seriesRoutes } from '../handlers/series.js'
import { episodeRoutes } from '../handlers/episodes.js'
import { collectionRoutes } from '../handlers/collections.js'
import { settingsRoutes } from '../handlers/settings.js'
import { libraryRoutes } from '../handlers/library.js'
import { appRoutes } from '../handlers/app.js'

function memoryStorage() {
  const sync = {}
  const local = {}
  const pick = (bag, keys) => Object.fromEntries([].concat(keys).filter(k => k in bag).map(k => [k, structuredClone(bag[k])]))
  return {
    sync, local,
    get: async keys => pick(sync, keys),
    set: async data => Object.assign(sync, structuredClone(data)),
    remove: async keys => [].concat(keys).forEach(k => delete sync[k]),
    getLocal: async keys => pick(local, keys),
    setLocal: vi.fn(async data => Object.assign(local, structuredClone(data))),
    removeLocal: async keys => [].concat(keys).forEach(k => delete local[k])
  }
}

const playlist = (id, videos = ['v1', 'v2']) => ({
  playlistId: id, title: `Title ${id}`, description: '', thumbnail: '', channelTitle: 'c', channelId: 'UC1',
  videoCount: videos.length, videos: videos.map((v, i) => ({ id: v, title: v, thumbnail: '', position: i, duration: 100 }))
})

let ctx, dispatch

beforeEach(() => {
  globalThis.chrome = {
    alarms: { get: vi.fn(async () => null) },
    runtime: { getURL: p => `chrome-extension://id/${p}` },
    action: { setIcon: vi.fn(async () => {}) }
  }
  ctx = {
    store: new Store(),
    storage: memoryStorage(),
    youtube: { fetchPlaylist: vi.fn(async () => playlist('PL1')), refreshPlaylist: vi.fn(async id => playlist(id, ['v1', 'v2', 'v3'])), search: vi.fn(async () => ({ playlists: [], channels: [] })) },
    tabs: { query: vi.fn(async () => []), create: vi.fn(), update: vi.fn() },
    alarms: { create: vi.fn(), clear: vi.fn() },
    notifications: { create: vi.fn() },
    broadcast: vi.fn(async () => {}),
    sync: {
      afterMutation: vi.fn(async () => {}), afterDelete: vi.fn(async () => {}),
      login: vi.fn(), logout: vi.fn(), syncNow: vi.fn(), onStorageReset: vi.fn(async () => {}), status: () => ({ loggedIn: false })
    }
  }
  dispatch = createRouter({ ...appRoutes, ...seriesRoutes, ...episodeRoutes, ...collectionRoutes, ...settingsRoutes, ...libraryRoutes }, createCommandQueue())
})

describe('router', () => {
  it('rejects unknown types and invalid payloads with uniform envelopes', async () => {
    expect(await dispatch({ type: 'NOPE' }, ctx)).toMatchObject({ success: false, error: 'UNKNOWN_TYPE' })
    expect(await dispatch({ type: '__proto__' }, ctx)).toMatchObject({ success: false, error: 'UNKNOWN_TYPE' })
    expect(await dispatch({ type: EVENTS.SERIES_DELETE, payload: { playlistId: '<script>' } }, ctx))
      .toMatchObject({ success: false, error: 'INVALID_PAYLOAD' })
    expect(await dispatch({ type: EVENTS.SETTINGS_UPDATE, payload: { theme: 'hacker' } }, ctx))
      .toMatchObject({ success: false, error: 'INVALID_PAYLOAD' })
  })

  it('adds a playlist, persists, queues sync and broadcasts', async () => {
    const response = await dispatch({ type: EVENTS.PLAYLIST_ADD, payload: { url: 'https://www.youtube.com/playlist?list=PL1' } }, ctx)
    expect(response).toMatchObject({ success: true, series: { playlistId: 'PL1' } })
    expect(ctx.storage.local.series.PL1).toBeTruthy()
    expect(ctx.sync.afterMutation).toHaveBeenCalledWith('PL1')
    expect(ctx.broadcast).toHaveBeenCalled()
  })

  it('persists episode progress (regression: progress was kept only in memory)', async () => {
    ctx.store.addSeries(playlist('PL1'))
    const response = await dispatch({ type: EVENTS.EPISODE_PROGRESS, payload: { videoId: 'v1', playlistId: 'stale', progress: 40, currentTime: 40, duration: 100 } }, ctx)
    expect(response).toEqual({ success: true })
    expect(ctx.storage.local.series.PL1.videos[0].resumeTime).toBe(40)
  })

  it('rolls back memory when the save fails', async () => {
    ctx.store.addSeries(playlist('PL1'))
    ctx.storage.setLocal.mockRejectedValueOnce(new AppError('STORAGE_SET_ERROR'))
    const response = await dispatch({ type: EVENTS.EPISODE_WATCH, payload: { videoId: 'v1' } }, ctx)
    expect(response).toMatchObject({ success: false, error: 'STORAGE_SET_ERROR' })
    expect(ctx.store.getSeriesById('PL1').videos[0].watched).toBe(false)
    expect(ctx.broadcast).not.toHaveBeenCalled()
  })

  it('still succeeds when queuing sync fails after a durable save', async () => {
    ctx.sync.afterMutation.mockRejectedValueOnce(new Error('queue down'))
    const response = await dispatch({ type: EVENTS.PLAYLIST_ADD, payload: { url: 'https://www.youtube.com/playlist?list=PL1' } }, ctx)
    expect(response.success).toBe(true)
  })

  it('deletes with a backup and supports undo via restore', async () => {
    ctx.store.addSeries(playlist('PL1'))
    const deleted = await dispatch({ type: EVENTS.SERIES_DELETE, payload: { playlistId: 'PL1' } }, ctx)
    expect(deleted.deletedSeries.playlistId).toBe('PL1')
    expect(ctx.sync.afterDelete).toHaveBeenCalledWith('PL1')
    expect(ctx.storage.local.backups[0].reason).toBe('before_delete')
    const restored = await dispatch({ type: EVENTS.SERIES_RESTORE, payload: { series: deleted.deletedSeries } }, ctx)
    expect(restored.state.series.PL1).toBeTruthy()
  })

  it('moves series between collections and undoes the move', async () => {
    ctx.store.addSeries(playlist('PL1'))
    const moved = await dispatch({ type: EVENTS.COLLECTION_MOVE, payload: { ids: ['PL1'], destination: 'Anime' } }, ctx)
    expect(moved).toMatchObject({ success: true, moved: 1, skipped: 0 })
    const undone = await dispatch({ type: EVENTS.COLLECTION_UNDO, payload: { token: moved.undoToken } }, ctx)
    expect(undone).toMatchObject({ success: true, restored: 1 })
    expect(ctx.store.getSeriesById('PL1').collection).toBe('')
  })

  it('updates settings and keeps the auto-refresh alarm in sync', async () => {
    const response = await dispatch({ type: EVENTS.SETTINGS_UPDATE, payload: { autoRefresh: false, apiKey: 'leak' } }, ctx)
    expect(response.settings.autoRefresh).toBe(false)
    expect(response.settings.apiKey).toBeUndefined()
    expect(ctx.alarms.clear).toHaveBeenCalledWith('autoRefresh')
  })

  it('rate-limits searches', async () => {
    expect((await dispatch({ type: EVENTS.PLAYLIST_SEARCH, payload: { query: 'a' } }, ctx)).success).toBe(true)
    expect(await dispatch({ type: EVENTS.PLAYLIST_SEARCH, payload: { query: 'b' } }, ctx)).toMatchObject({ error: 'RATE_LIMITED' })
  })

  it('imports a validated backup and rejects malicious ones', async () => {
    const ok = await dispatch({ type: EVENTS.IMPORT_SERIES, payload: { series: { PL9: playlist('PL9') } } }, ctx)
    expect(ok).toMatchObject({ success: true, imported: 1 })
    const bad = await dispatch({ type: EVENTS.IMPORT_SERIES, payload: { series: JSON.parse('{"__proto__": {"playlistId": "__proto__", "videos": []}}') } }, ctx)
    expect(bad).toMatchObject({ success: false, error: 'INVALID_BACKUP' })
  })
})
