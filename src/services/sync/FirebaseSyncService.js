import { AppError } from '../../shared/errors.js'
import { getFirebaseConfig } from './FirebaseConfig.js'
import { SYNC_MAX_CONFLICT_RETRIES, SYNC_STORAGE_KEYS } from '../../shared/constants.js'
import { encodeFields, decodeDocument } from './firestoreRest.js'
import { logger } from '../../shared/logger.js'

const REQUEST_TIMEOUT_MS = 15_000
const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback
const progressUpdatedAt = video => Math.max(number(video.progressUpdatedAt), number(video.watchedAt), number(video.lastWatchedAt))
const seriesLocalUpdatedAt = series => Math.max(number(series.localUpdatedAt), number(series.completedUpdatedAt), number(series.addedAt))

/** Firestore REST failure; 429 and 5xx are transient and safe to retry. */
function firestoreError(code, response, body, fallbackMessage) {
  const status = response?.status
  return new AppError(code, body?.error?.message || fallbackMessage, {
    status,
    retryable: status === 429 || status >= 500
  })
}

function seriesToFirestorePayload(series) {
  const progress = {}
  let updatedAt = Math.max(seriesLocalUpdatedAt(series), 1)
  for (const video of series.videos || []) {
    const at = progressUpdatedAt(video)
    if (at || video.watched || video.progress || video.resumeTime) {
      progress[video.id] = {
        w: Boolean(video.watched), p: Math.min(100, Math.max(0, number(video.progress))),
        r: Math.max(0, number(video.resumeTime)), t: Math.max(0, number(video.totalWatchedTime)),
        a: at, wa: number(video.watchedAt), la: number(video.lastWatchedAt)
      }
      updatedAt = Math.max(updatedAt, at)
    }
  }
  return {
    deleted: false,
    metadata: {
      title: series.title || '', thumbnail: series.thumbnail || '', channelTitle: series.channelTitle || '',
      channelId: series.channelId || '', videoCount: series.videoCount || (series.videos?.length ?? 0),
      collection: series.collection || '',
      collectionCover: series.collectionCover || ''
    },
    lastEpisodeIndex: series.lastEpisodeIndex ?? 0,
    completed: Boolean(series.completed),
    completedAt: number(series.completedUpdatedAt) || seriesLocalUpdatedAt(series),
    collectionAt: number(series.collectionUpdatedAt) || seriesLocalUpdatedAt(series),
    updatedAt,
    progress
  }
}

function mergeRemoteIntoSeries(series, remote) {
  const remoteAt = number(remote.updatedAt)
  const completedAt = number(remote.completedAt) || remoteAt
  const localCompletedAt = number(series.completedUpdatedAt) || seriesLocalUpdatedAt(series)
  if (remote.completed !== undefined && completedAt >= localCompletedAt) {
    series.completed = Boolean(remote.completed)
    series.completedUpdatedAt = completedAt
  }
  const collectionAt = number(remote.collectionAt) || remoteAt
  const localCollectionAt = number(series.collectionUpdatedAt) || seriesLocalUpdatedAt(series)
  if (remote.metadata && collectionAt >= localCollectionAt && typeof remote.metadata.collection === 'string') {
    series.collection = remote.metadata.collection
    series.collectionCover = typeof remote.metadata.collectionCover === 'string' && remote.metadata.collectionCover.startsWith('https://') ? remote.metadata.collectionCover : ''
    series.collectionUpdatedAt = collectionAt
  }
  for (const video of series.videos || []) {
    const remoteProgress = remote.progress?.[video.id]
    if (!remoteProgress) continue
    const remoteProgressAt = number(remoteProgress.a) || remoteAt
    if (remoteProgressAt < progressUpdatedAt(video)) continue
    video.watched = Boolean(remoteProgress.w)
    video.progress = video.watched ? 100 : Math.min(99, Math.max(0, number(remoteProgress.p)))
    video.resumeTime = Math.max(0, number(remoteProgress.r))
    video.totalWatchedTime = Math.max(0, number(remoteProgress.t))
    video.watchedAt = video.watched ? (number(remoteProgress.wa) || remoteProgressAt) : null
    video.lastWatchedAt = number(remoteProgress.la) || remoteProgressAt || null
    video.progressUpdatedAt = remoteProgressAt
  }
  const nextIndex = (series.videos || []).findIndex(video => !video.watched)
  series.lastEpisodeIndex = nextIndex >= 0 ? nextIndex : Math.max(0, (series.videos?.length || 1) - 1)
  series.syncUpdatedAt = Math.max(number(series.syncUpdatedAt), remoteAt)
  if (remote.__updateTime) series.remoteUpdateTime = remote.__updateTime
}

