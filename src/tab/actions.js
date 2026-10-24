// @ts-check
// User intents → background commands. The single place the dashboard talks
// to the service worker for mutations: it applies returned state, reports
// failures with a translated toast and never mutates server state locally.
import { EVENTS } from '../shared/events.js'
import { t } from '../shared/i18n.js'
import { logger } from '../shared/logger.js'
import { request, send } from './core/api.js'
import { getState, setServer, setUi } from './core/store.js'
import { toast, toastError } from './ui/feedback.js'
import { watchUrl, nextEpisode } from './seriesView.js'

const log = logger.child('actions')

/** Applies `response.state` when a command returns it; otherwise the broadcast will. */
function applyResponse(response) {
  if (response?.state || response?.syncStatus) setServer({ state: response.state, syncStatus: response.syncStatus })
  return response
}

/**
 * Runs a command; on failure shows a toast and returns null.
 * @param {string} type @param {Record<string, unknown>} payload @param {string} fallbackKey
 */
async function command(type, payload, fallbackKey) {
  try {
    return applyResponse(await request(type, payload))
  } catch (err) {
    log.warn(`${type} failed`, err)
    toastError(err, fallbackKey)
    return null
  }
}

export async function loadState() {
  const response = await request(EVENTS.STATE_GET)
  setServer({ state: response.state, syncStatus: response.syncStatus })
  return response
}

/** @param {string} url */
export function openExternal(url) {
  window.open(url, '_blank', 'noopener')
}

/** @param {any} series */
export function continueWatching(series) {
  const episode = nextEpisode(series)
  if (episode) openExternal(watchUrl(episode.id, series.playlistId, episode.resumeTime))
}

/** Toast for a 25/50/75/100 % milestone returned by EPISODE_WATCH. @param {{ percent: number, title: string } | null | undefined} milestone */
export function celebrate(milestone) {
  if (!milestone) return
  toast(t(milestone.percent === 100 ? 'milestone_done' : 'milestone_toast', milestone), { variant: 'success' })
}

/** @param {string} playlistId @param {string} videoId @param {boolean} watched */
export async function setEpisodeWatched(playlistId, videoId, watched) {
  const response = await command(watched ? EVENTS.EPISODE_WATCH : EVENTS.EPISODE_UNWATCH, { playlistId, videoId }, 'episode_update_error')
  celebrate(response?.milestone)
  return response
}

/**
 * Leaves episodes out of progress (trailers, filler) or counts them again.
 * @param {string} playlistId @param {string[]} videoIds @param {boolean} excluded
 */
export async function setEpisodesExcluded(playlistId, videoIds, excluded) {
  const response = await command(EVENTS.EPISODE_EXCLUDE, { playlistId, videoIds, excluded }, 'episode_update_error')
  if (response?.changed > 1 && excluded) toast(t('episodes_excluded_toast', { n: response.changed }), { variant: 'success' })
  return response
}

/** @param {string} playlistId @param {string} noteId @param {string} text */
export function updateNote(playlistId, noteId, text) {
  return command(EVENTS.NOTE_UPDATE, { playlistId, noteId, text }, 'note_save_error')
}

/** @param {string} playlistId @param {string} noteId */
export function deleteNote(playlistId, noteId) {
  return command(EVENTS.NOTE_DELETE, { playlistId, noteId }, 'note_save_error')
}

/** @param {string} playlistId */
export function toggleComplete(playlistId) {
  return command(EVENTS.SERIES_COMPLETE_TOGGLE, { playlistId }, 'something_wrong')
}

/** Ended: the creator will publish no more episodes. @param {string} playlistId @param {boolean} ended */
export function setSeriesEnded(playlistId, ended) {
  return command(EVENTS.SERIES_ENDED_SET, { playlistId, ended }, 'something_wrong')
}

/** @param {string} playlistId @param {string} collection */
export function setSeriesCollection(playlistId, collection) {
  return command(EVENTS.SERIES_COLLECTION_SET, { playlistId, collection }, 'collection_save_error')
}

/** @param {string} playlistId */
export function refreshSeries(playlistId) {
  return command(EVENTS.SERIES_REFRESH, { playlistId }, 'refresh_failed')
}

/**
 * Adds a playlist by id (search results, related playlists).
 * @param {string} playlistId
 */
export async function addPlaylistById(playlistId) {
  const url = new URL('https://www.youtube.com/playlist')
  url.searchParams.set('list', playlistId)
  const response = await command(EVENTS.PLAYLIST_ADD, { url: url.href }, 'add_failed')
  if (response) toast(t('series_added_toast', { title: response.series?.title || '' }), { variant: 'success' })
  return response
}

/** Follows a channel as a series of its latest uploads. @param {string} channelId */
export async function followChannel(channelId) {
  const response = await command(EVENTS.CHANNEL_FOLLOW, { channelId }, 'follow_error')
  if (response) toast(t('channel_followed_toast', { title: response.series?.title || '' }), { variant: 'success' })
  return response
}

/** Adds a playlist from a pasted URL; throws so the modal can show the error inline. @param {string} url */
export async function addPlaylistByUrl(url) {
  return applyResponse(await request(EVENTS.PLAYLIST_ADD, { url }))
}

/** Deletes a series and offers undo. @param {string} playlistId */
export async function deleteSeries(playlistId) {
  const response = await command(EVENTS.SERIES_DELETE, { playlistId }, 'delete_error')
  if (!response?.deletedSeries) return
  setUi({ detailId: null })
  toast(t('series_deleted_undo'), {
    variant: 'info',
    action: {
      label: t('undo'),
      run: () => command(EVENTS.SERIES_RESTORE, { series: response.deletedSeries }, 'restore_error')
    }
  })
}

/** @param {Record<string, unknown>} settings */
export function updateSettings(settings) {
  return command(EVENTS.SETTINGS_UPDATE, settings, 'settings_save_error')
}

/** Searches YouTube; keeps the previous results on failure. @param {string} query */
export async function searchYouTube(query) {
  setUi({ searchStatus: 'loading', searchError: null })
  try {
    const response = await request(EVENTS.PLAYLIST_SEARCH, { query })
    setUi({ searchResults: { playlists: response.playlists || [], channels: response.channels || [] }, searchStatus: 'idle' })
  } catch (err) {
    log.warn('Search failed', err)
    setUi({ searchStatus: 'error', searchError: /** @type {any} */ (err).code || 'UNKNOWN_ERROR' })
  }
}

/** @param {string} channelId @param {string} [excludePlaylistId] */
export async function fetchChannelPlaylists(channelId, excludePlaylistId) {
  const response = await request(EVENTS.FETCH_CHANNEL_PLAYLISTS, { channelId, excludePlaylistId })
  return response.playlists || []
}

/** @param {number} through */
export async function markActivityRead(through) {
  const state = getState()
  if (!state || through <= (state.activityReadAt || 0)) return
  const response = await send(EVENTS.ACTIVITY_MARK_READ, { through })
  if (!response.success) toast(t('activity_read_error'), { variant: 'error' })
}

export { command, applyResponse }
