import { describe, it, expect } from 'vitest'
import { youTubeApiService } from '../youtube.js'

describe('_extractPlaylistId', () => {
  it('extracts from standard YouTube playlist URL', () => {
    const result = youTubeApiService._extractPlaylistId('https://www.youtube.com/playlist?list=PLABC123DEF456')
    expect(result).toBe('PLABC123DEF456')
  })

  it('extracts from watch URL with list param', () => {
    const result = youTubeApiService._extractPlaylistId('https://www.youtube.com/watch?v=abc123&list=PLABC123DEF456')
    expect(result).toBe('PLABC123DEF456')
  })

  it('extracts from youtu.be short URL', () => {
    const result = youTubeApiService._extractPlaylistId('https://youtu.be/abc123?list=PLABC123DEF456')
    expect(result).toBe('PLABC123DEF456')
  })

  it('extracts list param regardless of position in query', () => {
    const result = youTubeApiService._extractPlaylistId('https://www.youtube.com/watch?v=abc123&list=PLXYZ&index=2')
    expect(result).toBe('PLXYZ')
  })

  it('returns null for non-YouTube URLs', () => {
    expect(youTubeApiService._extractPlaylistId('https://example.com')).toBeNull()
  })

  it('returns null for invalid input types', () => {
    expect(youTubeApiService._extractPlaylistId(null)).toBeNull()
    expect(youTubeApiService._extractPlaylistId(undefined)).toBeNull()
    expect(youTubeApiService._extractPlaylistId(123)).toBeNull()
  })

  it('returns null for URL without list param', () => {
    expect(youTubeApiService._extractPlaylistId('https://www.youtube.com/watch?v=abc123')).toBeNull()
  })

  it('returns null for non-https URL', () => {
    expect(youTubeApiService._extractPlaylistId('http://www.youtube.com/playlist?list=PLABC')).toBeNull()
  })
})

describe('_parseISO8601Duration', () => {
  it('parses hours minutes seconds', () => {
    expect(youTubeApiService._parseISO8601Duration('PT1H2M30S')).toBe(3750)
  })

  it('parses minutes and seconds', () => {
    expect(youTubeApiService._parseISO8601Duration('PT5M10S')).toBe(310)
  })

  it('parses only seconds', () => {
    expect(youTubeApiService._parseISO8601Duration('PT45S')).toBe(45)
  })

  it('parses only hours', () => {
    expect(youTubeApiService._parseISO8601Duration('PT2H')).toBe(7200)
  })

  it('returns 0 for invalid duration', () => {
    expect(youTubeApiService._parseISO8601Duration('')).toBe(0)
    expect(youTubeApiService._parseISO8601Duration(null)).toBe(0)
  })
})

describe('_chunkArray', () => {
  it('splits array into chunks of given size', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7]
    expect(youTubeApiService._chunkArray(arr, 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]])
  })

  it('returns empty array for empty input', () => {
    expect(youTubeApiService._chunkArray([], 5)).toEqual([])
  })

  it('handles chunk size larger than array', () => {
    expect(youTubeApiService._chunkArray([1, 2], 10)).toEqual([[1, 2]])
  })

  it('handles exact division', () => {
    expect(youTubeApiService._chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })
})
