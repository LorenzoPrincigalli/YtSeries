import { EVENTS } from '../shared/events.js'
import { logger } from '../shared/logger.js'
import { AUTO_REFRESH_INTERVAL_MINUTES, API, STORAGE_KEYS, EXTENSION_ID } from '../shared/constants.js'
import { storageService } from '../services/chrome/storage.js'
import { tabService } from '../services/chrome/tabs.js'
import { alarmService } from '../services/chrome/alarms.js'
import { notificationService } from '../services/chrome/notifications.js'
import { youTubeApiService } from '../services/youtube.js'
import { store } from '../state/store.js'
import { normalizeSeriesBackup, normalizeSeries } from '../shared/seriesValidation.js'
import {
  initSync,
  login as syncLogin,
  logout as syncLogout,
  afterSeriesMutation,
  afterSeriesDelete,
  onStorageReset as syncOnStorageReset,
  manualSync,
  retrySync,
  getSyncStatus
} from '../services/sync/syncCoordinator.js'

let initialized = false
let initPromise = null
let commandChain = Promise.resolve()

function runCommand(operation) {
  const result = commandChain.then(operation)
  commandChain = result.catch(() => {})
  return result
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
        } else {
          throw err
        }
      }
    }
    initPromise = null
  })().catch(err => {
    initPromise = null
    throw err
  })
  return initPromise
}

function syncOnStateChanged() {
  broadcastStateUpdate()
}

async function notifySeriesSync(playlistId) {
  await afterSeriesMutation(store, playlistId)
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

let lastSearchTime = 0
const collectionUndo = new Map()

async function handlePlaylistSearch(payload) {
  if (!payload || typeof payload.query !== 'string' || !payload.query.trim()) {
    return { success: false, playlists: [], channels: [] }
  }

  const now = Date.now()
  if (now - lastSearchTime < 3000) {
    return { success: false, error: 'RATE_LIMITED', playlists: [], channels: [] }
  }
  lastSearchTime = now

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
  if (!payload || !['', '_light'].includes(payload.suffix)) {
    return { success: false }
  }

  const sizes = { 16: 'icon16', 48: 'icon48', 128: 'icon128' }
  const path = {}
  for (const [size, name] of Object.entries(sizes)) {
    path[size] = chrome.runtime.getURL(`icons/${name}${payload.suffix}.png`)
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
  // OAuth credentials and library storage need not be readable by content scripts.
  await chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
  await chrome.storage.sync.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
  await store.loadFromStorage(storageService)

  if (!API.WORKER_BASE) {
    const settings = store.getSettings()
    if (settings.apiKey) {
      youTubeApiService.setApiKey(settings.apiKey)
      logger.info('API key loaded from settings')
    } else {
      logger.warn('No API key configured — set a key in settings or configure WORKER_BASE')
    }
  } else {
    logger.info('Using Cloudflare Worker proxy, API key not needed in extension')
  }

  if (store.getSettings().autoRefresh) {
    try {
      if (!await chrome.alarms.get('autoRefresh')) {
        await alarmService.create('autoRefresh', AUTO_REFRESH_INTERVAL_MINUTES)
      }
    } catch (err) {
      logger.warn('Failed to create alarm:', err)
    }
  }

  await initSync(store, storageService, youTubeApiService, syncOnStateChanged)
  if (!await chrome.alarms.get('syncRetry')) {
    await alarmService.create('syncRetry', 1)
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
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    sendResponse({ success: false, error: 'INVALID_MESSAGE' })
    return
  }
  if (sender.id !== chrome.runtime.id) {
    if (message._broadcast) return
    sendResponse({ success: false, error: 'FORBIDDEN', message: 'Message from unknown sender rejected' })
    return
  }

  if (message._broadcast) return

  ensureInit()
    .then(() => {
      const reads = [EVENTS.STATE_GET, EVENTS.SYNC_STATUS, EVENTS.PLAYLIST_EXISTS, EVENTS.GET_NEXT_EPISODE]
      return reads.includes(message.type) ? handleMessage(message) : runCommand(() => handleMessage(message))
    })
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
    await runCommand(autoRefresh)
  } else if (alarm.name === 'syncRetry') {
    await runCommand(() => retrySync(store, storageService, youTubeApiService, syncOnStateChanged))
  }
})

