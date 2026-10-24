import { describe, it, expect } from 'vitest'
import { computeBadges, libraryStats, earnedLevels, BADGES } from '../achievements.js'
import { t, setLanguage } from '../i18n.js'

const DAY = 86_400_000
const NOW = new Date(2026, 9, 21, 15, 0, 0).getTime() // Wednesday afternoon
/** Local time `daysAgo` days before NOW at `hour`:00. */
const at = (daysAgo, hour = 10) => { const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0); return d.getTime() }
const v = (id, extra = {}) => ({ id, title: id, duration: 1800, ...extra })
const watched = (id, when, extra = {}) => v(id, { watched: true, watchedAt: when, ...extra })
const badge = (badges, id) => badges.find(b => b.id === id)

describe('libraryStats', () => {
  const state = {
    settings: { weeklyGoal: 2 },
    collections: ['Empty one'],
    series: {
      A: { playlistId: 'A', channelId: 'UC1', collection: 'Docs', videos: [watched('a1', at(0)), watched('a2', at(0)), watched('a3', at(1, 2)), v('a4')], notes: { n1: { v: 'a1', t: 1, x: 'x', a: 1 }, n2: { v: 'a1', t: 2, x: '', a: 2, d: true } } },
      B: { playlistId: 'B', channelId: 'UC2', videos: [watched('b1', at(9, 6)), watched('b2', at(8)), v('trailer', { watched: true, watchedAt: at(0), excluded: true })] },
      C: { playlistId: 'C', channelId: 'UC3', videos: [v('c1')] }
    }
  }
  const stats = libraryStats(state, NOW)

  it('counts watched episodes and time, never excluded ones', () => {
    expect(stats.episodes).toBe(5)
    expect(stats.hours).toBe(2.5)
  })

  it('measures finished series, channels watched, saved series, collections and notes', () => {
    expect(stats.finished).toBe(1) // B: its only counted episodes are watched
    expect(stats.channels).toBe(2) // C has nothing watched
    expect(stats.series).toBe(3)
    expect(stats.collections).toBe(2) // "Docs" + the empty registered one
    expect(stats.notes).toBe(1) // deleted notes do not count
  })

  it('finds the best streak, binge day, night and early episodes', () => {
    expect(stats.bestStreak).toBe(2) // yesterday + today; 9 and 8 days ago is another run of 2
    expect(stats.binge).toBe(2) // two episodes of A today
    expect(stats.night).toBe(1) // 02:00
    expect(stats.early).toBe(1) // 06:00
  })

  it('counts weeks that met the weekly goal, or none without a goal', () => {
    expect(stats.goalWeeks).toBe(2) // this week (3 episodes of A) and the week of B's two
    expect(libraryStats({ ...state, settings: {} }, NOW).goalWeeks).toBe(0)
  })

  it('ignores missing or future watch dates for time-based badges', () => {
    const odd = libraryStats({ series: { X: { playlistId: 'X', videos: [watched('x1', null), watched('x2', NOW + DAY)] } } }, NOW)
    expect(odd.episodes).toBe(2)
    expect(odd.bestStreak).toBe(0)
  })
})

describe('badge texts', () => {
  it('exist in both languages, with a singular wording for a target of 1', () => {
    for (const language of ['en', 'it']) {
      setLanguage(language)
      for (const badge of BADGES) {
        for (const key of [`badge_${badge.id}`, `badge_${badge.id}_desc`, ...(badge.levels.includes(1) ? [`badge_${badge.id}_desc_one`] : [])]) {
          expect(t(key), `${language}: ${key}`).not.toBe(key)
        }
      }
    }
    setLanguage(null)
  })
})

describe('computeBadges', () => {
  it('reports level and next target for every badge', () => {
    const series = { S: { playlistId: 'S', videos: Array.from({ length: 12 }, (_, i) => watched(`e${i}`, at(i))) } }
    const badges = computeBadges({ series }, NOW)
    expect(badges.map(b => b.id)).toEqual(BADGES.map(b => b.id))
    expect(badge(badges, 'episodes')).toMatchObject({ value: 12, level: 1, next: 100 })
    expect(badge(badges, 'streak')).toMatchObject({ value: 12, level: 2, next: 30 })
    expect(badge(badges, 'finisher')).toMatchObject({ level: 1, next: 5 })
    expect(badge(badges, 'hours')).toMatchObject({ value: 6, level: 0, next: 10 })
  })

  it('caps at gold with no next target', () => {
    const series = { S: { playlistId: 'S', videos: Array.from({ length: 500 }, (_, i) => watched(`e${i}`, at(0))) } }
    expect(badge(computeBadges({ series }, NOW), 'episodes')).toMatchObject({ level: 3, next: null })
  })

  it('lists earned levels as stable keys', () => {
    const badges = computeBadges({ series: { S: { playlistId: 'S', videos: [watched('a', at(0))] } } }, NOW)
    expect([...earnedLevels(badges)]).toEqual(['finisher:1'])
  })
})
