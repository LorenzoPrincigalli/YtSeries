import { EVENTS } from '../shared/events.js'
import { logger } from '../shared/logger.js'
import { AUTO_REFRESH_INTERVAL_MINUTES, API, STORAGE_KEYS } from '../shared/constants.js'
import { storageService } from '../services/chrome/storage.js'
import { tabService } from '../services/chrome/tabs.js'
import { alarmService } from '../services/chrome/alarms.js'
import { notificationService } from '../services/chrome/notifications.js'
import { youTubeApiService } from '../services/youtube.js'
import { licenseService } from '../services/license.js'
import { store } from '../state/store.js'

let initialized = false
let initPromise = null

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

async function init() {
  await store.loadFromStorage(storageService)

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
    case EVENTS.STATE_GET:
      return { success: true, state: store.getState() }

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

    case EVENTS.EPISODE_PROGRESS:
      return handleEpisodeProgress(message.payload)

    case EVENTS.SETTINGS_UPDATE:
      return handleSettingsUpdate(message.payload)

    case EVENTS.LICENSE_VERIFY:
      return handleLicenseVerify(message.payload)

    case EVENTS.SET_API_KEY:
      return handleSetApiKey(message.payload)

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
  broadcastStateUpdate()

  return { success: true, series: store.getSeriesById(data.playlistId) }
}

async function handleSeriesDelete(payload) {
  if (!payload || typeof payload.playlistId !== 'string' || !payload.playlistId.trim()) {
    return { success: false, error: 'MISSING_ID', message: 'Playlist ID is required' }
  }

  store.deleteSeries(payload.playlistId)
  await store.saveToStorage(storageService)
  broadcastStateUpdate()

  return { success: true }
}

async function handleSeriesCompleteToggle(payload) {
  if (!payload || typeof payload.playlistId !== 'string' || !payload.playlistId.trim()) {
    return { success: false, error: 'MISSING_ID', message: 'Playlist ID is required' }
  }
  store.toggleSeriesComplete(payload.playlistId)
  await store.saveToStorage(storageService)
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

  store.markEpisodeWatched(playlistId, videoId)
  await store.saveToStorage(storageService)
  broadcastStateUpdate()

  return { success: true, state: store.getState() }
}

async function handleEpisodeProgress(payload) {
  if (!payload || typeof payload.playlistId !== 'string' || !payload.playlistId.trim() || typeof payload.videoId !== 'string' || !payload.videoId.trim()) {
    return { success: false, error: 'MISSING_PARAMS', message: 'playlistId and videoId are required' }
  }

  store.updateEpisodeProgress(payload.playlistId, payload.videoId, typeof payload.progress === 'number' ? payload.progress : 0)
  await store.saveToStorage(storageService)
  broadcastStateUpdate()

  return { success: true }
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

  const result = await licenseService.verify(payload.key.trim())

  if (result.valid) {
    store.setLicense({ key: payload.key, isPro: true, verifiedAt: Date.now() })
    await store.saveToStorage(storageService)
    broadcastStateUpdate()
  } else {
    store.setLicense({ key: null, isPro: false, verifiedAt: null })
    await store.saveToStorage(storageService)
    try { await alarmService.clear('autoRefresh') } catch (_) {}
    broadcastStateUpdate()
  }

  return { success: true, valid: result.valid, reason: result.reason }
}

async function handleSetApiKey(payload) {
  if (!payload || typeof payload.key !== 'string' || !payload.key.trim()) {
    return { success: false, error: 'MISSING_KEY', message: 'API key is required' }
  }

  if (API.WORKER_BASE) {
    logger.info('API key ignored — using Cloudflare Worker proxy')
    return { success: true, message: 'Ignored: using Cloudflare Worker proxy' }
  }

  youTubeApiService.setApiKey(payload.key.trim())
  store.setApiKey(payload.key)
  await store.saveToStorage(storageService)
  return { success: true }
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

async function autoRefresh() {
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
  }

  store.updateSettings({ lastRefreshCheck: Date.now() })
  await store.saveToStorage(storageService)
}

async function broadcastStateUpdate() {
  const state = store.getState()
  try {
    chrome.runtime.sendMessage({ type: EVENTS.STATE_UPDATED, state, _broadcast: true })
  } catch (e) {
    // no tabs open — ignore
  }
}

async function handleStorageReset() {
  try {
    await Promise.all([
      storageService.remove([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.LICENSE]),
      storageService.removeLocal([STORAGE_KEYS.SERIES])
    ])
    store._state = {
      series: {},
      settings: { theme: 'classic-red', autoRefresh: false, lastRefreshCheck: 0 },
      license: { key: null, isPro: false, verifiedAt: null }
    }
    return { success: true }
  } catch (err) {
    logger.error('handleStorageReset failed:', err)
    return { success: false, message: 'Failed to reset storage' }
  }
}
