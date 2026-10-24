// End-to-end smoke test: loads dist/ as an unpacked extension in Chromium,
// exercises the service worker message API, renders the dashboard and fails
// on any uncaught page error. Run after `npm run build`:  npm run smoke
import { chromium } from 'playwright'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
// Optional: SMOKE_SCREENSHOTS=<dir> saves screenshots for visual review.
const shots = process.env.SMOKE_SCREENSHOTS || ''
const axeSource = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
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
  await page.waitForSelector('.series-card', { timeout: 10000 })
  const cards = await page.locator('.series-card').count()
  check(cards > 0, `dashboard renders library (${cards} cards)`)
  check(await page.locator('html[data-theme="light"]').count() === 1, 'theme applied via data-theme')
  await page.waitForTimeout(600)
  if (shots) await page.screenshot({ path: join(shots, 'home-light.png'), fullPage: false })

  // Accessibility audit (axe-core): no serious or critical violations.
  const audit = async (label, include) => {
    // Extension pages forbid inline/remote scripts, so axe is evaluated as a string.
    await page.evaluate(axeSource)
    const result = await page.evaluate(async scope => {
      const { violations } = await window.axe.run(scope ? document.querySelector(scope) : document, { resultTypes: ['violations'] })
      return violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
        .map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(', ')}`)
    }, include)
    check(result.length === 0, `a11y ${label}: no serious/critical axe violations${result.length ? '\n    ' + result.join('\n    ') : ''}`)
  }
  await audit('home')

  // Detail dialog: open from a card title (keyboard path), toggle an episode, close with Escape.
  await page.locator('.series-row .card-title-btn').first().click()
  await page.waitForSelector('#detailModal:not(.hidden) .episode-card', { timeout: 5000 })
  check(await page.locator('#detailModal .modal[role="dialog"][aria-modal="true"]').count() === 1, 'detail opens as an accessible dialog')
  const status = page.locator('#detailModal .episode-status').first()
  const before = await status.getAttribute('aria-pressed')
  await status.click()
  await page.waitForFunction(prev => document.querySelector('#detailModal .episode-status')?.getAttribute('aria-pressed') !== prev, before, { timeout: 5000 })
  check(true, 'episode watched toggle re-renders from server state')
  await audit('detail dialog', '#detailModal')
  if (shots) await page.screenshot({ path: join(shots, 'detail.png') })
  await page.keyboard.press('Escape')
  await page.waitForSelector('#detailModal.hidden', { state: 'attached', timeout: 3000 })
  check(true, 'Escape closes the detail dialog')

  // Settings: switch theme from the UI.
  await page.click('#settingsBtn')
  await page.waitForSelector('#settingsModal:not(.hidden)')
  await page.selectOption('#themeSelect', 'ocean-blue')
  await page.waitForSelector('html[data-theme="ocean-blue"]', { timeout: 5000 })
  check(true, 'theme select updates the dashboard')
  await page.keyboard.press('Escape')

  // Local search filter.
  await page.fill('#searchInput', 'cooking')
  await page.waitForFunction(() => document.querySelectorAll('.series-card').length >= 1 && document.querySelector('.search-header-title'))
  const filtered = await page.locator('.series-card').count()
  check(filtered >= 1 && filtered < cards, `search filters the library (${filtered} cards)`)
  await page.waitForTimeout(600) // let theme/modal transitions settle
  if (shots) await page.screenshot({ path: join(shots, 'search-dark.png') })
  await page.fill('#searchInput', '')

  // ── Content script on a stubbed youtube.com ─────────────────────────────
  // Playwright serves fake YouTube markup, so the real content script runs
  // against known selectors without network access.
  const fakeYouTube = `<!doctype html><html><body>
    <ytd-guide-section-renderer></ytd-guide-section-renderer><ytd-guide-section-renderer></ytd-guide-section-renderer>
    <div id="playlist-action-menu"><div id="top-level-buttons-computed"></div></div>
    <video class="video-stream html5-main-video"></video></body></html>`
  await context.route('https://www.youtube.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: fakeYouTube }))
  const demoState = (await send('STATE_GET')).state
  const demoSeries = Object.values(demoState.series).find(s => s.videos.some(v => !v.watched))
  const target = demoSeries.videos.find(v => !v.watched)
  const yt = await context.newPage()
  yt.on('pageerror', err => pageErrors.push(`youtube: ${err.message}`))
  await yt.goto(`https://www.youtube.com/watch?v=${target.id}&list=${demoSeries.playlistId}`)
  await yt.waitForSelector('#yt-series-sidebar-section', { timeout: 10000 })
  check(true, 'content script injects the sidebar link')
  await yt.waitForSelector('#yt-series-add-btn', { timeout: 10000 })
  check(/YT Series/.test(await yt.textContent('#yt-series-add-btn')), 'add button recognises a saved playlist')
  await yt.evaluate(() => document.querySelector('video').dispatchEvent(new Event('ended')))
  await page.waitForFunction(([pl, vid]) => new Promise(resolve => chrome.runtime.sendMessage({ type: 'STATE_GET' }, r => resolve(r.state.series[pl].videos.find(v => v.id === vid).watched))), [demoSeries.playlistId, target.id], { timeout: 5000 })
  check(true, 'video "ended" marks the episode watched')
  const contentBlocked = await yt.evaluate(() => new Promise(resolve => {
    // Runs in the page's main world: chrome.runtime is not available there, which is expected.
    resolve(typeof chrome === 'undefined' || !chrome.runtime?.sendMessage)
  }))
  check(contentBlocked, 'page scripts cannot reach the extension messaging API')
  await yt.close()

  // Popup renders stats with the dashboard's theme tokens.
  const popup = await context.newPage()
  popup.on('pageerror', err => pageErrors.push(`popup: ${err.message}`))
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`)
  await popup.waitForFunction(() => document.getElementById('seriesCount').textContent !== '—', null, { timeout: 5000 })
  check(Number(await popup.textContent('#seriesCount')) > 0, 'popup shows library stats')
  check(await popup.getAttribute('html', 'data-theme') === 'ocean-blue', 'popup follows the selected theme')
  // "Open Dashboard" focuses the existing dashboard tab (or opens one) and closes the popup.
  const dashboardsBefore = context.pages().filter(p => p.url().includes('/src/tab/index.html')).length
  await Promise.all([popup.waitForEvent('close', { timeout: 5000 }), popup.click('#openDashboard')])
  const dashboardsAfter = context.pages().filter(p => p.url().includes('/src/tab/index.html')).length
  check(dashboardsAfter >= 1 && dashboardsAfter <= Math.max(1, dashboardsBefore), 'popup "Open Dashboard" opens or focuses the dashboard')

  // Saved library view.
  await page.click('#libraryMenuBtn')
  await page.click('#libraryMenu .nav-menu-item >> nth=0')
  await page.waitForSelector('.collections-section')
  check(await page.locator('.collection-library-grid .series-card').count() > 0, 'saved library renders')

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
