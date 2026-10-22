// Service worker entry point: wiring only. Business logic lives in
// handlers/*, routing and validation in router.js.
import { EVENTS } from '../shared/events.js'
import { logger } from '../shared/logger.js'
import { AUTO_REFRESH_INTERVAL_MINUTES, API, STORAGE_KEYS } from '../shared/constants.js'
import { storageService } from '../services/chrome/storage.js'
import { tabService } from '../services/chrome/tabs.js'
import { alarmService } from '../services/chrome/alarms.js'
import { notificationService } from '../services/chrome/notifications.js'
import { youTubeApiService } from '../services/youtube.js'
import { store } from '../state/store.js'
import * as syncCoordinator from '../services/sync/syncCoordinator.js'
import { createRouter, createCommandQueue } from './router.js'
import { createBroadcaster } from './broadcast.js'
import { autoRefresh } from './autoRefresh.js'
import { seriesRoutes } from './handlers/series.js'
import { episodeRoutes } from './handlers/episodes.js'
import { collectionRoutes } from './handlers/collections.js'
import { settingsRoutes } from './handlers/settings.js'
import { libraryRoutes } from './handlers/library.js'
import { appRoutes, openSeriesTab } from './handlers/app.js'

const log = logger.child('bg')

const broadcast = createBroadcaster({ store, getSyncStatus: syncCoordinator.getSyncStatus })
const onSyncStateChanged = () => { void broadcast() }
const syncArgs = [store, storageService, youTubeApiService, onSyncStateChanged]

/** @type {import('./context.js').BackgroundContext} */
const ctx = {
  store,
  storage: storageService,
  youtube: youTubeApiService,
  tabs: tabService,
  alarms: alarmService,
  notifications: notificationService,
  broadcast,
  sync: {
    afterMutation: playlistId => syncCoordinator.afterSeriesMutation(store, playlistId),
    afterDelete: playlistId => syncCoordinator.afterSeriesDelete(playlistId),
    login: options => syncCoordinator.login(...syncArgs, options),
    logout: () => syncCoordinator.logout(),
    syncNow: () => syncCoordinator.manualSync(...syncArgs),
    retry: () => syncCoordinator.retrySync(...syncArgs),
    onStorageReset: () => syncCoordinator.onStorageReset(),
    status: () => syncCoordinator.getSyncStatus()
  }
}

const runCommand = createCommandQueue()
const dispatch = createRouter({
  ...appRoutes, ...seriesRoutes, ...episodeRoutes, ...collectionRoutes, ...settingsRoutes, ...libraryRoutes
}, runCommand)

const READ_ONLY_BEFORE_INIT = new Set([EVENTS.STATE_GET])

// ── Lifecycle ────────────────────────────────────────────────────────────

let initPromise = null

/**
 * Idempotent, retried initialisation. MV3 suspends the worker when idle, so
 * every entry point awaits this before touching state.
 */
function ensureInit() {
  initPromise ??= (async () => {
    const maxAttempts = 3
    for (let attempt = 1; ; attempt++) {
      try {
        await init()
        return
      } catch (err) {
        log.error(`Init failed (attempt ${attempt}/${maxAttempts})`, err)
        if (attempt >= maxAttempts) throw err
        await new Promise(resolve => setTimeout(resolve, 2 ** attempt * 1000))
      }
    }
  })().catch(err => {
    initPromise = null // allow a later event to try again
    throw err
  })
  return initPromise
}

/** Legacy builds kept a YouTube API key inside synced settings; keep it device-local. */
async function migrateApiKey() {
  const legacy = store.getSettings().apiKey
  if (typeof legacy === 'string' && legacy) {
    await storageService.setLocal({ [STORAGE_KEYS.API_KEY]: legacy })
  }
  if ('apiKey' in store.getSettings()) {
    store.removeSettings(['apiKey'])
    await store.saveToStorage(storageService)
  }
  const data = await storageService.getLocal([STORAGE_KEYS.API_KEY])
  return typeof data[STORAGE_KEYS.API_KEY] === 'string' ? data[STORAGE_KEYS.API_KEY] : ''
}

