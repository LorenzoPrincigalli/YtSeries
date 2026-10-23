import { describe, it, expect, vi } from 'vitest'
import { Store } from '../../state/store.js'
import { episodeRoutes } from '../handlers/episodes.js'
import { EVENTS } from '../../shared/events.js'

const ctx = () => {
  const store = new Store()
  store.addSeries({ playlistId: 'PL1', title: 'Show', videos: ['a', 'b', 'c', 'd'].map(id => ({ id, title: id })) })
  return {
    store,
    storage: { setLocal: vi.fn().mockResolvedValue(), set: vi.fn().mockResolvedValue() },
    sync: { afterMutation: vi.fn().mockResolvedValue(), afterDelete: vi.fn().mockResolvedValue() },
    broadcast: vi.fn().mockResolvedValue()
  }
}
const watch = (c, videoId) => episodeRoutes[EVENTS.EPISODE_WATCH].handler(c, { playlistId: 'PL1', videoId })

describe('series milestones', () => {
  it('reports each milestone once, when an episode crosses it', async () => {
    const c = ctx()
    expect((await watch(c, 'a')).milestone).toEqual({ percent: 25, title: 'Show' })
    expect((await watch(c, 'a')).milestone).toBeNull()
    expect((await watch(c, 'b')).milestone).toEqual({ percent: 50, title: 'Show' })
    await watch(c, 'c')
    expect((await watch(c, 'd')).milestone).toEqual({ percent: 100, title: 'Show' })
    expect(c.store.getState().activity.filter(e => e.type === 'series_milestone').map(e => e.title))
      .toEqual(['Show · 100%', 'Show · 75%', 'Show · 50%', 'Show · 25%'])
  })

  it('ignores excluded episodes when computing the percentage', async () => {
    const c = ctx()
    c.store.setEpisodesExcluded('PL1', ['c', 'd'], true)
    expect((await watch(c, 'a')).milestone.percent).toBe(50)
    expect((await watch(c, 'b')).milestone.percent).toBe(100)
  })

  it('celebrates nothing when unwatching', async () => {
    const c = ctx()
    await watch(c, 'a')
    const response = await episodeRoutes[EVENTS.EPISODE_UNWATCH].handler(c, { playlistId: 'PL1', videoId: 'a' })
    expect(response.milestone).toBeNull()
  })
})