notificationService.onClick(async (notificationId) => {
  await ensureInit()
  if (notificationId === 'new_episodes_summary') {
    const target = Object.values(store.getSeries()).find(series => series.newEpisodesCount > 0 && series.latestNewVideoId)
    if (target) {
      await tabService.create({ url: `https://www.youtube.com/watch?v=${encodeURIComponent(target.latestNewVideoId)}&list=${encodeURIComponent(target.playlistId)}` })
      return
    }
    await openSeriesTab()
    return
  }
  const playlistId = notificationId.replace('new_episodes_', '')
  const series = store.getSeriesById(playlistId)
  if (series) {
    await tabService.create(chrome.runtime.getURL(`src/tab/index.html?series=${encodeURIComponent(playlistId)}`))
  }
})

async function handleMessage(message) {
  switch (message.type) {
    case EVENTS.EPISODE_PROGRESS:
      if (!message.payload || typeof message.payload.videoId !== 'string' || !message.payload.videoId.trim()) {
        return { success: false, error: 'MISSING_PARAMS', message: 'videoId is required' }
      }

      if (![message.payload.progress, message.payload.currentTime, message.payload.duration]
        .every(value => value === undefined || (Number.isFinite(value) && value >= 0))) {
        return { success: false, error: 'INVALID_PROGRESS' }
      }

      const progressTarget = store.resolvePlaylistForVideo(message.payload.videoId, message.payload.playlistId)
      if (!progressTarget) {
        return { success: false, error: 'VIDEO_NOT_FOUND', message: 'No series contains this video' }
      }
      const { playlistId } = progressTarget
      store.updateEpisodeProgress(
        playlistId,
        progressTarget.videoId,
        typeof message.payload.progress === 'number' ? message.payload.progress : 0,
        typeof message.payload.currentTime === 'number' ? message.payload.currentTime : 0,
        typeof message.payload.duration === 'number' ? message.payload.duration : 0
      )
      await notifySeriesSync(playlistId)
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
      return handleSyncLogin(message.payload)

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

    case EVENTS.SERIES_RESTORE:
      return handleSeriesRestore(message.payload)

    case EVENTS.SERIES_COMPLETE_TOGGLE:
      return handleSeriesCompleteToggle(message.payload)

    case EVENTS.SERIES_COLLECTION_SET:
      return handleSeriesCollectionSet(message.payload)

    case EVENTS.COLLECTION_EDIT:
    case EVENTS.COLLECTION_MOVE: {
      const p = message.payload || {}
      const before = store.getSeries()
      const ids = message.type === EVENTS.COLLECTION_EDIT
        ? store.editCollection(p.name, p.nextName, p.cover)
        : store.moveCollectionSeries(p.ids, p.destination)
      let undoToken = null
      if (message.type === EVENTS.COLLECTION_MOVE && ids.length) {
        undoToken = crypto.randomUUID()
        for (const [key, value] of collectionUndo) if (value.expires < Date.now()) collectionUndo.delete(key)
        collectionUndo.set(undoToken, { expires: Date.now() + 60_000, entries: ids.map(id => ({ id, collection: before[id].collection || '', cover: before[id].collectionCover || '', destination: store.getSeriesById(id).collection || '', afterAt: store.getSeriesById(id).collectionUpdatedAt })) })
      }
      if (ids.length || message.type === EVENTS.COLLECTION_EDIT) await store.saveToStorage(storageService)
      for (const id of ids) await notifySeriesSync(id)
      broadcastStateUpdate()
      return { success: true, state: store.getState(), moved: ids.length, skipped: message.type === EVENTS.COLLECTION_MOVE ? new Set(p.ids).size - ids.length : 0, undoToken }
    }

    case EVENTS.COLLECTION_DELETE: {
      const ids = store.deleteCollection(message.payload?.name)
      await store.saveToStorage(storageService)
      for (const id of ids) await notifySeriesSync(id)
      broadcastStateUpdate()
      return { success: true, state: store.getState() }
    }

    case EVENTS.COLLECTION_UNDO: {
      const token = message.payload?.token
      const operation = collectionUndo.get(token)
      if (!operation || operation.expires < Date.now()) return { success: false, error: 'UNDO_EXPIRED' }
      const ids = store.undoCollectionMove(operation.entries)
      await store.saveToStorage(storageService)
      collectionUndo.delete(token)
      for (const id of ids) await notifySeriesSync(id)
      broadcastStateUpdate()
      return { success: true, state: store.getState(), restored: ids.length, skipped: operation.entries.length - ids.length }
    }

    case EVENTS.COLLECTION_CREATE: {
      const ids = message.payload?.ids ?? []
      store.createCollection(message.payload?.name, ids)
      await store.saveToStorage(storageService)
      for (const id of new Set(ids)) await notifySeriesSync(id)
      broadcastStateUpdate()
      return { success: true, state: store.getState() }
    }

    case EVENTS.ACTIVITY_MARK_READ: {
      const activityReadAt = store.markActivityRead(message.payload?.through)
      await store.saveToStorage(storageService)
      broadcastStateUpdate()
      return { success: true, activityReadAt }
    }

    case EVENTS.SERIES_REFRESH:
      return handleSeriesRefresh(message.payload)

    case EVENTS.EPISODE_WATCH:
      return handleEpisodeWatch(message.payload)

    case EVENTS.EPISODE_UNWATCH:
      return handleEpisodeUnwatch(message.payload)

    case EVENTS.SETTINGS_UPDATE:
      return handleSettingsUpdate(message.payload)

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

    case EVENTS.RELOAD_STATE:
      await store.loadFromStorage(storageService)
      broadcastStateUpdate()
      return { success: true, state: store.getState() }

    case EVENTS.LOAD_DEMO_DATA:
      return handleLoadDemoData()

    case EVENTS.IMPORT_SERIES:
      return handleImportSeries(message.payload)

    case EVENTS.BACKUP_LIST:
      return handleBackupList()

    case EVENTS.BACKUP_RESTORE:
      return handleBackupRestore(message.payload)

    default:
      logger.warn('Unknown message type:', message.type)
      return { success: false, error: 'UNKNOWN_TYPE', message: `Unknown message type: ${message.type}` }
  }
}

