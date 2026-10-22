// @ts-check
import { STORAGE_KEYS } from '../shared/constants.js'

const MAX_BACKUPS = 5

/** @param {any} storage */
async function readBackups(storage) {
  const data = await storage.getLocal([STORAGE_KEYS.BACKUPS])
  return Array.isArray(data[STORAGE_KEYS.BACKUPS]) ? data[STORAGE_KEYS.BACKUPS] : []
}

/**
 * Snapshots the library before a destructive operation. Keeps the newest five.
 * @param {{ store: any, storage: any }} ctx
 * @param {string} reason
 * @returns {Promise<string | null>} backup id, or null when the library is empty
 */
async function createAutomaticBackup(ctx, reason) {
  const series = ctx.store.getSeries()
  if (!Object.keys(series).length) return null
  const backup = { id: crypto.randomUUID(), reason, at: Date.now(), series }
  const existing = await readBackups(ctx.storage)
  await ctx.storage.setLocal({ [STORAGE_KEYS.BACKUPS]: [backup, ...existing].slice(0, MAX_BACKUPS) })
  return backup.id
}

/** @param {any} storage */
async function listBackups(storage) {
  return (await readBackups(storage)).map(({ id, reason, at, series }) => ({
    id, reason, at, seriesCount: Object.keys(series || {}).length
  }))
}

/** @param {any} storage @param {string} id */
async function findBackup(storage, id) {
  return (await readBackups(storage)).find(item => item?.id === id) || null
}

export { createAutomaticBackup, listBackups, findBackup }
