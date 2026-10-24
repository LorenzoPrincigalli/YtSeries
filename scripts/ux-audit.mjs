// Exploratory UX/UI audit. Loads dist/ in Chromium, walks the main screens in
// several viewports and themes, screenshots each state and measures what a
// person would trip over: tiny targets, clipped text without a tooltip,
// overlapping controls, horizontal overflow, invisible keyboard focus, tiny
// type, broken images, console errors and axe violations.
//
// It is an audit, not a gate: it always exits 0 and writes a report for a
// human (or the ux-reviewer agent, .claude/agents/ux-reviewer.md) to judge.
//   npm run build && npm run ux            demo library (dev builds only)
//   UX_LIVE=1 npm run ux                   real playlists (scripts/store-library.mjs)
// Output: ux-report/<timestamp>/{report.md, report.json, *.png}, and ux-report/latest.txt
import { chromium } from 'playwright'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIBRARY, stageLibrary } from './store-library.mjs'

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = join(root, 'ux-report', stamp)
const axeSource = await readFile(join(root, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
const LIVE = process.env.UX_LIVE === '1'

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 375, height: 812 }
]
const THEMES = ['classic-red', 'light']
const MIN_TARGET = 24 // WCAG 2.2 SC 2.5.8 (target size, minimum)
const MIN_FONT = 11

await mkdir(outDir, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'yts-ux-'))
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  locale: process.env.UX_LOCALE || 'it-IT',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
})
const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 })
const DASH = `chrome-extension://${new URL(worker.url()).host}/src/tab/index.html`
const page = await context.newPage()
const consoleErrors = []
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)) })
page.on('pageerror', err => consoleErrors.push(String(err).slice(0, 300)))
const send = (type, payload) => page.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload])

// ── Library ──────────────────────────────────────────────────────────────
await page.goto(DASH)
if (LIVE) {
  for (const { playlistId } of LIBRARY) await send('PLAYLIST_ADD', { url: `https://www.youtube.com/playlist?list=${playlistId}` })
  const series = (await send('STATE_GET')).state.series
  await send('IMPORT_SERIES', { series: stageLibrary(series, Date.now(), LIBRARY.filter(plan => series[plan.playlistId])) })
} else {
  const demo = await send('LOAD_DEMO_DATA')
  if (!demo?.success) throw new Error(`LOAD_DEMO_DATA failed (${demo?.error}); use a development build or UX_LIVE=1`)
}
const library = (await send('STATE_GET')).state.series
const firstId = Object.keys(library)[0]

// ── Checks run inside the page ───────────────────────────────────────────
/** Measures the current screen; returns plain findings. */
function inspect({ minTarget, minFont }) {
  const findings = []
  const visible = el => {
    const r = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05 &&
      r.bottom > 0 && r.top < innerHeight && !el.closest('[inert], .hidden, [aria-hidden="true"], .visually-hidden')
  }
  /** Topmost at its centre: not covered by a dialog, menu or another layer. */
  const reachable = el => {
    const r = el.getBoundingClientRect()
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    const top = document.elementFromPoint(x, y)
    return Boolean(top && (top === el || el.contains(top) || top.contains(el)))
  }
  const describe = el => {
    const parts = [el.tagName.toLowerCase()]
    if (el.id) parts.push(`#${el.id}`)
    for (const cls of [...el.classList].slice(0, 2)) parts.push(`.${cls}`)
    const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 50)
    return { selector: parts.join(''), label }
  }
  const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="menuitemradio"], [tabindex]:not([tabindex="-1"])')].filter(el => visible(el) && reachable(el))

  // Targets smaller than 24×24 px (inline text links are exempt by the SC).
  for (const el of interactive) {
    const r = el.getBoundingClientRect()
    const inlineLink = el.tagName === 'A' && getComputedStyle(el).display === 'inline'
    if (!inlineLink && (r.width < minTarget || r.height < minTarget)) findings.push({ check: 'small-target', ...describe(el), detail: `${Math.round(r.width)}×${Math.round(r.height)} px` })
  }
  // Clipped text with no way to read it (no title, no aria-label).
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.children.length > 2 || el.clientWidth <= 2 || !reachable(el)) continue
    const style = getComputedStyle(el)
    const truncating = style.textOverflow === 'ellipsis' || (style.webkitLineClamp && style.webkitLineClamp !== 'none')
    const clipped = truncating && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) && (el.textContent || '').trim().length > 3
    if (clipped && !el.closest('[title]') && !el.getAttribute('aria-label') && !el.querySelector('img')) findings.push({ check: 'clipped-text', ...describe(el), detail: `${el.scrollWidth}px of text in ${el.clientWidth}px` })
  }
  // Overlapping controls (neither inside the other).
  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const a = interactive[i]; const b = interactive[j]
      if (a.contains(b) || b.contains(a)) continue
      // A button placed inside a text field (clear, reveal) is part of the field.
      if (a.parentElement === b.parentElement && [a, b].some(el => el.tagName === 'INPUT')) continue
      const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect()
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (w > 4 && h > 4 && w * h > 0.2 * Math.min(ra.width * ra.height, rb.width * rb.height)) {
        findings.push({ check: 'overlap', ...describe(a), detail: `overlaps ${describe(b).selector} "${describe(b).label}"` })
      }
    }
  }
  // Content wider than the screen, and controls cut off at the right edge.
  const overflow = document.documentElement.scrollWidth - innerWidth
  if (overflow > 1) findings.push({ check: 'page-overflow', selector: 'html', label: '', detail: `${overflow}px wider than the viewport` })
  for (const el of interactive) {
    const r = el.getBoundingClientRect()
    if (r.right > innerWidth + 1 && !el.closest('.carousel-grid, .collections-shelf, .nav-links')) findings.push({ check: 'off-screen', ...describe(el), detail: `ends at ${Math.round(r.right)}px of ${innerWidth}px` })
  }
  // Tiny type.
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || !reachable(el) || ![...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue
    const size = parseFloat(getComputedStyle(el).fontSize)
    if (size < minFont) findings.push({ check: 'tiny-text', ...describe(el), detail: `${size}px` })
  }
  // Broken images.
  for (const img of document.querySelectorAll('img')) {
    if (visible(img) && img.complete && img.naturalWidth === 0) findings.push({ check: 'broken-image', ...describe(img), detail: img.getAttribute('src')?.slice(0, 80) || '' })
  }
  return findings
}