function applyMetadataFromRemote(series, metadata) {
  if (!metadata) return
  for (const key of ['title', 'thumbnail', 'channelTitle', 'channelId']) {
    if (typeof metadata[key] === 'string') series[key] = metadata[key]
  }
  if (Number.isFinite(metadata.videoCount)) series.videoCount = metadata.videoCount
}

function isConflict(response, body) {
  return response.status === 409 || response.status === 412 || body?.error?.status === 'FAILED_PRECONDITION'
}

class FirebaseSyncService {
  constructor(authService) {
    this._auth = authService
    this._queueChain = Promise.resolve()
  }

  _baseUrl(uid) {
    const { projectId } = getFirebaseConfig()
    return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}/series`
  }

  async _authHeaders() {
    const token = await this._auth.getValidIdToken()
    if (!token) throw new AppError('NOT_AUTHENTICATED', 'Not logged in')
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  async _request(url, options) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    return { response, body: await response.json().catch(() => ({})) }
  }

  _documentUrl(uid, playlistId) { return `${this._baseUrl(uid)}/${encodeURIComponent(playlistId)}` }

  async listRemoteSeries(uid) {
    const headers = await this._authHeaders()
    const docs = []
    let pageToken = null
    do {
      const url = new URL(this._baseUrl(uid))
      url.searchParams.set('pageSize', '100')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const { response, body } = await this._request(url, { headers })
      if (!response.ok) throw firestoreError('FIRESTORE_LIST_FAILED', response, body, 'Failed to list series')
      docs.push(...(body.documents || []).map(doc => ({
        playlistId: decodeURIComponent(doc.name.split('/').pop()), ...decodeDocument(doc), __updateTime: doc.updateTime || null
      })))
      pageToken = body.nextPageToken || null
    } while (pageToken)
    return docs
  }

  async _getRemoteSeries(uid, playlistId, headers) {
    const { response, body } = await this._request(this._documentUrl(uid, playlistId), { headers })
    if (response.status === 404) return null
    if (!response.ok) throw firestoreError('FIRESTORE_READ_FAILED', response, body, 'Failed to read series')
    return { playlistId, ...decodeDocument(body), __updateTime: body.updateTime || null }
  }

  async _writeDocument(uid, playlistId, payload, previous, headers) {
    const url = new URL(this._documentUrl(uid, playlistId))
    if (previous?.__updateTime) url.searchParams.set('currentDocument.updateTime', previous.__updateTime)
    else url.searchParams.set('currentDocument.exists', 'false')
    const { response, body } = await this._request(url, { method: 'PATCH', headers, body: JSON.stringify(encodeFields(payload)) })
    if (!response.ok) {
      if (isConflict(response, body)) return { conflict: true }
      throw firestoreError('FIRESTORE_WRITE_FAILED', response, body, 'Failed to save series')
    }
    return { conflict: false, updateTime: body.updateTime || null }
  }

  async pushSeries(uid, playlistId, series) {
    const headers = await this._authHeaders()
    for (let attempt = 0; attempt < SYNC_MAX_CONFLICT_RETRIES; attempt++) {
      const remote = await this._getRemoteSeries(uid, playlistId, headers)
      if (remote?.deleted && number(remote.deletedAt) >= seriesLocalUpdatedAt(series)) return { deleted: true, updatedAt: number(remote.deletedAt) }
      if (remote) mergeRemoteIntoSeries(series, remote)
      const payload = seriesToFirestorePayload(series)
      const result = await this._writeDocument(uid, playlistId, payload, remote, headers)
      if (!result.conflict) {
        series.syncUpdatedAt = Math.max(number(series.syncUpdatedAt), payload.updatedAt)
        series.remoteUpdateTime = result.updateTime || series.remoteUpdateTime
        return { deleted: false, updatedAt: payload.updatedAt }
      }
    }
    throw new AppError('SYNC_CONFLICT', 'The series changed on another device; retry sync')
  }

  async _pushTombstone(uid, playlistId, deletedAt) {
    const headers = await this._authHeaders()
    for (let attempt = 0; attempt < SYNC_MAX_CONFLICT_RETRIES; attempt++) {
      const remote = await this._getRemoteSeries(uid, playlistId, headers)
      if (number(remote?.updatedAt) > deletedAt && !remote?.deleted) return
      const result = await this._writeDocument(uid, playlistId, { deleted: true, deletedAt, updatedAt: deletedAt, progress: {} }, remote, headers)
      if (!result.conflict) return
    }
    throw new AppError('SYNC_CONFLICT', 'Could not record remote deletion')
  }

  async deleteSeries(uid, playlistId) {
    const headers = await this._authHeaders()
    const { response, body } = await this._request(this._documentUrl(uid, playlistId), { method: 'DELETE', headers })
    if (response.status === 404) return
    if (!response.ok) throw firestoreError('FIRESTORE_DELETE_FAILED', response, body, 'Failed to delete series')
  }

  async deleteAllSeries(uid) {
    for (const doc of await this.listRemoteSeries(uid)) await this.deleteSeries(uid, doc.playlistId)
    const { response } = await this._request(this._collectionsUrl(uid), { method: 'DELETE', headers: await this._authHeaders() })
    if (!response.ok && response.status !== 404) throw firestoreError('FIRESTORE_DELETE_FAILED', response, {}, 'Failed to delete collection registry')
  }

  _collectionsUrl(uid) { return this._baseUrl(uid).replace(/\/series$/, '/collectionState/registry') }

  async syncCollections(uid, store) {
    const headers = await this._authHeaders()
    for (let attempt = 0; attempt < SYNC_MAX_CONFLICT_RETRIES; attempt++) {
      const { response, body } = await this._request(this._collectionsUrl(uid), { headers })
      if (!response.ok && response.status !== 404) throw firestoreError('FIRESTORE_READ_FAILED', response, body, 'Failed to read collections')
      const remote = response.status === 404 ? null : decodeDocument(body)
      store.mergeCollectionRecords(remote?.records || [])
      const records = store.getState().collectionRecords
      if (remote && JSON.stringify(remote.records) === JSON.stringify(records)) return
      if (!remote && !records.length) return
      const url = new URL(this._collectionsUrl(uid))
      url.searchParams.set(response.status === 404 ? 'currentDocument.exists' : 'currentDocument.updateTime', response.status === 404 ? 'false' : body.updateTime)
      const result = await this._request(url, { method: 'PATCH', headers, body: JSON.stringify(encodeFields({ records })) })
      if (result.response.ok) return
      if (!isConflict(result.response, result.body)) throw firestoreError('FIRESTORE_WRITE_FAILED', result.response, result.body, 'Failed to save collections')
    }
    throw new AppError('SYNC_CONFLICT', 'Collections changed on another device; retry sync')
  }

  _withQueueLock(operation) {
    const result = this._queueChain.then(operation)
    this._queueChain = result.catch(() => {})
    return result
  }

  async _readQueue() {
    const data = await chrome.storage.local.get(SYNC_STORAGE_KEYS.QUEUE)
    return Array.isArray(data[SYNC_STORAGE_KEYS.QUEUE]) ? data[SYNC_STORAGE_KEYS.QUEUE] : []
  }

  async _enqueueQueue(item) {
    return this._withQueueLock(async () => {
      const queue = await this._readQueue()
      const filtered = queue.filter(existing => !(existing.uid === item.uid && existing.playlistId === item.playlistId))
      filtered.push({ ...item, revision: `${item.at}-${Math.random().toString(36).slice(2)}`, attempts: 0, nextAttemptAt: item.at })
      await chrome.storage.local.set({ [SYNC_STORAGE_KEYS.QUEUE]: filtered })
    })
  }

  async enqueuePush(playlistId) {
    const uid = this._auth.getUid()
    if (uid) await this._enqueueQueue({ uid, op: 'push', playlistId, at: Date.now() })
  }

  async enqueueDelete(playlistId, deletedAt = Date.now()) {
    const uid = this._auth.getUid()
    if (uid) await this._enqueueQueue({ uid, op: 'delete', playlistId, deletedAt, at: Date.now() })
  }

  async getPendingDeletes(uid) {
    return new Set((await this._readQueue()).filter(item => item.uid === uid && item.op === 'delete').map(item => item.playlistId))
  }

  async getQueueSummary(uid) {
    const items = (await this._readQueue()).filter(item => item.uid === uid)
    return { pendingChanges: items.length, retryAt: items.reduce((next, item) => Math.min(next, number(item.nextAttemptAt) || Infinity), Infinity) }
  }

  async _removeIfCurrent(item) {
    return this._withQueueLock(async () => {
      const queue = await this._readQueue()
      await chrome.storage.local.set({ [SYNC_STORAGE_KEYS.QUEUE]: queue.filter(current => current.revision !== item.revision) })
    })
  }

  async _recordFailure(item) {
    return this._withQueueLock(async () => {
      const queue = await this._readQueue()
      const index = queue.findIndex(current => current.revision === item.revision)
      if (index < 0) return
      const attempts = number(queue[index].attempts) + 1
      queue[index] = { ...queue[index], attempts, nextAttemptAt: Date.now() + Math.min(300_000, 1_000 * 2 ** attempts) }
      await chrome.storage.local.set({ [SYNC_STORAGE_KEYS.QUEUE]: queue })
    })
  }

  async processQueue(getSeriesFn, onPushed, { force = false } = {}) {
    if (!this._auth.isLoggedIn() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    const uid = this._auth.getUid()
    const queue = (await this._readQueue()).filter(item => item.uid === uid && (force || number(item.nextAttemptAt) <= Date.now()))
    for (const item of queue) {
      try {
        if (item.op === 'delete') await this._pushTombstone(uid, item.playlistId, number(item.deletedAt) || number(item.at))
        else {
          const series = getSeriesFn(item.playlistId)
          if (series) {
            const result = await this.pushSeries(uid, item.playlistId, series)
            if (result.deleted && onPushed) await onPushed(item.playlistId, result)
          }
        }
        await this._removeIfCurrent(item)
      } catch (error) {
        logger.warn('FirebaseSync queue item failed:', item.playlistId, error)
        await this._recordFailure(item)
        throw error
      }
    }
  }

  mergeRemoteDocIntoStore(store, remoteDoc) {
    const { playlistId } = remoteDoc
    let series = store._getSeriesMutable(playlistId)
    if (!series) {
      const metadata = remoteDoc.metadata || {}
      series = { playlistId, title: metadata.title || 'Series', description: '', thumbnail: metadata.thumbnail || '',
        channelTitle: metadata.channelTitle || '', channelId: metadata.channelId || '', videoCount: metadata.videoCount || 0,
        videos: [], lastEpisodeIndex: remoteDoc.lastEpisodeIndex ?? 0, newEpisodesCount: 0, completed: Boolean(remoteDoc.completed),
        addedAt: number(remoteDoc.updatedAt), lastRefreshedAt: 0, localUpdatedAt: number(remoteDoc.updatedAt),
        syncUpdatedAt: 0, completedUpdatedAt: number(remoteDoc.completedAt) || number(remoteDoc.updatedAt) }
      store.insertRemoteSeries(series)
      mergeRemoteIntoSeries(series, remoteDoc)
      return { playlistId, needsHydration: true, pushLocal: false, changed: true }
    }
    const before = JSON.stringify(series)
    mergeRemoteIntoSeries(series, remoteDoc)
    const needsHydration = !series.videos?.length
    if (needsHydration) applyMetadataFromRemote(series, remoteDoc.metadata)
    return { playlistId, needsHydration, pushLocal: seriesLocalUpdatedAt(series) > number(remoteDoc.updatedAt), changed: before !== JSON.stringify(series) }
  }
}

export { FirebaseSyncService, seriesToFirestorePayload, mergeRemoteIntoSeries, applyMetadataFromRemote, seriesLocalUpdatedAt }
