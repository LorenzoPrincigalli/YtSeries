// @ts-check
// Pure presentation logic: derives view data from the server state. No DOM,
// no messaging, no mutation of inputs — every function here is unit-testable.

const DAY_MS = 86_400_000
const NEW_EPISODE_WINDOW_DAYS = 7

/** @param {any} series */
export function isInProgress(series) {
  const videos = series.videos || []
  return !series.completed && videos.some(video => !video.watched) &&
    videos.some(video => video.watched || video.resumeTime > 0 || video.progress > 0)
}

/** @param {any} series */
export function isComplete(series) {
  const videos = series.videos || []
  return Boolean(series.completed) || (videos.length > 0 && videos.every(video => video.watched))
}

/** @param {any} series */
export function watchedCount(series) {
  return (series.videos || []).filter(video => video.watched).length
}

/** Next unwatched episode, or null. @param {any} series */
export function nextEpisode(series) {
  return (series.videos || []).find(video => !video.watched) || null
}

/**
 * YouTube watch URL built with URL APIs (ids are encoded, never concatenated raw).
 * @param {string} videoId @param {string} playlistId @param {number} [resumeTime]
 */
export function watchUrl(videoId, playlistId, resumeTime = 0) {
  const url = new URL('https://www.youtube.com/watch')
  url.searchParams.set('v', videoId)
  if (playlistId) url.searchParams.set('list', playlistId)
  if (Number.isFinite(resumeTime) && resumeTime > 0) url.searchParams.set('t', `${Math.floor(resumeTime)}s`)
  return url.href
}

/** Progress shown on a library card: the in-flight episode, or 100% when done. @param {any} series */
export function cardProgress(series) {
  const videos = series.videos || []
  const inFlight = videos.find(video => !video.watched && video.progress > 0)
  if (inFlight) return inFlight.progress || 0
  return videos.length > 0 && videos.every(video => video.watched) ? 100 : 0
}

/** Progress of the most recently touched episode, for the hero banner. @param {any} series */
export function heroProgress(series) {
  const videos = series.videos || []
  let latest = null
  for (const video of videos) {
    if ((video.watched || video.progress > 0) && video.watchedAt && (!latest || video.watchedAt > latest.watchedAt)) latest = video
  }
  if (!latest) latest = [...videos].reverse().find(video => video.progress > 0 || video.watched) || null
  if (!latest) return 0
  return latest.watched ? 100 : latest.progress || 0
}

/** @param {any} video @param {number} [now] */
export function isNewEpisode(video, now = Date.now()) {
  if (!video.publishedAt || video.watched) return false
  return (now - new Date(video.publishedAt).getTime()) / DAY_MS <= NEW_EPISODE_WINDOW_DAYS
}

/** @param {any} series @param {number} [now] */
export function findNewEpisode(series, now = Date.now()) {
  return (series.videos || []).find(video => isNewEpisode(video, now)) || null
}

/** Latest published episode, or null. @param {any} series */
export function latestEpisode(series) {
  let latest = null
  for (const video of series.videos || []) {
    if (video.publishedAt && (!latest || video.publishedAt > latest.publishedAt)) latest = video
  }
  return latest
}

/** Default library order: unfinished first, then in-progress, then newest. @param {any} a @param {any} b */
function compareSeries(a, b) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1
  const ratio = s => (s.videos.length ? watchedCount(s) / s.videos.length : 0)
  const aStarted = ratio(a) > 0 && ratio(a) < 1
  const bStarted = ratio(b) > 0 && ratio(b) < 1
  if (aStarted !== bStarted) return aStarted ? -1 : 1
  return (b.addedAt || 0) - (a.addedAt || 0)
}

/**
 * @param {any[]} seriesList
 * @param {{ search?: string, collection?: string, filter?: string }} criteria
 */
export function filterSeries(seriesList, { search = '', collection = '', filter = 'all' } = {}) {
  const query = search.trim().toLowerCase()
  return seriesList
    .filter(series => !query || series.title?.toLowerCase().includes(query) || series.channelTitle?.toLowerCase().includes(query))
    .filter(series => !collection || series.collection === collection)
    .filter(series => {
      if (filter === 'watching') return isInProgress(series)
      if (filter === 'completed') return isComplete(series)
      if (filter === 'new') return series.newEpisodesCount > 0
      return true
    })
    .sort(compareSeries)
}

/** Unfinished series with an episode published this calendar week (Mon–Sun). @param {any[]} seriesList @param {Date} [now] */
export function thisWeekSeries(seriesList, now = new Date()) {
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const nextMonday = new Date(monday)
  nextMonday.setDate(monday.getDate() + 7)
  return seriesList.filter(series => !series.completed && (series.videos || []).some(video => {
    if (!video.publishedAt) return false
    const published = new Date(video.publishedAt)
    return published >= monday && published < nextMonday
  }))
}

/** Hero carousel: in progress, then not started, then completed; max 8. @param {any[]} seriesList */
export function heroSeries(seriesList) {
  const byNewest = (a, b) => (b.addedAt || 0) - (a.addedAt || 0)
  const inProgress = []
  const notStarted = []
  const completed = []
  for (const series of seriesList) {
    if (isComplete(series)) completed.push(series)
    else if (watchedCount(series) > 0) inProgress.push(series)
    else notStarted.push(series)
  }
  return [...inProgress.sort(byNewest), ...notStarted.sort(byNewest), ...completed].slice(0, 8)
}

/** Every known collection name: explicit ones plus any referenced by a series. @param {any} state */
export function collectionNames(state) {
  const names = new Set(state?.collections || [])
  for (const series of Object.values(state?.series || {})) if (series.collection) names.add(series.collection)
  return [...names].sort()
}

/**
 * Picks recommended playlists proportionally to how many saved series each
 * channel has, skipping already-saved ones.
 * @param {Map<string, any[]> | Record<string, any[]>} playlistsByChannel
 * @param {Record<string, number>} channelWeights
 * @param {Set<string>} savedIds
 * @param {number} [target]
 * @param {() => number} [random]
 */
export function pickRecommendations(playlistsByChannel, channelWeights, savedIds, target = 10, random = Math.random) {
  const entries = Object.entries(channelWeights)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  const lookup = playlistsByChannel instanceof Map ? playlistsByChannel : new Map(Object.entries(playlistsByChannel))
  const picked = []
  const seen = new Set()
  for (const [channelId, count] of entries) {
    const slots = Math.max(1, Math.round(target * (count / total)))
    let added = 0
    for (const playlist of lookup.get(channelId) || []) {
      if (added >= slots) break
      if (savedIds.has(playlist.playlistId) || seen.has(playlist.playlistId)) continue
      seen.add(playlist.playlistId)
      picked.push(playlist)
      added++
    }
  }
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[picked[i], picked[j]] = [picked[j], picked[i]]
  }
  return picked.slice(0, target)
}

/** @param {number} seconds */
export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
