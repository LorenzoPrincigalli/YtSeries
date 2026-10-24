// @ts-check
import { API, YOUTUBE_API_MAX_RESULTS, WORKER_CLIENT_TOKEN } from '../shared/constants.js'
import { AppError, toAppError } from '../shared/errors.js'
import { logger } from '../shared/logger.js'
import { withRetry, CircuitBreaker } from '../shared/resilience.js'
import { YT_ID } from '../shared/schema.js'
import { isChannelSeries } from '../shared/seriesStats.js'

const log = logger.child('youtube')

const REQUEST_TIMEOUT_MS = 15_000
const MAX_PLAYLIST_PAGES = 100 // 5,000 videos; stops a malformed nextPageToken loop
const ALLOWED_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype'])
// A followed channel is its uploads playlist: UULF… (long-form videos only,
// i.e. no Shorts; not documented by YouTube) or UU… (all uploads) as fallback.
const CHANNEL_WINDOW = 100
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/
const HANDLE = /^@[A-Za-z0-9._-]{3,100}$/

export { isChannelSeries }

/** @param {any} thumbnails @param {string[]} order */
function pickThumbnail(thumbnails, order = ['maxres', 'high', 'medium', 'default']) {
  for (const size of order) {
    const url = thumbnails?.[size]?.url
    if (typeof url === 'string' && url.startsWith('https://')) return url
  }
  return ''
}

/** @param {unknown} value @param {string} fallback */
const text = (value, fallback = '') => (typeof value === 'string' ? value : fallback)

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
/**
 * The search endpoint HTML-escapes snippet text ("Earth&#39;s"). The UI only
 * ever sets textContent, so decoding is safe and nothing becomes markup.
 * @param {string} value
 */
function unescapeHtml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, code) => {
    if (code[0] !== '#') return ENTITIES[/** @type {keyof typeof ENTITIES} */ (code.toLowerCase())]
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : match
  })
}

/** @param {unknown} value @param {string} [fallback] */
const searchText = (value, fallback = '') => unescapeHtml(text(value, fallback))

/**
 * Maps an HTTP failure to a typed error. Transient failures (429, 5xx) are
 * retryable; quota exhaustion is not.
 * @param {number} status @param {any} body
 */
