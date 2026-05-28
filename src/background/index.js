import { EVENTS } from '../shared/events.js'
import { logger } from '../shared/logger.js'
import { LICENSE_CACHE_DAYS, AUTO_REFRESH_INTERVAL_MINUTES, API, STORAGE_KEYS } from '../shared/constants.js'
import { storageService } from '../services/chrome/storage.js'
import { tabService } from '../services/chrome/tabs.js'
import { alarmService } from '../services/chrome/alarms.js'
import { notificationService } from '../services/chrome/notifications.js'
import { youTubeApiService } from '../services/youtube.js'
import { licenseService } from '../services/license.js'
import { store } from '../state/store.js'
import {
  initSync,
  login as syncLogin,
  logout as syncLogout,
  afterSeriesMutation,
  afterSeriesDelete,
  onStorageReset as syncOnStorageReset,
  manualSync,
  getSyncStatus
} from '../services/sync/syncCoordinator.js'

let initialized = false
let initPromise = null

const LICENSE_REVERIFY_MS = LICENSE_CACHE_DAYS * 24 * 60 * 60 * 1000

const licenseRateLimiter = {
  _state: { attempts: 0, lastAttempt: 0 },
  cooldownMs: 5000,
  maxAttempts: 5,
  async _load() {
    try {
      const data = await chrome.storage.local.get('_rateLimiter')
      if (data._rateLimiter) this._state = data._rateLimiter
    } catch (_) {}
  },
  async _save() {
    try { await chrome.storage.local.set({ _rateLimiter: this._state }) } catch (_) {}
  },
  async check() {
    await this._load()
    const now = Date.now()
    if (this._state.attempts >= this.maxAttempts) {
      const elapsed = now - this._state.lastAttempt
      const backoff = this.cooldownMs * Math.pow(2, Math.min(this._state.attempts - this.maxAttempts, 6))
      if (elapsed < backoff) {
        return { allowed: false, retryAfter: backoff - elapsed }
      }
    }
    return { allowed: true }
  },
  async recordFailure() {
    this._state.attempts++
    this._state.lastAttempt = Date.now()
    await this._save()
  },
  async reset() {
    this._state = { attempts: 0, lastAttempt: 0 }
    await this._save()
  }
}

async function reverifyLicense() {
  const license = store.getLicense()
  if (!license || !license.isPro || !license.key) return

  const verifiedAt = license.verifiedAt || 0
  if (Date.now() - verifiedAt < LICENSE_REVERIFY_MS) return

  try {
    const result = await licenseService.verify(license.key)
    if (!result.valid) {
      store.setLicense({ key: null, isPro: false, verifiedAt: null })
      await store.saveToStorage(storageService)
      broadcastStateUpdate()
      logger.warn('License re-verification failed, Pro disabled')
    }
  } catch (err) {
    logger.warn('License re-verification network error, keeping current state:', err)
  }
}

async function ensureInit() {
  if (initialized) return
  if (initPromise) return initPromise
  let attempt = 0
  const maxAttempts = 3
  initPromise = (async () => {
    while (attempt < maxAttempts) {
      attempt++
      try {
        await init()
        initialized = true
        return
      } catch (err) {
        logger.error(`Init failed (attempt ${attempt}/${maxAttempts}):`, err)
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
        }
      }
    }
    initPromise = null
  })()
  return initPromise
}

function syncOnStateChanged() {
  broadcastStateUpdate()
}

async function notifySeriesSync(playlistId) {
  afterSeriesMutation(store, playlistId, async () => {
    await store.saveToStorage(storageService)
    broadcastStateUpdate()
  })
}

async function handleOpenSeriesTab() {
  await openSeriesTab()
  return { success: true }
}

async function openSeriesTab() {
  const url = chrome.runtime.getURL('src/tab/index.html')
  const existingTabs = await tabService.query({ url })

  if (existingTabs.length > 0) {
    await tabService.update(existingTabs[0].id, { active: true })
  } else {
    await tabService.create(url)
  }
}

async function handlePlaylistSearch(payload) {
  if (!payload || typeof payload.query !== 'string' || !payload.query.trim()) {
    return { success: false, playlists: [], channels: [] }
  }

  const results = await youTubeApiService.search(payload.query.trim())
  return { success: true, ...results }
}

