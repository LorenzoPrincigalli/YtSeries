import { describe, expect, it } from 'vitest'
import { normalizeSeriesBackup } from '../seriesValidation.js'

const valid = {
  PL1: {
    playlistId: 'PL1', title: 'Series', videos: [
      { id: 'v1', watched: true, progress: 100 },
      { id: 'v2', progress: 44, resumeTime: 12 }
    ]
  }
}

describe('normalizeSeriesBackup', () => {
  it('returns a safe plain normalized library while preserving progress', () => {
    const result = normalizeSeriesBackup(valid)
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(result.PL1.videos[1]).toMatchObject({ progress: 44, resumeTime: 12, watched: false })
  })

  it('rejects unsafe keys and malformed series before import', () => {
    expect(() => normalizeSeriesBackup({ constructor: valid.PL1 })).toThrow('unsafe key')
    expect(() => normalizeSeriesBackup({ PL1: { playlistId: 'PL1', videos: [{ id: '' }] } })).toThrow('valid id')
  })

  it('rejects duplicate episode ids', () => {
    expect(() => normalizeSeriesBackup({ PL1: { playlistId: 'PL1', videos: [{ id: 'v1' }, { id: 'v1' }] } })).toThrow('unique')
  })
})
