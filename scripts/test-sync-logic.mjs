/**
 * Node tests for Firebase sync pure logic (no Chrome APIs).
 * Run: node scripts/test-sync-logic.mjs
 */
import assert from 'node:assert/strict'
import { encodeFields, decodeDocument } from '../src/services/sync/firestoreRest.js'
import {
  seriesToFirestorePayload,
  mergeRemoteIntoSeries
} from '../src/services/sync/FirestoreSyncTestExports.js'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  OK  ${name}`)
  } catch (err) {
    failed++
    console.error(`  FAIL ${name}`)
    console.error(`       ${err.message}`)
  }
}

test('encodeFields round-trip', () => {
  const original = {
    metadata: { title: 'Test Series', videoCount: 2 },
    completed: false,
    updatedAt: 1712345678901,
    progress: {
      vid1: { w: true, p: 120, a: 1712345678000 }
    }
  }
  const encoded = encodeFields(original)
  const decoded = decodeDocument(encoded)
  assert.equal(decoded.metadata.title, 'Test Series')
  assert.equal(decoded.metadata.videoCount, 2)
  assert.equal(decoded.progress.vid1.w, true)
  assert.equal(decoded.progress.vid1.p, 120)
  assert.equal(decoded.progress.vid1.a, 1712345678000)
})

test('seriesToFirestorePayload includes watched progress only', () => {
  const series = {
    title: 'My Show',
    thumbnail: 'http://x',
    channelTitle: 'Ch',
    channelId: 'c1',
    videoCount: 2,
    lastEpisodeIndex: 1,
    completed: false,
    videos: [
      { id: 'v1', watched: true, progress: 100, watchedAt: 1000 },
      { id: 'v2', watched: false, progress: 0, watchedAt: null }
    ]
  }
  const payload = seriesToFirestorePayload(series)
  assert.equal(payload.metadata.title, 'My Show')
  assert.ok(payload.progress.v1)
  assert.equal(payload.progress.v1.w, true)
  assert.equal(payload.progress.v2, undefined)
})

test('mergeRemoteIntoSeries prefers newer watchedAt per video', () => {
  const series = {
    addedAt: 100,
    videos: [
      { id: 'v1', watched: false, progress: 0, watchedAt: null },
      { id: 'v2', watched: true, progress: 50, watchedAt: 5000 }
    ],
    lastEpisodeIndex: 0,
    completed: false
  }
  mergeRemoteIntoSeries(series, {
    updatedAt: 9000,
    completed: true,
    lastEpisodeIndex: 1,
    progress: {
      v1: { w: true, p: 200, a: 8000 },
      v2: { w: false, p: 0, a: 1000 }
    }
  })
  assert.equal(series.videos[0].watched, true)
  assert.equal(series.videos[0].watchedAt, 8000)
  assert.equal(series.videos[1].watched, true)
  assert.equal(series.videos[1].watchedAt, 5000)
  assert.equal(series.completed, true)
})

test('mergeRemoteIntoSeries keeps local when local watchedAt is newer', () => {
  const series = {
    syncUpdatedAt: 10000,
    videos: [{ id: 'v1', watched: true, progress: 300, watchedAt: 9000 }],
    lastEpisodeIndex: 0,
    completed: false
  }
  mergeRemoteIntoSeries(series, {
    updatedAt: 5000,
    progress: { v1: { w: false, p: 0, a: 1000 } }
  })
  assert.equal(series.videos[0].watched, true)
  assert.equal(series.videos[0].watchedAt, 9000)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