async function handleFetchChannelPlaylists(payload) {
  if (!payload || typeof payload.channelId !== 'string' || !payload.channelId.trim()) {
    return { success: false, playlists: [] }
  }

  const playlists = await youTubeApiService.fetchChannelPlaylists(
    payload.channelId.trim(),
    typeof payload.excludePlaylistId === 'string' ? payload.excludePlaylistId : undefined
  )

  return { success: true, playlists }
}

async function handleSetIconTheme(payload) {
  if (!payload || payload.suffix === undefined) {
    return { success: false }
  }

  const sizes = { 16: 'icon16', 48: 'icon48', 128: 'icon128' }
  const path = {}
  for (const [size, name] of Object.entries(sizes)) {
    path[size] = `icons/${name}${payload.suffix}.png`
  }

  try {
    await chrome.action.setIcon({ path })
    return { success: true }
  } catch (err) {
    logger.warn('Failed to set toolbar icon:', err)
    return { success: false }
  }
}

async function init() {
  await store.loadFromStorage(storageService)

  await reverifyLicense()

  if (!API.WORKER_BASE) {
    let keyLoaded = false
    try {
      const url = chrome.runtime.getURL('src/shared/config.js')
      const resp = await fetch(url)
      const text = await resp.text()
      const match = text.match(/YT_API_KEY\s*=\s*['"]([^'"]+)['"]/)
      if (match && match[1]) {
        youTubeApiService.setApiKey(match[1])
        keyLoaded = true
        logger.info('API key loaded from config.js')
      }
    } catch (e) {
      logger.warn('Config fetch failed:', e.message)
    }

    if (!keyLoaded) {
      const settings = store.getSettings()
      if (settings.apiKey) {
        youTubeApiService.setApiKey(settings.apiKey)
        logger.info('API key loaded from settings')
      }
    }
  } else {
    logger.info('Using Cloudflare Worker proxy, API key not needed in extension')
  }

  if (store.isPro() && store.getSettings().autoRefresh) {
    try {
      await alarmService.create('autoRefresh', AUTO_REFRESH_INTERVAL_MINUTES)
    } catch (err) {
      logger.warn('Failed to create alarm:', err)
    }
  }

  try {
    await alarmService.create('licenseHeartbeat', 1440)
  } catch (err) {
    logger.warn('Failed to create license heartbeat alarm:', err)
  }

  await initSync(store, storageService, youTubeApiService, syncOnStateChanged)

  logger.info('Background initialized')
}

chrome.runtime.onInstalled.addListener(() => ensureInit())
chrome.runtime.onStartup.addListener(() => ensureInit())

chrome.action.onClicked.addListener(async () => {
  await ensureInit()
  openSeriesTab()
})

chrome.runtime.onSuspend.addListener(() => {
  logger.info('Background script suspending')
})

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type !== EVENTS.ACTIVATE_LICENSE) {
    sendResponse({ success: false, error: 'UNKNOWN_TYPE' })
    return
  }

  if (!message.key || typeof message.key !== 'string' || !message.key.trim()) {
    sendResponse({ success: false, error: 'MISSING_KEY' })
    return
  }

  ensureInit().then(async () => {
    const rateCheck = await licenseRateLimiter.check()
    if (!rateCheck.allowed) {
      return { success: false, error: 'RATE_LIMITED', message: `Too many attempts. Retry in ${Math.ceil(rateCheck.retryAfter / 1000)}s` }
    }
    const result = await licenseService.verify(message.key.trim())
    if (result.valid) {
      await licenseRateLimiter.reset()
      store.setLicense({ key: message.key, isPro: true, verifiedAt: Date.now() })
      await store.saveToStorage(storageService)
      broadcastStateUpdate()
      return { success: true, valid: true }
    }
    await licenseRateLimiter.recordFailure()
    return { success: true, valid: false }
  }).then(r => sendResponse(r)).catch(async (err) => {
    await licenseRateLimiter.recordFailure()
    sendResponse({ success: false, error: 'VERIFY_FAILED', message: err.message })
  })
  return true
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    if (message._broadcast) return
    sendResponse({ success: false, error: 'FORBIDDEN', message: 'Message from unknown sender rejected' })
    return
  }

  if (message._broadcast) return

  ensureInit()
    .then(() => handleMessage(message, sender))
    .then(result => sendResponse(result))
    .catch(err => {
      logger.error('Message handler error:', message.type, err)
      sendResponse({ success: false, error: err.code || 'UNKNOWN_ERROR', message: err.message || 'Unknown error' })
    })
  return true
})

