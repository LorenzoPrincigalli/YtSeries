import { AppError } from '../shared/errors.js'
import { STORAGE_KEYS } from '../shared/constants.js'
import { logger } from '../shared/logger.js'

/** Active notes per series; deletions are kept as tombstones so they sync. */
const MAX_NOTES = 300
const MAX_NOTE_ENTRIES = 400 // notes + tombstones, enforced by firestore.rules too

/** Resume pointer: first counted episode not watched, else the last one. */
function resumeIndex(series) {
  const next = series.videos.findIndex(video => !video.watched && !video.excluded)
  return next >= 0 ? next : Math.max(0, series.videos.length - 1)
}

class Store {
  constructor() {
    this._saveChain = Promise.resolve()
    this._savedSettings = null
    this.reset()
  }

  reset() {
    this._savedSettings = null
    this._state = {
      series: {},
      activity: [],
      activityReadAt: 0,
      collections: [],
      collectionRecords: [],
      settings: {
        theme: 'classic-red',
        autoRefresh: true,
        lastRefreshCheck: 0,
        language: 'system',
        nextEpisodeOverlay: true
      },
      license: {
        isPro: true
      }
    }
  }

  getState() {
    return structuredClone(this._state)
  }

  getSeries() {
    const copy = {}
    for (const [id, s] of Object.entries(this._state.series)) {
      copy[id] = structuredClone(s)
    }
    return copy
  }

  getSeriesById(playlistId) {
    const s = this._state.series[playlistId]
    if (!s) return null
    return structuredClone(s)
  }

  /** Mutable reference for sync merge (do not expose to UI). */
  _getSeriesMutable(playlistId) {
    return this._state.series[playlistId] || null
  }

  /** Inserts a series created by the sync merge and returns the stored (mutable) reference. */
  insertRemoteSeries(series) {
    this._state.series[series.playlistId] = series
    return series
  }

  /**
   * Runs `mutation` atomically: if it throws or rejects (including a failed
   * save inside it), the in-memory state is rolled back to the snapshot.
   */
  async transaction(mutation) {
    const snapshot = structuredClone(this._state)
    const savedSettings = this._savedSettings
    try {
      return await mutation(this)
    } catch (err) {
      this._state = snapshot
      this._savedSettings = savedSettings
      throw err
    }
  }

  getSettings() {
    return { ...this._state.settings }
  }

  getLicense() {
    return { ...this._state.license }
  }

  isPro() {
    return true
  }

  canAddSeries() {
    return true
  }

