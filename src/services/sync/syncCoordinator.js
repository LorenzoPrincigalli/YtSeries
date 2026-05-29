import { loadFirebaseConfig, isFirebaseConfigured } from './FirebaseConfig.js'
import { firebaseAuthService } from './FirebaseAuthService.js'
import { FirebaseSyncService, seriesLocalUpdatedAt, mergeRemoteIntoSeries } from './FirebaseSyncService.js'
import { SYNC_STORAGE_KEYS } from '../../shared/constants.js'
import { logger } from '../../shared/logger.js'

const firebaseSyncService = new FirebaseSyncService(firebaseAuthService)

let _status = {
  configured: false,
  loggedIn: false,
  email: null,
  lastSyncAt: null,
  lastError: null,
  syncing: false
}

function getSyncStatus() {
  return { ..._status }
}

async function _persistStatus() {
  try {
    await chrome.storage.local.set({ [SYNC_STORAGE_KEYS.STATUS]: _status })
  } catch (_) {}
}

async function _loadStatus() {
  try {
    const data = await chrome.storage.local.get(SYNC_STORAGE_KEYS.STATUS)
    if (data[SYNC_STORAGE_KEYS.STATUS]) {
      _status = { ..._status, ...data[SYNC_STORAGE_KEYS.STATUS] }
    }
  } catch (_) {}
}

function _updateStatus(partial) {
  _status = { ..._status, ...partial, configured: isFirebaseConfigured() }
  _persistStatus()
}

async function initSync(store, storageService, youTubeApiService, onStateChanged) {
  await loadFirebaseConfig()
  await _loadStatus()

  if (!isFirebaseConfigured()) {
    _updateStatus({ configured: false, loggedIn: false, email: null })
    return
  }

  await firebaseAuthService.tryRestoreSession()

  if (firebaseAuthService.isLoggedIn()) {
    _updateStatus({
      configured: true,
      loggedIn: true,
      email: firebaseAuthService.getEmail()
    })
    try {
      await pullAndMerge(store, storageService, youTubeApiService, onStateChanged)
      await firebaseSyncService.processQueue(
        id => store._getSeriesMutable(id),
        () => {}
      )
      _updateStatus({ lastSyncAt: Date.now(), lastError: null })
    } catch (err) {
      logger.warn('Sync init pull failed:', err)
      _updateStatus({ lastError: err.message || String(err) })
    }
  } else {
    _updateStatus({ configured: true, loggedIn: false, email: null })
  }
}

async function pullAndMerge(store, storageService, youTubeApiService, onStateChanged) {
  const uid = firebaseAuthService.getUid()
  if (!uid) return

  _updateStatus({ syncing: true })
  try {
    const remoteDocs = await firebaseSyncService.listRemoteSeries(uid)
    const toPush = []
    const toHydrate = []

    for (const doc of remoteDocs) {
      const result = firebaseSyncService.mergeRemoteDocIntoStore(store, doc)
      if (result.pushLocal) toPush.push(result.playlistId)
      if (result.needsHydration) toHydrate.push(result.playlistId)
    }

    for (const playlistId of toHydrate) {
      try {
        const fresh = await youTubeApiService.refreshPlaylist(playlistId)
        store.addSeries(fresh)
        const series = store.getSeriesById(playlistId)
        const remote = remoteDocs.find(d => d.playlistId === playlistId)
        const mutable = store._getSeriesMutable(playlistId)
        if (mutable && remote) {
          mergeRemoteIntoSeries(mutable, remote)
        }
      } catch (err) {
        logger.warn('Sync hydration failed:', playlistId, err)
      }
    }

    for (const playlistId of toPush) {
      const series = store._getSeriesMutable(playlistId)
      if (series) {
        await firebaseSyncService.pushSeries(uid, playlistId, series)
      }
    }

    if (toHydrate.length || remoteDocs.length || toPush.length) {
      await store.saveToStorage(storageService)
      if (onStateChanged) onStateChanged()
    }
  } finally {
    _updateStatus({ syncing: false, lastSyncAt: Date.now() })
  }
}

