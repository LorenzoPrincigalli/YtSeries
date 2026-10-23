import { describe, it, expect } from 'vitest'
import { encodeShare, decodeShare, shareUrl, shareDataFromUrl, shareListFromSeries, coverVideoId, SHARE_PAGE } from '../shareCodec.js'

const series = (n, extra = {}) => ({
  playlistId: `PL${String(n).padStart(10, '0')}`,
  title: `Series ${n}`,
  channelTitle: 'Channel',
  thumbnail: `https://i.ytimg.com/vi/abcdefghij${n % 10}/hqdefault.jpg`,
  videos: [{ id: 'zzzzzzzzzzz' }, { id: 'yyyyyyyyyyy' }],
  ...extra
})

/** Encodes arbitrary JSON the way encodeShare does, to forge hostile links. */
async function forge(value) {
  const stream = new CompressionStream('deflate-raw')
  const bytes = new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(stream)).arrayBuffer())
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('share links', () => {
  it('round-trips a list through the link', async () => {
    const list = shareListFromSeries('Documentaries', [series(1), series(2, { playlistId: 'UULFHnyfMqiRRG1u-2MsSQLbXA' })])
    const url = await shareUrl(list)
    expect(url.startsWith(`${SHARE_PAGE}#d=`)).toBe(true)
    const decoded = await decodeShare(shareDataFromUrl(url))
    expect(decoded).toEqual({
      name: 'Documentaries',
      items: [
        { playlistId: 'PL0000000001', title: 'Series 1', channelTitle: 'Channel', coverVideoId: 'abcdefghij1', videoCount: 2 },
        { playlistId: 'UULFHnyfMqiRRG1u-2MsSQLbXA', title: 'Series 2', channelTitle: 'Channel', coverVideoId: 'abcdefghij2', videoCount: 2 }
      ]
    })
  })

  it('stays short: 50 series fit comfortably in a URL', async () => {
    const encoded = await encodeShare(shareListFromSeries('Big list', Array.from({ length: 60 }, (_, i) => series(i))))
    expect(encoded.length).toBeLessThan(4000)
    expect((await decodeShare(encoded)).items).toHaveLength(50)
  })

  it('extracts the cover video from thumbnails', () => {
    expect(coverVideoId('https://i.ytimg.com/vi/BRlbSji4w2c/hqdefault.jpg')).toBe('BRlbSji4w2c')
    expect(coverVideoId('https://i9.ytimg.com/vi_webp/BRlbSji4w2c/x.webp')).toBe('BRlbSji4w2c')
    expect(coverVideoId('https://evil.example/vi/BRlbSji4w2c/x.jpg')).toBe('')
  })

  it('only recognises links to the share page', () => {
    expect(shareDataFromUrl(`${SHARE_PAGE}#d=abc`)).toBe('abc')
    expect(shareDataFromUrl('https://evil.example/share.html#d=abc')).toBeNull()
    expect(shareDataFromUrl('https://www.youtube.com/playlist?list=PL1')).toBeNull()
  })

  it('rejects garbage, oversized and unsupported links', async () => {
    for (const bad of ['', '***', 'a'.repeat(20_000), 'AAAA', null, 42]) await expect(decodeShare(bad)).rejects.toMatchObject({ code: 'INVALID_SHARE' })
    await expect(decodeShare(await forge({ v: 2, n: 'x', i: [['PL1234', 't', 'c', '', 1]] }))).rejects.toMatchObject({ code: 'INVALID_SHARE' })
    await expect(decodeShare(await forge({ v: 1, n: 'x', i: [] }))).rejects.toMatchObject({ code: 'INVALID_SHARE' })
  })

  it('stops a decompression bomb before it expands', async () => {
    const bomb = await forge({ v: 1, n: 'x'.repeat(200_000), i: [['PL1234', 't', 'c', '', 1]] })
    expect(bomb.length).toBeLessThan(16_384)
    await expect(decodeShare(bomb)).rejects.toMatchObject({ code: 'INVALID_SHARE' })
  })

  it('sanitises every field of a hostile list', async () => {
    const decoded = await decodeShare(await forge({
      v: 1,
      n: 'Name\u0000\nwith control chars',
      i: [
        ['PL1234', '<img src=x onerror=alert(1)>', 'C', 'not-a-video-id', -5],
        ['PL1234', 'duplicate', 'C', '', 1],
        ['../../etc', 'bad id', 'C', '', 1],
        ['__proto__', 'proto', 'C', '', 1],
        'not an array',
        ['PL5678', 7, { toString: 1 }, 'abcdefghijk', 99999]
      ]
    }))
    expect(decoded.name).toBe('Name  with control chars')
    expect(decoded.items).toEqual([
      { playlistId: 'PL1234', title: '<img src=x onerror=alert(1)>', channelTitle: 'C', coverVideoId: '', videoCount: 0 },
      { playlistId: 'PL5678', title: 'PL5678', channelTitle: '', coverVideoId: 'abcdefghijk', videoCount: 0 }
    ])
  })
})
