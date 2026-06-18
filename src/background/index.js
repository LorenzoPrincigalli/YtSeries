import { EVENTS } from '../shared/events.js'
import { logger } from '../shared/logger.js'
import { AUTO_REFRESH_INTERVAL_MINUTES, API, STORAGE_KEYS, EXTENSION_ID } from '../shared/constants.js'
import { storageService } from '../services/chrome/storage.js'
import { tabService } from '../services/chrome/tabs.js'
import { alarmService } from '../services/chrome/alarms.js'
import { notificationService } from '../services/chrome/notifications.js'
import { youTubeApiService } from '../services/youtube.js'
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

let lastSearchTime = 0

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
      await alarmService.create('autoRefresh', AUTO_REFRESH_INTERVAL_MINUTES)
    } catch (err) {
      logger.warn('Failed to create alarm:', err)
    }
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
    await tabService.create(chrome.runtime.getURL(`src/tab/index.html?series=${encodeURIComponent(playlistId)}`))
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
    return { success: false, error: 'SERIES_NOT_FOUND', message: 'Series not saved. Add it first.' }
  }

  store.markEpisodeWatched(playlistId, videoId)
  await store.saveToStorage(storageService)
  await notifySeriesSync(playlistId)
  broadcastStateUpdate()

  return { success: true, state: store.getState() }
}

async function handleEpisodeUnwatch(payload) {
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
    return { success: false, error: 'SERIES_NOT_FOUND', message: 'Series not found.' }
  }

  store.markEpisodeUnwatched(playlistId, videoId)
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

  const oldSettings = store.getSettings()
  store.updateSettings(sanitized)
  await store.saveToStorage(storageService)

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
    await syncOnStorageReset()
    await Promise.all([
      storageService.remove([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.LICENSE]),
      storageService.removeLocal([STORAGE_KEYS.SERIES])
    ])
    store._state = {
      series: {},
      settings: { theme: 'classic-red', autoRefresh: true, lastRefreshCheck: 0 },
      license: { isPro: true }
    }
    broadcastStateUpdate()
    return { success: true, syncStatus: getSyncStatus() }
  } catch (err) {
    logger.error('handleStorageReset failed:', err)
    return { success: false, message: 'Failed to reset storage' }
  }
}

