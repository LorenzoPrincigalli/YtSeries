// @ts-check
import { logger } from '../shared/logger.js'

const log = logger.child('bg')

/**
 * Dependencies every handler receives. Built once in index.js; tests build
 * their own with fakes.
 * @typedef {{
 *   store: import('../state/store.js').Store,
 *   storage: any,
 *   youtube: any,
 *   tabs: any,
 *   alarms: any,
 *   notifications: any,
 *   sync: {
 *     afterMutation: (playlistId: string) => Promise<void>,
 *     afterDelete: (playlistId: string) => Promise<void>,
 *     login: (options: { allowAccountChange: boolean }) => Promise<void>,
 *     logout: () => Promise<void>,
 *     syncNow: () => Promise<void>,
 *     onStorageReset: () => Promise<void>,
 *     status: () => any
 *   },
 *   broadcast: () => Promise<void>
 * }} BackgroundContext
 */

/**
 * The one way handlers change library state: runs `change` inside a store
 * transaction together with the save (so a failed write rolls memory back),
 * then queues cloud sync for touched series and broadcasts the new state.
 *
 * A failure to *queue* sync is logged, not thrown: the local change is
 * already durable and the periodic retry re-enqueues pending work.
 *
 * `change` may return `{ changed?: playlistId[], deleted?: playlistId[], ...extra }`;
 * the extra fields are returned to the caller.
 * @param {BackgroundContext} ctx
 * @param {(store: import('../state/store.js').Store) => any} change
 * @returns {Promise<Record<string, any>>}
 */
async function commit(ctx, change) {
  const { changed = [], deleted = [], ...result } = await ctx.store.transaction(async store => {
    const outcome = await change(store)
    await store.saveToStorage(ctx.storage)
    return outcome || {}
  })

  for (const playlistId of deleted) {
    await ctx.sync.afterDelete(playlistId).catch(err => log.error('Could not queue remote delete', playlistId, err))
  }
  for (const playlistId of new Set(changed)) {
    await ctx.sync.afterMutation(playlistId).catch(err => log.error('Could not queue sync', playlistId, err))
  }
  await ctx.broadcast()
  return result
}

export { commit }
