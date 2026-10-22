import { AppError } from '../../shared/errors.js'
import { loadFirebaseConfig, isFirebaseConfigured } from './FirebaseConfig.js'
import { firebaseAuthService } from './FirebaseAuthService.js'
import { FirebaseSyncService, mergeRemoteIntoSeries, seriesLocalUpdatedAt } from './FirebaseSyncService.js'
import { SYNC_STORAGE_KEYS } from '../../shared/constants.js'
import { logger } from '../../shared/logger.js'

const firebaseSyncService = new FirebaseSyncService(firebaseAuthService)
let _status = { configured: false, loggedIn: false, email: null, lastSyncAt: null, lastError: null, syncing: false, pendingChanges: 0 }
let _statusChain = Promise.resolve()
let _syncChain = Promise.resolve()

const getSyncStatus = () => ({ ..._status })

function _persistStatus() {
  const snapshot = { ..._status }
  const write = _statusChain.then(() => chrome.storage.local.set({ [SYNC_STORAGE_KEYS.STATUS]: snapshot }))
  _statusChain = write.catch(() => {})
  return write.catch(() => {})
}

async function _loadStatus() {
  const data = await chrome.storage.local.get(SYNC_STORAGE_KEYS.STATUS)
  if (data[SYNC_STORAGE_KEYS.STATUS]) _status = { ..._status, ...data[SYNC_STORAGE_KEYS.STATUS] }
}

function _updateStatus(partial) {
  _status = { ..._status, ...partial, configured: isFirebaseConfigured() }
  void _persistStatus()
}

function _runSync(operation) {
  const result = _syncChain.then(operation)
  _syncChain = result.catch(() => {})
  return result
}

async function _refreshQueueStatus() {
  const uid = firebaseAuthService.getUid()
  if (!uid) return _updateStatus({ pendingChanges: 0 })
  const { pendingChanges } = await firebaseSyncService.getQueueSummary(uid)
  _updateStatus({ pendingChanges })
}

async function _ownerUid() {
  const data = await chrome.storage.local.get(SYNC_STORAGE_KEYS.OWNER)
  return data[SYNC_STORAGE_KEYS.OWNER] || null
}

async function _assertOwner(store, allowAccountChange) {
  const uid = firebaseAuthService.getUid()
  const owner = await _ownerUid()
  if (owner && owner !== uid && (Object.keys(store.getSeries()).length || store.getState().collectionRecords?.length || store.getState().collections?.length) && !allowAccountChange) {
    await firebaseAuthService.logout()
    _updateStatus({ loggedIn: false, email: null, lastError: 'This browser already contains data from another Google account.' })
    throw new AppError('ACCOUNT_CHANGED', 'Confirm account change before merging this library')
  }
  await chrome.storage.local.set({ [SYNC_STORAGE_KEYS.OWNER]: uid })
}

async function initSync(store, storageService, youTubeApiService, onStateChanged) {
  await loadFirebaseConfig()
  try { await _loadStatus() } catch (error) { logger.warn('Could not load sync status:', error) }
  if (!isFirebaseConfigured()) {
    _updateStatus({ configured: false, loggedIn: false, email: null, syncing: false })
    return
  }
  await firebaseAuthService.tryRestoreSession({ refresh: false })
  if (!firebaseAuthService.isLoggedIn()) {
    _updateStatus({ configured: true, loggedIn: false, email: null, syncing: false })
    return
  }
  _updateStatus({ configured: true, loggedIn: true, email: firebaseAuthService.getEmail(), lastError: null })
  await _refreshQueueStatus()
  void retrySync(store, storageService, youTubeApiService, onStateChanged)
}

async function pullAndMerge(store, storageService, youTubeApiService, onStateChanged) {
  const uid = firebaseAuthService.getUid()
  if (!uid) return false
  const pendingDeletes = await firebaseSyncService.getPendingDeletes(uid)
  const remoteDocs = await firebaseSyncService.listRemoteSeries(uid)
  const hydrate = []
  const push = []
  let changed = false

  for (const remote of remoteDocs) {
    if (pendingDeletes.has(remote.playlistId)) continue
    const local = store._getSeriesMutable(remote.playlistId)
    if (remote.deleted) {
      if (local && Number(remote.deletedAt || remote.updatedAt) >= seriesLocalUpdatedAt(local)) {
        store.deleteSeries(remote.playlistId)
        changed = true
      } else if (local) push.push(remote.playlistId)
      continue
    }
    const result = firebaseSyncService.mergeRemoteDocIntoStore(store, remote)
    changed ||= result.changed
    if (result.needsHydration) hydrate.push(remote.playlistId)
    if (result.pushLocal) push.push(remote.playlistId)
  }

  for (const playlistId of hydrate) {
    try {
      const fresh = await youTubeApiService.refreshPlaylist(playlistId)
      store.addSeries(fresh, { markDirty: false })
      const remote = remoteDocs.find(doc => doc.playlistId === playlistId)
      const mutable = store._getSeriesMutable(playlistId)
      if (mutable && remote) mergeRemoteIntoSeries(mutable, remote)
      changed = true
    } catch (error) {
      logger.warn('Sync hydration failed:', playlistId, error)
    }
  }

  for (const playlistId of new Set(push)) await firebaseSyncService.enqueuePush(playlistId)
  if (changed) {
    await store.saveToStorage(storageService)
    onStateChanged?.()
  }
  return changed
}

