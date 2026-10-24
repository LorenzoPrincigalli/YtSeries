// Full frontend E2E suite. Loads dist/ in Chromium, stubs the YouTube Worker
// with deterministic fixtures and drives every dashboard feature, the popup
// and the content script. Each step is independent: a failure is recorded
// with a screenshot and the run continues.
//   npm run build && npm run e2e        (E2E_ARTIFACTS=<dir> keeps screenshots)
import { chromium } from 'playwright'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1' // lets context.route see service-worker fetches

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const artifacts = process.env.E2E_ARTIFACTS || await mkdtemp(join(tmpdir(), 'yts-e2e-art-'))
await mkdir(artifacts, { recursive: true })
const axeSource = await readFile(join(root, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
const WORKER = 'https://shy-snowflake-0680.lollo-princigalli.workers.dev'
const SHARE_SITE = 'https://lorenzoprincigalli.github.io/YtSeries'

// ── YouTube Worker fixtures ──────────────────────────────────────────────
const RECENT = new Date(Date.now() - 2 * 86_400_000).toISOString()
const CHANNEL = 'UCgreatchannel0000000001'
// A followed channel uploads weekly: newest first, like YouTube's uploads playlists.
const weeklyUploads = playlistId => [0, 1, 2, 3, 4, 5].map(week => ({
  snippet: { title: `Upload ${6 - week}`, position: week, publishedAt: new Date(Date.now() - (week * 7 + 1) * 86_400_000).toISOString(), resourceId: { videoId: `${playlistId.slice(-5)}up${6 - week}` }, thumbnails: thumb(`up${week}`) }
}))
const thumb = id => ({ high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } })
const videoIds = playlistId => [1, 2, 3].map(n => `${playlistId.slice(-6)}vid${n}`)
let apiMode = 'ok' // 'ok' | 'down' | 'quota'
const apiCalls = []

function fixture(url) {
  const endpoint = url.pathname.slice(1)
  const q = url.searchParams
  if (endpoint === 'search') {
    return { items: [
      { id: { kind: 'youtube#playlist', playlistId: 'PLsearch0001' }, snippet: { title: 'Search Result Series', channelTitle: 'Search Chan', channelId: 'UCsearch', thumbnails: thumb('s1') } },
      { id: { kind: 'youtube#channel' }, snippet: { channelId: CHANNEL, title: 'Great Channel', description: 'A channel', thumbnails: thumb('c1') } }
    ] }
  }
  if (endpoint === 'playlists' && q.get('channelId')) {
    return { items: ['PLrelated001', 'PLrelated002'].map(id => ({ id, snippet: { title: `Related ${id.slice(-3)}`, channelTitle: 'Rel', channelId: q.get('channelId'), thumbnails: thumb(id) }, contentDetails: { itemCount: 3 } })) }
  }
  if (endpoint === 'playlists') {
    const id = q.get('id')
    if (id === 'PLmissing000') return { items: [] }
    if (id.startsWith('UU')) return { items: [{ id, snippet: { title: 'Videos', channelTitle: 'Great Channel', channelId: CHANNEL, thumbnails: thumb(id) }, contentDetails: { itemCount: 6 } }] }
    return { items: [{ id, snippet: { title: `Playlist ${id}`, description: 'Fixture playlist', channelTitle: 'Fixture Channel', channelId: 'UCfixture01', thumbnails: thumb(id) }, contentDetails: { itemCount: 3 } }] }
  }
  if (endpoint === 'playlistItems') {
    if (q.get('playlistId').startsWith('UU')) return { items: weeklyUploads(q.get('playlistId')) }
    // PLtrailer001 opens with a trailer, to exercise the "exclude trailers?" suggestion.
    if (q.get('playlistId') === 'PLtrailer001') {
      return { items: ['Official Trailer', 'Episode 1', 'Episode 2'].map((title, position) => ({ snippet: { title, position, publishedAt: RECENT, resourceId: { videoId: `trailervid0${position}` }, thumbnails: thumb(`t${position}`) } })) }
    }
    return { items: videoIds(q.get('playlistId')).map((videoId, position) => ({ snippet: { title: `Episode ${position + 1} of ${q.get('playlistId')}`, position, publishedAt: RECENT, resourceId: { videoId }, thumbnails: thumb(videoId) } })) }
  }
  if (endpoint === 'videos') return { items: q.get('id').split(',').map(id => ({ id, contentDetails: { duration: 'PT3M20S' } })) }
  return null
}

// ── Harness ──────────────────────────────────────────────────────────────
const results = []
const consoleErrors = []
let context, page, extensionId

async function step(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name} (${Date.now() - started} ms)`)
  } catch (err) {
    const file = join(artifacts, `fail-${results.length + 1}.png`)
    await page?.screenshot({ path: file }).catch(() => {})
    results.push({ name, ok: false, error: err.message.split('\n')[0] })
    console.log(`  ✗ ${name}\n      ${err.message.split('\n').slice(0, 3).join('\n      ')}\n      screenshot: ${file}`)
    await recover()
  }
}

/** After a failure, return to a neutral state so later steps are not blocked. */
async function recover() {
  apiMode = 'ok'
  for (let i = 0; i < 4; i++) {
    const open = await page.evaluate(() => Boolean(document.querySelector('.modal-overlay:not(.hidden), dialog[open], #folderPicker'))).catch(() => false)
    if (!open) break
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(150)
  }
}
const assert = (cond, message) => { if (!cond) throw new Error(message) }
const send = (type, payload) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload])
const state = async () => (await send('STATE_GET')).state
const seriesCount = async () => Object.keys((await state()).series).length
const toastText = async () => (await page.waitForSelector('.toast-region .toast', { timeout: 5000 })).textContent()
const clearToasts = () => page.evaluate(() => document.getElementById('toastRegion')?.replaceChildren())
const confirm = async (accept = true) => {
  await page.waitForSelector('dialog.confirm-modal[open]')
  await page.click(`dialog.confirm-modal[open] .modal-footer button:${accept ? 'last-child' : 'first-child'}`)
  await page.waitForSelector('dialog.confirm-modal', { state: 'detached' })
}
const settled = () => page.waitForTimeout(250)
const goHome = async () => { await page.click('.nav-link[data-view="home"]'); await settled() }
const FILTER_INDEX = { all: 0, watching: 1, completed: 2, new: 3 }
/** Opens "Your series" from the header menu, on a filter. */
const openLibrary = async (filter = 'all') => {
  await page.click('#libraryMenuBtn')
  await page.click(`#libraryMenu .nav-menu-item >> nth=${FILTER_INDEX[filter]}`)
  await page.waitForSelector('.library-toolbar')
}
/** Opens Settings (if needed) on the given section. */
async function settingsSection(section) {
  if (await page.locator('#settingsModal.hidden').count()) {
    await page.click('#settingsBtn')
    await page.waitForSelector('#settingsModal:not(.hidden)')
  }
  await page.click(`.settings-tab[data-section="${section}"]`)
}
async function axe(label, selector) {
  // Contrast measured mid-transition (e.g. a tab losing its active colour) is a false positive.
  await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity), null, { timeout: 3000 }).catch(() => {})
  await page.evaluate(axeSource)
  const violations = await page.evaluate(async scope => {
    const { violations } = await window.axe.run(scope ? document.querySelector(scope) : document, { resultTypes: ['violations'] })
    return violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(', ')}`)
  }, selector)
  assert(!violations.length, `${label}: ${violations.join(' | ')}`)
}
function watchErrors(p, label) {
  p.on('pageerror', err => consoleErrors.push(`${label}: ${err.message}`))
  p.on('console', msg => {
    // Expected warnings from deliberately failing API calls are logged as warnings, not errors.
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) consoleErrors.push(`${label}: ${msg.text()}`)
  })
}

// ── Run ──────────────────────────────────────────────────────────────────
const profile = await mkdtemp(join(tmpdir(), 'yts-e2e-'))
context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  serviceWorkers: 'allow',
  viewport: { width: 1280, height: 800 },
  locale: 'en-US', // assertions use English strings; the extension follows navigator.language
  acceptDownloads: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
})

await context.route(`${WORKER}/**`, route => {
  const url = new URL(route.request().url())
  apiCalls.push(url.pathname)
  if (apiMode === 'down') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":503,"errors":[]}}' })
  if (apiMode === 'quota') return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":{"code":403,"errors":[{"reason":"quotaExceeded"}]}}' })
  const body = fixture(url)
  return route.fulfill({ status: body ? 200 : 404, contentType: 'application/json', body: JSON.stringify(body || {}) })
})
// Thumbnails: serve a 1×1 PNG so the run never touches the network.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
await context.route('https://i.ytimg.com/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))

const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 })
extensionId = new URL(worker.url()).host
page = await context.newPage()
watchErrors(page, 'dashboard')
const DASH = `chrome-extension://${extensionId}/src/tab/index.html`

console.log('\nDashboard — empty library')
await step('first run shows the welcome state', async () => {
  await page.goto(DASH)
  await page.waitForSelector('.empty-state-title')
  assert(await page.locator('#loadingScreen').count() === 0, 'loading skeleton still present')
})
await step('a11y: empty home (dark theme)', () => axe('empty home'))

console.log('\nAdd series via link')
await step('empty URL shows inline error and keeps the dialog open', async () => {
  await page.click('#addPlaylistBtn')
  await page.waitForSelector('#addPlaylistModal:not(.hidden)')
  assert(await page.evaluate(() => document.activeElement?.id) === 'playlistUrlInput', 'URL input not focused on open')
  await page.click('#addPlaylistConfirm')
  assert(await page.isVisible('#playlistError'), 'no inline error')
})
await step('non-YouTube URL is rejected with a translated message', async () => {
  await page.fill('#playlistUrlInput', 'https://evil.example/playlist?list=PLabc')
  await page.click('#addPlaylistConfirm')
  await page.waitForFunction(() => /valid YouTube playlist link/i.test(document.getElementById('playlistError').textContent))
})
await step('valid URL adds the series, closes the dialog and shows a toast', async () => {
  await page.fill('#playlistUrlInput', 'https://www.youtube.com/playlist?list=PLfixture001')
  await page.press('#playlistUrlInput', 'Enter')
  await page.waitForSelector('#addPlaylistModal.hidden', { state: 'attached' })
  assert(/Added/.test(await toastText()), 'no success toast')
  await page.waitForSelector('.series-card')
  assert(await seriesCount() === 1, 'series not stored')
  assert(await page.evaluate(() => document.activeElement?.id) === 'addPlaylistBtn', 'focus not restored to the opener')
})
await step('adding the same playlist again is refused', async () => {
  await page.click('#addPlaylistBtn')
  await page.fill('#playlistUrlInput', 'https://www.youtube.com/watch?v=x&list=PLfixture001')
  await page.click('#addPlaylistConfirm')
  await page.waitForFunction(() => /already/i.test(document.getElementById('playlistError').textContent))
  await page.keyboard.press('Escape')
  await page.waitForSelector('#addPlaylistModal.hidden', { state: 'attached' })
})
await step('missing/private playlist shows "not found"', async () => {
  await page.click('#addPlaylistBtn')
  await page.fill('#playlistUrlInput', 'https://www.youtube.com/playlist?list=PLmissing000')
  await page.click('#addPlaylistConfirm')
  await page.waitForFunction(() => /not found/i.test(document.getElementById('playlistError').textContent))
  await page.click('#addPlaylistCancel')
})
await step('API outage shows a clear error instead of failing silently', async () => {
  apiMode = 'down'
  await page.click('#addPlaylistBtn')
  await page.fill('#playlistUrlInput', 'https://www.youtube.com/playlist?list=PLoutage0001')
  await page.click('#addPlaylistConfirm')
  await page.waitForFunction(() => /not responding|unreachable/i.test(document.getElementById('playlistError').textContent), null, { timeout: 15000 })
  apiMode = 'ok'
  await page.click('#addPlaylistCancel')
})

console.log('\nSearch')
await step('typing filters the local library and shows the Enter hint', async () => {
  await page.fill('#searchInput', 'fixture')
  await page.waitForSelector('.search-header-title')
  assert(await page.locator('.series-card').count() >= 1, 'local match not shown')
  await page.waitForSelector('.search-header-hint', { timeout: 4000 })
})
await step('Enter searches YouTube: playlist row and channel card', async () => {
  // The circuit breaker may be open after the outage step: give it a fresh worker-side state.
  await page.press('#searchInput', 'Enter')
  await page.waitForSelector('.search-playlist-card', { timeout: 15000 })
  await page.waitForSelector('.channel-card')
})
await step('channel card expands its playlists (aria-expanded)', async () => {
  await page.click('.channel-expand-btn')
  await page.waitForSelector('.channel-playlist-card')
  assert(await page.getAttribute('.channel-expand-btn', 'aria-expanded') === 'true', 'aria-expanded not set')
})
await step('adding a search result stores it and clears the search', async () => {
  await clearToasts()
  await page.click('.search-playlist-card .card-add-overlay')
  assert(/Added/.test(await toastText()), 'no toast')
  await page.waitForFunction(() => document.getElementById('searchInput').value === '')
  assert(await seriesCount() === 2, `expected 2 series, got ${await seriesCount()}`)
})
await step('search quota error is explained and old results are kept', async () => {
  await page.fill('#searchInput', 'another')
  await page.waitForTimeout(3100) // server-side 3 s search cooldown
  apiMode = 'quota'
  await page.press('#searchInput', 'Enter')
  await page.waitForSelector('.search-header-error', { timeout: 10000 })
  assert(/limit/i.test(await page.textContent('.search-header-error')), 'quota not explained')
  apiMode = 'ok'
  await page.click('#searchClear')
  await settled()
  assert(await page.locator('.search-header').count() === 0, 'search header still shown after clear')
})
await step('Escape in the search box clears it', async () => {
  await page.fill('#searchInput', 'zzz')
  await page.press('#searchInput', 'Escape')
  assert(await page.inputValue('#searchInput') === '', 'not cleared')
})

console.log('\nHome')
await step('home shows hero, rows and recommendations', async () => {
  await goHome()
  await page.waitForSelector('.hero-carousel')
  await page.waitForSelector('.series-row')
  await page.waitForFunction(() => [...document.querySelectorAll('.section-title')].some(h => /More from your channels/i.test(h.textContent)), null, { timeout: 10000 })
})
await step('hero dots switch slides', async () => {
  const dots = page.locator('.hero-dot')
  if (await dots.count() < 2) return
  await dots.nth(1).click()
  assert(await page.$eval('.hero-carousel-slide[data-index="1"]', el => !el.inert && el.classList.contains('active')), 'slide 2 not shown')
  assert(await page.$eval('.hero-carousel-slide[data-index="0"]', el => el.inert), 'hidden slide still focusable')
})
await step('carousel arrows are labelled buttons', async () => {
  const label = await page.getAttribute('.carousel-btn-right', 'aria-label')
  assert(label && label.length > 3, 'missing aria-label')
})
await step('a11y: populated home', () => axe('home'))

console.log('\nSeries detail')
await step('keyboard: Tab to a card title and Enter opens the detail dialog', async () => {
  await page.focus('.series-row .card-title-btn')
  await page.keyboard.press('Enter')
  await page.waitForSelector('#detailModal:not(.hidden) .episode-card')
  assert(await page.evaluate(() => document.getElementById('detailModal').contains(document.activeElement)), 'focus not moved into dialog')
})
await step('opening the dialog does not rebuild the page underneath', async () => {
  const marker = await page.evaluate(() => { const el = document.querySelector('.hero-carousel'); el.dataset.marker = '1'; return Boolean(el) })
  await page.evaluate(() => chrome.runtime.sendMessage({ type: 'STATE_GET' })) // any broadcast-free roundtrip
  await settled()
  assert(marker && await page.locator('.hero-carousel[data-marker="1"]').count() === 1, 'main area was re-rendered')
})
await step('episode sort reorders and survives a state update', async () => {
  await page.selectOption('.episode-sort', 'date_asc')
  await page.click('#detailModal .episode-status >> nth=0')
  await page.waitForFunction(() => document.querySelector('#detailModal .episode-status')?.getAttribute('aria-pressed') === 'true')
  assert(await page.inputValue('.episode-sort') === 'date_asc', 'sort reset after re-render')
})
await step('toggle watched back and forth (aria-pressed reflects server state)', async () => {
  await page.click('#detailModal .episode-status >> nth=0')
  await page.waitForFunction(() => document.querySelector('#detailModal .episode-status')?.getAttribute('aria-pressed') === 'false')
})
await step('mark complete / incomplete', async () => {
  const button = page.locator('#detailModal .detail-actions .btn-secondary', { hasText: /complete/i }).first()
  const before = await button.textContent()
  await button.click()
  await page.waitForFunction(text => [...document.querySelectorAll('#detailModal .detail-actions .btn-secondary')].every(b => b.textContent !== text), before)
  await page.locator('#detailModal .detail-actions .btn-secondary', { hasText: /complete/i }).first().click()
})
await step('refresh re-fetches the playlist', async () => {
  const calls = apiCalls.length
  await page.click('#detailModal [aria-label="Refresh"]')
  await page.waitForFunction(() => !document.querySelector('#detailModal [aria-label="Refresh"]')?.disabled)
  assert(apiCalls.length > calls, 'no API call')
})
await step('folder picker creates a collection and assigns it', async () => {
  await page.click('#detailModal .folder-icon-btn')
  await page.waitForSelector('#folderPicker')
  await page.fill('#folderPicker input', 'Anime')
  await page.press('#folderPicker input', 'Enter')
  await page.waitForSelector('#folderPicker', { state: 'detached' })
  await page.waitForSelector('#detailModal .folder-icon-btn.assigned')
})
await step('Escape closes the folder picker but not the dialog', async () => {
  await page.click('#detailModal .folder-icon-btn')
  await page.waitForSelector('#folderPicker')
  await page.keyboard.press('Escape')
  await page.waitForSelector('#folderPicker', { state: 'detached' })
  assert(await page.isVisible('#detailModal .modal'), 'dialog closed too')
})
await step('related playlists load lazily and can be added', async () => {
  await page.locator('#detailMoreSection').scrollIntoViewIfNeeded()
  await page.waitForSelector('#detailMoreSection .related-card', { timeout: 10000 })
  const before = await seriesCount()
  await page.click('#detailMoreSection .related-card >> nth=0')
  await page.waitForFunction(n => new Promise(r => chrome.runtime.sendMessage({ type: 'STATE_GET' }, res => r(Object.keys(res.state.series).length > n))), before)
})
await step('channel dialog lists playlists and closes with Escape', async () => {
  await page.click('#detailModal .detail-hero-channel')
  await page.waitForSelector('#channelModal:not(.hidden) .related-card, #channelModal:not(.hidden) .more-loading')
  await page.keyboard.press('Escape')
  await page.waitForSelector('#channelModal', { state: 'detached' })
  assert(await page.isVisible('#detailModal .modal'), 'detail closed by channel Escape')
})
await step('a11y: detail dialog', () => axe('detail', '#detailModal'))
await step('Escape closes the dialog and focus returns to the card', async () => {
  await page.keyboard.press('Escape')
  await page.waitForSelector('#detailModal.hidden', { state: 'attached' })
  assert(await page.evaluate(() => document.activeElement?.classList.contains('card-title-btn')), 'focus not restored')
})
await step('delete asks for confirmation, then Undo restores the series', async () => {
  const before = await seriesCount()
  await page.evaluate(() => window.scrollTo(0, 400)) // the confirmation must not follow the page scroll
  await page.click('.series-row .card-title-btn')
  await page.waitForSelector('#detailModal:not(.hidden)')
  await page.click('#detailModal [aria-label="Delete"]')
  await page.waitForSelector('dialog.confirm-modal[open]')
  await axe('delete confirmation', 'dialog.confirm-modal') // white "Delete" on red; also waits for the entrance animation
  const placement = await page.$eval('dialog.confirm-modal', el => {
    const r = el.getBoundingClientRect()
    return { scrollY, off: Math.max(Math.abs(r.left + r.width / 2 - innerWidth / 2), Math.abs(r.top + r.height / 2 - innerHeight / 2)) }
  })
  assert(placement.off <= 2, `delete confirmation is ${Math.round(placement.off)}px off the centre of the screen (page scrolled ${placement.scrollY}px)`)
  await confirm(false) // cancel first: nothing happens
  assert(await seriesCount() === before, 'deleted despite cancel')
  await page.click('#detailModal [aria-label="Delete"]')
  await clearToasts()
  await confirm(true)
  await page.waitForSelector('#detailModal.hidden', { state: 'attached' })
  assert(await seriesCount() === before - 1, 'not deleted')
  await page.click('.toast-action')
  await page.waitForFunction(n => new Promise(r => chrome.runtime.sendMessage({ type: 'STATE_GET' }, res => r(Object.keys(res.state.series).length === n))), before)
})

console.log('\nNavigation & filters')
await step('"Your series" menu: filters with counts, keyboard, Escape', async () => {
  assert(await page.locator('.nav-link[data-filter]').count() === 0, 'old filter links still in the header')
  await page.focus('#libraryMenuBtn')
  await page.keyboard.press('ArrowDown')
  await page.waitForSelector('#libraryMenu:not(.hidden)')
  assert(await page.getAttribute('#libraryMenuBtn', 'aria-expanded') === 'true', 'aria-expanded not set')
  assert(await page.evaluate(() => document.activeElement?.closest('#libraryMenu') !== null), 'focus not in the menu')
  const counts = await page.$$eval('#libraryMenu .nav-menu-count', list => list.map(el => Number(el.textContent)))
  assert(counts.length === 4 && counts[0] === await seriesCount(), `menu counts: ${counts}`)
  await page.keyboard.press('Escape')
  await page.waitForSelector('#libraryMenu.hidden', { state: 'attached' })
  assert(await page.evaluate(() => document.activeElement?.id) === 'libraryMenuBtn', 'focus not returned to the button')
  // Tab closes it and moves on from the button (the panel sits after the header).
  await page.keyboard.press('ArrowDown')
  await page.waitForSelector('#libraryMenu:not(.hidden)')
  await page.keyboard.press('Tab')
  await page.waitForSelector('#libraryMenu.hidden', { state: 'attached' })
  assert(await page.evaluate(() => document.activeElement?.getAttribute('data-view')) === 'schedule', 'Tab did not move on to the next nav link')
  for (const filter of ['watching', 'completed', 'new']) {
    await openLibrary(filter)
    assert(await page.getAttribute(`.library-chip >> nth=${FILTER_INDEX[filter]}`, 'aria-pressed') === 'true', `${filter} chip not pressed`)
    assert(await page.locator('#libraryMenuBtn.active').count() === 1, 'menu button not marked active')
  }
  await goHome()
})
await step('Your series: search box, filter chips and list view', async () => {
  await openLibrary('all')
  const total = await seriesCount()
  await page.fill('#savedSearchInput', 'plsearch')
  await page.waitForFunction(() => document.querySelectorAll('.saved-results .series-card').length === 1)
  assert(await page.evaluate(() => document.activeElement?.id) === 'savedSearchInput', 'search box lost focus')
  await page.press('#savedSearchInput', 'Escape')
  await page.waitForFunction(n => document.querySelectorAll('.saved-results .series-card').length === n, total)
  await page.click('.library-view-btn >> nth=1')
  await page.waitForSelector('.library-list .library-row')
  assert(await page.locator('.library-row').count() === total, 'list view incomplete')
  assert((await state()).settings.libraryView === 'list', 'view not saved')
  await axe('your series, list view')
  await page.click('.library-view-btn >> nth=0')
  await page.waitForSelector('.collection-library-grid .series-card')
  await goHome()
})

console.log('\nSaved library & collections')
await step('Saved view shows the shelf and the full grid', async () => {
  await openLibrary()
  await page.waitForSelector('.collections-section')
  assert(await page.locator('.collection-library-grid .series-card').count() === await seriesCount(), 'grid incomplete')
})
await step('create a collection with two series', async () => {
  await page.click('.collection-add')
  await page.waitForSelector('dialog.collection-editor[open]')
  await page.fill('dialog.collection-editor input:not([type])', 'Docs')
  await page.check('.collection-select-card input >> nth=0')
  await page.check('.collection-select-card input >> nth=1')
  await page.click('dialog.collection-editor button[type="submit"]')
  await page.waitForSelector('dialog.collection-editor', { state: 'detached' })
  await page.waitForFunction(() => document.querySelector('.collection-content-title')?.textContent === 'Docs')
})
await step('duplicate collection name is rejected inline', async () => {
  await page.click('.collection-add')
  await page.fill('dialog.collection-editor input:not([type])', 'Docs')
  await page.click('dialog.collection-editor button[type="submit"]')
  await page.waitForFunction(() => /already exists/i.test(document.querySelector('dialog.collection-editor .error-msg')?.textContent || ''))
  await page.keyboard.press('Escape')
  await page.waitForSelector('dialog.collection-editor', { state: 'detached' })
})
await step('rename the collection', async () => {
  await page.click('.collection-management button:has-text("Edit")')
  await page.fill('dialog.collection-editor input:not([type])', 'Documentaries')
  await page.click('dialog.collection-editor button[type="submit"]')
  await page.waitForFunction(() => document.querySelector('.collection-content-title')?.textContent === 'Documentaries')
})
await step('move a series out and undo the move', async () => {
  await clearToasts()
  await page.click('.collection-management button:has-text("Move")')
  await page.check('dialog.collection-editor .collection-move-list input >> nth=0')
  await page.click('dialog.collection-editor button[type="submit"]')
  assert(/moved/i.test(await toastText()), 'no move toast')
  await page.click('.toast-action')
  await page.waitForFunction(() => /restored/i.test(document.querySelector('.toast')?.textContent || ''))
})
await step('delete the collection (series are kept)', async () => {
  const before = await seriesCount()
  await page.click('.collection-management button:has-text("Delete")')
  await confirm(true)
  await page.waitForFunction(() => document.querySelector('.collection-content-title')?.textContent !== 'Documentaries')
  assert(await seriesCount() === before, 'series lost')
})
await step('a11y: saved library', () => axe('saved'))

console.log('\nActivity')
await step('bell shows unread count, opens the panel and marks read', async () => {
  await goHome()
  await page.waitForSelector('#activityBadge:not(.hidden)')
  await page.click('#activityBtn')
  await page.waitForSelector('#activityPanel:not(.hidden) .activity-panel-item')
  await page.waitForSelector('#activityBadge.hidden', { state: 'attached', timeout: 5000 })
  await page.keyboard.press('Escape')
  assert(await page.evaluate(() => document.activeElement?.id) === 'activityBtn', 'focus not returned to bell')
})

console.log('\nSettings')
await step('settings opens on Theme; arrow keys move between tabs', async () => {
  await page.click('#settingsBtn')
  await page.waitForSelector('#settingsModal:not(.hidden)')
  await page.focus('.settings-tab[data-section="theme"]')
  await page.keyboard.press('ArrowDown')
  assert(await page.getAttribute('.settings-tab[data-section="language"]', 'aria-selected') === 'true', 'arrow navigation broken')
})
await step('a11y: settings dialog', () => axe('settings', '#settingsModal'))
await step('theme switch applies instantly and persists', async () => {
  await settingsSection('theme')
  await page.selectOption('#themeSelect', 'light')
  await page.waitForSelector('html[data-theme="light"]')
  assert((await state()).settings.theme === 'light', 'not persisted')
})
await step('language switch translates the UI (IT) and back', async () => {
  await settingsSection('language')
  await page.selectOption('#languageSelect', 'it')
  await page.waitForFunction(() => document.querySelector('#libraryMenuBtn')?.textContent.trim() === 'Le tue serie')
  assert(await page.getAttribute('html', 'lang') === 'it', 'lang attribute not updated')
  await page.selectOption('#languageSelect', 'en')
  await page.waitForFunction(() => document.querySelector('#libraryMenuBtn')?.textContent.trim() === 'Your series')
})
await step('overlay and notification toggles are keyboard operable and persist', async () => {
  await settingsSection('overlay')
  await page.focus('#nextEpisodeOverlayToggle')
  assert(await page.evaluate(() => document.activeElement?.id) === 'nextEpisodeOverlayToggle', 'toggle cannot receive focus')
  await page.keyboard.press('Space')
  await page.waitForFunction(() => new Promise(r => chrome.runtime.sendMessage({ type: 'STATE_GET' }, res => r(res.state.settings.nextEpisodeOverlay === false))))
  await page.keyboard.press('Space')
  await page.click('.settings-tab[data-section="support"]')
  await page.focus('#autoRefreshToggle')
  await page.keyboard.press('Space')
  await page.waitForFunction(() => new Promise(r => chrome.runtime.sendMessage({ type: 'STATE_GET' }, res => r(res.state.settings.autoRefresh === false))))
})
await step('cloud sync tab matches the Firebase configuration', async () => {
  const { syncStatus } = await send('SYNC_STATUS')
  const hidden = await page.locator('.settings-tab[data-section="sync"].hidden').count() === 1
  assert(hidden === !syncStatus.configured, `sync tab hidden=${hidden} but configured=${syncStatus.configured}`)
  if (syncStatus.configured && !syncStatus.loggedIn) {
    await settingsSection('sync')
    assert(await page.isVisible('#syncLoginBtn'), 'sign-in button missing')
    assert(!await page.isVisible('#syncLogoutBtn'), 'sign-out shown while signed out')
  }
})
await step('export downloads a JSON backup of the library', async () => {
  await settingsSection('reset')
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportDataBtn')])
  const file = join(artifacts, 'export.json')
  await download.saveAs(file)
  const data = JSON.parse(await readFile(file, 'utf8'))
  assert(Object.keys(data).length === await seriesCount(), 'export incomplete')
})
await step('import rejects an invalid file', async () => {
  const bad = join(artifacts, 'bad.json')
  await writeFile(bad, '{"x": ')
  await settingsSection('reset')
  await clearToasts()
  await page.setInputFiles('#importFileInput', bad)
  assert(/Invalid/i.test(await toastText()), 'no error for invalid JSON')
})
await step('import a valid backup after confirmation', async () => {
  const lib = (await state()).series
  const [id] = Object.keys(lib)
  const extra = structuredClone(lib[id])
  extra.playlistId = 'PLimported01'
  extra.title = 'Imported Series'
  const file = join(artifacts, 'import.json')
  await writeFile(file, JSON.stringify({ PLimported01: extra }))
  const before = await seriesCount()
  await clearToasts()
  await page.setInputFiles('#importFileInput', file)
  await confirm(true)
  assert(/complete/i.test(await toastText()), 'no import toast')
  assert(await seriesCount() === before + 1, 'not imported')
})
await step('backups list shows automatic snapshots and restores one', async () => {
  await settingsSection('reset')
  await page.click('#showBackupsBtn')
  await page.waitForSelector('#backupList .backup-row')
  const before = await seriesCount()
  await page.click('#backupList .backup-row button >> nth=0') // newest = before_import
  await confirm(true)
  await page.waitForFunction(n => new Promise(r => chrome.runtime.sendMessage({ type: 'STATE_GET' }, res => r(Object.keys(res.state.series).length === n - 1))), before)
})
await step('reset wipes the library after confirmation', async () => {
  await settingsSection('reset')
  await page.click('#resetStorageBtn')
  await confirm(true)
  await page.waitForFunction(() => new Promise(r => chrome.runtime.sendMessage({ type: 'STATE_GET' }, res => r(Object.keys(res.state.series).length === 0))))
})
await step('dev tools load the demo library', async () => {
  await settingsSection('dev')
  await page.click('#loadDemoBtn')
  await page.waitForFunction(() => new Promise(r => chrome.runtime.sendMessage({ type: 'STATE_GET' }, res => r(Object.keys(res.state.series).length === 8))))
  await page.keyboard.press('Escape')
  await page.waitForSelector('#settingsModal.hidden', { state: 'attached' })
})

console.log('\nFooter dialogs')
await step('FAQ items expand with aria-expanded', async () => {
  await page.click('#footerFaqLink')
  await page.click('.faq-question >> nth=0')
  assert(await page.getAttribute('.faq-question >> nth=0', 'aria-expanded') === 'true', 'aria-expanded not updated')
  await page.keyboard.press('Escape')
})
await step('changelog lists versions and scrolls to the oldest one', async () => {
  await page.click('#footerChangelogLink')
  await page.waitForSelector('#changelogBody .changelog-entry')
  // Taller than the dialog: the body scrolls, the header stays. (When only the dialog
  // clipped, focusing its footer button scrolled the dialog itself: the newest
  // versions were out of reach above.)
  const layout = await page.$eval('#changelogBody', body => {
    const modal = body.closest('.modal')
    body.scrollTop = body.scrollHeight
    return { modalScrolled: modal.scrollTop, bodyScrolled: body.scrollTop, lastInView: body.lastElementChild.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1 }
  })
  assert(layout.modalScrolled === 0, `the dialog itself scrolled by ${layout.modalScrolled}px`)
  assert(layout.bodyScrolled > 0 && layout.lastInView, 'the changelog body does not scroll to the oldest version')
  await page.keyboard.press('Escape')
})
await step('bug report validates empty text', async () => {
  await page.click('#footerBugLink')
  await page.click('#bugReportSend')
  assert(await page.isVisible('#bugReportError'), 'no validation message')
  await page.keyboard.press('Escape')
})

console.log('\nProgress tools: exclusions, time left, goals, notes')
await step('trailer suggestion excludes trailers; time left is shown', async () => {
  await send('PLAYLIST_ADD', { url: 'https://www.youtube.com/playlist?list=PLtrailer001' })
  await page.goto(`${DASH}?series=PLtrailer001`)
  await page.waitForSelector('#detailModal:not(.hidden) .detail-suggestion')
  await page.click('.detail-suggestion .btn-primary')
  await page.waitForSelector('.episode-card.episode-excluded')
  assert(await page.locator('.detail-suggestion').count() === 0, 'suggestion still shown after excluding')
  assert(/2 episodes · 0\/2 Watched.*1 skipped/.test(await page.textContent('.detail-meta-row')), `meta: ${await page.textContent('.detail-meta-row')}`)
  assert(/7 min left/.test(await page.textContent('.detail-pace-row')), `pace: ${await page.textContent('.detail-pace-row')}`)
  const trailer = (await state()).series.PLtrailer001.videos[0]
  assert(trailer.excluded === true, 'trailer not excluded in the library')
})
await step('a milestone is celebrated when an episode crosses it', async () => {
  await clearToasts()
  await page.click('.episode-card[data-video-id="trailervid01"] .episode-status')
  const celebration = await page.waitForSelector('.celebration', { timeout: 5000 })
  assert(/50% of Playlist PLtrailer001/.test(await celebration.textContent()), 'no 50% milestone celebration')
  assert(await page.locator('.celebration.tier-silver .celebration-confetti').count() > 0, 'no confetti')
  await page.keyboard.press('Escape') // closes the celebration
  await page.waitForSelector('.celebration', { state: 'detached' })
  await page.keyboard.press('Escape') // and the detail dialog
})
await step('weekly goal: set in Settings, shown in Achievements with the badges', async () => {
  await settingsSection('goals')
  await page.selectOption('#weeklyGoalSelect', '3')
  await page.waitForFunction(() => new Promise(r => chrome.runtime.sendMessage({ type: 'STATE_GET' }, res => r(res.state.settings.weeklyGoal === 3))))
  await page.keyboard.press('Escape')
  await goHome()
  assert(await page.locator('.week-strip').count() === 0, 'weekly progress still on the home page')
  await page.click('#achievementsBtn')
  await page.waitForSelector('#achievementsModal:not(.hidden) .badge-card')
  assert(/\d+\/3 episodes/.test(await page.textContent('.week-panel-count')), `week: ${await page.textContent('.week-panel-count')}`)
  assert(/1-day streak/.test(await page.textContent('.week-panel')), 'streak missing')
  assert(await page.locator('.badge-card').count() === 12, 'badge grid incomplete')
  assert(await page.locator('.badge-card:not(.tier-locked)').count() >= 1, 'no badge earned yet')
  await axe('achievements', '#achievementsModal')
  await page.keyboard.press('Escape')
  await page.waitForSelector('#achievementsModal', { state: 'detached' })
})
await step('closing the trailer suggestion is remembered after a reload', async () => {
  await send('EPISODE_EXCLUDE', { playlistId: 'PLtrailer001', videoIds: ['trailervid00'], excluded: false })
  await page.goto(`${DASH}?series=PLtrailer001`)
  await page.waitForSelector('#detailModal:not(.hidden) .detail-suggestion')
  await page.click('.detail-suggestion .btn-secondary')
  await page.waitForSelector('.detail-suggestion', { state: 'detached' })
  await page.goto(`${DASH}?series=PLtrailer001`)
  await page.waitForSelector('#detailModal:not(.hidden) .episode-card')
  assert(await page.locator('.detail-suggestion').count() === 0, 'suggestion offered again')
  await send('EPISODE_EXCLUDE', { playlistId: 'PLtrailer001', videoIds: ['trailervid00'], excluded: true })
  await page.keyboard.press('Escape')
})

console.log('\nYouTube: notes and progress overlay (stubbed youtube.com)')
const ytPage = body => `<!doctype html><html><body>
  <ytd-guide-section-renderer></ytd-guide-section-renderer><ytd-guide-section-renderer></ytd-guide-section-renderer>${body}</body></html>`
await step('a note taken on YouTube appears in the detail and exports as Markdown', async () => {
  await context.route(url => new URL(url).searchParams.get('v') === 'trailervid02', route => route.fulfill({ status: 200, contentType: 'text/html', body: ytPage(`
    <video class="video-stream html5-main-video"></video>
    <ytd-watch-metadata><div id="title"><h1>Episode 2</h1></div></ytd-watch-metadata>`) }))
  const yt = await context.newPage()
  watchErrors(yt, 'youtube-notes')
  await yt.goto('https://www.youtube.com/watch?v=trailervid02&list=PLtrailer001')
  await yt.waitForSelector('.yt-series-note-btn')
  await yt.click('.yt-series-note-btn')
  await yt.fill('.yt-series-note-input', 'Remember this scene')
  // YouTube's single-key shortcuts listen on the document: typing must not reach them.
  const leaked = await yt.evaluate(() => {
    let seen = false
    document.addEventListener('keydown', () => { seen = true }, { once: true })
    document.querySelector('.yt-series-note-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }))
    return seen
  })
  assert(!leaked, 'keystrokes reach YouTube shortcuts')
  await yt.press('.yt-series-note-input', 'Control+Enter')
  await yt.waitForSelector('.yt-series-toast')
  await yt.close()
  await page.goto(`${DASH}?series=PLtrailer001`)
  await page.waitForSelector('#detailModal:not(.hidden) .note-row')
  assert(/Remember this scene/.test(await page.textContent('.note-row .note-text')), 'note not listed')
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.detail-notes .btn-secondary')])
  const markdown = await readFile(await download.path(), 'utf8')
  assert(markdown.includes('# Playlist PLtrailer001') && markdown.includes('Remember this scene') && markdown.includes('watch?v=trailervid02'), `markdown: ${markdown}`)
  await page.keyboard.press('Escape')
})
await step('playlist page shows series progress, watched badges and excluded episodes', async () => {
  const items = ['trailervid00', 'trailervid01', 'trailervid02'].map(id => `
    <ytd-playlist-video-renderer><a id="thumbnail" href="/watch?v=${id}&list=PLtrailer001"><ytd-thumbnail style="position:relative;display:block;width:120px;height:68px"></ytd-thumbnail></a></ytd-playlist-video-renderer>`).join('')
  await context.route(url => new URL(url).pathname === '/playlist' && new URL(url).searchParams.get('list') === 'PLtrailer001', route => route.fulfill({ status: 200, contentType: 'text/html', body: ytPage(`
    <yt-page-header-view-model><div class="ytPageHeaderViewModelScrollContainer"><button>Play all</button></div></yt-page-header-view-model>${items}`) }))
  const yt = await context.newPage()
  watchErrors(yt, 'youtube-progress')
  await yt.goto('https://www.youtube.com/playlist?list=PLtrailer001')
  await yt.waitForSelector('.yt-series-progress-summary')
  assert(/1\/2 watched/.test(await yt.textContent('.yt-series-progress-summary')), `summary: ${await yt.textContent('.yt-series-progress-summary')}`)
  await yt.waitForSelector('ytd-playlist-video-renderer:nth-of-type(2) .yt-series-item-badge')
  assert(await yt.getAttribute('ytd-playlist-video-renderer:nth-of-type(1)', 'data-yt-series-excluded') === 'true', 'trailer not dimmed')
  assert(await yt.locator('.yt-series-item-badge').count() === 1, 'wrong number of watched badges')
  // Watching another episode elsewhere updates the page.
  await send('EPISODE_WATCH', { playlistId: 'PLtrailer001', videoId: 'trailervid02' })
  await yt.waitForFunction(() => document.querySelectorAll('.yt-series-item-badge').length === 2, null, { timeout: 5000 })
  await yt.close()
})

console.log('\nChannels and Upcoming')
await step('follow a channel from search as a series of its latest uploads', async () => {
  await goHome()
  await page.waitForTimeout(3100) // server-side search cooldown
  await page.fill('#searchInput', 'great')
  await page.press('#searchInput', 'Enter')
  await page.waitForSelector('.channel-follow-btn')
  await clearToasts()
  await page.click('.channel-follow-btn')
  assert(/Following Great Channel/.test(await toastText()), 'no follow toast')
  const followed = (await state()).series[`UULF${CHANNEL.slice(2)}`]
  assert(followed && followed.title === 'Great Channel' && followed.videos[0].title === 'Upload 1', 'channel series wrong')
  await page.waitForFunction(() => document.querySelector('.channel-follow-btn')?.disabled)
  await page.click('#searchClear')
})
await step('Upcoming shows the expected next upload of a followed channel', async () => {
  await page.click('.nav-link[data-view="schedule"]')
  await page.waitForSelector('.schedule-view')
  assert(/Great Channel/.test(await page.textContent('.schedule-week')), 'channel forecast missing from the week')
  assert(/every ~7 days/.test(await page.textContent('.schedule-week')), 'rhythm not shown')
  assert(await page.getAttribute('.nav-link[data-view="schedule"]', 'aria-current') === 'page', 'nav not marked current')
})
await step('a11y: Upcoming', () => axe('upcoming'))

console.log('\nShareable lists')
await step('share a collection, open the link, import the list', async () => {
  await context.route(`${SHARE_SITE}/**`, async route => {
    const path = new URL(route.request().url()).pathname.replace('/YtSeries/', '')
    const types = { html: 'text/html', js: 'text/javascript', png: 'image/png', woff2: 'font/woff2' }
    try {
      await route.fulfill({ status: 200, contentType: types[path.split('.').pop()] || 'application/octet-stream', body: await readFile(join(root, path)) })
    } catch {
      await route.fulfill({ status: 404, body: '' })
    }
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await send('COLLECTION_MOVE', { ids: ['PLtrailer001'], destination: 'Shared picks' })
  await openLibrary()
  await page.click('.collection-tile[data-collection="Shared picks"]')
  await clearToasts()
  await page.click('text=Share collection')
  assert(/Share link copied/.test(await toastText()), 'no copy toast')
  const link = await page.evaluate(() => navigator.clipboard.readText())
  assert(link.startsWith(`${SHARE_SITE}/share.html#d=`), `link: ${link}`)

  await send('SERIES_DELETE', { playlistId: 'PLtrailer001' })
  const site = await context.newPage()
  watchErrors(site, 'share-page')
  await site.goto(link)
  await site.waitForSelector('.card')
  assert(/Shared picks/.test(await site.textContent('h1')), 'list name missing on the share page')
  const [dashboard] = await Promise.all([context.waitForEvent('page'), site.click('text=Open in YT Series')])
  watchErrors(dashboard, 'dashboard-import')
  await dashboard.waitForSelector('#shareImportModal:not(.hidden) .share-row')
  assert(!/#import/.test(dashboard.url()), 'import fragment left in the address bar')
  await dashboard.click('#shareImportModal .btn-primary')
  await dashboard.waitForSelector('#shareImportModal', { state: 'detached', timeout: 15000 })
  const restored = (await state()).series.PLtrailer001
  assert(restored && restored.collection === 'Shared picks', 'list not imported into its collection')
  await dashboard.close()
  await site.close()
})
await step('a pasted share link opens the same import preview; forged links are refused', async () => {
  const link = await page.evaluate(() => navigator.clipboard.readText())
  await page.click('#addPlaylistBtn')
  await page.fill('#playlistUrlInput', link)
  await page.click('#addPlaylistConfirm')
  await page.waitForSelector('#shareImportModal:not(.hidden) .share-row.is-saved')
  await page.keyboard.press('Escape')
  await page.click('#addPlaylistBtn')
  await page.fill('#playlistUrlInput', `${SHARE_SITE}/share.html#d=forged-garbage`)
  await clearToasts()
  await page.click('#addPlaylistConfirm')
  assert(/invalid or damaged/.test(await toastText()), 'forged link not refused')
  // Another website cannot talk to the extension at all.
  const evil = await context.newPage()
  await context.route('https://evil.example/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>evil</p>' }))
  await evil.goto('https://evil.example/')
  assert(!await evil.evaluate(() => Boolean(window.chrome?.runtime?.sendMessage)), 'unrelated site can message the extension')
  await evil.close()
})

console.log('\nDeep links, theme, mobile')
await step('?series=<id> opens that series', async () => {
  const id = Object.keys((await state()).series)[0]
  await page.goto(`${DASH}?series=${id}`)
  await page.waitForSelector('#detailModal:not(.hidden) .episode-card')
  await page.keyboard.press('Escape')
})
await step('?settings=1 opens settings', async () => {
  await page.goto(`${DASH}?settings=1`)
  await page.waitForSelector('#settingsModal:not(.hidden)')
  await page.keyboard.press('Escape')
})
await step('a11y: light theme home', async () => {
  await page.goto(DASH)
  await page.waitForSelector('.hero-carousel')
  await axe('light home')
})
for (const theme of ['classic-red', 'ocean-blue', 'forest']) {
  await step(`a11y: ${theme} theme home`, async () => {
    await send('SETTINGS_UPDATE', { theme })
    await page.waitForSelector(`html[data-theme="${theme}"]`)
    await settled()
    await axe(`${theme} home`)
  })
}
await step('mobile 375px: no horizontal overflow, header usable', async () => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(DASH)
  await page.waitForSelector('.series-card')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  await page.screenshot({ path: join(artifacts, 'mobile-home.png') })
  assert(overflow <= 1, `page overflows horizontally by ${overflow}px`)
  assert(await page.isVisible('#settingsBtn') && await page.isVisible('#addPlaylistBtn'), 'header controls hidden')
  // One row of icons: search opens from the magnifier, and the header stays compact.
  const headerHeight = await page.$eval('#header', el => el.getBoundingClientRect().height)
  assert(headerHeight <= 120, `phone header is ${Math.round(headerHeight)}px tall`)
  assert(!await page.isVisible('#searchInput'), 'search row open by default')
  await page.click('#searchToggle')
  assert(await page.isVisible('#searchInput') && await page.evaluate(() => document.activeElement?.id) === 'searchInput', 'search toggle does not open and focus the search')
})
await step('mobile 375px: detail dialog fits the screen', async () => {
  await page.click('.series-card .card-title-btn >> nth=0')
  await page.waitForSelector('#detailModal:not(.hidden) .episode-card')
  await page.waitForTimeout(400) // let the opening animation finish before measuring
  const box = await page.locator('#detailModal .modal').boundingBox()
  await page.screenshot({ path: join(artifacts, 'mobile-detail.png') })
  assert(box && box.width <= 375, `dialog is ${box?.width}px wide`)
  assert(await page.evaluate(() => document.activeElement?.classList.contains('detail-hero-title')), 'initial focus is not on the title')
})
await step('mobile 375px: the other detail actions are in a "⋯" menu', async () => {
  assert(await page.isVisible('#detailModal .detail-more-btn') && !await page.isVisible('#detailModal .detail-share-btn'), 'secondary actions not folded into "⋯"')
  await page.click('#detailModal .detail-more-btn')
  await page.waitForSelector('.detail-more-menu')
  assert(await page.evaluate(() => document.activeElement?.getAttribute('role')) === 'menuitem', 'focus not in the menu')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.detail-more-menu', { state: 'detached' })
  assert(await page.isVisible('#detailModal .modal'), 'Escape closed the dialog too')
  assert(await page.evaluate(() => document.activeElement?.classList.contains('detail-more-btn')), 'focus not back on "⋯"')
  // An action re-renders the dialog: focus stays on "⋯". The same item again undoes it.
  for (let i = 0; i < 2; i++) {
    await page.click('#detailModal .detail-more-btn')
    await page.click('.detail-more-menu [role="menuitem"] >> nth=0')
    await settled()
    assert(await page.evaluate(() => document.activeElement?.classList.contains('detail-more-btn')), 'focus lost after the re-render')
  }
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1280, height: 800 })
})

console.log('\nPopup')
await step('popup shows stats and opens the dashboard', async () => {
  const popup = await context.newPage()
  watchErrors(popup, 'popup')
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`)
  const expected = String(await seriesCount())
  await popup.waitForFunction(n => document.getElementById('seriesCount').textContent === n, expected)
  await Promise.all([popup.waitForEvent('close'), popup.click('#openDashboard')])
})

console.log('\nYouTube content script (stubbed youtube.com)')
await step('sidebar link, add button and watch-on-ended work on YouTube', async () => {
  await context.route('https://www.youtube.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body>
    <ytd-guide-section-renderer></ytd-guide-section-renderer><ytd-guide-section-renderer></ytd-guide-section-renderer>
    <div id="playlist-action-menu"><div id="top-level-buttons-computed"></div></div>
    <video class="video-stream html5-main-video"></video></body></html>` }))
  const yt = await context.newPage()
  watchErrors(yt, 'youtube')
  await yt.goto('https://www.youtube.com/playlist?list=PLnotsaved01')
  await yt.waitForSelector('#yt-series-sidebar-section')
  await yt.waitForSelector('#yt-series-add-btn')
  assert(/Add to Series/.test(await yt.textContent('#yt-series-add-btn')), 'unsaved playlist label wrong')
  await yt.click('#yt-series-add-btn')
  await yt.waitForFunction(() => /View on YT Series/.test(document.getElementById('yt-series-add-btn').textContent))
  const lib = (await state()).series
  assert(lib.PLnotsaved01, 'playlist not added from YouTube')
  const video = lib.PLnotsaved01.videos[0].id
  await yt.goto(`https://www.youtube.com/watch?v=${video}&list=PLnotsaved01`)
  await yt.waitForSelector('#yt-series-sidebar-section')
  await yt.evaluate(() => document.querySelector('video').dispatchEvent(new Event('ended')))
  await page.waitForFunction(v => new Promise(r => chrome.runtime.sendMessage({ type: 'STATE_GET' }, res => r(res.state.series.PLnotsaved01.videos.find(x => x.id === v).watched))), video)
  await yt.close()
})

await step('new YouTube layout: one button in the visible header, live label, readable sidebar', async () => {
  // Current YouTube keeps a second, hidden playlist header in the DOM and a light page theme.
  const layout = `<!doctype html><html><body style="color: rgb(15, 15, 15); background: #fff">
    <div id="guide"><ytd-guide-section-renderer></ytd-guide-section-renderer><ytd-guide-section-renderer></ytd-guide-section-renderer></div>
    <ytd-browse><yt-page-header-view-model style="display:none"><div class="ytPageHeaderViewModelScrollContainer"></div></yt-page-header-view-model></ytd-browse>
    <ytd-browse><yt-page-header-view-model><div class="ytPageHeaderViewModelScrollContainer"><button>Play all</button></div></yt-page-header-view-model></ytd-browse>
    </body></html>`
  await context.route(url => new URL(url).searchParams.get('list') === 'PLlayout0001', route => route.fulfill({ status: 200, contentType: 'text/html', body: layout }))
  const yt = await context.newPage()
  watchErrors(yt, 'youtube-layout')
  await yt.goto('https://www.youtube.com/playlist?list=PLlayout0001')
  await yt.waitForSelector('.yt-series-add-btn')
  await yt.waitForTimeout(500) // let a few observer passes run
  const placement = await yt.evaluate(() => {
    const buttons = [...document.querySelectorAll('.yt-series-add-btn')]
    const visibleHeader = document.querySelectorAll('.ytPageHeaderViewModelScrollContainer')[1]
    const link = document.getElementById('yt-series-link')
    return {
      count: buttons.length,
      inVisibleHeader: visibleHeader.contains(buttons[0]),
      marginRight: parseFloat(getComputedStyle(buttons[0]).marginRight),
      linkColor: getComputedStyle(link).color,
      bodyColor: getComputedStyle(document.body).color
    }
  })
  assert(placement.count === 1, `${placement.count} add buttons`)
  // The sidebar mark is inline SVG: youtube.com never loads extension files.
  assert(await yt.locator('#yt-series-link .yt-series-icon svg').count() === 1, 'sidebar icon is not inline SVG')
  assert(await yt.locator('img[src^="chrome-extension:"]').count() === 0, 'page loads an extension file')
  assert(placement.inVisibleHeader, 'button injected into the hidden header')
  assert(placement.marginRight >= 8, 'button has no gap from neighbouring buttons')
  assert(placement.linkColor === placement.bodyColor, `sidebar link colour ${placement.linkColor} ≠ page text ${placement.bodyColor}`)
  // YouTube's dark theme (<html dark>): the sidebar section reads white.
  const dark = await yt.evaluate(() => {
    document.documentElement.setAttribute('dark', '')
    return [getComputedStyle(document.getElementById('yt-series-link')).color, getComputedStyle(document.getElementById('yt-series-section-title')).color]
  })
  assert(dark.every(color => color === 'rgb(241, 241, 241)'), `sidebar in dark theme: ${dark.join(', ')}`)
  await yt.evaluate(() => document.documentElement.removeAttribute('dark'))
  assert(/Add to Series/.test(await yt.textContent('.yt-series-add-btn')), 'wrong initial label')
  await send('PLAYLIST_ADD', { url: 'https://www.youtube.com/playlist?list=PLlayout0001' })
  await yt.waitForFunction(() => /View on YT Series/.test(document.querySelector('.yt-series-add-btn').textContent), null, { timeout: 5000 })
  assert(await yt.locator('.yt-series-add-btn').count() === 1, 'duplicate after library update')
  await yt.close()
})

await step('re-injected content script takes over: one button, correct saved state', async () => {
  // What the service worker does on install/update for already-open YouTube tabs.
  const yt = await context.newPage()
  watchErrors(yt, 'youtube-reinject')
  await yt.goto('https://www.youtube.com/playlist?list=PLlayout0001') // saved in the previous step
  await yt.waitForFunction(() => /View on YT Series/.test(document.querySelector('.yt-series-add-btn')?.textContent || ''))
  const firstOwner = await yt.$eval('.yt-series-add-btn', b => b.dataset.owner)
  await page.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/playlist?list=PLlayout0001' })
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content/index.js'] })
  })
  await yt.waitForFunction(owner => {
    const buttons = document.querySelectorAll('.yt-series-add-btn')
    return buttons.length === 1 && buttons[0].dataset.owner !== owner && /View on YT Series/.test(buttons[0].textContent)
  }, firstOwner, { timeout: 5000 })
  assert(await yt.locator('#yt-series-sidebar-section').count() === 1, 'duplicate sidebar link')
  // The superseded instance must not resurrect its UI on later navigations.
  await yt.evaluate(() => document.dispatchEvent(new Event('yt-navigate-finish')))
  await yt.waitForTimeout(300)
  assert(await yt.locator('.yt-series-add-btn').count() === 1, 'old instance re-injected a button')
  await yt.close()
})

await step('legacy orphaned script button (pre-1.2 markup) is cleaned up', async () => {
  const yt = await context.newPage()
  watchErrors(yt, 'youtube-legacy')
  await yt.goto('https://www.youtube.com/playlist?list=PLlayout0001') // saved
  await yt.waitForFunction(() => /View on YT Series/.test(document.querySelector('.yt-series-add-btn')?.textContent || ''))
  // Emulate the old orphaned content script: whenever no #yt-series-add-btn exists it
  // appends its own "Add to Series" (id only, no class/owner); it also inserts one right away.
  await yt.evaluate(() => {
    const container = document.querySelectorAll('.ytPageHeaderViewModelScrollContainer')[1]
    const legacy = () => { const b = document.createElement('button'); b.id = 'yt-series-add-btn'; b.textContent = 'Add to Series'; container.append(b) }
    legacy()
    new MutationObserver(() => { if (!document.querySelector('#yt-series-add-btn')) legacy() }).observe(document.body, { childList: true, subtree: true })
  })
  await yt.waitForTimeout(800)
  const buttons = await yt.$$eval('#yt-series-add-btn, .yt-series-add-btn', list => list.map(b => ({ text: b.textContent, owned: Boolean(b.dataset.owner) })))
  assert(buttons.length === 1 && buttons[0].owned && /View on YT Series/.test(buttons[0].text), `buttons: ${JSON.stringify(buttons)}`)
  await yt.close()
})

await step('no uncaught errors or console errors on any page', async () => {
  assert(!consoleErrors.length, consoleErrors.slice(0, 5).join(' | '))
})

await context.close()
await rm(profile, { recursive: true, force: true })

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed. Artifacts: ${artifacts}`)
if (failed.length) {
  for (const f of failed) console.log(`  ✗ ${f.name}: ${f.error}`)
  process.exit(1)
}