async function handlePlaylistAdd(payload) {
  if (!payload || typeof payload.url !== 'string' || !payload.url.trim()) {
    return { success: false, error: 'MISSING_URL', message: 'Playlist URL is required' }
  }

  const data = await youTubeApiService.fetchPlaylist(payload.url.trim())
  store.addSeries(data)
  store.recordActivity('series_added', { playlistId: data.playlistId, title: data.title })
  await store.saveToStorage(storageService)
  await notifySeriesSync(data.playlistId)
  broadcastStateUpdate()

  return { success: true, series: store.getSeriesById(data.playlistId) }
}

async function createAutomaticBackup(reason) {
  const snapshot = store.getSeries()
  if (!Object.keys(snapshot).length) return null
  const data = await storageService.getLocal([STORAGE_KEYS.BACKUPS])
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const backup = { id, reason, at: Date.now(), series: snapshot }
  const existing = Array.isArray(data[STORAGE_KEYS.BACKUPS]) ? data[STORAGE_KEYS.BACKUPS] : []
  await storageService.setLocal({ [STORAGE_KEYS.BACKUPS]: [backup, ...existing].slice(0, 5) })
  return backup.id
}

async function handleBackupList() {
  const data = await storageService.getLocal([STORAGE_KEYS.BACKUPS])
  const backups = Array.isArray(data[STORAGE_KEYS.BACKUPS]) ? data[STORAGE_KEYS.BACKUPS] : []
  return { success: true, backups: backups.map(({ id, reason, at, series }) => ({ id, reason, at, seriesCount: Object.keys(series || {}).length })) }
}

