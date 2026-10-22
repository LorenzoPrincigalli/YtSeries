import { describe, it, expect } from 'vitest'
import {
  filterSeries, thisWeekSeries, heroSeries, collectionNames, pickRecommendations,
  cardProgress, heroProgress, watchUrl, formatDuration, findNewEpisode, isComplete
} from '../seriesView.js'

const v = (id, extra = {}) => ({ id, title: id, ...extra })
const s = (playlistId, videos, extra = {}) => ({ playlistId, title: playlistId, channelTitle: 'Chan', videos, addedAt: 0, ...extra })

describe('filterSeries', () => {
  const library = [
    s('done', [v('a', { watched: true })], { addedAt: 3, completed: true }),
    s('started', [v('a', { watched: true }), v('b')], { addedAt: 1 }),
    s('fresh', [v('a')], { addedAt: 2, newEpisodesCount: 1, collection: 'Anime' })
  ]

  it('orders unfinished first, then in-progress, then newest', () => {
    expect(filterSeries(library).map(x => x.playlistId)).toEqual(['started', 'fresh', 'done'])
  })

  it('does not mutate its input', () => {
    const copy = [...library]
    filterSeries(library)
    expect(library).toEqual(copy)
  })

  it('applies search, collection and filter criteria', () => {
    expect(filterSeries(library, { search: 'FRE' }).map(x => x.playlistId)).toEqual(['fresh'])
    expect(filterSeries(library, { collection: 'Anime' }).map(x => x.playlistId)).toEqual(['fresh'])
    expect(filterSeries(library, { filter: 'watching' }).map(x => x.playlistId)).toEqual(['started'])
    expect(filterSeries(library, { filter: 'completed' }).map(x => x.playlistId)).toEqual(['done'])
    expect(filterSeries(library, { filter: 'new' }).map(x => x.playlistId)).toEqual(['fresh'])
  })
})

describe('derived views', () => {
  it('finds series with episodes published this week (Mon–Sun)', () => {
    const now = new Date('2026-10-22T12:00:00') // Thursday
    const lib = [
      s('this', [v('a', { publishedAt: '2026-10-19T08:00:00' })]),
      s('last', [v('a', { publishedAt: '2026-10-18T23:00:00' })]),
      s('closed', [v('a', { publishedAt: '2026-10-20T08:00:00' })], { completed: true })
    ]
    expect(thisWeekSeries(lib, now).map(x => x.playlistId)).toEqual(['this'])
  })

  it('builds the hero list: in progress, not started, completed; max 8', () => {
    const lib = [s('c', [v('a', { watched: true })]), s('n', [v('a')]), s('p', [v('a', { watched: true }), v('b')])]
    expect(heroSeries(lib).map(x => x.playlistId)).toEqual(['p', 'n', 'c'])
    expect(heroSeries(Array.from({ length: 12 }, (_, i) => s(`x${i}`, [v('a')])))).toHaveLength(8)
  })

  it('merges explicit and referenced collection names', () => {
    expect(collectionNames({ collections: ['B'], series: { x: { collection: 'A' }, y: { collection: 'B' } } })).toEqual(['A', 'B'])
  })

  it('computes card and hero progress', () => {
    expect(cardProgress(s('x', [v('a', { watched: true }), v('b', { progress: 40 })]))).toBe(40)
    expect(cardProgress(s('x', [v('a', { watched: true })]))).toBe(100)
    expect(heroProgress(s('x', [v('a', { progress: 30, watchedAt: 2 }), v('b', { watched: true, watchedAt: 1 })]))).toBe(30)
    expect(isComplete(s('x', []))).toBe(false)
  })

  it('flags episodes published in the last 7 days as new', () => {
    const now = Date.parse('2026-10-22T00:00:00Z')
    const series = s('x', [v('old', { publishedAt: '2026-10-01T00:00:00Z' }), v('new', { publishedAt: '2026-10-20T00:00:00Z' })])
    expect(findNewEpisode(series, now)?.id).toBe('new')
  })
})

describe('recommendations', () => {
  it('allocates slots by channel weight and skips saved playlists', () => {
    const byChannel = { A: [{ playlistId: 'saved' }, { playlistId: 'a1' }, { playlistId: 'a2' }], B: [{ playlistId: 'b1' }] }
    const picked = pickRecommendations(byChannel, { A: 3, B: 1 }, new Set(['saved']), 4, () => 0)
    expect(picked.map(p => p.playlistId).sort()).toEqual(['a1', 'a2', 'b1'])
  })
})

describe('formatting', () => {
  it('builds encoded watch URLs with resume time', () => {
    expect(watchUrl('abc', 'PL&x', 61.9)).toBe('https://www.youtube.com/watch?v=abc&list=PL%26x&t=61s')
    expect(watchUrl('abc', 'PL')).toBe('https://www.youtube.com/watch?v=abc&list=PL')
  })

  it('formats durations', () => {
    expect(formatDuration(59)).toBe('0:59')
    expect(formatDuration(3725)).toBe('1:02:05')
  })
})
