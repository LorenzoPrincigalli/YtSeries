// @ts-check
// Shareable lists, encoded entirely in the link: no server stores them. The
// fragment (#d=…) is compressed JSON in base64url. A link is untrusted input,
// so decoding validates every field and caps every size.
//
// Self-contained on purpose: share.html (GitHub Pages) imports this file directly.

export const SHARE_PAGE = 'https://lorenzoprincigalli.github.io/YtSeries/share.html'
export const SHARE_ORIGIN = 'https://lorenzoprincigalli.github.io'

const VERSION = 1
const MAX_ITEMS = 50
const MAX_ENCODED = 16_384
const MAX_JSON = 65_536
const PLAYLIST_ID = /^[A-Za-z0-9_-]{2,64}$/
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const ENCODED = /^[A-Za-z0-9_-]+$/
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * @typedef {{ playlistId: string, title: string, channelTitle: string, coverVideoId: string, videoCount: number }} ShareItem
 * @typedef {{ name: string, items: ShareItem[] }} ShareList
 */

class ShareError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ShareError'
    this.code = 'INVALID_SHARE'
  }
}

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** @param {string} text */
function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

/** @param {Uint8Array<ArrayBuffer>} bytes @param {CompressionStream | DecompressionStream} stream @param {number} [limit] */
async function pipe(bytes, stream, limit = Infinity) {
  const writer = stream.writable.getWriter()
  writer.write(bytes).catch(() => {})
  writer.close().catch(() => {})
  const reader = stream.readable.getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) { reader.cancel().catch(() => {}); throw new ShareError('Share link is too large') }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return out
}

/** @param {unknown} value @param {number} max */
const clean = (value, max) => (typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, max) : '')

/** First video id of a thumbnail URL like https://i.ytimg.com/vi/<id>/hqdefault.jpg, else ''. @param {unknown} url */
export function coverVideoId(url) {
  const match = typeof url === 'string' ? url.match(/^https:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//) : null
  return match ? match[1] : ''
}

/**
 * Builds the share list for a set of saved series.
 * @param {string} name @param {any[]} seriesList @returns {ShareList}
 */
export function shareListFromSeries(name, seriesList) {
  return {
    name: clean(name, 80),
    items: seriesList.slice(0, MAX_ITEMS).map(series => ({
      playlistId: series.playlistId,
      title: clean(series.title, 200),
      channelTitle: clean(series.channelTitle, 100),
      coverVideoId: coverVideoId(series.thumbnail) || series.videos?.[0]?.id || '',
      videoCount: series.videos?.length || series.videoCount || 0
    }))
  }
}

/** @param {ShareList} list @returns {Promise<string>} the fragment value (without "d=") */
export async function encodeShare(list) {
  const json = JSON.stringify({
    v: VERSION,
    n: clean(list.name, 80),
    i: list.items.slice(0, MAX_ITEMS).map(item => [item.playlistId, clean(item.title, 200), clean(item.channelTitle, 100), VIDEO_ID.test(item.coverVideoId) ? item.coverVideoId : '', item.videoCount | 0])
  })
  return toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')))
}

/** @param {ShareList} list */
export async function shareUrl(list) {
  return `${SHARE_PAGE}#d=${await encodeShare(list)}`
}

/** @param {unknown} encoded @returns {Promise<ShareList>} */
export async function decodeShare(encoded) {
  if (typeof encoded !== 'string' || !encoded || encoded.length > MAX_ENCODED || !ENCODED.test(encoded)) throw new ShareError('Invalid share link')
  let data
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw'), MAX_JSON))
    data = JSON.parse(json)
  } catch (err) {
    if (err instanceof ShareError) throw err
    throw new ShareError('Invalid share link')
  }
  if (!data || data.v !== VERSION || !Array.isArray(data.i) || !data.i.length || data.i.length > MAX_ITEMS) throw new ShareError('Unsupported share link')
  const seen = new Set()
  const items = []
  for (const entry of data.i) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !PLAYLIST_ID.test(entry[0]) || FORBIDDEN_IDS.has(entry[0].toLowerCase()) || seen.has(entry[0])) continue
    seen.add(entry[0])
    const count = Number(entry[4])
    items.push({
      playlistId: entry[0],
      title: clean(entry[1], 200) || entry[0],
      channelTitle: clean(entry[2], 100),
      coverVideoId: typeof entry[3] === 'string' && VIDEO_ID.test(entry[3]) ? entry[3] : '',
      videoCount: Number.isSafeInteger(count) && count >= 0 && count <= 10_000 ? count : 0
    })
  }
  if (!items.length) throw new ShareError('Empty share link')
  return { name: clean(data.n, 80), items }
}

/** The encoded list in a share link, or null for any other URL. @param {string} url */
export function shareDataFromUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(`${SHARE_PAGE}#`)) return null
  return new URLSearchParams(url.slice(SHARE_PAGE.length + 1)).get('d')
}
