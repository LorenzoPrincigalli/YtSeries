// @ts-check
// Pure progress statistics shared by the service worker, the dashboard and the
// YouTube content script. Episodes the user excluded (trailers, filler) never
// count towards progress, time left, goals or milestones.

const DAY_MS = 86_400_000
const PACE_WINDOW_DAYS = 21
const MIN_RELEASE_GAP_MS = 12 * 3_600_000 // closer uploads are bulk adds, not a release rhythm
const MAX_CADENCE_DAYS = 45
const DORMANT_DAYS = 90 // no upload for this long: offer to mark the series as ended
export const MILESTONES = [25, 50, 75, 100]
const EXTRA_TITLE = /\b(trailer|teaser|first look|anteprima|sneak peek)\b/i

/** Episodes that count: everything not excluded. @param {any} series @returns {any[]} */
export function countedVideos(series) {
  return (series?.videos || []).filter(video => !video.excluded)
}

/** @param {any} series */
export function watchedCount(series) {
  return countedVideos(series).filter(video => video.watched).length
}

/** Share of counted episodes watched, 0–100 (not rounded). @param {any} series */
export function progressRatio(series) {
  const counted = countedVideos(series)
  return counted.length ? (100 * counted.filter(video => video.watched).length) / counted.length : 0
}

/** First counted episode not yet watched, or null. @param {any} series */
export function nextCountedEpisode(series) {
  return countedVideos(series).find(video => !video.watched) || null
}

/**
 * Seconds still to watch: unwatched counted episodes minus what was already
 * seen of an in-progress one. Episodes with an unknown duration add nothing.
 * @param {any} series
 */
export function timeLeft(series) {
  let seconds = 0
  for (const video of countedVideos(series)) {
    if (video.watched) continue
    seconds += Math.max(0, (Number(video.duration) || 0) - (Number(video.resumeTime) || 0))
  }
  return Math.round(seconds)
}

/** Episodes of this series finished in the last three weeks, per week. @param {any} series @param {number} [now] */
export function seriesPace(series, now = Date.now()) {
  const since = now - PACE_WINDOW_DAYS * DAY_MS
  const recent = countedVideos(series).filter(video => video.watched && Number(video.watchedAt) >= since).length
  return recent >= 2 ? (recent * 7) / PACE_WINDOW_DAYS : 0
}

/**
 * When the series will be finished at the current pace, or null when there is
 * no recent pace to extrapolate from (no invented estimates).
 * @param {any} series @param {number} [now]
 * @returns {{ pacePerWeek: number, finishAt: number } | null}
 */
export function finishEstimate(series, now = Date.now()) {
  const remaining = countedVideos(series).filter(video => !video.watched).length
  const pacePerWeek = seriesPace(series, now)
  if (!remaining || !pacePerWeek) return null
  return { pacePerWeek, finishAt: now + (remaining / pacePerWeek) * 7 * DAY_MS }
}

/** Highest milestone passed going from `before` to `after` percent, or null. @param {number} before @param {number} after */
export function milestoneCrossed(before, after) {
  let crossed = null
  for (const milestone of MILESTONES) if (before < milestone && after >= milestone) crossed = milestone
  return crossed
}

/** Local midnight of the day containing `at`. @param {number} at */
export function startOfDay(at) {
  const day = new Date(at)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

/** Local midnight of the Monday of the week containing `at`. @param {number} at */
export function startOfWeek(at) {
  const day = new Date(startOfDay(at))
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  return day.getTime()
}

/** @param {number} dayStart @param {number} delta */
function shiftDay(dayStart, delta) {
  const day = new Date(dayStart)
  day.setDate(day.getDate() + delta)
  return day.getTime()
}

/**
 * Consecutive days (local time) with at least one finished episode. A streak
 * is still alive today if the last episode was yesterday.
 * @param {any[]} seriesList @param {number} [now]
 */
export function streak(seriesList, now = Date.now()) {
  const days = new Set()
  for (const series of seriesList) {
    for (const video of countedVideos(series)) if (video.watched && Number(video.watchedAt) > 0) days.add(startOfDay(video.watchedAt))
  }
  let day = startOfDay(now)
  if (!days.has(day)) day = shiftDay(day, -1)
  let count = 0
  while (days.has(day)) {
    count++
    day = shiftDay(day, -1)
  }
  return count
}

/** Episodes finished and time watched since Monday. @param {any[]} seriesList @param {number} [now] */
export function weekProgress(seriesList, now = Date.now()) {
  const since = startOfWeek(now)
  let episodes = 0
  let seconds = 0
  for (const series of seriesList) {
    for (const video of countedVideos(series)) {
      if (!video.watched || !(Number(video.watchedAt) >= since)) continue
      episodes++
      seconds += Number(video.duration) || 0
    }
  }
  return { episodes, seconds }
}

/**
 * Expected next release from the series' own rhythm: the median gap between
 * its latest uploads. Null for irregular, slow (> 45 days), dormant or ended series.
 * @param {any} series @param {number} [now]
 * @returns {{ cadenceDays: number, lastAt: number, nextAt: number, overdue: boolean } | null}
 */
export function releaseForecast(series, now = Date.now()) {
  if (series?.ended) return null
  const dates = [...new Set((series?.videos || [])
    .map(video => Date.parse(video.publishedAt))
    .filter(Number.isFinite))]
    .sort((a, b) => a - b)
    .slice(-11)
  const gaps = []
  for (let i = 1; i < dates.length; i++) {
    const gap = dates[i] - dates[i - 1]
    if (gap >= MIN_RELEASE_GAP_MS) gaps.push(gap)
  }
  if (gaps.length < 3) return null
  gaps.sort((a, b) => a - b)
  const middle = Math.floor(gaps.length / 2)
  const cadence = gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2
  const lastAt = dates[dates.length - 1]
  if (cadence > MAX_CADENCE_DAYS * DAY_MS || now - lastAt > 3 * cadence) return null
  const nextAt = lastAt + cadence
  return { cadenceDays: cadence / DAY_MS, lastAt, nextAt, overdue: nextAt < now - DAY_MS }
}

/**
 * Whole months since the latest upload when the series looks finished: no
 * release rhythm (see releaseForecast) and nothing new for DORMANT_DAYS.
 * Null when the user already marked it as ended, or it still looks active.
 * @param {any} series @param {number} [now]
 */
export function dormantMonths(series, now = Date.now()) {
  if (!series || series.ended || !series.videos?.length) return null
  const latest = Math.max(...(series.videos || []).map(video => Date.parse(video.publishedAt)).filter(Number.isFinite))
  if (!Number.isFinite(latest) || now - latest < DORMANT_DAYS * DAY_MS || releaseForecast(series, now)) return null
  return Math.floor((now - latest) / (30 * DAY_MS))
}

/** Counted episodes whose title marks them as trailers or teasers. @param {any} series @returns {string[]} */
export function suggestedExclusions(series) {
  return countedVideos(series).filter(video => EXTRA_TITLE.test(video.title || '')).map(video => video.id)
}

/** Clock-style length: "4:05", "1:02:03". @param {number} seconds */
export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Rounded, human length: "4 h 20 min", "45 min", "< 1 min". @param {number} seconds */
export function formatLength(seconds) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return '< 1 min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}
