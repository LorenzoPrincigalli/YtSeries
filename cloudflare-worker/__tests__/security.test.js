import { describe, it, expect } from 'vitest'
import {
  validateWorkerClient,
  getClientIp,
  DEFAULT_CLIENT_TOKEN
} from '../security.js'

describe('validateWorkerClient', () => {
  it('accepts matching client token', () => {
    const request = new Request('https://worker.test/playlists', {
      headers: { 'X-YT-Series-Client': DEFAULT_CLIENT_TOKEN }
    })
    expect(validateWorkerClient(request, {})).toEqual({ ok: true })
  })

  it('rejects missing header', () => {
    const request = new Request('https://worker.test/playlists')
    expect(validateWorkerClient(request, {})).toMatchObject({ ok: false, status: 403 })
  })

  it('rejects wrong token', () => {
    const request = new Request('https://worker.test/playlists', {
      headers: { 'X-YT-Series-Client': 'wrong' }
    })
    expect(validateWorkerClient(request, { YT_SERIES_CLIENT_TOKEN: 'expected' })).toMatchObject({ ok: false })
  })
})

describe('getClientIp', () => {
  it('reads CF-Connecting-IP', () => {
    const request = new Request('https://x', { headers: { 'CF-Connecting-IP': '1.2.3.4' } })
    expect(getClientIp(request)).toBe('1.2.3.4')
  })
})