async function handleBackupRestore(payload) {
  if (!payload || typeof payload.id !== 'string') return { success: false, error: 'MISSING_ID' }
  const data = await storageService.getLocal([STORAGE_KEYS.BACKUPS])
  const backup = (data[STORAGE_KEYS.BACKUPS] || []).find(item => item?.id === payload.id)
  if (!backup?.series) return { success: false, error: 'BACKUP_NOT_FOUND' }
  const restored = normalizeSeriesBackup(backup.series)
  const previousIds = new Set(Object.keys(store.getSeries()))
  await createAutomaticBackup('before_restore')
  store.replaceSeries(restored)
  await store.saveToStorage(storageService)
  for (const playlistId of previousIds) if (!restored[playlistId]) await afterSeriesDelete(playlistId)
  for (const playlistId of Object.keys(restored)) await notifySeriesSync(playlistId)
  store.recordActivity('backup_restored', { title: String(Object.keys(restored).length) })
  await store.saveToStorage(storageService)
  broadcastStateUpdate()
  return { success: true, state: store.getState() }
}

async function handleSeriesDelete(payload) {
  if (!payload || typeof payload.playlistId !== 'string' || !payload.playlistId.trim()) {
    return { success: false, error: 'MISSING_ID', message: 'Playlist ID is required' }
  }

  const { playlistId } = payload
  const deleted = store.getSeriesById(playlistId)
  if (deleted) await createAutomaticBackup('before_delete')
  store.deleteSeries(playlistId)
  if (deleted) store.recordActivity('series_deleted', { playlistId, title: deleted.title })
  await store.saveToStorage(storageService)
  await afterSeriesDelete(playlistId)
  broadcastStateUpdate()

  return { success: true, deletedSeries: deleted }
}

async function handleSeriesRestore(payload) {
  const restored = normalizeSeriesBackup(payload?.series?.playlistId ? { [payload.series.playlistId]: payload.series } : null)
  const series = Object.values(restored)[0]
  if (!series) return { success: false, error: 'INVALID_SERIES' }
  store.importSeries(series)
  store.recordActivity('series_restored', { playlistId: series.playlistId, title: series.title })
  await store.saveToStorage(storageService)
  await notifySeriesSync(series.playlistId)
  broadcastStateUpdate()
  return { success: true, state: store.getState() }
}

async function handleSeriesCompleteToggle(payload) {
  if (!payload || typeof payload.playlistId !== 'string' || !payload.playlistId.trim()) {
    return { success: false, error: 'MISSING_ID', message: 'Playlist ID is required' }
  }
  store.toggleSeriesComplete(payload.playlistId)
  const completed = store.getSeriesById(payload.playlistId)
  if (completed) store.recordActivity(completed.completed ? 'series_completed' : 'series_reopened', { playlistId: completed.playlistId, title: completed.title })
  await store.saveToStorage(storageService)
  await notifySeriesSync(payload.playlistId)
  broadcastStateUpdate()
  return { success: true, state: store.getState() }
}

async function handleSeriesCollectionSet(payload) {
  if (!payload || typeof payload.playlistId !== 'string' || typeof payload.collection !== 'string') {
    return { success: false, error: 'MISSING_PARAMS' }
  }
  const collection = payload.collection.trim().slice(0, 40)
  const existing = store.getSeriesById(payload.playlistId)
  if (existing && (existing.collection || '') === collection) return { success: true, state: store.getState(), skipped: 1 }
  if (!store.setSeriesCollection(payload.playlistId, collection)) {
    return { success: false, error: 'SERIES_NOT_FOUND' }
  }
  store.recordActivity('collection_changed', { playlistId: payload.playlistId, title: collection })
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

  const watchTarget = store.resolvePlaylistForVideo(payload.videoId, payload.playlistId)
  if (!watchTarget) {
    return { success: false, error: 'VIDEO_NOT_FOUND', message: 'No series contains this video' }
  }
  const { playlistId, videoId } = watchTarget

  const series = store.getSeriesById(playlistId)
  if (!series) {
    return { success: false, error: 'SERIES_NOT_FOUND', message: 'Series not saved. Add it first.' }
  }

  store.markEpisodeWatched(playlistId, videoId)
  store.recordActivity('episode_watched', { playlistId, videoId })
  await store.saveToStorage(storageService)
  await notifySeriesSync(playlistId)
  broadcastStateUpdate()

  return { success: true, state: store.getState() }
}

