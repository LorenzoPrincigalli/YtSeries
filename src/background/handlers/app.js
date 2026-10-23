// @ts-check
import { EVENTS } from '../../shared/events.js'
import { AppError, toAppError } from '../../shared/errors.js'
import { s } from '../../shared/schema.js'

/** @typedef {import('../context.js').BackgroundContext} Ctx */

const SEARCH_COOLDOWN_MS = 3000
let lastSearchAt = 0

/** Focuses the dashboard tab if open, otherwise opens it. @param {Ctx} ctx @param {string} [query] */
async function openSeriesTab(ctx, query = '') {
  const base = chrome.runtime.getURL('src/tab/index.html')
  const [existing] = await ctx.tabs.query({ url: base })
  if (existing && !query) await ctx.tabs.update(existing.id, { active: true })
  else await ctx.tabs.create(base + query)
}

/** @param {Ctx} ctx @param {{ query: string }} payload */
async function search(ctx, { query }) {
  const now = Date.now()
  if (now - lastSearchAt < SEARCH_COOLDOWN_MS) throw new AppError('RATE_LIMITED')
  lastSearchAt = now
  return { success: true, ...await ctx.youtube.search(query) }
}

/** @param {Ctx} ctx @param {{ channelId: string, excludePlaylistId?: string }} payload */
async function channelPlaylists(ctx, { channelId, excludePlaylistId }) {
  return { success: true, playlists: await ctx.youtube.fetchChannelPlaylists(channelId, excludePlaylistId) }
}

/**
 * Sync failures are returned (not thrown) because the UI needs the fresh
 * syncStatus alongside the error code.
 * @param {(ctx: Ctx, payload: any) => Promise<void>} operation
 * @param {string} fallbackCode
 */
function syncCommand(operation, fallbackCode) {
  /** @param {Ctx} ctx @param {any} payload */
  return async (ctx, payload) => {
    try {
      await operation(ctx, payload)
      return { success: true, syncStatus: ctx.sync.status() }
    } catch (raw) {
      const err = toAppError(raw, fallbackCode)
      return { success: false, error: err.code, message: err.message, syncStatus: ctx.sync.status() }
    }
  }
}

const appRoutes = {
  [EVENTS.STATE_GET]: { mode: 'read', handler: ctx => ({ success: true, state: ctx.store.getState(), syncStatus: ctx.sync.status() }) },
  [EVENTS.OPEN_SERIES_TAB]: { contexts: ['extension', 'content'], mode: 'read', handler: async ctx => { await openSeriesTab(ctx); return { success: true } } },
  [EVENTS.PLAYLIST_SEARCH]: { mode: 'read', schema: s.object({ query: s.string({ min: 1, max: 200 }) }), handler: search },
  [EVENTS.FETCH_CHANNEL_PLAYLISTS]: {
    mode: 'read',
    schema: s.object({ channelId: s.id(), excludePlaylistId: s.optional(s.string({ max: 200 })) }),
    handler: channelPlaylists
  },
  [EVENTS.CONTENT_SETTINGS_GET]: {
    contexts: ['content'],
    mode: 'read',
    handler: ctx => {
      const { nextEpisodeOverlay, language } = ctx.store.getSettings()
      return { success: true, settings: { nextEpisodeOverlay: nextEpisodeOverlay !== false, language: language || 'system' } }
    }
  },
  // Content script only: whether the video on screen is an episode of a saved series (no progress data).
  [EVENTS.CONTENT_VIDEO_SERIES]: {
    contexts: ['content'],
    mode: 'read',
    schema: s.object({ videoId: s.id(), playlistId: s.optional(s.string({ max: 200 })) }),
    handler: (ctx, { videoId, playlistId }) => ({ success: true, saved: Boolean(ctx.store.resolvePlaylistForVideo(videoId, playlistId)) })
  },
  [EVENTS.SYNC_STATUS]: { mode: 'read', handler: ctx => ({ success: true, syncStatus: ctx.sync.status() }) },
  [EVENTS.SYNC_LOGIN]: {
    schema: s.object({ allowAccountChange: s.optional(s.boolean()) }),
    handler: syncCommand((ctx, payload) => ctx.sync.login({ allowAccountChange: payload.allowAccountChange === true }), 'SYNC_LOGIN_FAILED')
  },
  [EVENTS.SYNC_LOGOUT]: { handler: async ctx => { await ctx.sync.logout(); await ctx.broadcast(); return { success: true, syncStatus: ctx.sync.status() } } },
  [EVENTS.SYNC_NOW]: { handler: syncCommand(ctx => ctx.sync.syncNow(), 'SYNC_FAILED') }
}

export { appRoutes, openSeriesTab }
