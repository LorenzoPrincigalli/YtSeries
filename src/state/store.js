import { STORAGE_KEYS, FREE_LIMITS } from '../shared/constants.js'
import { logger } from '../shared/logger.js'

class Store {
  static _buildSecret() {
    const a = [121, 116, 115, 101, 114, 105, 101, 115]
    const b = [95, 108, 105, 99, 95]
    const c = [50, 48, 50, 52]
    const d = [95, 120, 75, 57, 109, 80, 50, 118, 76]
    return [...a, ...b, ...c, ...d].map(c => String.fromCharCode(c)).join('')
  }

  static _djb2(str) {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF
    }
    return hash.toString(36)
  }

  static _computeLicenseChecksum(license) {
    const payload = JSON.stringify({ key: license.key, isPro: license.isPro })
    const secret = this._buildSecret()
    let xor = 0
    for (let i = 0; i < payload.length; i++) {
      xor ^= payload.charCodeAt(i) ^ secret.charCodeAt(i % secret.length)
    }
    return this._djb2(payload + xor.toString(36))
  }
  constructor() {
    this._state = {
      series: {},
      settings: {
        theme: 'classic-red',
        autoRefresh: false,
        lastRefreshCheck: 0,
        nextEpisodeOverlay: true
      },
      license: {
        key: null,
        isPro: false,
        verifiedAt: null
      }
    }
    this._listeners = new Map()
  }

  getState() {
    return {
      series: { ...this._state.series },
      settings: { ...this._state.settings },
      license: { ...this._state.license }
    }
  }

  getSeries() {
    const copy = {}
    for (const [id, s] of Object.entries(this._state.series)) {
      copy[id] = { ...s, videos: [...s.videos] }
    }
    return copy
  }

  getSeriesById(playlistId) {
    const s = this._state.series[playlistId]
    if (!s) return null
    return { ...s, videos: [...s.videos] }
  }

  /** Mutable reference for sync merge (do not expose to UI). */
  _getSeriesMutable(playlistId) {
    return this._state.series[playlistId] || null
  }

  getSettings() {
    return { ...this._state.settings }
  }

  getLicense() {
    return { ...this._state.license }
  }

  isPro() {
    const lic = this._state.license
    if (!lic || !lic.isPro || !lic.key) return false
    const verifiedAt = lic.verifiedAt || 0
    if (Date.now() - verifiedAt > 86400000) return false
    return true
  }

  canAddSeries() {
    if (this.isPro()) return true
    return Object.keys(this._state.series).length < FREE_LIMITS.MAX_SERIES
  }

  async loadFromStorage(storageService) {
    try {
      const syncData = await storageService.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.LICENSE])
      if (syncData[STORAGE_KEYS.SETTINGS]) {
        this._state.settings = { ...this._state.settings, ...syncData[STORAGE_KEYS.SETTINGS] }
      }
      if (syncData[STORAGE_KEYS.LICENSE]) {
        const stored = syncData[STORAGE_KEYS.LICENSE]
        const expectedChecksum = Store._computeLicenseChecksum(stored)
        if (stored._checksum && stored._checksum !== expectedChecksum) {
          logger.warn('Store.loadFromStorage: license checksum mismatch — resetting to free.')
          this._state.license = { key: null, isPro: false, verifiedAt: null }
        } else {
          this._state.license = { ...this._state.license, key: stored.key, isPro: stored.isPro, verifiedAt: stored.verifiedAt }
        }
      }
    } catch (err) {
      logger.error('Store.loadFromStorage: sync read failed:', err)
    }

    try {
      const localData = await storageService.getLocal([STORAGE_KEYS.SERIES])
      if (localData[STORAGE_KEYS.SERIES]) {
        this._state.series = localData[STORAGE_KEYS.SERIES]
      }
    } catch (err) {
      logger.error('Store.loadFromStorage: local read failed:', err)
    }

    logger.info('Store loaded from storage')
  }

  async saveToStorage(storageService) {
    let syncOk = true

    for (const key of [STORAGE_KEYS.SETTINGS, STORAGE_KEYS.LICENSE]) {
      let val = this._state[key]
      if (key === STORAGE_KEYS.LICENSE) {
        val = { ...val, _checksum: Store._computeLicenseChecksum(val) }
      }
      const size = new TextEncoder().encode(JSON.stringify(val)).length
      if (size > 4096) {
        logger.warn(`Store.saveToStorage: ${key} is ${size} bytes, cannot sync. Skipping save for this key.`)
        syncOk = false
      } else {
        try {
          await storageService.set({ [key]: val })
        } catch (setErr) {
          const msg = setErr?.message || ''
          const isQuota = msg.includes('QUOTA') || msg.includes('quota') || msg.includes('153')
          if (isQuota) {
            logger.warn(`Store.saveToStorage: sync quota exceeded for ${key}, data not saved for this key`)
          } else {
            logger.error(`Store.saveToStorage: sync write failed for ${key}:`, setErr)
          }
          syncOk = false
        }
      }
    }

    try {
      await storageService.setLocal({ [STORAGE_KEYS.SERIES]: this._state.series })
    } catch (localErr) {
      logger.error('Store.saveToStorage: local write failed:', localErr)
      throw localErr
    }

    if (!syncOk) {
      logger.warn('Store.saveToStorage: sync write degraded, local write succeeded')
    }
  }

  addSeries(series) {
    const existing = this._state.series[series.playlistId]

    const existingVideoMap = {}
    if (existing) {
      for (const v of existing.videos) {
        existingVideoMap[v.id] = v
      }
    }

    this._state.series[series.playlistId] = {
      ...series,
      lastEpisodeIndex: existing?.lastEpisodeIndex || 0,
      newEpisodesCount: existing ? Math.max(0, series.videos.length - (existing.videos?.length || 0)) : 0,
      completed: existing?.completed || false,
      addedAt: existing?.addedAt || Date.now(),
      lastRefreshedAt: Date.now(),
      videos: series.videos.map(v => {
        const existingVideo = existingVideoMap[v.id]
        return {
          ...v,
          watched: existingVideo?.watched || false,
          progress: existingVideo?.progress || 0,
          watchedAt: existingVideo?.watchedAt || null,
          resumeTime: existingVideo?.resumeTime || 0,
          totalWatchedTime: existingVideo?.totalWatchedTime || 0,
          lastWatchedAt: existingVideo?.lastWatchedAt || null
        }
      })
    }
    this._emitChange()
  }

  toggleSeriesComplete(playlistId) {
    const series = this._state.series[playlistId]
    if (!series) return
    series.completed = !series.completed
    this._emitChange()
  }

  findPlaylistByVideoId(videoId) {
    for (const [playlistId, series] of Object.entries(this._state.series)) {
      if (series.videos.some(v => v.id === videoId)) {
        return playlistId
      }
    }
    return null
  }

  playlistExists(playlistId) {
    return playlistId in this._state.series
  }

  getNextEpisode(playlistId, currentVideoId) {
    const series = this._state.series[playlistId]
    if (!series) return null

    const currentIndex = series.videos.findIndex(v => v.id === currentVideoId)
    if (currentIndex === -1) return null

    // Find next unwatched episode starting from current position
    for (let i = currentIndex + 1; i < series.videos.length; i++) {
      if (!series.videos[i].watched) {
        return series.videos[i]
      }
    }

    return null
  }

  deleteSeries(playlistId) {
    delete this._state.series[playlistId]
    this._emitChange()
  }

  markEpisodeWatched(playlistId, videoId) {
    const series = this._state.series[playlistId]
    if (!series) return

    const video = series.videos.find(v => v.id === videoId)
    if (!video) return

    if (!video.watched) {
      video.watched = true
      video.progress = 100
      video.resumeTime = video.duration || 0
      video.watchedAt = Date.now()
    }

    const nextIndex = series.videos.findIndex(v => !v.watched)
    series.lastEpisodeIndex = nextIndex >= 0 ? nextIndex : series.videos.length - 1

    this._emitChange()
  }

  markEpisodeUnwatched(playlistId, videoId) {
    const series = this._state.series[playlistId]
    if (!series) return

    const video = series.videos.find(v => v.id === videoId)
    if (!video) return

    if (video.watched) {
      video.watched = false
      video.progress = 0
      video.watchedAt = null
      video.resumeTime = 0
    }

    const nextIndex = series.videos.findIndex(v => !v.watched)
    series.lastEpisodeIndex = nextIndex >= 0 ? nextIndex : series.videos.length - 1

    this._emitChange()
  }

  updateEpisodeProgress(playlistId, videoId, progress, currentTime = 0, duration = 0) {
    const series = this._state.series[playlistId]
    if (!series) return

    const video = series.videos.find(v => v.id === videoId)
    if (!video) return

    const previousResumeTime = video.resumeTime || 0
    video.resumeTime = currentTime
    video.progress = progress
    video.lastWatchedAt = Date.now()

    // Calculate total watched time using delta from previous resumeTime
    if (currentTime > 0 && duration > 0) {
      const delta = Math.max(0, currentTime - previousResumeTime)
      // Only add delta if it's reasonable (user actually watched, not skipped)
      if (delta > 0 && delta < 30) {
        video.totalWatchedTime = (video.totalWatchedTime || 0) + delta
      }
    }

    // Removed auto-mark to prevent false positives
    // Videos are only marked as watched via the 'ended' event or manual action

    this._emitChange()
  }

  updateSettings(settings) {
    this._state.settings = { ...this._state.settings, ...settings }
    this._emitChange()
  }

  setLicense(licenseData) {
    this._state.license = { ...this._state.license, ...licenseData }
    this._emitChange()
  }

  setApiKey(key) {
    this._state.settings.apiKey = key
    this._emitChange()
  }

  subscribe(key, callback) {
    this._listeners.set(key, callback)
  }

  unsubscribe(key) {
    this._listeners.delete(key)
  }

  _emitChange() {
    for (const callback of this._listeners.values()) {
      try {
        callback(this._state)
      } catch (err) {
        logger.error('Store listener error:', err)
      }
    }
  }
}

const store = new Store()
export { store }