function httpError(status, body) {
  const reason = body?.error?.errors?.[0]?.reason
  if (status === 403 && (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded')) {
    return new AppError('QUOTA_EXCEEDED', 'YouTube API quota exhausted', { status })
  }
  if (status === 404) return new AppError('PLAYLIST_NOT_FOUND', 'Resource not found', { status })
  if (status === 429) return new AppError('RATE_LIMITED', 'Too many requests', { status, retryable: true })
  if (status >= 500) return new AppError('API_UNAVAILABLE', `YouTube API returned ${status}`, { status, retryable: true })
  return new AppError('API_ERROR', `YouTube API returned ${status}`, { status })
}

class YouTubeApiService {
  /** @param {{ fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<unknown> }} [deps] */
  constructor({ fetchImpl, sleep } = {}) {
    this.apiKey = ''
    this._fetchImpl = fetchImpl || ((input, init) => fetch(input, init))
    this._sleep = sleep
    this.breaker = new CircuitBreaker('youtube-api', { threshold: 5, cooldownMs: 5 * 60_000 })
  }

  /** @param {string} key */
  setApiKey(key) {
    this.apiKey = key
  }

  /** @param {string} endpoint @param {Record<string, unknown>} params */
  _buildUrl(endpoint, params = {}) {
    const base = API.WORKER_BASE || API.YOUTUBE_BASE
    const url = new URL(`${base.replace(/\/+$/, '')}/${String(endpoint).replace(/^\/+/, '')}`)
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value))
    }
    if (!API.WORKER_BASE) url.searchParams.set('key', this.apiKey)
    return url.toString()
  }

  /**
   * One API call: circuit breaker → retry with backoff → timeout-bound fetch.
   * @param {string} url
   */
  async _fetch(url) {
    return this.breaker.exec(() => withRetry(async () => {
      /** @type {Record<string, string>} */
      const headers = { Accept: 'application/json' }
      if (API.WORKER_BASE) headers['X-YT-Series-Client'] = WORKER_CLIENT_TOKEN
      let response
      try {
        response = await this._fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers })
      } catch (err) {
        throw toAppError(err, 'NETWORK_ERROR')
      }
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const err = httpError(response.status, body)
        log.warn(`API ${response.status}`, err.code)
        throw err
      }
      if (!body || typeof body !== 'object') throw new AppError('API_BAD_RESPONSE', 'Malformed API response', { retryable: true })
      return body
    }, { retries: 2, label: 'YouTube request', sleep: this._sleep }))
  }

  /** @param {string} playlistId @param {any} playlist @param {any[]} videos */
  _buildPlaylistResult(playlistId, playlist, videos) {
    const snippet = playlist.snippet || {}
    return {
      playlistId,
      title: text(snippet.title, 'Untitled'),
      description: text(snippet.description),
      thumbnail: pickThumbnail(snippet.thumbnails),
      channelTitle: text(snippet.channelTitle),
      channelId: text(snippet.channelId),
      videoCount: parseInt(playlist.contentDetails?.itemCount ?? videos.length, 10) || videos.length,
      videos
    }
  }

  /** A playlist link, or a channel link (followed as a series). @param {string} playlistUrl */
  async fetchPlaylist(playlistUrl) {
    const playlistId = this._extractPlaylistId(playlistUrl)
    if (playlistId) return this.refreshPlaylist(playlistId)
    const channel = this._extractChannelRef(playlistUrl)
    if (channel) return this.followChannel(channel)
    throw new AppError('INVALID_URL', 'Invalid YouTube playlist URL')
  }

  /** @param {string} playlistId */
  async refreshPlaylist(playlistId) {
    if (!this._isSafeIdentifier(playlistId)) throw new AppError('INVALID_PAYLOAD', 'Invalid playlist id')
    const playlist = await this._getPlaylistDetails(playlistId)
    if (!isChannelSeries(playlistId)) return this._buildPlaylistResult(playlistId, playlist, await this._getPlaylistItems(playlistId))
    // Uploads come newest first: keep the latest window, then oldest → newest like episodes.
    const videos = (await this._getPlaylistItems(playlistId, CHANNEL_WINDOW)).reverse().map((video, position) => ({ ...video, position }))
    const result = this._buildPlaylistResult(playlistId, playlist, videos)
    return { ...result, title: result.channelTitle || result.title, description: '' }
  }

  /**
   * Follows a channel as a series of its latest long-form uploads.
   * @param {{ channelId?: string, handle?: string }} channel
   */
  async followChannel({ channelId, handle }) {
    if (!channelId && handle) {
      const data = await this._fetch(this._buildUrl('/channels', { part: 'snippet,contentDetails', forHandle: handle }))
      channelId = Array.isArray(data.items) ? data.items[0]?.id : undefined
      if (!channelId) throw new AppError('PLAYLIST_NOT_FOUND', 'Channel not found')
    }
    if (typeof channelId !== 'string' || !CHANNEL_ID.test(channelId)) throw new AppError('INVALID_PAYLOAD', 'Invalid channel id')
    try {
      return await this.refreshPlaylist(`UULF${channelId.slice(2)}`)
    } catch (err) {
      if (/** @type {any} */ (err)?.code !== 'PLAYLIST_NOT_FOUND') throw err
      return this.refreshPlaylist(`UU${channelId.slice(2)}`)
    }
  }

  /** youtube.com/channel/UC… or youtube.com/@handle, else null. @param {unknown} url */
  _extractChannelRef(url) {
    if (typeof url !== 'string') return null
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return null
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname) || parsed.username || parsed.password) return null
    let first, second
    try {
      [first, second] = parsed.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part))
    } catch {
      return null // malformed percent-encoding
    }
    if (first === 'channel' && second && CHANNEL_ID.test(second)) return { channelId: second }
    if (first && HANDLE.test(first)) return { handle: first }
    return null
  }

  /**
   * Errors propagate: callers must be able to tell "no playlists" from "failed".
   * @param {string} channelId @param {string} [excludePlaylistId]
   */
  async fetchChannelPlaylists(channelId, excludePlaylistId) {
    if (!this._isSafeIdentifier(channelId)) throw new AppError('INVALID_PAYLOAD', 'Invalid channel id')
    const data = await this._fetch(this._buildUrl('/playlists', { part: 'snippet,contentDetails', channelId, maxResults: 10 }))
    return (Array.isArray(data.items) ? data.items : [])
      .filter(item => this._isSafeIdentifier(item?.id) && item.id !== excludePlaylistId)
      .map(item => ({
        playlistId: item.id,
        title: text(item.snippet?.title, 'Untitled'),
        thumbnail: pickThumbnail(item.snippet?.thumbnails, ['high', 'medium', 'default']),
        channelTitle: text(item.snippet?.channelTitle),
        channelId: text(item.snippet?.channelId),
        videoCount: Number(item.contentDetails?.itemCount) || 0
      }))
  }

  /** @param {unknown} url @returns {string | null} */
  _extractPlaylistId(url) {
    if (typeof url !== 'string') return null
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return null
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname) ||
      (parsed.port && parsed.port !== '443') || parsed.username || parsed.password) {
      return null
    }
    const playlistId = parsed.searchParams.get('list')
    return this._isSafeIdentifier(playlistId) ? playlistId : null
  }

  /** @param {unknown} value @returns {value is string} */
  _isSafeIdentifier(value) {
    return typeof value === 'string' && YT_ID.test(value) && !FORBIDDEN_IDS.has(value.toLowerCase())
  }

  /**
   * Errors propagate so the UI can show "search failed" instead of "no results".
   * @param {string} query
   */
  async search(query) {
    if (!query || !query.trim()) return { playlists: [], channels: [] }
    const data = await this._fetch(this._buildUrl('/search', { part: 'snippet', type: 'playlist,channel', maxResults: 15, q: query.trim() }))
    const result = this._parseSearch(data)
    // Broad queries ("documentary") can return only channels; the user came for
    // series, so ask once more for playlists alone (cached by the Worker).
    if (!result.playlists.length && result.channels.length) {
      const more = await this._fetch(this._buildUrl('/search', { part: 'snippet', type: 'playlist', maxResults: 12, q: query.trim() }))
      result.playlists = this._parseSearch(more).playlists
    }
    return result
  }

  /** @param {any} data */
  _parseSearch(data) {
    const playlists = []
    const channels = []
    for (const item of Array.isArray(data.items) ? data.items : []) {
      const snippet = item?.snippet || {}
      if (item?.id?.kind === 'youtube#playlist' && this._isSafeIdentifier(item.id.playlistId)) {
        playlists.push({
          playlistId: item.id.playlistId,
          title: searchText(snippet.title, 'Untitled'),
          description: searchText(snippet.description),
          thumbnail: pickThumbnail(snippet.thumbnails, ['high', 'medium', 'default']),
          channelTitle: searchText(snippet.channelTitle),
          channelId: text(snippet.channelId),
          publishedAt: text(snippet.publishedAt)
        })
      } else if (item?.id?.kind === 'youtube#channel' && this._isSafeIdentifier(snippet.channelId)) {
        channels.push({
          channelId: snippet.channelId,
          title: searchText(snippet.title, 'Untitled'),
          description: searchText(snippet.description),
          thumbnail: pickThumbnail(snippet.thumbnails, ['high', 'medium', 'default']),
          publishedAt: text(snippet.publishedAt)
        })
      }
    }
    return { playlists, channels }
  }

  /** @param {string} playlistId */
  async _getPlaylistDetails(playlistId) {
    const data = await this._fetch(this._buildUrl('/playlists', { part: 'snippet,contentDetails', id: playlistId }))
    const playlist = Array.isArray(data.items) ? data.items[0] : null
    if (!playlist) throw new AppError('PLAYLIST_NOT_FOUND', 'Playlist not found or private')
    return playlist
  }

  /** @param {string} playlistId @param {number} [limit] stop after this many videos */
  async _getPlaylistItems(playlistId, limit = Infinity) {
    const videos = []
    const seen = new Set()
    let pageToken = ''
    let pages = 0

    do {
      const data = await this._fetch(this._buildUrl('/playlistItems', {
        part: 'snippet,contentDetails', maxResults: YOUTUBE_API_MAX_RESULTS, playlistId, pageToken
      }))
      for (const item of Array.isArray(data.items) ? data.items : []) {
        const videoId = item?.snippet?.resourceId?.videoId
        // Duplicates break per-episode progress keys; private/deleted entries have no id.
        if (!this._isSafeIdentifier(videoId) || seen.has(videoId)) continue
        seen.add(videoId)
        videos.push({
          id: videoId,
          title: text(item.snippet.title, 'Untitled'),
          thumbnail: pickThumbnail(item.snippet.thumbnails),
          position: Number.isSafeInteger(item.snippet.position) ? item.snippet.position : videos.length,
          publishedAt: text(item.snippet.publishedAt),
          duration: 0
        })
      }
      pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : ''
    } while (pageToken && videos.length < limit && ++pages < MAX_PLAYLIST_PAGES)
    videos.splice(limit)

    if (videos.length) {
      const durations = await this._getVideoDurations(videos.map(v => v.id))
      for (const video of videos) video.duration = durations[video.id] || 0
    }
    return videos
  }

  /** @param {string[]} videoIds */
  async _getVideoDurations(videoIds) {
    /** @type {Record<string, number>} */
    const durations = {}
    for (const chunk of this._chunkArray(videoIds, 50)) {
      const data = await this._fetch(this._buildUrl('/videos', { part: 'contentDetails', id: chunk.join(',') }))
      for (const item of Array.isArray(data.items) ? data.items : []) {
        if (typeof item?.id === 'string') durations[item.id] = this._parseISO8601Duration(item.contentDetails?.duration)
      }
    }
    return durations
  }

  /** Parses ISO-8601 durations such as PT1H2M3S or P1DT2H. @param {unknown} duration */
  _parseISO8601Duration(duration) {
    if (typeof duration !== 'string') return 0
    const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
    if (!match) return 0
    const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match
    return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  }

  /** @template T @param {T[]} arr @param {number} size @returns {T[][]} */
  _chunkArray(arr, size) {
    const chunks = []
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
    return chunks
  }
}

const youTubeApiService = new YouTubeApiService()
export { youTubeApiService, YouTubeApiService }