/** Tabs through the first controls and flags those with no visible focus change. */
async function focusAudit(limit = 30) {
  await page.bringToFront()
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
  // A focus colour that fades in would read as "unchanged" mid-transition.
  const still = await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important }' })
  const findings = []
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    const result = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const focused = getComputedStyle(el)
      const signature = s => [s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? 'outline' : '', s.boxShadow, s.backgroundColor, s.borderColor, s.textDecorationLine, s.color].join('|')
      const now = signature(focused)
      el.blur()
      const before = signature(getComputedStyle(el))
      el.focus({ preventScroll: true })
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50)
      return { visible: now !== before, selector: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].slice(0, 2).map(c => `.${c}`).join('')}`, label }
    })
    if (result && !result.visible) findings.push({ check: 'no-focus-style', selector: result.selector, label: result.label, detail: 'nothing changes when it receives keyboard focus' })
  }
  await still.evaluate(el => el.remove())
  return findings
}

async function axe() {
  await page.evaluate(axeSource)
  return page.evaluate(async () => {
    const { violations } = await window.axe.run(document, { resultTypes: ['violations'] })
    return violations.filter(v => ['serious', 'critical'].includes(v.impact))
      .flatMap(v => v.nodes.slice(0, 3).map(n => ({ check: `axe:${v.id}`, selector: n.target.join(' '), label: '', detail: v.help })))
  })
}

// ── Screens ──────────────────────────────────────────────────────────────
const openLibrary = async filter => {
  await page.click('#libraryMenuBtn')
  await page.click(`#libraryMenu .nav-menu-item >> nth=${{ all: 0, watching: 1, completed: 2, new: 3 }[filter]}`)
  await page.waitForSelector('.library-toolbar')
}
const SCREENS = [
  { name: 'home', go: async () => { await page.goto(DASH); await page.waitForSelector('.series-card, .empty-state') } },
  { name: 'library-menu', go: async () => { await page.goto(DASH); await page.waitForSelector('.series-card'); await page.click('#libraryMenuBtn'); await page.waitForSelector('#libraryMenu:not(.hidden)') } },
  { name: 'your-series-grid', go: async () => { await page.goto(DASH); await page.waitForSelector('.series-card'); await send('SETTINGS_UPDATE', { libraryView: 'grid' }); await openLibrary('all') } },
  { name: 'your-series-list', go: async () => { await page.goto(DASH); await page.waitForSelector('.series-card'); await send('SETTINGS_UPDATE', { libraryView: 'list' }); await openLibrary('watching') } },
  { name: 'upcoming', go: async () => { await page.goto(DASH); await page.click('.nav-link[data-view="schedule"]'); await page.waitForSelector('.schedule-view') } },
  { name: 'detail', go: async () => { await page.goto(`${DASH}?series=${firstId}`); await page.waitForSelector('#detailModal:not(.hidden) .episode-card') } },
  { name: 'detail-episodes', go: async () => { await page.goto(`${DASH}?series=${firstId}`); await page.waitForSelector('#detailModal:not(.hidden) .episode-card'); await page.evaluate(() => { document.getElementById('detailModalBody').scrollTop = 700 }) } },
  { name: 'add-via-link-error', go: async () => { await page.goto(DASH); await page.click('#addPlaylistBtn'); await page.fill('#playlistUrlInput', 'not a link'); await page.click('#addPlaylistConfirm'); await page.waitForSelector('#playlistError:not(.hidden)') } },
  { name: 'settings-goals', go: async () => { await page.goto(`${DASH}?settings=1`); await page.click('.settings-tab[data-section="goals"]') } },
  { name: 'achievements', go: async () => { await page.goto(DASH); await page.click('#achievementsBtn'); await page.waitForSelector('#achievementsModal:not(.hidden) .badge-card') } },
  { name: 'search-youtube', go: async () => { await page.goto(DASH); if (await page.isVisible('#searchToggle')) await page.click('#searchToggle'); await page.fill('#searchInput', 'documentary'); await page.press('#searchInput', 'Enter'); await page.waitForSelector('.search-playlist-card, .channel-card, .search-header-error', { timeout: 20000 }) } }
]

