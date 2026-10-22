// @ts-check
import { EVENTS } from '../../shared/events.js'
import { AppError } from '../../shared/errors.js'
import { s } from '../../shared/schema.js'
import { normalizeSeriesBackup } from '../../shared/seriesValidation.js'
import { commit } from '../context.js'
import { createAutomaticBackup } from '../backups.js'

/** @typedef {import('../context.js').BackgroundContext} Ctx */

const byPlaylist = s.object({ playlistId: s.id() })

/** @param {Ctx} ctx @param {{ url: string }} payload */
async function addPlaylist(ctx, { url }) {
  // Network first, outside the transaction: a slow API call must not hold a snapshot.
  const data = await ctx.youtube.fetchPlaylist(url)
  await commit(ctx, store => {
    store.addSeries(data)
    store.recordActivity('series_added', { playlistId: data.playlistId, title: data.title })
    return { changed: [data.playlistId] }
  })
  return { success: true, series: ctx.store.getSeriesById(data.playlistId) }
}

/** @param {Ctx} ctx @param {{ playlistId: string }} payload */
async function refreshSeries(ctx, { playlistId }) {
  if (!ctx.store.playlistExists(playlistId)) throw new AppError('SERIES_NOT_FOUND')
  const data = await ctx.youtube.refreshPlaylist(playlistId)
  await commit(ctx, store => {
    store.addSeries(data)
    return { changed: [playlistId] }
  })
  return { success: true, series: ctx.store.getSeriesById(playlistId) }
}

/** @param {Ctx} ctx @param {{ playlistId: string }} payload */
async function deleteSeries(ctx, { playlistId }) {
  const deleted = ctx.store.getSeriesById(playlistId)
  if (!deleted) return { success: true, deletedSeries: null }
  await createAutomaticBackup(ctx, 'before_delete')
  await commit(ctx, store => {
    store.deleteSeries(playlistId)
    store.recordActivity('series_deleted', { playlistId, title: deleted.title })
    return { deleted: [playlistId] }
  })
  return { success: true, deletedSeries: deleted }
}

/** Undo of a delete: the client sends back the series it received. @param {Ctx} ctx @param {{ series: any }} payload */
async function restoreSeries(ctx, { series: candidate }) {
  if (!candidate?.playlistId) throw new AppError('INVALID_SERIES')
  const [series] = Object.values(normalizeSeriesBackup({ [candidate.playlistId]: candidate }))
  await commit(ctx, store => {
    store.importSeries(series)
    store.recordActivity('series_restored', { playlistId: series.playlistId, title: series.title })
    return { changed: [series.playlistId] }
  })
  return { success: true, state: ctx.store.getState() }
}

/** @param {Ctx} ctx @param {{ playlistId: string }} payload */
async function toggleComplete(ctx, { playlistId }) {
  if (!ctx.store.playlistExists(playlistId)) throw new AppError('SERIES_NOT_FOUND')
  await commit(ctx, store => {
    store.toggleSeriesComplete(playlistId)
    const series = /** @type {any} */ (store.getSeriesById(playlistId))
    store.recordActivity(series.completed ? 'series_completed' : 'series_reopened', { playlistId, title: series.title })
    return { changed: [playlistId] }
  })
  return { success: true, state: ctx.store.getState() }
}

/** @param {Ctx} ctx @param {{ playlistId: string, collection: string }} payload */
async function setCollection(ctx, { playlistId, collection }) {
  const existing = ctx.store.getSeriesById(playlistId)
  if (!existing) throw new AppError('SERIES_NOT_FOUND')
  if ((existing.collection || '') === collection) return { success: true, state: ctx.store.getState(), skipped: 1 }
  await commit(ctx, store => {
    store.setSeriesCollection(playlistId, collection)
    store.recordActivity('collection_changed', { playlistId, title: collection })
    return { changed: [playlistId] }
  })
  return { success: true, state: ctx.store.getState() }
}

const seriesRoutes = {
  [EVENTS.PLAYLIST_ADD]: { contexts: ['extension', 'content'], schema: s.object({ url: s.string({ min: 1, max: 2048 }) }), handler: addPlaylist },
  [EVENTS.SERIES_REFRESH]: { schema: byPlaylist, handler: refreshSeries },
  [EVENTS.SERIES_DELETE]: { schema: byPlaylist, handler: deleteSeries },
  [EVENTS.SERIES_RESTORE]: { schema: s.object({ series: s.any() }), handler: restoreSeries },
  [EVENTS.SERIES_COMPLETE_TOGGLE]: { schema: byPlaylist, handler: toggleComplete },
  [EVENTS.SERIES_COLLECTION_SET]: {
    schema: s.object({ playlistId: s.id(), collection: s.string({ max: 40 }) }),
    handler: setCollection
  },
  [EVENTS.PLAYLIST_EXISTS]: {
    contexts: ['extension', 'content'],
    mode: 'read',
    schema: byPlaylist,
    handler: (ctx, { playlistId }) => ({ success: true, exists: ctx.store.playlistExists(playlistId) })
  }
}

export { seriesRoutes }