  async loadFromStorage(storageService) {
    try {
      const syncData = await storageService.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.LICENSE])
      if (syncData[STORAGE_KEYS.SETTINGS]) {
        this._state.settings = { ...this._state.settings, ...syncData[STORAGE_KEYS.SETTINGS] }
      }
      if (syncData[STORAGE_KEYS.LICENSE]) {
        // ignore stored license data — always Pro
      }
    } catch (err) {
      logger.error('Store.loadFromStorage: sync read failed:', err)
      throw err
    }

    try {
      const localData = await storageService.getLocal([STORAGE_KEYS.SERIES, STORAGE_KEYS.ACTIVITY, STORAGE_KEYS.ACTIVITY_READ_AT, STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.COLLECTION_RECORDS])
      this._state.collections = Array.isArray(localData[STORAGE_KEYS.COLLECTIONS]) ? [...new Set(localData[STORAGE_KEYS.COLLECTIONS].filter(name => typeof name === 'string' && name.trim() && name.length <= 40).map(name => name.trim()))] : []
      this.mergeCollectionRecords(localData[STORAGE_KEYS.COLLECTION_RECORDS] || [])
      this._state.activityReadAt = Number.isSafeInteger(localData[STORAGE_KEYS.ACTIVITY_READ_AT]) && localData[STORAGE_KEYS.ACTIVITY_READ_AT] > 0 ? localData[STORAGE_KEYS.ACTIVITY_READ_AT] : 0
      if (localData[STORAGE_KEYS.SERIES]) {
        const series = localData[STORAGE_KEYS.SERIES]
        if (typeof series !== 'object' || Array.isArray(series) ||
          Object.entries(series).some(([id, value]) =>
            ['__proto__', 'constructor', 'prototype'].includes(id) || !value ||
            value.playlistId !== id || !Array.isArray(value.videos) ||
            value.videos.some(video => !video || typeof video.id !== 'string'))) {
          throw new AppError('STORAGE_CORRUPT', 'Stored library is invalid; restore a valid backup before saving changes')
        }
        this._state.series = localData[STORAGE_KEYS.SERIES]
      }
      if (localData[STORAGE_KEYS.ACTIVITY]) {
        if (!Array.isArray(localData[STORAGE_KEYS.ACTIVITY])) throw new AppError('STORAGE_CORRUPT', 'Stored activity is invalid')
        this._state.activity = localData[STORAGE_KEYS.ACTIVITY].filter(event => event && typeof event.type === 'string' && Number.isFinite(event.at)).slice(0, 100)
      }
    } catch (err) {
      logger.error('Store.loadFromStorage: local read failed:', err)
      throw err
    }

    this._savedSettings = JSON.stringify(this._state.settings)
    logger.info('Store loaded from storage')
  }

  saveToStorage(storageService) {
    const snapshot = this.getState()
    const settingsJson = JSON.stringify(snapshot.settings)
    const save = this._saveChain.then(async () => {
      // Preserve ordering even when network callbacks and commands save together.
      await storageService.setLocal({ [STORAGE_KEYS.SERIES]: snapshot.series, [STORAGE_KEYS.ACTIVITY]: snapshot.activity, [STORAGE_KEYS.ACTIVITY_READ_AT]: snapshot.activityReadAt, [STORAGE_KEYS.COLLECTIONS]: snapshot.collections, [STORAGE_KEYS.COLLECTION_RECORDS]: snapshot.collectionRecords })
      if (settingsJson !== this._savedSettings) {
        if (new TextEncoder().encode(settingsJson).length > 8192) {
          throw new AppError('STORAGE_QUOTA_EXCEEDED', 'Settings exceed Chrome sync storage quota')
        }
        await storageService.set({ [STORAGE_KEYS.SETTINGS]: snapshot.settings })
        this._savedSettings = settingsJson
      }
    })
    this._saveChain = save.catch(() => {})
    return save
  }

  addSeries(series, { markDirty = true } = {}) {
    const existing = this._state.series[series.playlistId]

    const existingVideoMap = {}
    if (existing) {
      for (const v of existing.videos) {
        existingVideoMap[v.id] = v
      }
    }

    const newVideoIds = existing ? series.videos.filter(video => !existingVideoMap[video.id]).map(video => video.id) : []
    this._state.series[series.playlistId] = {
      ...existing,
      ...series,
      lastEpisodeIndex: existing?.lastEpisodeIndex || 0,
      // Count ids, not length: a channel series keeps a fixed window of videos.
      newEpisodesCount: newVideoIds.length,
      latestNewVideoId: newVideoIds[0] || null,
      completed: existing?.completed || false,
      addedAt: existing?.addedAt ?? Date.now(),
      lastRefreshedAt: Date.now(),
      videos: series.videos.map(v => {
        const existingVideo = existingVideoMap[v.id]
        return {
          ...v,
          watched: existingVideo?.watched || false,
          progress: existingVideo?.progress || 0,
          watchedAt: existingVideo?.watchedAt || null,
          resumeTime: existingVideo?.resumeTime || 0,
          totalWatchedTime: existingVideo?.totalWatchedTime || 0,
          lastWatchedAt: existingVideo?.lastWatchedAt || null,
          progressUpdatedAt: existingVideo?.progressUpdatedAt || 0,
          excluded: existingVideo?.excluded || false
        }
      })
    }
    if (markDirty) this._touch(this._state.series[series.playlistId])
    return { newVideoIds }
  }

  _touch(series) {
    const at = Math.max(Date.now(), (series.localUpdatedAt || 0) + 1)
    series.localUpdatedAt = at
    return at
  }

  importSeries(series) {
    const restored = structuredClone(series)
    const existing = this._state.series[series.playlistId]
    restored.localUpdatedAt = Math.max(existing?.localUpdatedAt || 0, restored.localUpdatedAt || 0)
    const at = this._touch(restored)
    restored.completedUpdatedAt = at
    restored.collectionUpdatedAt = at
    for (const video of restored.videos) video.progressUpdatedAt = at
    restored.lastEpisodeIndex = resumeIndex(restored)
    this._state.series[series.playlistId] = restored
  }

  replaceSeries(seriesMap) {
    this._state.series = {}
    for (const series of Object.values(seriesMap)) this.importSeries(series)
  }

  toggleSeriesComplete(playlistId) {
    const series = this._state.series[playlistId]
    if (!series) return
    series.completed = !series.completed
    series.completedUpdatedAt = this._touch(series)
  }

  setSeriesCollection(playlistId, collection) {
    const series = this._state.series[playlistId]
    if (!series) return false
    if ((series.collection || '') === collection) return false

    const target = Object.values(this._state.series).filter(s => s.collection === collection)
      .sort((a, b) => (b.collectionUpdatedAt || 0) - (a.collectionUpdatedAt || 0))[0]
    series.collectionCover = collection ? target?.collectionCover || '' : ''
    series.collection = collection
    series.collectionUpdatedAt = this._touch(series)
    return true
  }

  createCollection(name, ids = []) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) throw new AppError('INVALID_COLLECTION')
    name = name.trim()
    if (this._state.collections.includes(name) || Object.values(this._state.series).some(s => s.collection === name)) throw new AppError('COLLECTION_EXISTS')
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !Object.hasOwn(this._state.series, id))) throw new AppError('INVALID_COLLECTION_MOVE')
    this._state.collections.push(name)
    this._recordCollection(name, false)
    for (const id of new Set(ids)) this.setSeriesCollection(id, name)
    return name
  }

  editCollection(name, nextName, cover) {
    if (typeof name !== 'string' || !name.trim() || typeof nextName !== 'string' || !nextName.trim() || nextName.trim().length > 40) throw new AppError('INVALID_COLLECTION')
    nextName = nextName.trim()
    const members = Object.values(this._state.series).filter(s => s.collection === name)
    if (!members.length && !this._state.collections.includes(name)) throw new AppError('COLLECTION_NOT_FOUND')
    if (nextName !== name && (this._state.collections.includes(nextName) || Object.values(this._state.series).some(s => s.collection === nextName))) throw new AppError('COLLECTION_EXISTS')
    const allowed = members.flatMap(s => [s.thumbnail, s.collectionCover, ...(s.videos || []).map(v => v.thumbnail)])
    if (typeof cover !== 'string' || (cover && (!cover.startsWith('https://') || !allowed.includes(cover)))) throw new AppError('INVALID_COVER')
    this._state.collections = this._state.collections.map(value => value === name ? nextName : value)
    if (name !== nextName) this._recordCollection(name, true)
    this._recordCollection(nextName, false)
    for (const series of members) {
      series.collection = nextName
      series.collectionCover = cover
      series.collectionUpdatedAt = this._touch(series)
    }
    return members.map(s => s.playlistId)
  }

  moveCollectionSeries(ids, destination) {
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !Object.hasOwn(this._state.series, id)) ||
      typeof destination !== 'string' || destination.trim().length > 40) throw new AppError('INVALID_COLLECTION_MOVE')
    const unique = [...new Set(ids)].filter(id => (this._state.series[id].collection || '') !== destination.trim())
    for (const id of unique) this.setSeriesCollection(id, destination.trim())
    return unique
  }

  deleteCollection(name) {
    if (typeof name !== 'string' || !name.trim()) throw new AppError('INVALID_COLLECTION')
    const ids = Object.values(this._state.series).filter(s => s.collection === name).map(s => s.playlistId)
    this._state.collections = this._state.collections.filter(value => value !== name)
    this._recordCollection(name, true)
    for (const id of ids) this.setSeriesCollection(id, '')
    return ids
  }

  _recordCollection(name, deleted) {
    const at = Math.max(Date.now(), ...this._state.collectionRecords.map(record => record.at + 1))
    this.mergeCollectionRecords([{ name, deleted, at }])
  }

  mergeCollectionRecords(records) {
    const merged = new Map(this._state.collections.map(name => [name, { name, deleted: false, at: 1 }]))
    for (const record of [...this._state.collectionRecords, ...(Array.isArray(records) ? records : [])]) {
      if (!record || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 40 || !Number.isSafeInteger(record.at) || record.at < 1 || typeof record.deleted !== 'boolean') continue
      const old = merged.get(record.name)
      if (!old || record.at > old.at || (record.at === old.at && record.deleted)) merged.set(record.name, { name: record.name, at: record.at, deleted: record.deleted })
    }
    this._state.collectionRecords = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
    this._state.collections = this._state.collectionRecords.filter(record => !record.deleted).map(record => record.name)
    for (const record of this._state.collectionRecords.filter(value => value.deleted)) {
      for (const series of Object.values(this._state.series)) {
        if (series.collection === record.name && (series.collectionUpdatedAt || 0) <= record.at) {
          series.collection = ''; series.collectionCover = ''; series.collectionUpdatedAt = record.at
          series.localUpdatedAt = Math.max(series.localUpdatedAt || 0, record.at)
        }
      }
    }
  }

  undoCollectionMove(entries) {
    const changed = []
    for (const entry of entries) {
      const series = this._state.series[entry.id]
      if (!series || series.collectionUpdatedAt !== entry.afterAt || (series.collection || '') !== entry.destination) continue
      if (this._state.collectionRecords.some(record => record.name === entry.collection && record.deleted && record.at >= entry.afterAt)) continue
      series.collection = entry.collection
      series.collectionCover = entry.cover
      series.collectionUpdatedAt = this._touch(series)
      changed.push(entry.id)
    }
    return changed
  }

  recordActivity(type, { playlistId = null, videoId = null, title = '' } = {}) {
    const at = Math.max(Date.now(), (this._state.activity[0]?.at || 0) + 1, this._state.activityReadAt + 1)
    this._state.activity.unshift({ type, playlistId, videoId, title: String(title).slice(0, 160), at })
    this._state.activity = this._state.activity.slice(0, 100)
  }

  markActivityRead(through) {
    if (!Number.isSafeInteger(through) || through < 0) throw new AppError('INVALID_PAYLOAD', 'Invalid activity cursor')
    const latest = Math.max(0, ...this._state.activity.map(event => event.at))
    this._state.activityReadAt = Math.max(this._state.activityReadAt, Math.min(through, latest))
    return this._state.activityReadAt
  }

  findPlaylistByVideoId(videoId) {
    for (const [playlistId, series] of Object.entries(this._state.series)) {
      if (series.videos.some(v => v.id === videoId)) {
        return playlistId
      }
    }
    return null
  }

  /** Resolve playlist for a video, falling back when playlistId hint is stale or wrong. */
  resolvePlaylistForVideo(videoId, playlistIdHint) {
    const id = typeof videoId === 'string' ? videoId.trim() : ''
    if (!id) return null

    const hint = typeof playlistIdHint === 'string' ? playlistIdHint.trim() : ''
    if (hint) {
      const series = this._state.series[hint]
      if (series?.videos.some(v => v.id === id)) return { playlistId: hint, videoId: id }
    }

    const found = this.findPlaylistByVideoId(id)
    return found ? { playlistId: found, videoId: id } : null
  }

  playlistExists(playlistId) {
    return Object.hasOwn(this._state.series, playlistId)
  }

  getNextEpisode(playlistId, currentVideoId) {
    const series = this._state.series[playlistId]
    if (!series) return null

    const currentIndex = series.videos.findIndex(v => v.id === currentVideoId)
    if (currentIndex === -1) return null

    // Find next unwatched episode starting from current position
    for (let i = currentIndex + 1; i < series.videos.length; i++) {
      if (!series.videos[i].watched && !series.videos[i].excluded) {
        return series.videos[i]
      }
    }

    return null
  }

  deleteSeries(playlistId) {
    delete this._state.series[playlistId]
  }

  markEpisodeWatched(playlistId, videoId) {
    const series = this._state.series[playlistId]
    if (!series) return

    const video = series.videos.find(v => v.id === videoId)
    if (!video) return

    if (!video.watched) {
      video.watched = true
      video.progress = 100
      video.resumeTime = video.duration || 0
      video.watchedAt = Date.now()
      video.progressUpdatedAt = this._touch(series)
    }

    series.lastEpisodeIndex = resumeIndex(series)

  }

  markEpisodeUnwatched(playlistId, videoId) {
    const series = this._state.series[playlistId]
    if (!series) return

    const video = series.videos.find(v => v.id === videoId)
    if (!video) return

    if (video.watched || video.progress || video.resumeTime) {
      video.watched = false
      video.progress = 0
      video.watchedAt = null
      video.resumeTime = 0
      video.progressUpdatedAt = this._touch(series)
    }

    series.lastEpisodeIndex = resumeIndex(series)

  }

  /**
   * Excludes episodes (trailers, filler) from progress, or counts them again.
   * @returns {string[]} ids whose state actually changed
   */
  setEpisodesExcluded(playlistId, videoIds, excluded) {
    const series = this._state.series[playlistId]
    if (!series) throw new AppError('SERIES_NOT_FOUND')
    const wanted = new Set(videoIds)
    const changed = series.videos.filter(video => wanted.has(video.id) && Boolean(video.excluded) !== excluded)
    if (!changed.length) return []
    const at = this._touch(series)
    for (const video of changed) {
      video.excluded = excluded
      video.progressUpdatedAt = at
    }
    series.lastEpisodeIndex = resumeIndex(series)
    return changed.map(video => video.id)
  }

  /**
   * Timestamped note on an episode. Notes live in the series (so backups and
   * deletion carry them) as { [id]: { v: videoId, t: seconds, x: text, a: updatedAt, d?: deleted } }.
   * @returns {string} the new note id
   */
  addNote(playlistId, videoId, time, text) {
    const series = this._state.series[playlistId]
    if (!series) throw new AppError('SERIES_NOT_FOUND')
    if (!series.videos.some(video => video.id === videoId)) throw new AppError('VIDEO_NOT_FOUND')
    const notes = series.notes || (series.notes = {})
    if (Object.values(notes).filter(note => !note.d).length >= MAX_NOTES) throw new AppError('NOTES_LIMIT', `At most ${MAX_NOTES} notes per series`)
    const id = crypto.randomUUID()
    notes[id] = { v: videoId, t: Math.max(0, Math.floor(time)), x: text, a: this._touch(series) }
    this._pruneNoteTombstones(series)
    return id
  }

  updateNote(playlistId, noteId, text) {
    const note = this._activeNote(playlistId, noteId)
    note.x = text
    // Strictly newer than the version it replaces, even if another device wrote it this millisecond.
    note.a = Math.max(this._touch(this._state.series[playlistId]), note.a + 1)
  }

  deleteNote(playlistId, noteId) {
    const note = this._activeNote(playlistId, noteId)
    note.x = ''
    note.d = true
    // Strictly newer than the version it replaces, even if another device wrote it this millisecond.
    note.a = Math.max(this._touch(this._state.series[playlistId]), note.a + 1)
  }

  _activeNote(playlistId, noteId) {
    const note = this._state.series[playlistId]?.notes?.[noteId]
    if (!note || note.d || !Object.hasOwn(this._state.series[playlistId].notes, noteId)) throw new AppError('NOTE_NOT_FOUND')
    return note
  }

  /** Drops the oldest tombstones once notes + tombstones exceed the synced limit. */
  _pruneNoteTombstones(series) {
    const entries = Object.entries(series.notes || {})
    if (entries.length <= MAX_NOTE_ENTRIES) return
    const tombstones = entries.filter(([, note]) => note.d).sort((a, b) => a[1].a - b[1].a)
    for (const [id] of tombstones.slice(0, entries.length - MAX_NOTE_ENTRIES)) delete series.notes[id]
  }

  updateEpisodeProgress(playlistId, videoId, progress, currentTime = 0, duration = 0) {
    const series = this._state.series[playlistId]
    if (!series) return

    const video = series.videos.find(v => v.id === videoId)
    if (!video) return

    if (![progress, currentTime, duration].every(Number.isFinite)) return
    progress = Math.min(99, Math.max(0, progress))
    currentTime = Math.max(0, duration > 0 ? Math.min(currentTime, duration) : currentTime)

    const previousResumeTime = video.resumeTime || 0
    video.resumeTime = currentTime
    video.progress = video.watched ? 100 : progress
    video.lastWatchedAt = Date.now()
    video.progressUpdatedAt = this._touch(series)

    // Calculate total watched time using delta from previous resumeTime
    if (currentTime > 0 && duration > 0) {
      const delta = Math.max(0, currentTime - previousResumeTime)
      // Only add delta if it's reasonable (user actually watched, not skipped)
      if (delta > 0 && delta < 30) {
        video.totalWatchedTime = (video.totalWatchedTime || 0) + delta
      }
    }

    // Removed auto-mark to prevent false positives
    // Videos are only marked as watched via the 'ended' event or manual action

  }

  updateSettings(settings) {
    this._state.settings = { ...this._state.settings, ...settings }
  }

  removeSettings(keys) {
    const next = { ...this._state.settings }
    for (const key of keys) delete next[key]
    this._state.settings = next
  }

}

const store = new Store()
export { Store, store }