async function handleEpisodeUnwatch(payload) {
  if (!payload || typeof payload.videoId !== 'string' || !payload.videoId.trim()) {
    return { success: false, error: 'MISSING_PARAMS', message: 'videoId is required' }
  }

  const unwatchTarget = store.resolvePlaylistForVideo(payload.videoId, payload.playlistId)
  if (!unwatchTarget) {
    return { success: false, error: 'VIDEO_NOT_FOUND', message: 'No series contains this video' }
  }
  const { playlistId, videoId } = unwatchTarget

  const series = store.getSeriesById(playlistId)
  if (!series) {
    return { success: false, error: 'SERIES_NOT_FOUND', message: 'Series not found.' }
  }

  store.markEpisodeUnwatched(playlistId, videoId)
  store.recordActivity('episode_unwatched', { playlistId, videoId })
  await store.saveToStorage(storageService)
  await notifySeriesSync(playlistId)
  broadcastStateUpdate()

  return { success: true, state: store.getState() }
}

async function handleSyncLogin(payload) {
  try {
    await syncLogin(store, storageService, youTubeApiService, syncOnStateChanged, {
      allowAccountChange: payload?.allowAccountChange === true
    })
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
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { success: false, error: 'MISSING_PARAMS', message: 'Settings payload is required' }
  }

  const allowed = ['theme', 'language', 'autoRefresh', 'nextEpisodeOverlay', 'apiKey']
  const sanitized = {}
  for (const k of allowed) {
    if (k in payload) sanitized[k] = payload[k]
  }
  if ('apiKey' in sanitized && typeof sanitized.apiKey !== 'string') {
    delete sanitized.apiKey
  }
  if ('autoRefresh' in sanitized) {
    sanitized.autoRefresh = Boolean(sanitized.autoRefresh)
  }
  if ('nextEpisodeOverlay' in sanitized) {
    sanitized.nextEpisodeOverlay = Boolean(sanitized.nextEpisodeOverlay)
  }
  if ('theme' in sanitized && !['classic-red', 'ocean-blue', 'forest', 'light'].includes(sanitized.theme)) {
    return { success: false, error: 'INVALID_THEME' }
  }
  if ('language' in sanitized && !['system', 'en', 'it'].includes(sanitized.language)) {
    return { success: false, error: 'INVALID_LANGUAGE' }
  }

  const oldSettings = store.getSettings()
  store.updateSettings(sanitized)
  try {
    await store.saveToStorage(storageService)
  } catch (err) {
    store._state.settings = oldSettings
    throw err
  }
  if ('apiKey' in sanitized && !API.WORKER_BASE) youTubeApiService.setApiKey(sanitized.apiKey)

  if (sanitized.autoRefresh && !oldSettings.autoRefresh) {
    await alarmService.create('autoRefresh', AUTO_REFRESH_INTERVAL_MINUTES)
  } else if (sanitized.autoRefresh === false && oldSettings.autoRefresh) {
    await alarmService.clear('autoRefresh')
  }

  broadcastStateUpdate()
  return { success: true, settings: store.getSettings() }
}

