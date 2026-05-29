import { describe, it, expect } from 'vitest'
import { encodeValue, decodeValue, decodeDocument, encodeFields } from '../firestoreRest.js'

describe('encodeValue', () => {
  it('encodes null and undefined as nullValue', () => {
    expect(encodeValue(null)).toEqual({ nullValue: null })
    expect(encodeValue(undefined)).toEqual({ nullValue: null })
  })

  it('encodes booleans', () => {
    expect(encodeValue(true)).toEqual({ booleanValue: true })
    expect(encodeValue(false)).toEqual({ booleanValue: false })
  })

  it('encodes integers as string', () => {
    expect(encodeValue(42)).toEqual({ integerValue: '42' })
    expect(encodeValue(0)).toEqual({ integerValue: '0' })
  })

  it('encodes floats as double', () => {
    expect(encodeValue(3.14)).toEqual({ doubleValue: 3.14 })
  })

  it('encodes strings', () => {
    expect(encodeValue('hello')).toEqual({ stringValue: 'hello' })
    expect(encodeValue('')).toEqual({ stringValue: '' })
  })

  it('encodes arrays', () => {
    expect(encodeValue([1, 'a', true])).toEqual({
      arrayValue: {
        values: [
          { integerValue: '1' },
          { stringValue: 'a' },
          { booleanValue: true }
        ]
      }
    })
  })

  it('encodes objects as mapValue', () => {
    expect(encodeValue({ name: 'test', count: 5 })).toEqual({
      mapValue: {
        fields: {
          name: { stringValue: 'test' },
          count: { integerValue: '5' }
        }
      }
    })
  })

  it('encodes nested objects', () => {
    const result = encodeValue({ nested: { key: 'val' } })
    expect(result.mapValue.fields.nested).toEqual({
      mapValue: {
        fields: {
          key: { stringValue: 'val' }
        }
      }
    })
  })

  it('encodes empty array', () => {
    expect(encodeValue([])).toEqual({ arrayValue: { values: [] } })
  })

  it('encodes empty object', () => {
    expect(encodeValue({})).toEqual({ mapValue: { fields: {} } })
  })
})

describe('decodeValue', () => {
  it('decodes nullValue', () => {
    expect(decodeValue({ nullValue: null })).toBeNull()
  })

  it('decodes booleans', () => {
    expect(decodeValue({ booleanValue: true })).toBe(true)
    expect(decodeValue({ booleanValue: false })).toBe(false)
  })

  it('decodes integers', () => {
    expect(decodeValue({ integerValue: '42' })).toBe(42)
    expect(decodeValue({ integerValue: '0' })).toBe(0)
  })

  it('decodes doubles', () => {
    expect(decodeValue({ doubleValue: 3.14 })).toBe(3.14)
  })

  it('decodes strings', () => {
    expect(decodeValue({ stringValue: 'hello' })).toBe('hello')
  })

  it('decodes arrays', () => {
    expect(decodeValue({
      arrayValue: {
        values: [
          { integerValue: '1' },
          { stringValue: 'a' }
        ]
      }
    })).toEqual([1, 'a'])
  })

  it('decodes objects', () => {
    expect(decodeValue({
      mapValue: {
        fields: {
          name: { stringValue: 'test' },
          count: { integerValue: '5' }
        }
      }
    })).toEqual({ name: 'test', count: 5 })
  })

  it('decodes nested objects', () => {
    expect(decodeValue({
      mapValue: {
        fields: {
          nested: {
            mapValue: {
              fields: {
                key: { stringValue: 'val' }
              }
            }
          }
        }
      }
    })).toEqual({ nested: { key: 'val' } })
  })

  it('returns null for invalid input', () => {
    expect(decodeValue(null)).toBeNull()
    expect(decodeValue({})).toBeNull()
    expect(decodeValue('string')).toBeNull()
  })
})

describe('decodeDocument', () => {
  it('decodes a Firestore document', () => {
    const doc = {
      fields: {
        title: { stringValue: 'My Playlist' },
        count: { integerValue: '10' }
      }
    }
    expect(decodeDocument(doc)).toEqual({ title: 'My Playlist', count: 10 })
  })

  it('returns null for document without fields', () => {
    expect(decodeDocument({})).toBeNull()
    expect(decodeDocument(null)).toBeNull()
  })
})

describe('encodeFields', () => {
  it('encodes an object to Firestore fields format', () => {
    const result = encodeFields({ name: 'test', active: true })
    expect(result).toEqual({
      fields: {
        name: { stringValue: 'test' },
        active: { booleanValue: true }
      }
    })
  })

  it('handles empty object', () => {
    expect(encodeFields({})).toEqual({ fields: {} })
  })
})

describe('roundtrip', () => {
  it('preserves complex nested data through encode->decode', () => {
    const original = {
      title: 'My Series',
      episodes: ['ep1', 'ep2'],
      metadata: {
        views: 100,
        active: true
      },
      count: 0
    }

    const encoded = encodeValue(original)
    const decoded = decodeValue(encoded)
    expect(decoded).toEqual(original)
  })
})
