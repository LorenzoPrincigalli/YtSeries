import { AppError } from './errors.js'
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function invalid(message) {
  return new AppError('INVALID_BACKUP', message)
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function normalizeVideo(video) {
  if (!video || typeof video !== 'object' || Array.isArray(video) || typeof video.id !== 'string' || !video.id.trim()) {
    throw invalid('Each episode needs a valid id')
  }

  return {
    id: video.id.trim(),
    title: typeof video.title === 'string' ? video.title : '',
    thumbnail: typeof video.thumbnail === 'string' ? video.thumbnail : '',
    publishedAt: typeof video.publishedAt === 'string' ? video.publishedAt : undefined,
    duration: Math.max(0, finiteNumber(video.duration)),
    position: Math.max(0, Math.floor(finiteNumber(video.position))),
    watched: Boolean(video.watched),
    progress: Math.min(100, Math.max(0, finiteNumber(video.progress))),
    watchedAt: Number.isFinite(video.watchedAt) ? video.watchedAt : null,
    resumeTime: Math.max(0, finiteNumber(video.resumeTime)),
    totalWatchedTime: Math.max(0, finiteNumber(video.totalWatchedTime)),
    lastWatchedAt: Number.isFinite(video.lastWatchedAt) ? video.lastWatchedAt : null,
    progressUpdatedAt: Math.max(0, finiteNumber(video.progressUpdatedAt)),
    excluded: Boolean(video.excluded)
  }
}

function normalizeSeries(series, playlistId) {
  if (!series || typeof series !== 'object' || Array.isArray(series) ||
    typeof playlistId !== 'string' || !playlistId.trim() || series.playlistId !== playlistId) {
    throw invalid('Each series needs a matching playlist id')
  }

  if (!Array.isArray(series.videos) || series.videos.length > 10_000) {
    throw invalid('Each series needs a valid episode list')
  }

  const videos = series.videos.map(normalizeVideo)
  if (new Set(videos.map(video => video.id)).size !== videos.length) throw invalid('Episode ids must be unique')

  return {
    playlistId,
    title: typeof series.title === 'string' ? series.title : '',
    description: typeof series.description === 'string' ? series.description : '',
    thumbnail: typeof series.thumbnail === 'string' ? series.thumbnail : '',
    channelTitle: typeof series.channelTitle === 'string' ? series.channelTitle : '',
    channelId: typeof series.channelId === 'string' ? series.channelId : '',
    videoCount: Math.max(0, Math.floor(finiteNumber(series.videoCount, videos.length))),
    videos,
    lastEpisodeIndex: Math.max(0, Math.floor(finiteNumber(series.lastEpisodeIndex))),
    newEpisodesCount: Math.max(0, Math.floor(finiteNumber(series.newEpisodesCount))),
    completed: Boolean(series.completed),
    collection: typeof series.collection === 'string' ? series.collection.trim().slice(0, 40) : '',
    collectionCover: typeof series.collectionCover === 'string' && series.collectionCover.startsWith('https://') ? series.collectionCover : '',
    addedAt: Math.max(0, finiteNumber(series.addedAt, Date.now())),
    lastRefreshedAt: Math.max(0, finiteNumber(series.lastRefreshedAt)),
    localUpdatedAt: Math.max(0, finiteNumber(series.localUpdatedAt)),
    syncUpdatedAt: Math.max(0, finiteNumber(series.syncUpdatedAt)),
    completedUpdatedAt: Math.max(0, finiteNumber(series.completedUpdatedAt)),
    collectionUpdatedAt: Math.max(0, finiteNumber(series.collectionUpdatedAt)),
    remoteUpdateTime: typeof series.remoteUpdateTime === 'string' ? series.remoteUpdateTime : undefined
  }
}

/** Validates external backups and returns a plain, safe library object. */
function normalizeSeriesBackup(payload) {
  const source = payload?.series ?? payload
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw invalid('Backup must contain a series object')

  const entries = Object.entries(source)
  if (entries.length > 2_000) throw invalid('Backup contains too many series')
  const normalized = Object.create(null)
  for (const [playlistId, series] of entries) {
    if (FORBIDDEN_KEYS.has(playlistId)) throw invalid('Backup contains an unsafe key')
    normalized[playlistId] = normalizeSeries(series, playlistId)
  }
  return normalized
}

export { normalizeSeriesBackup, normalizeSeries }
