import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { Store } from '../store.js'
import { seriesToFirestorePayload, mergeRemoteIntoSeries } from '../../services/sync/FirebaseSyncService.js'
import { normalizeSeriesBackup, normalizeNotes } from '../../shared/seriesValidation.js'
import { notesMarkdown, activeNotes } from '../../tab/components/notes.js'
import { setLanguage } from '../../shared/i18n.js'

beforeAll(() => {
  vi.stubGlobal('chrome', { runtime: { getURL: () => '' } })
  setLanguage('en')
})

const fetched = () => ({ playlistId: 'PL1', title: 'Course', channelTitle: 'Prof', videos: ['v1', 'v2'].map(id => ({ id, title: `Lesson ${id}` })) })

describe('episode notes', () => {
  /** @type {Store} */
  let store
  beforeEach(() => {
    store = new Store()
    store.addSeries(fetched())
  })

  it('adds, edits and deletes notes as syncable changes', () => {
    const id = store.addNote('PL1', 'v1', 75.9, 'Key idea')
    let note = store.getSeriesById('PL1').notes[id]
    expect(note).toMatchObject({ v: 'v1', t: 75, x: 'Key idea' })
    expect(note.a).toBe(store.getSeriesById('PL1').localUpdatedAt)

    store.updateNote('PL1', id, 'Key idea, revised')
    expect(store.getSeriesById('PL1').notes[id].x).toBe('Key idea, revised')

    store.deleteNote('PL1', id)
    note = store.getSeriesById('PL1').notes[id]
    expect(note).toMatchObject({ d: true, x: '' })
    expect(() => store.updateNote('PL1', id, 'again')).toThrow()
  })

  it('rejects unknown series, videos and notes', () => {
    expect(() => store.addNote('nope', 'v1', 0, 'x')).toThrow()
    expect(() => store.addNote('PL1', 'other', 0, 'x')).toThrow()
    expect(() => store.deleteNote('PL1', '__proto__')).toThrow()
  })

  it('keeps notes when the playlist is refreshed', () => {
    const id = store.addNote('PL1', 'v2', 10, 'Remember')
    store.addSeries(fetched())
    expect(store.getSeriesById('PL1').notes[id].x).toBe('Remember')
  })

  it('caps active notes and prunes the oldest tombstones', () => {
    for (let i = 0; i < 300; i++) store.addNote('PL1', 'v1', i, `n${i}`)
    expect(() => store.addNote('PL1', 'v1', 1, 'one too many')).toThrow(/300/)
    const ids = Object.keys(store.getSeriesById('PL1').notes)
    for (const id of ids.slice(0, 150)) store.deleteNote('PL1', id)
    for (let i = 0; i < 150; i++) store.addNote('PL1', 'v2', i, `m${i}`)
    const notes = Object.values(store.getSeriesById('PL1').notes)
    expect(notes.length).toBe(400)
    expect(notes.filter(note => !note.d).length).toBe(300)
  })

  it('merges notes one by one across devices, latest edit or deletion wins', () => {
    const id = store.addNote('PL1', 'v1', 5, 'Mine')
    const payload = seriesToFirestorePayload(store.getSeriesById('PL1'))
    expect(payload.notes[id].x).toBe('Mine')

    const other = new Store()
    other.addSeries(fetched())
    const remoteSeries = other._getSeriesMutable('PL1')
    mergeRemoteIntoSeries(remoteSeries, payload)
    expect(remoteSeries.notes[id].x).toBe('Mine')

    // The other device deletes it later; an older remote copy must not resurrect it.
    other.deleteNote('PL1', id)
    const local = store._getSeriesMutable('PL1')
    mergeRemoteIntoSeries(local, seriesToFirestorePayload(other.getSeriesById('PL1')))
    expect(local.notes[id].d).toBe(true)
    mergeRemoteIntoSeries(local, payload)
    expect(local.notes[id].d).toBe(true)
  })

  it('drops malformed notes from backups and cloud documents', () => {
    const notes = normalizeNotes({
      ok: { v: 'v1', t: 3, x: 'fine', a: 1 },
      gone: { v: 'v1', t: 3, x: 'secret', a: 2, d: true },
      '__proto__': { v: 'v1', t: 1, x: 'x', a: 1 },
      'bad id!': { v: 'v1', t: 1, x: 'x', a: 1 },
      long: { v: 'v1', t: 1, x: 'x'.repeat(1001), a: 1 },
      noTime: { v: 'v1', x: 'x', a: 1 }
    })
    expect(Object.keys(notes)).toEqual(['ok', 'gone'])
    expect(notes.gone).toEqual({ v: 'v1', t: 3, x: '', a: 2, d: true })
    const id = store.addNote('PL1', 'v1', 5, 'Backed up')
    expect(normalizeSeriesBackup({ PL1: store.getSeriesById('PL1') }).PL1.notes[id].x).toBe('Backed up')
  })
})

describe('notes in the dashboard', () => {
  it('lists active notes in episode order and exports Markdown with timestamped links', () => {
    const series = {
      ...fetched(),
      notes: {
        b: { v: 'v2', t: 30, x: 'Second lesson', a: 1 },
        a: { v: 'v1', t: 754, x: 'Line one\nline two', a: 1 },
        z: { v: 'v1', t: 5, x: '', a: 2, d: true },
        orphan: { v: 'removed', t: 1, x: 'video left the playlist', a: 1 }
      }
    }
    expect(activeNotes(series).map(note => note.id)).toEqual(['a', 'b'])
    const markdown = notesMarkdown(series)
    expect(markdown).toContain('# Course')
    expect(markdown).toContain('Prof — https://www.youtube.com/playlist?list=PL1')
    expect(markdown).toContain('## episode 1 · Lesson v1')
    expect(markdown).toContain('- [12:34](https://www.youtube.com/watch?v=v1&list=PL1&t=754s) Line one line two')
    expect(markdown).not.toContain('video left the playlist')
  })
})