async function autoRefresh() {
  if (!store.getSettings().autoRefresh) return

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
  srs('viral_hits', 'Viral Hits', 'UCpDJl2EmP7Oh90FvG2RAw', 'Viral Vibes', 'dQw4w9WgXcQ', [
    vid('dQw4w9WgXcQ', 'Rick Astley — Never Gonna Give You Up', 10, 1, 212, false),
    vid('jNQXAC9IVRw', 'Me at the zoo', 14, 2, 18, false),
    vid('9bZkp7q19f0', 'PSY — Gangnam Style', 7, 3, 252, false),
    vid('XqZsoesa55w', 'Baby Shark Dance', 3, 4, 136, true),
    vid('kJQP7kiw5Fk', 'Luis Fonsi — Despacito', 5, 5, 282, false),
  ], { addedDaysAgo: 30 }),

  // 2 — GAMING
  srs('gaming_hub', 'Gaming Hub', 'UC4R8DVoMoM8yXPDNAmBKx3A', 'Game Central', 'RgKAFK5djSk', [
    vid('RgKAFK5djSk', 'Wiz Khalifa — See You Again', 20, 1, 229, false),
    vid('JGwWNGJdvx8', 'Ed Sheeran — Shape of You', 45, 2, 253, true),
    vid('fRh_vgS2dFE', 'Justin Bieber — Sorry', 12, 3, 206, false),
    vid('HP-MbfHFUqs', 'Taylor Swift — Shake It Off', 60, 4, 242, false),
    vid('YQHsXMglC9A', 'Adele — Hello', 2, 5, 367, true),
    vid('7wtfhZwyrcc', 'Imagine Dragons — Believer', 90, 6, 204, false),
  ], { addedDaysAgo: 60, lastWatchedAt: now - 2 * DAY }),

  // 3 — SCIENCE & SPACE
  srs('science_lab', 'Science & Space', 'UCsXVk37bltHxD1rDPwtNM8Q', 'Science Lab', 'dQw4w9WgXcQ', [
    vid('nfWlot6h_JM', 'Taylor Swift — Shake It Off', 50, 1, 233, true),
    vid('QcIy9NiNbmo', 'Taylor Swift — Bad Blood', 35, 2, 244, false),
    vid('CevxZvSJLk8', 'Katy Perry — Roar', 20, 3, 253, false),
    vid('kXYiU_JCYtU', 'Mark Ronson — Uptown Funk', 10, 4, 271, false),
    vid('pc0mxOXbWIU', 'Taylor Swift — Blank Space', 5, 5, 231, false),
  ], { addedDaysAgo: 80 }),

  // 4 — COOKING SHOW
  srs('cooking_show', 'Cooking Show', 'UCJFp8uSYCjXOMnkUyb3CQ3Q', 'Tasty Kitchen', 'hT_nvWreIhg', [
    vid('hT_nvWreIhg', 'OneRepublic — Counting Stars', 18, 1, 266, true),
    vid('09R8_2nJtjg', 'Maroon 5 — Sugar', 25, 2, 299, false),
    vid('fKopy74weus', 'Imagine Dragons — Thunder', 8, 3, 195, false),
    vid('OPf0YbXqDm0', 'Mark Ronson — Uptown Funk', 32, 4, 271, false),
    vid('450p7goxZqg', 'John Legend — All of Me', 15, 5, 269, true),
  ], { addedDaysAgo: 45, lastWatchedAt: now - 4 * DAY }),

  // 5 — WORLD TRAVEL
  srs('world_travel', 'World Travel', 'UCpVm7bg6pXKo1Pr6k5kxG9A', 'Earth Explorer', 'kffacxfA7G4', [
    vid('kffacxfA7G4', 'Justin Bieber — Baby', 40, 1, 220, true),
    vid('pRpeEdMmmQ0', 'Shakira — Waka Waka', 22, 2, 206, false),
    vid('0KSOMA3QBU0', 'Katy Perry — Dark Horse', 55, 3, 224, false),
    vid('e-ORhEE9VVg', 'Taylor Swift — I Knew You Were Trouble', 12, 4, 232, false),
    vid('2Vv-BfVoq4g', 'Ed Sheeran — Perfect', 30, 5, 263, true),
    vid('IdneKLhsWOQ', 'Silentó — Watch Me', 70, 6, 191, false),
  ], { addedDaysAgo: 120 }),

  // 6 — FITNESS
  srs('fitness_club', 'Fitness Club', 'UCXgYHB5jpHdXfqjI_h5YJ2w', 'Fit Life', 'nfs8NYg7yQM', [
    vid('nfs8NYg7yQM', 'Fifth Harmony — Work from Home', 5, 1, 207, false),
    vid('dQw4w9WgXcQ', 'Rick Astley — Never Gonna Give You Up', 8, 2, 212, true),
    vid('jNQXAC9IVRw', 'Me at the zoo', 15, 3, 18, false),
    vid('9bZkp7q19f0', 'PSY — Gangnam Style', 3, 4, 252, false),
    vid('kJQP7kiw5Fk', 'Luis Fonsi — Despacito', 10, 5, 282, true),
  ], { addedDaysAgo: 25, lastWatchedAt: now - 1 * DAY }),

  // 7 — MUSIC LAB
  srs('music_lab', 'Music Lab', 'UCouPeqI8YrQJcOHa4F7xHPw', 'Beat Lab', '60ItHLz5WEA', [
    vid('60ItHLz5WEA', 'Alan Walker — Faded', 30, 1, 212, true),
    vid('FM7MFYoylVs', 'Martin Garrix — Animals', 20, 2, 180, false),
    vid('p7ZsBPK656s', 'Avicii — Wake Me Up', 40, 3, 247, false),
    vid('RgKAFK5djSk', 'Wiz Khalifa — See You Again', 12, 4, 229, false),
    vid('JGwWNGJdvx8', 'Ed Sheeran — Shape of You', 50, 5, 253, false),
  ], { addedDaysAgo: 90 }),

  // 8 — MOVIE CLUB (completed)
  srs('movie_club', 'Movie Club', 'UCeY0GLeQkOZ66Q8hZ6O7HnA', 'Screen Talk', 'HP-MbfHFUqs', [
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
      seriesMap[s.playlistId] = s
    }
    store._state.series = seriesMap
    await store.saveToStorage(storageService)
    broadcastStateUpdate()
    return { success: true, count: Object.keys(seriesMap).length }
  } catch (err) {
    logger.error('Failed to load demo data:', err)
    return { success: false, error: err.message }
  }
}

async function handleImportSeries(payload) {
  if (!payload || typeof payload.series !== 'object' || !Object.keys(payload.series).length) {
    return { success: false, error: 'INVALID_DATA', message: 'No valid series data to import' }
  }

  let imported = 0
  for (const [playlistId, series] of Object.entries(payload.series)) {
    if (typeof playlistId !== 'string' || !playlistId.trim()) continue
    if (!series || typeof series !== 'object' || !series.videos) continue
    store.addSeries(series)
    await notifySeriesSync(playlistId)
    imported++
  }

  await store.saveToStorage(storageService)
  broadcastStateUpdate()
  return { success: true, imported }
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