const results = []
for (const theme of THEMES) {
  await send('SETTINGS_UPDATE', { theme })
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    for (const screen of SCREENS) {
      const id = `${screen.name}--${viewport.name}--${theme}`
      const errorsBefore = consoleErrors.length
      try {
        await screen.go()
        await page.mouse.move(viewport.width - 2, viewport.height - 2)
        await page.waitForTimeout(700)
        const file = `${id}.png`
        await page.screenshot({ path: join(outDir, file) })
        const findings = [
          ...await page.evaluate(inspect, { minTarget: MIN_TARGET, minFont: MIN_FONT }),
          // Keyboard and axe once per screen (desktop, first theme): they do not depend on size.
          // axe before the focus pass: that pass pauses animations, and resuming them would replay entrances mid-measure.
          ...(viewport.name === 'desktop' && theme === THEMES[0] ? [...await axe(), ...await focusAudit()] : []),
          ...consoleErrors.slice(errorsBefore).map(text => ({ check: 'console-error', selector: '', label: '', detail: text }))
        ]
        results.push({ id, screen: screen.name, viewport: viewport.name, theme, screenshot: file, findings })
        console.log(`✓ ${id}: ${findings.length} findings`)
      } catch (err) {
        await page.screenshot({ path: join(outDir, `${id}--broken.png`) }).catch(() => {})
        results.push({ id, screen: screen.name, viewport: viewport.name, theme, screenshot: `${id}--broken.png`, findings: [{ check: 'flow-broken', selector: '', label: '', detail: String(err.message).split('\n')[0] }] })
        console.log(`✗ ${id}: ${String(err.message).split('\n')[0]}`)
      }
    }
  }
}

// ── Report: the same issue on many screens is listed once ────────────────
const grouped = new Map()
for (const result of results) {
  for (const finding of result.findings) {
    const key = `${finding.check}|${finding.selector}|${finding.check === 'console-error' ? finding.detail : ''}`
    if (!grouped.has(key)) grouped.set(key, { ...finding, where: [] })
    const entry = grouped.get(key)
    if (!entry.where.includes(result.id)) entry.where.push(result.id)
  }
}
const ORDER = ['flow-broken', 'console-error', 'page-overflow', 'off-screen', 'overlap', 'no-focus-style', 'small-target', 'broken-image', 'tiny-text', 'clipped-text']
const rank = check => (check.startsWith('axe:') ? 2.5 : ORDER.indexOf(check) === -1 ? 99 : ORDER.indexOf(check))
const issues = [...grouped.values()].sort((a, b) => rank(a.check) - rank(b.check) || b.where.length - a.where.length)

const lines = [
  `# UX audit — ${stamp}`,
  '',
  `${results.length} screens (${SCREENS.length} screens × ${VIEWPORTS.length} viewports × ${THEMES.length} themes), library: ${LIVE ? 'real playlists' : 'demo'}, locale ${process.env.UX_LOCALE || 'it-IT'}.`,
  `${issues.length} distinct issues. Measured signals only: a person still has to judge them (see .claude/agents/ux-reviewer.md).`,
  '',
  '| Check | Element | Detail | Seen on |',
  '|---|---|---|---|',
  ...issues.map(issue => `| ${issue.check} | \`${issue.selector || '—'}\` ${issue.label ? `"${issue.label.replace(/\|/g, '/')}"` : ''} | ${String(issue.detail).replace(/\|/g, '/')} | ${issue.where.length} (${issue.where.slice(0, 3).join(', ')}${issue.where.length > 3 ? ', …' : ''}) |`),
  '',
  '## Screenshots',
  '',
  ...results.filter(r => r.screenshot).map(r => `- \`${r.screenshot}\``)
]
await writeFile(join(outDir, 'report.md'), `${lines.join('\n')}\n`)
await writeFile(join(outDir, 'report.json'), JSON.stringify({ stamp, live: LIVE, results, issues }, null, 2))
await writeFile(join(root, 'ux-report', 'latest.txt'), `${outDir}\n`)

await context.close()
await rm(profile, { recursive: true, force: true })
console.log(`\n${issues.length} distinct issues. Report: ${join(outDir, 'report.md')}`)
