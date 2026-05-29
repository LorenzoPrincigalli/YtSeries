import { getFirebaseConfig } from './FirebaseConfig.js'
import { SYNC_STORAGE_KEYS, SYNC_PUSH_DEBOUNCE_MS } from '../../shared/constants.js'
import { encodeFields, decodeDocument } from './firestoreRest.js'
import { logger } from '../../shared/logger.js'

function seriesLocalUpdatedAt(series) {
  return series.syncUpdatedAt || series.lastRefreshedAt || series.addedAt || 0
}

function seriesToFirestorePayload(series) {
  const progress = {}
  for (const v of series.videos || []) {
    if (v.watched || v.progress || v.watchedAt) {
      progress[v.id] = {
        w: !!v.watched,
        p: v.progress || 0,
        a: v.watchedAt || 0
      }
    }
  }

  return {
    metadata: {
      title: series.title || '',
      thumbnail: series.thumbnail || '',
      channelTitle: series.channelTitle || '',
      channelId: series.channelId || '',
      videoCount: series.videoCount || (series.videos?.length ?? 0)
    },
    lastEpisodeIndex: series.lastEpisodeIndex ?? 0,
    completed: !!series.completed,
    updatedAt: Date.now(),
    progress
  }
}

function mergeRemoteIntoSeries(series, remote) {
  const remoteAt = remote.updatedAt || 0
  const localAt = seriesLocalUpdatedAt(series)

  if (remote.completed !== undefined && remoteAt >= localAt) {
    series.completed = remote.completed
  }
  if (remote.lastEpisodeIndex !== undefined && remoteAt >= localAt) {
    series.lastEpisodeIndex = remote.lastEpisodeIndex
  }

  const progress = remote.progress || {}
  for (const v of series.videos || []) {
    const prog = progress[v.id]
    if (!prog) continue
    const remoteWatchAt = prog.a || 0
    const localWatchAt = v.watchedAt || 0
    if (remoteWatchAt >= localWatchAt) {
      v.watched = !!prog.w
      v.progress = prog.p ?? v.progress
      if (remoteWatchAt) v.watchedAt = remoteWatchAt
    }
  }

  const nextIndex = series.videos.findIndex(v => !v.watched)
  series.lastEpisodeIndex = nextIndex >= 0 ? nextIndex : Math.max(0, series.videos.length - 1)
  series.syncUpdatedAt = Math.max(remoteAt, localAt)
}

function applyMetadataFromRemote(series, metadata) {
  if (!metadata) return
  if (metadata.title) series.title = metadata.title
  if (metadata.thumbnail) series.thumbnail = metadata.thumbnail
  if (metadata.channelTitle) series.channelTitle = metadata.channelTitle
  if (metadata.channelId) series.channelId = metadata.channelId
  if (metadata.videoCount != null) series.videoCount = metadata.videoCount
}

class FirebaseSyncService {
  constructor(authService) {
    this._auth = authService
    this._pushTimers = new Map()
    this._pushing = false
  }

