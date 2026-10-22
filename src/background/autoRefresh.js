// @ts-check
import { logger } from '../shared/logger.js'
import { mapLimit } from '../shared/resilience.js'
import { commit } from './context.js'

const log = logger.child('autoRefresh')
const CONCURRENCY = 2

/** @typedef {import('./context.js').BackgroundContext} Ctx */

/** @param {Ctx} ctx @param {{ playlistId: string, title: string, count: number }[]} updates */
async function notifyNewEpisodes(ctx, updates) {
  const total = updates.reduce((sum, update) => sum + update.count, 0)
  const first = updates[0]
  try {
    await ctx.notifications.create('new_episodes_summary', {
      type: 'basic',
      title: `${total} new episode${total === 1 ? '' : 's'} in ${updates.length} series`,
      message: `Open the next new episode from ${updates.length > 1 ? `First: ${first.title}` : first.title}`,
      iconUrl: 'icons/icon128.png'
    })
  } catch (err) {
    log.warn('Could not create new-episode notification', err)
  }
}

/**
 * Refreshes every saved playlist with bounded concurrency. One failing
 * playlist never aborts the rest; when the API circuit is open the run stops
 * early instead of hammering a dead backend.
 * @param {Ctx} ctx
 */
async function autoRefresh(ctx) {
  if (!ctx.store.getSettings().autoRefresh) return

  const series = Object.values(ctx.store.getSeries())
  const results = await mapLimit(series, CONCURRENCY, async ({ playlistId }) => ({
    playlistId,
    data: await ctx.youtube.refreshPlaylist(playlistId)
  }))

  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length) {
    const codes = [...new Set(failed.map(r => /** @type {any} */ (r).reason?.code || 'UNKNOWN_ERROR'))]
    log.warn(`Auto-refresh: ${failed.length}/${series.length} playlists failed`, codes)
  }

  const fresh = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
  const updates = await commit(ctx, store => {
    const updates = []
    for (const { playlistId, data } of fresh) {
      if (!store.playlistExists(playlistId)) continue // deleted while we were fetching
      const { newVideoIds } = store.addSeries(data)
      if (newVideoIds.length) updates.push({ playlistId, title: data.title, count: newVideoIds.length })
    }
    store.updateSettings({ lastRefreshCheck: Date.now() })
    return { updates, changed: updates.map(update => update.playlistId) }
  })

  if (updates.updates.length) await notifyNewEpisodes(ctx, updates.updates)
}

export { autoRefresh }