async function init() {
  // Library and OAuth data must not be readable from content scripts.
  await chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
  await chrome.storage.sync.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
  await store.loadFromStorage(storageService)

  const apiKey = await migrateApiKey()
  if (API.WORKER_BASE) log.info('Using Cloudflare Worker proxy')
  else if (apiKey) youTubeApiService.setApiKey(apiKey)
  else log.warn('No YouTube API key and no WORKER_BASE configured; API calls will fail')

  if (store.getSettings().autoRefresh && !await chrome.alarms.get('autoRefresh')) {
    await alarmService.create('autoRefresh', AUTO_REFRESH_INTERVAL_MINUTES)
  }

  await syncCoordinator.initSync(...syncArgs)
  if (!await chrome.alarms.get('syncRetry')) await alarmService.create('syncRetry', 1)

  log.info('Background initialized')
}

// ── Event wiring ─────────────────────────────────────────────────────────

/** Runs a background-initiated task, logging instead of leaving an unhandled rejection. */
function runTask(name, task) {
  return ensureInit().then(task).catch(err => log.error(`${name} failed`, err))
}

/**
 * Chrome does not inject content scripts into tabs that were already open
 * when the extension is installed, updated or reloaded. Inject the current
 * version there; it takes over from (and cleans up after) the orphaned copy.
 */
async function injectIntoOpenYouTubeTabs() {
  const [script] = chrome.runtime.getManifest().content_scripts || []
  if (!script?.js?.length) return
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' })
  const results = await Promise.allSettled(tabs.map(async tab => {
    const target = { tabId: /** @type {number} */ (tab.id) }
    if (script.css?.length) await chrome.scripting.insertCSS({ target, files: script.css })
    await chrome.scripting.executeScript({ target, files: script.js })
  }))
  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length) log.warn(`Content script not injected into ${failed.length} tab(s)`, failed[0].reason)
}

chrome.runtime.onInstalled.addListener(() => runTask('install init', injectIntoOpenYouTubeTabs))
chrome.runtime.onStartup.addListener(() => runTask('startup init', () => {}))
chrome.action.onClicked.addListener(() => runTask('open dashboard', () => openSeriesTab(ctx)))

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    sendResponse({ success: false, error: 'INVALID_MESSAGE' })
    return
  }
  // Our own STATE_UPDATED broadcasts loop back here; they are not requests.
  if (message._broadcast) return
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: 'FORBIDDEN', message: 'Message from unknown sender rejected' })
    return
  }

  // Extension pages (dashboard, popup) have a chrome-extension:// URL; anything
  // else from our own extension id is the content script on youtube.com.
  const senderContext = sender.url?.startsWith(chrome.runtime.getURL('')) ? 'extension' : 'content'

  ensureInit()
    .then(() => dispatch(message, ctx, senderContext))
    .catch(err => {
      log.error('Initialisation failed while handling', message.type, err)
      const code = READ_ONLY_BEFORE_INIT.has(message.type) ? 'STATE_UNAVAILABLE' : 'INIT_FAILED'
      return { success: false, error: code, message: 'Extension failed to start; reload it from chrome://extensions' }
    })
    .then(sendResponse)
  return true
})

alarmService.onAlarm(alarm => {
  if (alarm.name === 'autoRefresh') return runTask('autoRefresh', () => runCommand(() => autoRefresh(ctx)))
  if (alarm.name === 'syncRetry') return runTask('syncRetry', () => runCommand(() => ctx.sync.retry()))
})

notificationService.onClick(notificationId => runTask('notification click', async () => {
  if (notificationId === 'new_episodes_summary') {
    const target = Object.values(store.getSeries()).find(series => series.newEpisodesCount > 0 && series.latestNewVideoId)
    if (!target) return openSeriesTab(ctx)
    return tabService.create(`https://www.youtube.com/watch?v=${encodeURIComponent(target.latestNewVideoId)}&list=${encodeURIComponent(target.playlistId)}`)
  }
  const playlistId = notificationId.replace(/^new_episodes_/, '')
  if (store.playlistExists(playlistId)) {
    return tabService.create(chrome.runtime.getURL(`src/tab/index.html?series=${encodeURIComponent(playlistId)}`))
  }
}))

export { ensureInit, dispatch, ctx }