  _baseUrl(uid) {
    const { projectId } = getFirebaseConfig()
    return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/series`
  }

  async _authHeaders() {
    const token = await this._auth.getValidIdToken()
    if (!token) throw { code: 'NOT_AUTHENTICATED', message: 'Not logged in' }
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

  async listRemoteSeries(uid) {
    const headers = await this._authHeaders()
    const url = this._baseUrl(uid)
    const resp = await fetch(url, { headers })
    const data = await resp.json()

    if (!resp.ok) {
      throw { code: 'FIRESTORE_LIST_FAILED', message: data.error?.message || 'Failed to list series' }
    }

    const docs = data.documents || []
    return docs.map(doc => {
      const playlistId = doc.name.split('/').pop()
      const fields = decodeDocument(doc) || {}
      return { playlistId, ...fields }
    })
  }

  async pushSeries(uid, playlistId, series) {
    const headers = await this._authHeaders()
    const payload = seriesToFirestorePayload(series)
    const docUrl = `${this._baseUrl(uid)}/${encodeURIComponent(playlistId)}`

    let resp = await fetch(docUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(encodeFields(payload))
    })

    if (resp.status === 404) {
      resp = await fetch(
        `${this._baseUrl(uid)}?documentId=${encodeURIComponent(playlistId)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(encodeFields(payload))
        }
      )
    }

    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw { code: 'FIRESTORE_WRITE_FAILED', message: data.error?.message || 'Failed to save series' }
    }

    series.syncUpdatedAt = payload.updatedAt
    return payload.updatedAt
  }

  async deleteSeries(uid, playlistId) {
    const headers = await this._authHeaders()
    const url = `${this._baseUrl(uid)}/${encodeURIComponent(playlistId)}`
    const resp = await fetch(url, { method: 'DELETE', headers })
    if (resp.status === 404) return
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      throw { code: 'FIRESTORE_DELETE_FAILED', message: data.error?.message || 'Failed to delete series' }
    }
  }

  async deleteAllSeries(uid) {
    const remote = await this.listRemoteSeries(uid)
    for (const doc of remote) {
      await this.deleteSeries(uid, doc.playlistId)
    }
  }

  enqueuePush(playlistId, getSeriesFn, onPushed) {
    if (this._pushTimers.has(playlistId)) {
      clearTimeout(this._pushTimers.get(playlistId))
    }

    const timer = setTimeout(async () => {
      this._pushTimers.delete(playlistId)
      try {
        await this.pushNow(playlistId, getSeriesFn, onPushed)
      } catch (err) {
        logger.warn('FirebaseSync push failed:', playlistId, err)
        await this._enqueueQueue({ op: 'push', playlistId, at: Date.now() })
      }
    }, SYNC_PUSH_DEBOUNCE_MS)

    this._pushTimers.set(playlistId, timer)
  }

  async pushNow(playlistId, getSeriesFn, onPushed) {
    const uid = this._auth.getUid()
    if (!uid || !this._auth.isLoggedIn()) return

    if (!navigator.onLine) {
      await this._enqueueQueue({ op: 'push', playlistId, at: Date.now() })
      return
    }

    const series = getSeriesFn(playlistId)
    if (!series) return

    if (this._pushing) {
      await this._enqueueQueue({ op: 'push', playlistId, at: Date.now() })
      return
    }

    this._pushing = true
    try {
      await this.pushSeries(uid, playlistId, series)
      if (onPushed) onPushed(playlistId)
    } finally {
      this._pushing = false
    }
  }

  async processQueue(getSeriesFn, onPushed) {
    if (!navigator.onLine || !this._auth.isLoggedIn()) return

    const data = await chrome.storage.local.get(SYNC_STORAGE_KEYS.QUEUE)
    let queue = data[SYNC_STORAGE_KEYS.QUEUE] || []
    if (!queue.length) return

    const remaining = []
    for (const item of queue) {
      try {
        if (item.op === 'push') {
          await this.pushNow(item.playlistId, getSeriesFn, onPushed)
        } else if (item.op === 'delete') {
          const uid = this._auth.getUid()
          if (uid) await this.deleteSeries(uid, item.playlistId)
        }
      } catch (err) {
        logger.warn('FirebaseSync queue item failed:', item, err)
        remaining.push(item)
      }
    }

    await chrome.storage.local.set({ [SYNC_STORAGE_KEYS.QUEUE]: remaining })
  }

  async enqueueDelete(playlistId) {
    if (!navigator.onLine) {
      await this._enqueueQueue({ op: 'delete', playlistId, at: Date.now() })
      return
    }
    const uid = this._auth.getUid()
    if (!uid) return
    try {
      await this.deleteSeries(uid, playlistId)
    } catch (err) {
      logger.warn('FirebaseSync delete failed:', err)
      await this._enqueueQueue({ op: 'delete', playlistId, at: Date.now() })
    }
  }

  async _enqueueQueue(item) {
    const data = await chrome.storage.local.get(SYNC_STORAGE_KEYS.QUEUE)
    const queue = data[SYNC_STORAGE_KEYS.QUEUE] || []
    queue.push(item)
    await chrome.storage.local.set({ [SYNC_STORAGE_KEYS.QUEUE]: queue })
  }

  mergeRemoteDocIntoStore(store, remoteDoc) {
    const { playlistId } = remoteDoc
    let series = store._getSeriesMutable(playlistId)
    const remoteAt = remoteDoc.updatedAt || 0

    if (!series) {
      const meta = remoteDoc.metadata || {}
      series = {
        playlistId,
        title: meta.title || 'Series',
        description: '',
        thumbnail: meta.thumbnail || '',
        channelTitle: meta.channelTitle || '',
        channelId: meta.channelId || '',
        videoCount: meta.videoCount || 0,
        videos: [],
        lastEpisodeIndex: remoteDoc.lastEpisodeIndex ?? 0,
        newEpisodesCount: 0,
        completed: !!remoteDoc.completed,
        addedAt: Date.now(),
        lastRefreshedAt: 0,
        syncUpdatedAt: remoteAt
      }
      store._state.series[playlistId] = series
      mergeRemoteIntoSeries(series, remoteDoc)
      return { playlistId, needsHydration: true, pushLocal: false }
    }

    const localAt = seriesLocalUpdatedAt(series)
    if (remoteAt > localAt) {
      applyMetadataFromRemote(series, remoteDoc.metadata)
      mergeRemoteIntoSeries(series, remoteDoc)
      return { playlistId, needsHydration: !series.videos?.length, pushLocal: false }
    }

    if (localAt > remoteAt) {
      return { playlistId, needsHydration: false, pushLocal: true }
    }

    mergeRemoteIntoSeries(series, remoteDoc)
    return { playlistId, needsHydration: false, pushLocal: false }
  }
}

export {
  FirebaseSyncService,
  seriesToFirestorePayload,
  mergeRemoteIntoSeries,
  applyMetadataFromRemote,
  seriesLocalUpdatedAt
}