async function login(store, storageService, youTubeApiService, onStateChanged) {
  if (!isFirebaseConfigured()) {
    throw { code: 'SYNC_NOT_CONFIGURED', message: 'Firebase is not configured' }
  }

  await firebaseAuthService.login()
  _updateStatus({
    loggedIn: true,
    email: firebaseAuthService.getEmail(),
    lastError: null
  })

  await pullAndMerge(store, storageService, youTubeApiService, onStateChanged)

  const uid = firebaseAuthService.getUid()
  for (const playlistId of Object.keys(store.getSeries())) {
    const series = store._getSeriesMutable(playlistId)
    if (!series) continue
    try {
      await firebaseSyncService.pushSeries(uid, playlistId, series)
    } catch (err) {
      logger.warn('Sync initial upload failed:', playlistId, err)
    }
  }

  await store.saveToStorage(storageService)
  _updateStatus({ lastSyncAt: Date.now() })
  if (onStateChanged) onStateChanged()
}

async function logout() {
  for (const timer of firebaseSyncService._pushTimers?.values?.() || []) {
    clearTimeout(timer)
  }
  firebaseSyncService._pushTimers?.clear?.()
  await firebaseAuthService.logout()
  await chrome.storage.local.remove([SYNC_STORAGE_KEYS.QUEUE])
  _updateStatus({
    loggedIn: false,
    email: null,
    lastError: null
  })
}

function afterSeriesMutation(store, playlistId, onSaved) {
  if (!firebaseAuthService.isLoggedIn()) return

  firebaseSyncService.enqueuePush(
    playlistId,
    id => store._getSeriesMutable(id),
    async () => {
      const series = store._getSeriesMutable(playlistId)
      if (series) series.syncUpdatedAt = Date.now()
      if (onSaved) await onSaved()
      _updateStatus({ lastSyncAt: Date.now(), lastError: null })
    }
  )
}

async function afterSeriesDelete(playlistId) {
  if (!firebaseAuthService.isLoggedIn()) return
  await firebaseSyncService.enqueueDelete(playlistId)
  _updateStatus({ lastSyncAt: Date.now() })
}

async function onStorageReset() {
  if (firebaseAuthService.isLoggedIn()) {
    const uid = firebaseAuthService.getUid()
    if (uid) {
      try {
        await firebaseSyncService.deleteAllSeries(uid)
      } catch (err) {
        logger.warn('Sync remote reset failed:', err)
      }
    }
  }
  await logout()
}

async function manualSync(store, storageService, youTubeApiService, onStateChanged) {
  if (!firebaseAuthService.isLoggedIn()) {
    throw { code: 'NOT_LOGGED_IN', message: 'Not logged in' }
  }
  await pullAndMerge(store, storageService, youTubeApiService, onStateChanged)
  await firebaseSyncService.processQueue(
    id => store._getSeriesMutable(id),
    () => {}
  )
  const uid = firebaseAuthService.getUid()
  for (const playlistId of Object.keys(store.getSeries())) {
    const series = store._getSeriesMutable(playlistId)
    if (!series) continue
    const remoteAt = series.syncUpdatedAt || 0
    if (seriesLocalUpdatedAt(series) >= remoteAt) {
      await firebaseSyncService.pushSeries(uid, playlistId, series)
    }
  }
  await store.saveToStorage(storageService)
  _updateStatus({ lastSyncAt: Date.now(), lastError: null })
  if (onStateChanged) onStateChanged()
}

export {
  initSync,
  login,
  logout,
  afterSeriesMutation,
  afterSeriesDelete,
  onStorageReset,
  manualSync,
  getSyncStatus,
  firebaseAuthService,
  isFirebaseConfigured
}
