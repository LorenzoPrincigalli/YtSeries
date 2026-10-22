// @ts-check
import { EVENTS } from '../../shared/events.js'
import { AppError } from '../../shared/errors.js'
import { s } from '../../shared/schema.js'
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
    await commit(ctx, store => {
      if (watched) store.markEpisodeWatched(playlistId, videoId)
      else store.markEpisodeUnwatched(playlistId, videoId)
      store.recordActivity(watched ? 'episode_watched' : 'episode_unwatched', { playlistId, videoId })
      return { changed: [playlistId] }
    })
    return { success: true, state: ctx.store.getState() }
  }
}

const episodeRoutes = {
  [EVENTS.EPISODE_PROGRESS]: {
    schema: s.object({ ...episodeRef, progress: s.optional(s.number({ min: 0, max: 100 })), currentTime: seconds, duration: seconds }),
    handler: recordProgress
  },
  [EVENTS.EPISODE_WATCH]: { schema: s.object(episodeRef), handler: setWatched(true) },
  [EVENTS.EPISODE_UNWATCH]: { schema: s.object(episodeRef), handler: setWatched(false) },
  [EVENTS.GET_NEXT_EPISODE]: {
    mode: 'read',
    schema: s.object({ videoId: s.id(), playlistId: s.id() }),
    handler: (ctx, { playlistId, videoId }) => ({ success: true, nextEpisode: ctx.store.getNextEpisode(playlistId, videoId) })
  }
}

export { episodeRoutes }
