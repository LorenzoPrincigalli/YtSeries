// @ts-check
import { EVENTS } from '../../shared/events.js'
import { STORAGE_KEYS, EXTENSION_ID } from '../../shared/constants.js'
import { AppError } from '../../shared/errors.js'
import { s } from '../../shared/schema.js'
import { normalizeSeries, normalizeSeriesBackup } from '../../shared/seriesValidation.js'
import { commit } from '../context.js'
import { createAutomaticBackup, listBackups, findBackup } from '../backups.js'
import { generateMockSeries } from '../demoData.js'
import { syncAutoRefreshAlarm } from './settings.js'

/** @typedef {import('../context.js').BackgroundContext} Ctx */

/** @param {Ctx} ctx @param {{ series: unknown }} payload */
async function importLibrary(ctx, { series }) {
  const list = Object.values(normalizeSeriesBackup(series))
  await createAutomaticBackup(ctx, 'before_import')
  await commit(ctx, store => {
    for (const item of list) store.importSeries(item)
    store.recordActivity('library_imported', { title: String(list.length) })
    return { changed: list.map(item => item.playlistId) }
  })
  return { success: true, imported: list.length }
}

/** @param {Ctx} ctx @param {{ id: string }} payload */
async function restoreBackup(ctx, { id }) {
  const backup = await findBackup(ctx.storage, id)
  if (!backup?.series) throw new AppError('BACKUP_NOT_FOUND')
  const restored = normalizeSeriesBackup(backup.series)
  const previousIds = Object.keys(ctx.store.getSeries())
  await createAutomaticBackup(ctx, 'before_restore')
  await commit(ctx, store => {
    store.replaceSeries(restored)
    store.recordActivity('backup_restored', { title: String(Object.keys(restored).length) })
    return { changed: Object.keys(restored), deleted: previousIds.filter(playlistId => !restored[playlistId]) }
  })
  return { success: true, state: ctx.store.getState() }
}

/**
 * Wipes local data (after a safety backup) and the user's cloud copy. The
 * remote wipe runs first: if it fails, nothing local is touched.
 * @param {Ctx} ctx
 */
async function resetStorage(ctx) {
  await createAutomaticBackup(ctx, 'before_reset')
  await ctx.sync.onStorageReset()
  await Promise.all([
    ctx.storage.remove([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.LICENSE]),
    ctx.storage.removeLocal([STORAGE_KEYS.SERIES, STORAGE_KEYS.ACTIVITY, STORAGE_KEYS.ACTIVITY_READ_AT, STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.COLLECTION_RECORDS])
  ])
  await commit(ctx, store => { store.reset() })
  await syncAutoRefreshAlarm(ctx, ctx.store.getSettings().autoRefresh)
  return { success: true, syncStatus: ctx.sync.status() }
}

/** Development-only sample library; disabled once EXTENSION_ID marks a store build. @param {Ctx} ctx */
async function loadDemoData(ctx) {
  if (EXTENSION_ID) throw new AppError('NOT_IN_DEV_MODE')
  const seriesMap = {}
  for (const series of generateMockSeries()) seriesMap[series.playlistId] = normalizeSeries(series, series.playlistId)
  await commit(ctx, store => { store.replaceSeries(seriesMap) })
  return { success: true, count: Object.keys(seriesMap).length }
}

/** @param {Ctx} ctx */
async function reloadState(ctx) {
  await ctx.store.loadFromStorage(ctx.storage)
  await ctx.broadcast()
  return { success: true, state: ctx.store.getState() }
}

const libraryRoutes = {
  [EVENTS.IMPORT_SERIES]: { schema: s.object({ series: s.any() }), handler: importLibrary },
  [EVENTS.BACKUP_LIST]: { mode: 'read', handler: async ctx => ({ success: true, backups: await listBackups(ctx.storage) }) },
  [EVENTS.BACKUP_RESTORE]: { schema: s.object({ id: s.string({ min: 1, max: 100 }) }), handler: restoreBackup },
  [EVENTS.STORAGE_RESET]: { handler: resetStorage },
  [EVENTS.LOAD_DEMO_DATA]: { handler: loadDemoData },
  [EVENTS.RELOAD_STATE]: { handler: reloadState }
}

export { libraryRoutes }