async function handleStorageReset() {
  try {
    await createAutomaticBackup('before_reset')
    await syncOnStorageReset()
    await Promise.all([
      storageService.remove([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.LICENSE]),
      storageService.removeLocal([STORAGE_KEYS.SERIES, STORAGE_KEYS.ACTIVITY, STORAGE_KEYS.ACTIVITY_READ_AT, STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.COLLECTION_RECORDS])
    ])
    store.reset()
    await store.saveToStorage(storageService)
    if (store.getSettings().autoRefresh) {
      await alarmService.create('autoRefresh', AUTO_REFRESH_INTERVAL_MINUTES)
    } else {
      await alarmService.clear('autoRefresh')
    }
    broadcastStateUpdate()
    return { success: true, syncStatus: getSyncStatus() }
  } catch (err) {
    logger.error('handleStorageReset failed:', err)
    return { success: false, message: err.message || 'Failed to reset storage' }
  }
}

async function autoRefresh() {
  if (!store.getSettings().autoRefresh) return

  const seriesList = store.getSeries()
  const newEpisodes = []

  for (const [playlistId, series] of Object.entries(seriesList)) {
    try {
      const freshData = await youTubeApiService.refreshPlaylist(playlistId)
      const oldCount = series.videos.length

      const { newVideoIds } = store.addSeries(freshData)

      const updated = store.getSeriesById(playlistId)
      if (updated && updated.videos.length > oldCount) {
        newEpisodes.push({ playlistId, title: updated.title, count: newVideoIds.length, videoId: newVideoIds[0] })
      }
    } catch (err) {
      logger.error(`Auto-refresh failed for ${playlistId}:`, err)
    }
  }

  if (newEpisodes.length) {
    const total = newEpisodes.reduce((sum, update) => sum + update.count, 0)
    const first = newEpisodes[0]
    const suffix = newEpisodes.length > 1 ? ` First: ${first.title}` : first.title
    try {
      await notificationService.create('new_episodes_summary', {
        type: 'basic',
        title: `${total} new episode${total === 1 ? '' : 's'} in ${newEpisodes.length} series`,
        message: `Open the next new episode from ${suffix}`,
        iconUrl: 'icons/icon128.png'
      })
    } catch (err) {
      logger.warn('Could not create new-episode summary:', err)
    }
    await store.saveToStorage(storageService)
    for (const { playlistId } of newEpisodes) {
      await notifySeriesSync(playlistId)
    }
  }

  store.updateSettings({ lastRefreshCheck: Date.now() })
  await store.saveToStorage(storageService)
  broadcastStateUpdate()
}