alarmService.onAlarm(async (alarm) => {
  await ensureInit()
  if (alarm.name === 'autoRefresh') {
    await autoRefresh()
  } else if (alarm.name === 'licenseHeartbeat') {
    await reverifyLicense()
  }
})

notificationService.onClick(async (notificationId) => {
  await ensureInit()
  const playlistId = notificationId.replace('new_episodes_', '')
  const series = store.getSeriesById(playlistId)
  if (series) {
    await tabService.create(chrome.runtime.getURL(`src/tab/index.html?series=${playlistId}`))
  }
})

async function handleMessage(message) {
  switch (message.type) {
    case EVENTS.EPISODE_PROGRESS:
      if (!message.payload || typeof message.payload.videoId !== 'string' || !message.payload.videoId.trim()) {
        return { success: false, error: 'MISSING_PARAMS', message: 'videoId is required' }
      }

      let playlistId = message.payload.playlistId
      if (!playlistId || typeof playlistId !== 'string' || !playlistId.trim()) {
        playlistId = store.findPlaylistByVideoId(message.payload.videoId)
        if (!playlistId) {
          return { success: false, error: 'VIDEO_NOT_FOUND', message: 'No series contains this video' }
        }
      }

      store.updateEpisodeProgress(
        playlistId,
        message.payload.videoId,
        typeof message.payload.progress === 'number' ? message.payload.progress : 0,
        typeof message.payload.currentTime === 'number' ? message.payload.currentTime : 0,
        typeof message.payload.duration === 'number' ? message.payload.duration : 0
      )
      await store.saveToStorage(storageService)
      await notifySeriesSync(playlistId)
      broadcastStateUpdate()
      return { success: true }

    case EVENTS.GET_NEXT_EPISODE:
      if (!message.payload || typeof message.payload.videoId !== 'string' || !message.payload.videoId.trim() || typeof message.payload.playlistId !== 'string' || !message.payload.playlistId.trim()) {
        return { success: false, error: 'MISSING_PARAMS', message: 'videoId and playlistId are required' }
      }
      const nextEpisode = store.getNextEpisode(message.payload.playlistId, message.payload.videoId)
      return { success: true, nextEpisode }

    case EVENTS.PLAYLIST_EXISTS:
      if (!message.payload || typeof message.payload.playlistId !== 'string' || !message.payload.playlistId.trim()) {
        return { success: false, error: 'MISSING_PARAMS', message: 'playlistId is required' }
      }
      const exists = store.playlistExists(message.payload.playlistId)
      return { success: true, exists }

    case EVENTS.STATE_GET:
      return { success: true, state: store.getState(), syncStatus: getSyncStatus() }

    case EVENTS.SYNC_LOGIN:
      return handleSyncLogin()

    case EVENTS.SYNC_LOGOUT:
      return handleSyncLogout()

    case EVENTS.SYNC_STATUS:
      return { success: true, syncStatus: getSyncStatus() }

    case EVENTS.SYNC_NOW:
      return handleSyncNow()

    case EVENTS.PLAYLIST_ADD:
      return handlePlaylistAdd(message.payload)

    case EVENTS.SERIES_DELETE:
      return handleSeriesDelete(message.payload)

    case EVENTS.SERIES_COMPLETE_TOGGLE:
      return handleSeriesCompleteToggle(message.payload)

    case EVENTS.SERIES_REFRESH:
      return handleSeriesRefresh(message.payload)

    case EVENTS.EPISODE_WATCH:
      return handleEpisodeWatch(message.payload)

    case EVENTS.SETTINGS_UPDATE:
      return handleSettingsUpdate(message.payload)

    case EVENTS.LICENSE_VERIFY:
      return handleLicenseVerify(message.payload)

    case EVENTS.STORAGE_RESET:
      return handleStorageReset()

    case EVENTS.OPEN_SERIES_TAB:
      return handleOpenSeriesTab()

    case EVENTS.PLAYLIST_SEARCH:
      return handlePlaylistSearch(message.payload)

    case EVENTS.FETCH_CHANNEL_PLAYLISTS:
      return handleFetchChannelPlaylists(message.payload)

    case EVENTS.SET_ICON_THEME:
      return handleSetIconTheme(message.payload)

    default:
      logger.warn('Unknown message type:', message.type)
      return { success: false, error: 'UNKNOWN_TYPE', message: `Unknown message type: ${message.type}` }
  }
}

