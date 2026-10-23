// @ts-check
import { EVENTS } from '../../shared/events.js'
import { AppError } from '../../shared/errors.js'
import { s } from '../../shared/schema.js'
import { progressRatio, milestoneCrossed } from '../../shared/seriesStats.js'
import { commit } from '../context.js'

/** @typedef {import('../context.js').BackgroundContext} Ctx */

// The playlist id is only a hint (YouTube URLs can carry stale or foreign
// list= values), so it is accepted as any short string and resolved below.
const episodeRef = {
  videoId: s.id(),
  playlistId: s.optional(s.string({ max: 200 }))
}
const seconds = s.optional(s.number({ min: 0, max: 7 * 24 * 3600 }))

/** @param {Ctx} ctx @param {{ videoId: string, playlistId?: string }} ref */
function resolveEpisode(ctx, { videoId, playlistId }) {
  const target = ctx.store.resolvePlaylistForVideo(videoId, playlistId)
  if (!target) throw new AppError('VIDEO_NOT_FOUND', 'No series contains this video')
  return target
}

/** @param {Ctx} ctx @param {any} payload */
async function recordProgress(ctx, payload) {
  const { playlistId, videoId } = resolveEpisode(ctx, payload)
  await commit(ctx, store => {
    store.updateEpisodeProgress(playlistId, videoId, payload.progress ?? 0, payload.currentTime ?? 0, payload.duration ?? 0)
    return { changed: [playlistId] }
  })
  return { success: true }
}

/** @param {boolean} watched */
function setWatched(watched) {
  /** @param {Ctx} ctx @param {any} payload */
  return async (ctx, payload) => {
    const { playlistId, videoId } = resolveEpisode(ctx, payload)
    const before = progressRatio(ctx.store.getSeriesById(playlistId))
    const { milestone } = await commit(ctx, store => {
      if (watched) store.markEpisodeWatched(playlistId, videoId)
      else store.markEpisodeUnwatched(playlistId, videoId)
      store.recordActivity(watched ? 'episode_watched' : 'episode_unwatched', { playlistId, videoId })
      // 25/50/75/100 %: celebrated once, when an episode pushes the series past it.
      const series = store.getSeriesById(playlistId)
      const percent = watched ? milestoneCrossed(before, progressRatio(series)) : null
      if (percent) store.recordActivity('series_milestone', { playlistId, title: `${series.title} · ${percent}%` })
      return { milestone: percent ? { percent, title: series.title } : null, changed: [playlistId] }
    })
    return { success: true, milestone, state: ctx.store.getState() }
  }
}

/** @param {Ctx} ctx @param {{ playlistId: string, videoIds: string[], excluded: boolean }} payload */
async function setExcluded(ctx, { playlistId, videoIds, excluded }) {
  const { ids } = await commit(ctx, store => {
    const ids = store.setEpisodesExcluded(playlistId, videoIds, excluded)
    return { ids, changed: ids.length ? [playlistId] : [] }
  })
  return { success: true, changed: ids.length, state: ctx.store.getState() }
}

const episodeRoutes = {
  [EVENTS.EPISODE_PROGRESS]: {
    contexts: ['extension', 'content'],
    schema: s.object({ ...episodeRef, progress: s.optional(s.number({ min: 0, max: 100 })), currentTime: seconds, duration: seconds }),
    handler: recordProgress
  },
  [EVENTS.EPISODE_WATCH]: { contexts: ['extension', 'content'], schema: s.object(episodeRef), handler: setWatched(true) },
  [EVENTS.EPISODE_UNWATCH]: { schema: s.object(episodeRef), handler: setWatched(false) },
  [EVENTS.EPISODE_EXCLUDE]: {
    schema: s.object({ playlistId: s.id(), videoIds: s.array(s.id(), { min: 1, max: 500 }), excluded: s.boolean() }),
    handler: setExcluded
  },
  [EVENTS.GET_NEXT_EPISODE]: {
    contexts: ['extension', 'content'],
    mode: 'read',
    schema: s.object({ videoId: s.id(), playlistId: s.id() }),
    handler: (ctx, { playlistId, videoId }) => ({ success: true, nextEpisode: ctx.store.getNextEpisode(playlistId, videoId) })
  }
}

export { episodeRoutes }
