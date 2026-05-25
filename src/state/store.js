import { STORAGE_KEYS, FREE_LIMITS } from '../shared/constants.js'
import { logger } from '../shared/logger.js'

class Store {
  constructor() {
    this._state = {
      series: {},
      settings: {
        theme: 'classic-red',
        autoRefresh: false,
        lastRefreshCheck: 0
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

  getSettings() {
    return { ...this._state.settings }
  }

  getLicense() {
    return { ...this._state.license }
  }

  isPro() {
    return this._state.license.isPro
  }

  canAddSeries() {
    if (this.isPro()) return true
    return Object.keys(this._state.series).length < FREE_LIMITS.MAX_SERIES
  }

  async loadFromStorage(storageService) {
    try {
      const [syncData, localData] = await Promise.all([
        storageService.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.LICENSE]),
        storageService.getLocal([STORAGE_KEYS.SERIES])
      ])

      if (localData[STORAGE_KEYS.SERIES]) {
        this._state.series = localData[STORAGE_KEYS.SERIES]
      }
      if (syncData[STORAGE_KEYS.SETTINGS]) {
        this._state.settings = { ...this._state.settings, ...syncData[STORAGE_KEYS.SETTINGS] }
      }
      if (syncData[STORAGE_KEYS.LICENSE]) {
        this._state.license = { ...this._state.license, ...syncData[STORAGE_KEYS.LICENSE] }
      }

      logger.info('Store loaded from storage')
    } catch (err) {
      logger.error('Store.loadFromStorage failed:', err)
    }
  }

  async saveToStorage(storageService) {
    let syncOk = true

    for (const key of [STORAGE_KEYS.SETTINGS, STORAGE_KEYS.LICENSE]) {
      const val = this._state[key]
      const size = new TextEncoder().encode(JSON.stringify(val)).length
      if (size > 4096) {
        logger.warn(`Store.saveToStorage: ${key} is ${size} bytes, resetting to defaults`)
        this._state[key] = key === STORAGE_KEYS.SETTINGS
          ? { theme: 'classic-red', autoRefresh: false, apiKey: '', lastRefreshCheck: 0 }
          : { key: null, isPro: false, verifiedAt: null }
        try {
          await storageService.set({ [key]: this._state[key] })
        } catch (setErr) {
          logger.error(`Store.saveToStorage: failed to save reset ${key}:`, setErr)
          syncOk = false
        }
      } else {
        try {
          await storageService.set({ [key]: val })
        } catch (setErr) {
          const msg = setErr?.message || ''
          const isQuota = msg.includes('QUOTA') || msg.includes('quota') || msg.includes('153')
          if (!isQuota) {
            logger.error(`Store.saveToStorage: sync write failed for ${key}:`, setErr)
            syncOk = false
          }
          logger.warn(`Store.saveToStorage: sync quota for ${key}, trying delete+reset`)
          try {
            await storageService.set({ [key]: null })
            await storageService.set({ [key]: val })
          } catch (retryErr) {
            logger.error(`Store.saveToStorage: still fails after delete for ${key}, data lost:`, retryErr)
            syncOk = false
          }
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
          watchedAt: existingVideo?.watchedAt || null
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

  deleteSeries(playlistId) {
    delete this._state.series[playlistId]
    this._emitChange()
  }

  markEpisodeWatched(playlistId, videoId) {
    const series = this._state.series[playlistId]
    if (!series) return

    const video = series.videos.find(v => v.id === videoId)
    if (!video) return

    video.watched = true
    video.progress = video.duration || 0
    video.watchedAt = Date.now()

    const nextIndex = series.videos.findIndex(v => !v.watched)
    series.lastEpisodeIndex = nextIndex >= 0 ? nextIndex : series.videos.length - 1

    this._emitChange()
  }

  updateEpisodeProgress(playlistId, videoId, progress) {
    const series = this._state.series[playlistId]
    if (!series) return

    const video = series.videos.find(v => v.id === videoId)
    if (!video) return

    video.progress = progress
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
export { store, Store }