async function handlePlaylistAdd(payload) {
  if (!payload || typeof payload.url !== 'string' || !payload.url.trim()) {
    return { success: false, error: 'MISSING_URL', message: 'Playlist URL is required' }
  }

  if (!store.canAddSeries()) {
    return { success: false, error: 'LIMIT_REACHED', message: 'Free limit reached. Upgrade to Pro for unlimited series.' }
  }

  const data = await youTubeApiService.fetchPlaylist(payload.url.trim())
  store.addSeries(data)
  await store.saveToStorage(storageService)
  await notifySeriesSync(data.playlistId)
  broadcastStateUpdate()

  return { success: true, series: store.getSeriesById(data.playlistId) }
}

async function handleSeriesDelete(payload) {
  if (!payload || typeof payload.playlistId !== 'string' || !payload.playlistId.trim()) {
    return { success: false, error: 'MISSING_ID', message: 'Playlist ID is required' }
  }

  const { playlistId } = payload
  store.deleteSeries(playlistId)
  await store.saveToStorage(storageService)
  await afterSeriesDelete(playlistId)
  broadcastStateUpdate()

  return { success: true }
}

async function handleSeriesCompleteToggle(payload) {
  if (!payload || typeof payload.playlistId !== 'string' || !payload.playlistId.trim()) {
    return { success: false, error: 'MISSING_ID', message: 'Playlist ID is required' }
  }
  store.toggleSeriesComplete(payload.playlistId)
  await store.saveToStorage(storageService)
  await notifySeriesSync(payload.playlistId)
  broadcastStateUpdate()
  return { success: true, state: store.getState() }
}

async function handleSeriesRefresh(payload) {
  if (!payload || typeof payload.playlistId !== 'string' || !payload.playlistId.trim()) {
    return { success: false, error: 'MISSING_ID', message: 'Playlist ID is required' }
  }

  const data = await youTubeApiService.refreshPlaylist(payload.playlistId.trim())
  store.addSeries(data)
  await store.saveToStorage(storageService)
  await notifySeriesSync(data.playlistId)
  broadcastStateUpdate()

  const refreshed = store.getSeriesById(data.playlistId)
  return { success: true, series: refreshed }
}

async function handleEpisodeWatch(payload) {
  if (!payload || typeof payload.videoId !== 'string' || !payload.videoId.trim()) {
    return { success: false, error: 'MISSING_PARAMS', message: 'videoId is required' }
  }

  let { playlistId, videoId } = payload

  if (!playlistId || typeof playlistId !== 'string' || !playlistId.trim()) {
    playlistId = store.findPlaylistByVideoId(videoId)
    if (!playlistId) {
      return { success: false, error: 'VIDEO_NOT_FOUND', message: 'No series contains this video' }
    }
  }

  const series = store.getSeriesById(playlistId)
  if (!series) {
    if (!store.canAddSeries()) {
      return { success: false, error: 'SERIES_NOT_FOUND', message: 'Upgrade to Pro to add this series and track episodes.' }
    }
    return { success: false, error: 'SERIES_NOT_FOUND', message: 'Series not saved. Add it first.' }
  }

  store.markEpisodeWatched(playlistId, videoId)
  await store.saveToStorage(storageService)
  await notifySeriesSync(playlistId)
  broadcastStateUpdate()

  return { success: true, state: store.getState() }
}

async function handleSyncLogin() {
  try {
    await syncLogin(store, storageService, youTubeApiService, syncOnStateChanged)
    return { success: true, syncStatus: getSyncStatus() }
  } catch (err) {
    return {
      success: false,
      error: err.code || 'SYNC_LOGIN_FAILED',
      message: err.message || 'Cloud sync login failed',
      syncStatus: getSyncStatus()
    }
  }
}

async function handleSyncLogout() {
  await syncLogout()
  broadcastStateUpdate()
  return { success: true, syncStatus: getSyncStatus() }
}