// Demo data generator — used by LOAD_DEMO_DATA handler
function generateMockSeries() {
  const now = Date.now();
  const DAY = 86400000;

  function vid(id, title, daysAgo, pos, secs, watched = false) {
    return {
      id, title, description: title,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: new Date(now - daysAgo * DAY).toISOString(),
      position: pos, duration: secs, watched,
      progress: watched ? 100 : 0
    };
  }

  function srs(plId, title, chId, chTitle, thumbId, videos, opts = {}) {
    return {
      playlistId: plId, title, description: title,
      thumbnail: `https://i.ytimg.com/vi/${thumbId}/hqdefault.jpg`,
      channelId: chId, channelTitle: chTitle,
      videoCount: videos.length, videos,
      completed: opts.completed || false,
      lastWatchedAt: opts.lastWatchedAt || null,
      addedAt: now - (opts.addedDaysAgo || 0) * DAY,
      channelPlaylists: []
    };
  }

  const SERIES = [
  // 1 — VIRAL HITS
  srs('PLYtSeriesDemo01', 'Viral Hits', 'UCpDJl2EmP7Oh90FvG2RAw', 'Viral Vibes', 'dQw4w9WgXcQ', [
    vid('dQw4w9WgXcQ', 'Rick Astley — Never Gonna Give You Up', 10, 1, 212, false),
    vid('jNQXAC9IVRw', 'Me at the zoo', 14, 2, 18, false),
    vid('9bZkp7q19f0', 'PSY — Gangnam Style', 7, 3, 252, false),
    vid('XqZsoesa55w', 'Baby Shark Dance', 3, 4, 136, true),
    vid('kJQP7kiw5Fk', 'Luis Fonsi — Despacito', 5, 5, 282, false),
  ], { addedDaysAgo: 30 }),

  // 2 — GAMING
  srs('PLYtSeriesDemo02', 'Gaming Hub', 'UC4R8DVoMoM8yXPDNAmBKx3A', 'Game Central', 'RgKAFK5djSk', [
    vid('RgKAFK5djSk', 'Wiz Khalifa — See You Again', 20, 1, 229, false),
    vid('JGwWNGJdvx8', 'Ed Sheeran — Shape of You', 45, 2, 253, true),
    vid('fRh_vgS2dFE', 'Justin Bieber — Sorry', 12, 3, 206, false),
    vid('HP-MbfHFUqs', 'Taylor Swift — Shake It Off', 60, 4, 242, false),
    vid('YQHsXMglC9A', 'Adele — Hello', 2, 5, 367, true),
    vid('7wtfhZwyrcc', 'Imagine Dragons — Believer', 90, 6, 204, false),
  ], { addedDaysAgo: 60, lastWatchedAt: now - 2 * DAY }),

  // 3 — SCIENCE & SPACE
  srs('PLYtSeriesDemo03', 'Science & Space', 'UCsXVk37bltHxD1rDPwtNM8Q', 'Science Lab', 'dQw4w9WgXcQ', [
    vid('nfWlot6h_JM', 'Taylor Swift — Shake It Off', 50, 1, 233, true),
    vid('QcIy9NiNbmo', 'Taylor Swift — Bad Blood', 35, 2, 244, false),
    vid('CevxZvSJLk8', 'Katy Perry — Roar', 20, 3, 253, false),
    vid('kXYiU_JCYtU', 'Mark Ronson — Uptown Funk', 10, 4, 271, false),
    vid('pc0mxOXbWIU', 'Taylor Swift — Blank Space', 5, 5, 231, false),
  ], { addedDaysAgo: 80 }),

  // 4 — COOKING SHOW
  srs('PLYtSeriesDemo04', 'Cooking Show', 'UCJFp8uSYCjXOMnkUyb3CQ3Q', 'Tasty Kitchen', 'hT_nvWreIhg', [
    vid('hT_nvWreIhg', 'OneRepublic — Counting Stars', 18, 1, 266, true),
    vid('09R8_2nJtjg', 'Maroon 5 — Sugar', 25, 2, 299, false),
    vid('fKopy74weus', 'Imagine Dragons — Thunder', 8, 3, 195, false),
    vid('OPf0YbXqDm0', 'Mark Ronson — Uptown Funk', 32, 4, 271, false),
    vid('450p7goxZqg', 'John Legend — All of Me', 15, 5, 269, true),
  ], { addedDaysAgo: 45, lastWatchedAt: now - 4 * DAY }),

  // 5 — WORLD TRAVEL
  srs('PLYtSeriesDemo05', 'World Travel', 'UCpVm7bg6pXKo1Pr6k5kxG9A', 'Earth Explorer', 'kffacxfA7G4', [
    vid('kffacxfA7G4', 'Justin Bieber — Baby', 40, 1, 220, true),
    vid('pRpeEdMmmQ0', 'Shakira — Waka Waka', 22, 2, 206, false),
    vid('0KSOMA3QBU0', 'Katy Perry — Dark Horse', 55, 3, 224, false),
    vid('e-ORhEE9VVg', 'Taylor Swift — I Knew You Were Trouble', 12, 4, 232, false),
    vid('2Vv-BfVoq4g', 'Ed Sheeran — Perfect', 30, 5, 263, true),
    vid('IdneKLhsWOQ', 'Silentó — Watch Me', 70, 6, 191, false),
  ], { addedDaysAgo: 120 }),

  // 6 — FITNESS
  srs('PLYtSeriesDemo06', 'Fitness Club', 'UCXgYHB5jpHdXfqjI_h5YJ2w', 'Fit Life', 'nfs8NYg7yQM', [
    vid('nfs8NYg7yQM', 'Fifth Harmony — Work from Home', 5, 1, 207, false),
    vid('dQw4w9WgXcQ', 'Rick Astley — Never Gonna Give You Up', 8, 2, 212, true),
    vid('jNQXAC9IVRw', 'Me at the zoo', 15, 3, 18, false),
    vid('9bZkp7q19f0', 'PSY — Gangnam Style', 3, 4, 252, false),
    vid('kJQP7kiw5Fk', 'Luis Fonsi — Despacito', 10, 5, 282, true),
  ], { addedDaysAgo: 25, lastWatchedAt: now - 1 * DAY }),

  // 7 — MUSIC LAB
  srs('PLYtSeriesDemo07', 'Music Lab', 'UCouPeqI8YrQJcOHa4F7xHPw', 'Beat Lab', '60ItHLz5WEA', [
    vid('60ItHLz5WEA', 'Alan Walker — Faded', 30, 1, 212, true),
    vid('FM7MFYoylVs', 'Martin Garrix — Animals', 20, 2, 180, false),
    vid('p7ZsBPK656s', 'Avicii — Wake Me Up', 40, 3, 247, false),
    vid('RgKAFK5djSk', 'Wiz Khalifa — See You Again', 12, 4, 229, false),
    vid('JGwWNGJdvx8', 'Ed Sheeran — Shape of You', 50, 5, 253, false),
  ], { addedDaysAgo: 90 }),

  // 8 — MOVIE CLUB (completed)
  srs('PLYtSeriesDemo08', 'Movie Club', 'UCeY0GLeQkOZ66Q8hZ6O7HnA', 'Screen Talk', 'HP-MbfHFUqs', [
    vid('HP-MbfHFUqs', 'Taylor Swift — Shake It Off', 60, 1, 242, true),
    vid('YQHsXMglC9A', 'Adele — Hello', 45, 2, 367, true),
    vid('fRh_vgS2dFE', 'Justin Bieber — Sorry', 80, 3, 206, true),
    vid('7wtfhZwyrcc', 'Imagine Dragons — Believer', 100, 4, 204, true),
    vid('CevxZvSJLk8', 'Katy Perry — Roar', 5, 5, 253, true),
  ], { addedDaysAgo: 150, completed: true, lastWatchedAt: now - 100 * DAY }),
]


  return SERIES;
}

