// Chrome Web Store screenshots: 1280×800, 24-bit PNG (no alpha), captured
// natively at that size from the real extension (dist/) — no scaling.
// Library, thumbnails and API responses are fictional (scripts/store-fixtures.mjs).
//   npm run build && npm run screenshots   →   src/assets/store/screenshots/
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLibrary, imageForUrl, apiResponse } from './store-fixtures.mjs'

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const outDir = join(root, 'src', 'assets', 'store', 'screenshots')
const WORKER = 'https://shy-snowflake-0680.lollo-princigalli.workers.dev'
const SIZE = { width: 1280, height: 800 }

await mkdir(outDir, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'yts-shots-'))
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  serviceWorkers: 'allow',
  viewport: SIZE,
  deviceScaleFactor: 1,
  locale: 'en-US',
  colorScheme: 'dark',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
})

await context.route(`${WORKER}/**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiResponse(new URL(route.request().url()))) }))
await context.route('https://i.ytimg.com/**', route => {
  const svg = imageForUrl(route.request().url())
  return svg ? route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }) : route.fulfill({ status: 404, body: '' })
})

const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 })
const DASH = `chrome-extension://${new URL(worker.url()).host}/src/tab/index.html`
const page = await context.newPage()
const send = (type, payload) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload])

/** Waits for layout, fonts, images and entry animations to settle. */
async function settle(extra = 900) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  // Only images inside the frame: lazy ones below the fold never load.
  await page.waitForFunction(() => [...document.images].every(img => {
    const r = img.getBoundingClientRect()
    const visible = r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
    return !visible || img.complete
  }), null, { timeout: 10000 })
  await page.waitForTimeout(extra)
}

async function open(url = DASH) {
  await page.goto(url)
  // Store screenshots: no scrollbars, no blinking caret.
  await page.addStyleTag({ content: '::-webkit-scrollbar{display:none} *{caret-color:transparent !important}' })
  await page.waitForSelector('.series-card, .empty-state', { timeout: 10000 })
}

async function theme(name) {
  await send('SETTINGS_UPDATE', { theme: name, language: 'en' })
}

/** Scrolls the page so `selector` sits `offset` px below the top (under the fixed header). */
async function scrollTo(selector, offset = 90) {
  const moved = await page.evaluate(([sel, off]) => {
    const el = document.querySelector(sel)
    // Whatever actually scrolls (window or an overflow container), with smooth scrolling off.
    document.documentElement.style.scrollBehavior = 'auto'
    let scroller = el.parentElement
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
    const target = scroller || document.scrollingElement
    target.scrollTop += el.getBoundingClientRect().top - off
    return Math.round(target.scrollTop)
  }, [selector, offset])
  if (!moved) throw new Error(`could not scroll to ${selector}`)
  await page.waitForTimeout(400)
}

async function capture(name) {
  await page.mouse.move(SIZE.width - 2, SIZE.height - 2) // no stray hover states
  await page.waitForTimeout(250)
  const png = await page.screenshot({ type: 'png' })
  const file = join(outDir, name)
  await sharp(png).removeAlpha().png({ compressionLevel: 9 }).toFile(file)
  const meta = await sharp(file).metadata()
  if (meta.width !== SIZE.width || meta.height !== SIZE.height || meta.hasAlpha) throw new Error(`${name}: ${meta.width}x${meta.height} alpha=${meta.hasAlpha}`)
  console.log(`✓ ${name} (${meta.width}×${meta.height}, ${meta.channels} channels)`)
}

// ── Library ──────────────────────────────────────────────────────────────
await page.goto(DASH)
const imported = await send('IMPORT_SERIES', { series: buildLibrary() })
if (!imported?.success) throw new Error(`import failed: ${JSON.stringify(imported)}`)
// Recent activity for the bell (re-marking finished episodes changes no progress).
const library = (await send('STATE_GET')).state.series
for (const [playlistId, index] of [['PLrailjourneyseu', 1], ['PLcosmosexplain', 5], ['PLstreetfoodtour', 4], ['PLdeepblueocean', 2], ['PLpython30days', 17]]) {
  await send('EPISODE_WATCH', { playlistId, videoId: library[playlistId].videos[index].id })
}

// 1 — Home: hero, continue watching, new this week, recommendations (Classic Red)
await theme('classic-red')
await open()
await page.waitForFunction(() => [...document.querySelectorAll('.section-title')].some(h => /More from your channels/i.test(h.textContent)), null, { timeout: 10000 })
await settle(1500)
// Hero title and button stay in frame, with the first row of cards below it.
await scrollTo('.hero-carousel', -200)
await settle(500)
await capture('screenshot-01-home.png')

// 2 — Series detail: progress, resume, new episode, watched toggles (Classic Red)
await open(`${DASH}?series=PLdeepblueocean`)
await page.waitForSelector('#detailModal:not(.hidden) .episode-card')
await settle(800)
await page.evaluate(() => { document.getElementById('detailModalBody').scrollTop = 0 })
await capture('screenshot-02-detail.png')

// 3 — Saved library with collections (Ocean Blue)
await theme('ocean-blue')
await open()
await page.click('.nav-link[data-view="saved"]')
await page.waitForSelector('.collections-section')
await settle()
await capture('screenshot-03-collections.png')

// 4 — Search: local matches + YouTube playlists and channels (Light)
await theme('light')
await open()
await page.fill('#searchInput', 'ocean')
await page.press('#searchInput', 'Enter')
await page.waitForSelector('.search-playlist-card')
await page.waitForSelector('.channel-card')
await page.click('.channel-expand-btn')
await page.waitForSelector('.channel-playlist-card')
await settle()
await scrollTo('.series-row:has(.search-playlist-card)', 95)
await settle(400)
await capture('screenshot-04-search.png')

// 5 — Recent activity and new-episode badges (Forest)
await theme('forest')
await open()
await settle(1200)
await scrollTo('.series-row:nth-of-type(3)', 80)
await settle(500)
await page.click('#activityBtn')
await page.waitForSelector('#activityPanel:not(.hidden) .activity-panel-item')
await page.waitForTimeout(400)
await capture('screenshot-05-activity.png')

await context.close()
await rm(profile, { recursive: true, force: true })
console.log(`\nSaved to ${outDir}`)