async function handleSyncNow() {
  try {
    await manualSync(store, storageService, youTubeApiService, syncOnStateChanged)
    return { success: true, syncStatus: getSyncStatus() }
  } catch (err) {
    return {
      success: false,
      error: err.code || 'SYNC_FAILED',
      message: err.message || 'Sync failed',
      syncStatus: getSyncStatus()
    }
  }
}

async function handleSettingsUpdate(payload) {
  if (!payload) {
    return { success: false, error: 'MISSING_PARAMS', message: 'Settings payload is required' }
  }

  const oldSettings = store.getSettings()
  store.updateSettings(payload)
  await store.saveToStorage(storageService)

  if (store.isPro() && payload.autoRefresh && !oldSettings.autoRefresh) {
    await alarmService.create('autoRefresh', AUTO_REFRESH_INTERVAL_MINUTES)
  } else if (payload.autoRefresh === false && oldSettings.autoRefresh) {
    await alarmService.clear('autoRefresh')
  }

  broadcastStateUpdate()
  return { success: true, settings: store.getSettings() }
}

async function handleLicenseVerify(payload) {
  if (!payload || typeof payload.key !== 'string' || !payload.key.trim()) {
    return { success: false, error: 'MISSING_KEY', message: 'License key is required' }
  }

  const rateCheck = await licenseRateLimiter.check()
  if (!rateCheck.allowed) {
    return { success: false, error: 'RATE_LIMITED', message: `Too many attempts. Retry in ${Math.ceil(rateCheck.retryAfter / 1000)}s` }
  }

  const result = await licenseService.verify(payload.key.trim())

  if (result.valid) {
    await licenseRateLimiter.reset()
    store.setLicense({ key: payload.key, isPro: true, verifiedAt: Date.now() })
    await store.saveToStorage(storageService)
    broadcastStateUpdate()
  } else {
    await licenseRateLimiter.recordFailure()
    store.setLicense({ key: null, isPro: false, verifiedAt: null })
    await store.saveToStorage(storageService)
    try { await alarmService.clear('autoRefresh') } catch (_) {}
    broadcastStateUpdate()
  }

  return { success: true, valid: result.valid, reason: result.reason }
}

async function handleStorageReset() {
  try {
    await syncOnStorageReset()
    await Promise.all([
      storageService.remove([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.LICENSE]),
      storageService.removeLocal([STORAGE_KEYS.SERIES])
    ])
    store._state = {
      series: {},
      settings: { theme: 'classic-red', autoRefresh: false, lastRefreshCheck: 0 },
      license: { key: null, isPro: false, verifiedAt: null }
    }
    broadcastStateUpdate()
    return { success: true, syncStatus: getSyncStatus() }
  } catch (err) {
    logger.error('handleStorageReset failed:', err)
    return { success: false, message: 'Failed to reset storage' }
  }
}

async function autoRefresh() {
  await reverifyLicense()
  if (!store.isPro() || !store.getSettings().autoRefresh) return

  const seriesList = store.getSeries()
  let hasNewEpisodes = false

  for (const [playlistId, series] of Object.entries(seriesList)) {
    try {
      const freshData = await youTubeApiService.refreshPlaylist(playlistId)
      const oldCount = series.videos.length

      store.addSeries(freshData)

      const updated = store.getSeriesById(playlistId)
      if (updated && updated.videos.length > oldCount) {
        hasNewEpisodes = true

        await notificationService.create(`new_episodes_${playlistId}`, {
          type: 'basic',
          title: series.title,
          message: `${updated.videos.length - oldCount} new episode${updated.videos.length - oldCount > 1 ? 's' : ''} available!`,
          iconUrl: 'icons/icon128.png'
        })
      }
    } catch (err) {
      logger.error(`Auto-refresh failed for ${playlistId}:`, err)
    }
  }

  if (hasNewEpisodes) {
    await store.saveToStorage(storageService)
    for (const playlistId of Object.keys(seriesList)) {
      await notifySeriesSync(playlistId)
    }
  }

  store.updateSettings({ lastRefreshCheck: Date.now() })
  await store.saveToStorage(storageService)
}

async function broadcastStateUpdate() {
  if (!chrome.runtime?.sendMessage) return
  const state = store.getState()
  const syncStatus = getSyncStatus()
  try {
    await chrome.runtime.sendMessage({
      type: EVENTS.STATE_UPDATED,
      state,
      syncStatus,
      _broadcast: true
    })
  } catch (e) {
    // no tabs open — ignore
  }
}