async function handleLoadDemoData() {
  if (EXTENSION_ID) {
    return { success: false, error: 'NOT_IN_DEV_MODE' }
  }
  try {
    const mockSeries = generateMockSeries()
    const seriesMap = {}
    for (const s of mockSeries) {
      seriesMap[s.playlistId] = normalizeSeries(s, s.playlistId)
    }
    store.replaceSeries(seriesMap)
    await store.saveToStorage(storageService)
    broadcastStateUpdate()
    return { success: true, count: Object.keys(seriesMap).length }
  } catch (err) {
    logger.error('Failed to load demo data:', err)
    return { success: false, error: err.message }
  }
}

async function handleImportSeries(payload) {
  const seriesList = Object.values(normalizeSeriesBackup(payload?.series))
  const before = store.getState()
  try {
    await createAutomaticBackup('before_import')
    for (const series of seriesList) store.importSeries(series)
    store.recordActivity('library_imported', { title: String(seriesList.length) })
    await store.saveToStorage(storageService)
  } catch (err) {
    store._state = before
    throw err
  }
  for (const series of seriesList) await notifySeriesSync(series.playlistId)
  broadcastStateUpdate()
  return { success: true, imported: seriesList.length }
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
  // runtime.sendMessage does not deliver to content scripts.
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' })
    await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, {
      type: EVENTS.STATE_UPDATED,
      state: { settings: state.settings, series: Object.fromEntries(Object.keys(state.series).map(id => [id, true])) },
      _broadcast: true
    })))
  } catch (_) {}
}
