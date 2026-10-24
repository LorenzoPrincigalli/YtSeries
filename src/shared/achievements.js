// @ts-check
// Achievement badges, derived from the library alone (nothing extra stored):
// every badge has three levels (bronze, silver, gold) and reports progress
// towards the next one. Excluded episodes never count, as everywhere else.
import { countedVideos, startOfDay, startOfWeek } from './seriesStats.js'

const HOUR_MS = 3_600_000

/**
 * Badge catalogue: id (i18n keys badge_<id>, badge_<id>_desc and, when a
 * level needs exactly 1, badge_<id>_desc_one), icon from
 * src/shared/icons.js and the value needed for each level.
 */
export const BADGES = /** @type {const} */ ([
  { id: 'episodes', icon: 'film', levels: [10, 100, 500] },
  { id: 'hours', icon: 'clock', levels: [10, 50, 200] },
  { id: 'finisher', icon: 'trophy', levels: [1, 5, 20] },
  { id: 'streak', icon: 'flame', levels: [3, 7, 30] },
  { id: 'binge', icon: 'layers', levels: [3, 5, 10] },
  { id: 'goal', icon: 'target', levels: [1, 4, 12] },
  { id: 'night_owl', icon: 'moon', levels: [1, 10, 50] },
  { id: 'early_bird', icon: 'sun', levels: [1, 10, 50] },
  { id: 'explorer', icon: 'compass', levels: [3, 10, 25] },
  { id: 'collector', icon: 'stack', levels: [5, 20, 50] },
  { id: 'curator', icon: 'folder', levels: [1, 3, 8] },
  { id: 'note_taker', icon: 'note', levels: [1, 20, 100] }
])

/**
 * @typedef {{ id: string, icon: string, levels: readonly number[], value: number, level: number, next: number | null }} Badge
 */

/** Longest run of consecutive local days in a set of day starts. @param {Set<number>} days */
function longestRun(days) {
  const sorted = [...days].sort((a, b) => a - b)
  let best = 0
  let run = 0
  let previous = null
  for (const day of sorted) {
    // +25 h then back to midnight: the next local day, DST included.
    run = previous !== null && startOfDay(previous + 25 * HOUR_MS) === day ? run + 1 : 1
    best = Math.max(best, run)
    previous = day
  }
  return best
}

/**
 * Everything the badges measure, in one pass over the library.
 * @param {any} state @param {number} [now]
 */
export function libraryStats(state, now = Date.now()) {
  const seriesList = Object.values(state?.series || {})
  const goal = Number(state?.settings?.weeklyGoal) || 0
  const days = new Set()
  /** @type {Map<string, number>} */ const perSeriesDay = new Map()
  /** @type {Map<number, number>} */ const perWeek = new Map()
  const channels = new Set()
  const collections = new Set(state?.collections || [])
  let episodes = 0
  let seconds = 0
  let finished = 0
  let night = 0
  let early = 0
  let notes = 0

  for (const series of seriesList) {
    if (series.collection) collections.add(series.collection)
    notes += Object.values(series.notes || {}).filter(note => note && !note.d).length
    const counted = countedVideos(series)
    if (series.completed || (counted.length && counted.every(video => video.watched))) finished++
    let watchedAny = false
    for (const video of counted) {
      if (!video.watched) continue
      watchedAny = true
      episodes++
      seconds += Number(video.duration) || 0
      const at = Number(video.watchedAt)
      if (!(at > 0) || at > now) continue
      const hour = new Date(at).getHours()
      if (hour < 5) night++
      else if (hour < 8) early++
      const day = startOfDay(at)
      days.add(day)
      const key = `${series.playlistId}|${day}`
      perSeriesDay.set(key, (perSeriesDay.get(key) || 0) + 1)
      const week = startOfWeek(at)
      perWeek.set(week, (perWeek.get(week) || 0) + 1)
    }
    if (watchedAny && series.channelId) channels.add(series.channelId)
  }

  return {
    episodes,
    hours: seconds / 3600,
    finished,
    bestStreak: longestRun(days),
    binge: Math.max(0, ...perSeriesDay.values()),
    goalWeeks: goal ? [...perWeek.values()].filter(count => count >= goal).length : 0,
    night,
    early,
    channels: channels.size,
    series: seriesList.length,
    collections: collections.size,
    notes
  }
}

/** @param {ReturnType<typeof libraryStats>} stats @param {string} id */
function valueOf(stats, id) {
  switch (id) {
    case 'episodes': return stats.episodes
    case 'hours': return Math.floor(stats.hours)
    case 'finisher': return stats.finished
    case 'streak': return stats.bestStreak
    case 'binge': return stats.binge
    case 'goal': return stats.goalWeeks
    case 'night_owl': return stats.night
    case 'early_bird': return stats.early
    case 'explorer': return stats.channels
    case 'collector': return stats.series
    case 'curator': return stats.collections
    case 'note_taker': return stats.notes
    default: return 0
  }
}

/**
 * Every badge with its current level (0–3) and the value needed for the next.
 * @param {any} state @param {number} [now] @returns {Badge[]}
 */
export function computeBadges(state, now = Date.now()) {
  const stats = libraryStats(state, now)
  return BADGES.map(badge => {
    const value = valueOf(stats, badge.id)
    const level = badge.levels.filter(target => value >= target).length
    return { ...badge, value, level, next: level < badge.levels.length ? badge.levels[level] : null }
  })
}

/** Levels earned across all badges, as "badge:level" keys (for "new badge" detection). @param {Badge[]} badges */
export function earnedLevels(badges) {
  return new Set(badges.flatMap(badge => Array.from({ length: badge.level }, (_, i) => `${badge.id}:${i + 1}`)))
}