async function _retrySync(store, storageService, youTubeApiService, onStateChanged, options = {}) {
  if (!firebaseAuthService.isLoggedIn()) return { success: false, error: 'NOT_LOGGED_IN' }
  _updateStatus({ syncing: true, lastError: null })
  try {
    await firebaseSyncService.processQueue(
      id => store._getSeriesMutable(id),
      async (playlistId, result) => {
        if (result.deleted) {
          store.deleteSeries(playlistId)
          await store.saveToStorage(storageService)
          onStateChanged?.()
        }
      },
      { force: Boolean(options.force) }
    )
    await _refreshQueueStatus()
    await pullAndMerge(store, storageService, youTubeApiService, onStateChanged)
    const beforeCollections = store.getSeries()
    await firebaseSyncService.syncCollections(firebaseAuthService.getUid(), store)
    for (const [id, series] of Object.entries(store.getSeries())) {
      if (series.collectionUpdatedAt !== beforeCollections[id]?.collectionUpdatedAt) await firebaseSyncService.enqueuePush(id)
    }
    await _refreshQueueStatus()
    await store.saveToStorage(storageService)
    onStateChanged?.()
    _updateStatus({ lastSyncAt: Date.now(), lastError: null })
    return { success: true }
  } catch (error) {
    logger.warn('Sync failed:', error)
    _updateStatus({ lastError: error.message || String(error) })
    return { success: false, error: error.code || 'SYNC_FAILED' }
  } finally {
    _updateStatus({ syncing: false })
  }
}

function retrySync(store, storageService, youTubeApiService, onStateChanged, options) {
  return _runSync(() => _retrySync(store, storageService, youTubeApiService, onStateChanged, options))
}

async function login(store, storageService, youTubeApiService, onStateChanged, { allowAccountChange = false } = {}) {
  if (!isFirebaseConfigured()) throw new AppError('SYNC_NOT_CONFIGURED', 'Firebase is not configured')
  await firebaseAuthService.login()
  await _assertOwner(store, allowAccountChange)
  _updateStatus({ loggedIn: true, email: firebaseAuthService.getEmail(), lastError: null })
  await retrySync(store, storageService, youTubeApiService, onStateChanged, { force: true })
  for (const playlistId of Object.keys(store.getSeries())) await firebaseSyncService.enqueuePush(playlistId)
  await _refreshQueueStatus()
  const result = await retrySync(store, storageService, youTubeApiService, onStateChanged, { force: true })
  if (!result.success) throw new AppError(result.error, getSyncStatus().lastError || 'Sync failed')
  await store.saveToStorage(storageService)
  onStateChanged?.()
}

async function logout() {
  const uid = firebaseAuthService.getUid()
  await firebaseAuthService.logout()
  if (uid) {
    const queue = await chrome.storage.local.get(SYNC_STORAGE_KEYS.QUEUE)
    const remaining = (queue[SYNC_STORAGE_KEYS.QUEUE] || []).filter(item => item.uid !== uid)
    await chrome.storage.local.set({ [SYNC_STORAGE_KEYS.QUEUE]: remaining })
  }
  _updateStatus({ loggedIn: false, email: null, syncing: false, lastError: null, pendingChanges: 0 })
}

async function afterSeriesMutation(store, playlistId, onSaved) {
  if (firebaseAuthService.isLoggedIn()) await firebaseSyncService.enqueuePush(playlistId)
  if (firebaseAuthService.isLoggedIn()) await _refreshQueueStatus()
  if (onSaved) await onSaved()
}

async function afterSeriesDelete(playlistId) {
  if (!firebaseAuthService.isLoggedIn()) return
  await firebaseSyncService.enqueueDelete(playlistId)
  await _refreshQueueStatus()
}

async function onStorageReset() {
  if (firebaseAuthService.isLoggedIn()) {
    const uid = firebaseAuthService.getUid()
    if (uid) await firebaseSyncService.deleteAllSeries(uid)
  }
  await logout()
}

async function manualSync(store, storageService, youTubeApiService, onStateChanged) {
  const result = await retrySync(store, storageService, youTubeApiService, onStateChanged, { force: true })
  if (!result.success) throw new AppError(result.error, getSyncStatus().lastError || 'Sync failed')
}

export { initSync, login, logout, afterSeriesMutation, afterSeriesDelete, onStorageReset, manualSync, retrySync, getSyncStatus, firebaseAuthService, isFirebaseConfigured }
