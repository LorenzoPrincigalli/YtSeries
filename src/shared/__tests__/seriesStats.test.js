import { describe, it, expect } from 'vitest'
import {
  countedVideos, watchedCount, progressRatio, nextCountedEpisode, timeLeft, seriesPace, finishEstimate,
  milestoneCrossed, streak, weekProgress, startOfWeek, releaseForecast, suggestedExclusions, dormantMonths
} from '../seriesStats.js'

const DAY = 86_400_000
// Wednesday 2026-10-21, 15:00 local time.
const NOW = new Date(2026, 9, 21, 15, 0, 0).getTime()
const v = (id, extra = {}) => ({ id, title: id, duration: 600, ...extra })
const s = (videos, extra = {}) => ({ playlistId: 'PL1', videos, ...extra })

describe('excluded episodes', () => {
  const series = s([v('trailer', { excluded: true }), v('a', { watched: true }), v('b'), v('c')])

  it('never count towards progress', () => {
    expect(countedVideos(series).map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(watchedCount(series)).toBe(1)
    expect(progressRatio(series)).toBeCloseTo(100 / 3)
  })

  it('are skipped when picking the next episode', () => {
    expect(nextCountedEpisode(s([v('t', { excluded: true }), v('a')])).id).toBe('a')
    expect(nextCountedEpisode(s([v('a', { watched: true }), v('t', { excluded: true })]))).toBeNull()
  })
})

describe('timeLeft', () => {
  it('sums unwatched counted episodes minus the resume point', () => {
    const series = s([
      v('a', { watched: true }),
      v('b', { resumeTime: 200 }),
      v('c', { duration: 900 }),
      v('d', { excluded: true }),
      v('e', { duration: 0 })
    ])
    expect(timeLeft(series)).toBe(400 + 900)
  })

  it('never goes negative when the resume point passes the duration', () => {
    expect(timeLeft(s([v('a', { resumeTime: 9999 })]))).toBe(0)
  })
})

describe('pace and finish estimate', () => {
  const watchedDaysAgo = days => ({ watched: true, watchedAt: NOW - days * DAY })

  it('needs at least two recent episodes', () => {
    expect(seriesPace(s([v('a', watchedDaysAgo(1)), v('b')]), NOW)).toBe(0)
    expect(finishEstimate(s([v('a', watchedDaysAgo(1)), v('b')]), NOW)).toBeNull()
  })

  it('ignores episodes finished more than three weeks ago', () => {
    expect(seriesPace(s([v('a', watchedDaysAgo(30)), v('b', watchedDaysAgo(40)), v('c')]), NOW)).toBe(0)
  })

  it('extrapolates the remaining episodes at the recent pace', () => {
    // 3 episodes in 21 days = 1 per week; 2 left → 14 days.
    const series = s([v('a', watchedDaysAgo(2)), v('b', watchedDaysAgo(9)), v('c', watchedDaysAgo(16)), v('d'), v('e')])
    const estimate = finishEstimate(series, NOW)
    expect(estimate.pacePerWeek).toBe(1)
    expect(estimate.finishAt).toBe(NOW + 14 * DAY)
  })

  it('has nothing to estimate for a finished series', () => {
    expect(finishEstimate(s([v('a', watchedDaysAgo(1)), v('b', watchedDaysAgo(2))]), NOW)).toBeNull()
  })
})

describe('milestoneCrossed', () => {
  it('returns the highest milestone passed, or null', () => {
    expect(milestoneCrossed(20, 30)).toBe(25)
    expect(milestoneCrossed(20, 80)).toBe(75)
    expect(milestoneCrossed(99, 100)).toBe(100)
    expect(milestoneCrossed(25, 40)).toBeNull()
    expect(milestoneCrossed(60, 40)).toBeNull()
  })
})

describe('streak', () => {
  const at = (daysAgo, hour = 20) => {
    const day = new Date(NOW)
    day.setDate(day.getDate() - daysAgo)
    day.setHours(hour, 0, 0, 0)
    return day.getTime()
  }
  const watchedOn = (...daysAgo) => [s(daysAgo.map((d, i) => v(`e${i}`, { watched: true, watchedAt: at(d) })))]

  it('counts consecutive days ending today', () => {
    expect(streak(watchedOn(0, 1, 2), NOW)).toBe(3)
  })

  it('stays alive until the end of the day after the last episode', () => {
    expect(streak(watchedOn(1, 2), NOW)).toBe(2)
    expect(streak(watchedOn(2, 3), NOW)).toBe(0)
  })

  it('counts a day once however many episodes it has, across series', () => {
    const list = [...watchedOn(0, 1), ...watchedOn(1, 2)]
    expect(streak(list, NOW)).toBe(3)
  })

  it('uses local days: 23:30 and 00:30 are two different days', () => {
    const late = new Date(NOW); late.setDate(late.getDate() - 1); late.setHours(23, 30, 0, 0)
    const early = new Date(NOW); early.setHours(0, 30, 0, 0)
    expect(streak([s([v('a', { watched: true, watchedAt: late.getTime() }), v('b', { watched: true, watchedAt: early.getTime() })])], NOW)).toBe(2)
  })

  it('ignores excluded episodes', () => {
    expect(streak([s([v('a', { watched: true, watchedAt: NOW, excluded: true })])], NOW)).toBe(0)
  })
})

describe('weekProgress', () => {
  it('counts episodes and time since Monday', () => {
    const monday = startOfWeek(NOW)
    expect(new Date(monday).getDay()).toBe(1)
    const list = [s([
      v('a', { watched: true, watchedAt: monday + 1000, duration: 300 }),
      v('b', { watched: true, watchedAt: NOW, duration: 600 }),
      v('c', { watched: true, watchedAt: monday - 1000 }),
      v('d', { watched: true, watchedAt: NOW, excluded: true })
    ])]
    expect(weekProgress(list, NOW)).toEqual({ episodes: 2, seconds: 900 })
  })
})

describe('releaseForecast', () => {
  const weekly = count => Array.from({ length: count }, (_, i) =>
    v(`w${i}`, { publishedAt: new Date(NOW - (count - 1 - i) * 7 * DAY - 2 * DAY).toISOString() }))

  it('predicts the next release from the median gap', () => {
    const forecast = releaseForecast(s(weekly(6)), NOW)
    expect(forecast.cadenceDays).toBeCloseTo(7)
    expect(forecast.nextAt).toBe(forecast.lastAt + 7 * DAY)
    expect(forecast.overdue).toBe(false)
  })

  it('needs at least three real gaps', () => {
    expect(releaseForecast(s(weekly(3)), NOW)).toBeNull()
  })

  it('ignores bulk additions made within hours', () => {
    const bulk = Array.from({ length: 10 }, (_, i) => v(`b${i}`, { publishedAt: new Date(NOW - DAY - i * 60_000).toISOString() }))
    expect(releaseForecast(s(bulk), NOW)).toBeNull()
  })

  it('gives up on slow or dormant series', () => {
    const monthly = Array.from({ length: 6 }, (_, i) => v(`m${i}`, { publishedAt: new Date(NOW - (6 - i) * 60 * DAY).toISOString() }))
    expect(releaseForecast(s(monthly), NOW)).toBeNull()
    expect(releaseForecast(s(weekly(6)), NOW + 30 * DAY)).toBeNull()
  })

  it('flags a release more than a day late', () => {
    expect(releaseForecast(s(weekly(6)), NOW + 8 * DAY).overdue).toBe(true)
  })

  it('skips missing or invalid dates', () => {
    const videos = [...weekly(5), v('x', { publishedAt: 'not a date' }), v('y')]
    expect(releaseForecast(s(videos), NOW)?.cadenceDays).toBeCloseTo(7)
  })

  it('expects nothing from an ended series', () => {
    expect(releaseForecast(s(weekly(6), { ended: true }), NOW)).toBeNull()
  })
})

describe('dormantMonths', () => {
  const at = daysAgo => v(`d${daysAgo}`, { publishedAt: new Date(NOW - daysAgo * DAY).toISOString() })

  it('counts whole months since the latest upload once the series has gone quiet', () => {
    expect(dormantMonths(s([at(400), at(200), at(130)]), NOW)).toBe(4)
  })

  it('stays silent for recent, regular or already ended series', () => {
    expect(dormantMonths(s([at(300), at(60)]), NOW)).toBeNull()
    expect(dormantMonths(s([at(300), at(130)], { ended: true }), NOW)).toBeNull()
    expect(dormantMonths(s([]), NOW)).toBeNull()
    expect(dormantMonths(s([v('undated')]), NOW)).toBeNull()
  })

  it('never asks about a followed channel, which keeps publishing', () => {
    expect(dormantMonths(s([at(400), at(200), at(130)], { playlistId: 'UULFHnyfMqiRRG1u-2MsSQLbXA' }), NOW)).toBeNull()
  })
})

describe('suggestedExclusions', () => {
  it('finds trailers and teasers, in English and Italian', () => {
    const series = s([
      v('t1', { title: 'Official Trailer | BBC Earth' }),
      v('t2', { title: 'First Look: Planet Earth III' }),
      v('t3', { title: 'Anteprima della stagione' }),
      v('t4', { title: 'Teaser', watched: true }),
      v('t5', { title: 'Trailer', excluded: true }),
      v('ep', { title: 'Episode 1: Coasts' }),
      v('word', { title: 'Trailering a boat' })
    ])
    expect(suggestedExclusions(series)).toEqual(['t1', 't2', 't3', 't4'])
  })
})
