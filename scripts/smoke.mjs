// End-to-end smoke test: loads dist/ as an unpacked extension in Chromium,
// exercises the service worker message API, renders the dashboard and fails
// on any uncaught page error. Run after `npm run build`:  npm run smoke
import { chromium } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const profile = await mkdtemp(join(tmpdir(), 'yts-smoke-'))
const failures = []
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failures.push(label) }

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium', // new headless mode; the old headless shell cannot load extensions
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
})

try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 })
  const extensionId = new URL(worker.url()).host
  check(Boolean(extensionId), `service worker started (${extensionId})`)

  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', err => pageErrors.push(err.message))
  page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(msg.text()) })

  await page.goto(`chrome-extension://${extensionId}/src/tab/index.html`)
  await page.waitForLoadState('networkidle')

  const send = (type, payload) => page.evaluate(([type, payload]) => chrome.runtime.sendMessage({ type, payload }), [type, payload])

  const state = await send('STATE_GET')
  check(state?.success === true && typeof state.state?.series === 'object', 'STATE_GET returns state')

  const invalid = await send('SERIES_DELETE', { playlistId: '<img src=x>' })
  check(invalid?.error === 'INVALID_PAYLOAD', 'router rejects invalid payloads')

  const unknown = await send('NOT_A_MESSAGE')
  check(unknown?.error === 'UNKNOWN_TYPE', 'router rejects unknown message types')

  const demo = await send('LOAD_DEMO_DATA')
  check(demo?.success === true && demo.count > 0, `demo data loaded (${demo?.count ?? demo?.error})`)

  const after = await send('STATE_GET')
  const [firstId] = Object.keys(after.state.series)
  const firstVideo = after.state.series[firstId].videos[0].id
  const watched = await send('EPISODE_WATCH', { videoId: firstVideo, playlistId: firstId })
  check(watched?.success === true, 'EPISODE_WATCH succeeds')

  const theme = await send('SETTINGS_UPDATE', { theme: 'light' })
  check(theme?.settings?.theme === 'light', 'SETTINGS_UPDATE persists theme')

  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  const cards = await page.locator('.series-card, .hero, [data-playlist-id]').count()
  check(cards > 0, `dashboard renders library (${cards} elements)`)

  const reset = await send('STORAGE_RESET')
  check(reset?.success === true, 'STORAGE_RESET succeeds')

  check(pageErrors.length === 0, `no page errors${pageErrors.length ? ': ' + pageErrors.join(' | ') : ''}`)
} catch (err) {
  check(false, `smoke run crashed: ${err.message}`)
} finally {
  await context.close()
  await rm(profile, { recursive: true, force: true })
}

if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed`)
  process.exit(1)
}
console.log('\nSmoke test passed')
