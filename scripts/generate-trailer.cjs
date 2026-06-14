const { chromium } = require('playwright')
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const EXTENSION_PATH = path.resolve(__dirname, '..')
const OUT_DIR = path.join(EXTENSION_PATH, 'src', 'assets', 'store')
const TMP_DIR = path.join(EXTENSION_PATH, 'scripts', '.trailer-tmp')
const MUSIC_FILE = path.join(EXTENSION_PATH, 'scripts', 'music.mp3')
const FFMPEG = require('@ffmpeg-installer/ffmpeg').path

const W = 1920, H = 1080

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

async function getExtensionId(context) {
  await sleep(3000)
  const sws = context.serviceWorkers()
  for (const sw of sws) {
    const m = sw.url().match(/chrome-extension:\/\/([^/]+)/)
    if (m) return m[1]
  }
  const page = await context.newPage()
  await page.goto('chrome://extensions', { waitUntil: 'load', timeout: 10000 })
  await sleep(1000)
  const id = await page.evaluate(() => {
    const root = document.querySelector('extensions-manager')
    if (!root?.shadowRoot) return null
    const list = root.shadowRoot.querySelector('extensions-item-list')
    if (!list?.shadowRoot) return null
    for (const item of list.shadowRoot.querySelectorAll('extensions-item')) {
      if ((item.shadowRoot?.querySelector('#name')?.textContent || '').includes('YT Series'))
        return item.getAttribute('id')
    }
    return null
  })
  await page.close()
  return id
}

async function injectMockData(page) {
  const { SERIES } = require(path.join(EXTENSION_PATH, 'src', 'assets', 'scripts', 'mock-data.cjs'))
  const seriesMap = {}
  for (const s of SERIES) seriesMap[s.playlistId] = s
  await page.evaluate((data) => {
    return new Promise((res, rej) => {
      chrome.storage.local.set({ series: data }, () => {
        if (chrome.runtime.lastError) rej(chrome.runtime.lastError)
        else res()
      })
    })
  }, seriesMap)
}

async function showOverlay(page, text, subtitle, durationMs) {
  await page.evaluate(({ text, subtitle, durationMs }) => {
    let el = document.getElementById('tl-overlay')
    if (!el) {
      el = document.createElement('div')
      el.id = 'tl-overlay'
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;transition:opacity 0.4s;'
      document.body.appendChild(el)
    }
    el.innerHTML = `
      <div style="font:700 52px Poppins,sans-serif;color:#fff;text-shadow:0 4px 40px rgba(0,0,0,0.9);text-align:center;padding:0 80px;line-height:1.2">${text}</div>
      ${subtitle ? `<div style="font:400 22px Poppins,sans-serif;color:rgba(255,255,255,0.8);margin-top:18px;text-shadow:0 2px 20px rgba(0,0,0,0.8);text-align:center;padding:0 80px">${subtitle}</div>` : ''}
    `
    el.style.opacity = '1'
    setTimeout(() => { if (el) el.style.opacity = '0' }, durationMs - 400)
  }, { text, subtitle, durationMs })
  await sleep(durationMs)
  await page.evaluate(() => {
    const el = document.getElementById('tl-overlay')
    if (el) el.remove()
  })
}

async function setupExtensionPage() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: W, height: H },
    args: [
      '--disable-extensions-except=' + EXTENSION_PATH,
      '--load-extension=' + EXTENSION_PATH,
      '--no-sandbox',
    ],
    recordVideo: { dir: TMP_DIR, size: { width: W, height: H } },
  })
  const extensionId = await getExtensionId(context)
  if (!extensionId) { await context.close(); throw new Error('Extension not found') }

  const pages = context.pages()
  for (let i = 1; i < pages.length; i++) await pages[i].close()
  const page = pages[0]
  await page.setViewportSize({ width: W, height: H })

  const tabUrl = 'chrome-extension://' + extensionId + '/src/tab/index.html'
  await page.goto(tabUrl, { waitUntil: 'load', timeout: 15000 })
  await sleep(2000)
  await injectMockData(page)
  await page.evaluate(() => chrome.runtime.sendMessage({ type: 'RELOAD_STATE' }))
  await sleep(500)
  await page.reload({ waitUntil: 'load', timeout: 15000 })
  await sleep(3000)
  try { await page.waitForSelector('.series-row', { timeout: 8000 }) } catch(e) {}
  await sleep(2000)
  return { context, page, extensionId }
}

async function recordClip(outFile, actionFn) {
  console.log('  Recording...')
  const existing = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.webm') && !f.startsWith('clip-'))
  for (const f of existing) fs.unlinkSync(path.join(TMP_DIR, f))

  const { context, page } = await setupExtensionPage()
  try {
    await actionFn(page)
  } finally {
    await sleep(500)
    await context.close()
    await sleep(2000)
  }
  const files = fs.readdirSync(TMP_DIR)
    .filter(f => f.endsWith('.webm') && !f.startsWith('clip-'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(TMP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (files.length === 0) throw new Error('No video recorded in ' + TMP_DIR)
  const src = path.join(TMP_DIR, files[0].name)
  if (fs.existsSync(outFile)) fs.unlinkSync(outFile)
  fs.copyFileSync(src, outFile)
  console.log('  ->', path.basename(outFile))
}

async function recordAllClips() {
  ensureDir(TMP_DIR)

  // CLIP 1 — Home (7s action) — Overlay: "Cinematic Dashboard"
  await recordClip(path.join(TMP_DIR, 'clip-01.webm'), async (page) => {
    await showOverlay(page, 'Cinematic Dashboard', 'Your playlists, like a TV series.', 4000)
    await sleep(500)
    for (let y = 0; y <= 700; y += 14) {
      await page.evaluate(y => window.scrollTo(0, y), y)
      await sleep(50)
    }
    await sleep(500)
    await page.evaluate(() => window.scrollTo(0, 0))
    await sleep(1000)
  })

  // CLIP 2 — Detail + scroll eps (8s) — Overlay: "Track Every Episode"
  await recordClip(path.join(TMP_DIR, 'clip-02.webm'), async (page) => {
    await showOverlay(page, 'Track Every Episode', 'Auto-detect watched. Sort, filter, resume.', 4000)
    await sleep(800)
    const card = page.locator('.series-card').first()
    if (await card.count() > 0) await card.click()
    await sleep(1500)
    for (let i = 0; i < 70; i++) {
      await page.evaluate(() => {
        const body = document.querySelector('.detail-body')
        if (body) body.scrollBy(0, 4)
        else window.scrollBy(0, 4)
      })
      await sleep(45)
    }
    await sleep(800)
    await page.evaluate(() => window.scrollTo(0, 0))
    await sleep(800)
  })

  // CLIP 3 — Filters (6s) — Overlay: "Smart Filters"
  await recordClip(path.join(TMP_DIR, 'clip-03.webm'), async (page) => {
    await page.evaluate(() => {
      const m = document.getElementById('detailModal'); if (m) m.classList.add('hidden')
      const o = document.querySelector('.modal-overlay'); if (o) o.classList.add('hidden')
    })
    await sleep(500)
    await showOverlay(page, 'Smart Filters', 'All · Watching · Completed · New Episodes', 4000)
    await sleep(500)
    const chips = page.locator('.nav-link[data-filter]')
    const count = await chips.count()
    for (let i = 0; i < count; i++) {
      const text = await chips.nth(i).textContent()
      if (text.toLowerCase().includes('complet')) { await chips.nth(i).click(); break }
    }
    await sleep(1500)
    if (count > 0) await chips.first().click()
    await sleep(1500)
  })

  // CLIP 4 — Settings + themes + lang (8s) — Overlay: "Make It Yours"
  await recordClip(path.join(TMP_DIR, 'clip-04.webm'), async (page) => {
    await showOverlay(page, 'Make It Yours', '4 themes · English · Italiano', 4000)
    await sleep(500)
    await page.evaluate(() => {
      const btn = document.querySelector('[data-action="open-settings"]')
      if (btn) btn.click()
    })
    await sleep(1500)
    for (const theme of ['ocean-blue', 'forest', 'light', 'classic-red']) {
      await page.evaluate(v => {
        const sel = document.getElementById('themeSelect')
        if (sel) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })) }
      }, theme)
      await sleep(1200)
    }
    await page.evaluate(() => {
      const tab = document.querySelector('.settings-tab[data-section="language"]')
      if (tab) tab.click()
    })
    await sleep(500)
    await page.evaluate(() => {
      const sel = document.getElementById('languageSelect')
      if (sel) { sel.value = 'it'; sel.dispatchEvent(new Event('change', { bubbles: true })) }
    })
    await sleep(1200)
    await page.evaluate(() => {
      const sel = document.getElementById('languageSelect')
      if (sel) { sel.value = 'en'; sel.dispatchEvent(new Event('change', { bubbles: true })) }
    })
    await sleep(1000)
  })
}

function composeWithFFmpeg() {
  console.log('Composing trailer with FFmpeg + sound effects...')

  const clip1 = path.join(TMP_DIR, 'clip-01.webm')
  const clip2 = path.join(TMP_DIR, 'clip-02.webm')
  const clip3 = path.join(TMP_DIR, 'clip-03.webm')
  const clip4 = path.join(TMP_DIR, 'clip-04.webm')
  const outFile = path.join(OUT_DIR, 'trailer.mp4')
  const hasAudio = fs.existsSync(MUSIC_FILE)

  const sfxDir = path.join(EXTENSION_PATH, 'scripts', 'sfx')
  const sfxClick = path.join(sfxDir, 'click.wav')
  const sfxSwoosh = path.join(sfxDir, 'swoosh.wav')
  const sfxPop = path.join(sfxDir, 'pop.wav')
  const sfxHover = path.join(sfxDir, 'hover.wav')

  const fadeDuration = 0.5

  // Video filter: trim + fade only (zoompan removed — too error-prone)
  const videoFilter = [
    `[0:v]trim=10:17,setpts=PTS-STARTPTS,fade=t=in:d=${fadeDuration},fade=t=out:d=${fadeDuration}:st=6,setpts=PTS-STARTPTS[v0]`,
    `[1:v]trim=10:19,setpts=PTS-STARTPTS,fade=t=in:d=${fadeDuration},fade=t=out:d=${fadeDuration}:st=7,setpts=PTS-STARTPTS[v1]`,
    `[2:v]trim=10:17,setpts=PTS-STARTPTS,fade=t=in:d=${fadeDuration},fade=t=out:d=${fadeDuration}:st=5,setpts=PTS-STARTPTS[v2]`,
    `[3:v]trim=10:19,setpts=PTS-STARTPTS,fade=t=in:d=${fadeDuration},fade=t=out:d=${fadeDuration}:st=7,setpts=PTS-STARTPTS[v3]`,
    `[v0][v1][v2][v3]concat=n=4:v=1:a=0,format=yuv420p[v]`
  ].join(';')

  const args = ['-y', '-i', clip1, '-i', clip2, '-i', clip3, '-i', clip4]
  let inputIdx = 4 // next input number
  if (hasAudio) { args.push('-i', MUSIC_FILE); musicIdx = inputIdx; inputIdx++ }
  else { musicIdx = -1 }
  args.push('-i', sfxClick); const clickIdx = inputIdx; inputIdx++
  args.push('-i', sfxSwoosh); const swooshIdx = inputIdx; inputIdx++
  args.push('-i', sfxPop); const popIdx = inputIdx; inputIdx++
  args.push('-i', sfxHover); const hoverIdx = inputIdx; inputIdx++

  // Audio layout: transitions at 0, 7, 14, 21s
  const audioFilter = [
    `[${swooshIdx}:a]adelay=0|0,adelay=7000|7000,adelay=14000|14000,adelay=21000|21000,volume=0.3[swoosh]`,
    `[${clickIdx}:a]adelay=2500|2500,adelay=9000|9000,adelay=15500|15500,adelay=22000|22000,volume=0.25[click]`,
    `[${popIdx}:a]adelay=6000|6000,adelay=13000|13000,adelay=20000|20000,adelay=27000|27000,volume=0.2[pop]`,
    `[${hoverIdx}:a]adelay=23500|23500,volume=0.15[hover]`,
    // mix all sfx
    `[swoosh][click]amix=inputs=2[sfx1]`,
    `[sfx1][pop]amix=inputs=2[sfx2]`,
    `[sfx2][hover]amix=inputs=2[sfx]`,
  ]

  if (musicIdx >= 0) {
    audioFilter.push(`[${musicIdx}:a]afade=t=in:d=1,afade=t=out:d=2:st=26,volume=0.1[music]`)
    audioFilter.push(`[sfx][music]amix=inputs=2:duration=shortest[a]`)
  } else {
    audioFilter.push(`[sfx]volume=1[a]`)
  }

  args.push('-filter_complex', videoFilter + ';' + audioFilter.join(';'))
  args.push('-map', '[v]', '-map', '[a]')
  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23')
  args.push('-pix_fmt', 'yuv420p', '-r', '30', '-t', '28', outFile)

  console.log('  ffmpeg (filtering with SFX)...')
  const result = spawnSync(FFMPEG, args, { stdio: 'inherit', timeout: 180000 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('ffmpeg exited with code ' + result.status)

  const stat = fs.statSync(outFile)
  console.log('Trailer:', outFile, '(' + (stat.size / 1024 / 1024).toFixed(1) + ' MB)')
}

async function main() {
  console.log('=== YT Series Trailer Generator ===')
  console.log('Resolution:', W + 'x' + H, '\n')

  console.log('Recording 4 clips...')
  await recordAllClips()

  console.log('\nComposing...')
  composeWithFFmpeg()

  console.log('\nCleaning...')
  fs.rmSync(TMP_DIR, { recursive: true, force: true })
  console.log('Done! trailer.mp4 ready.')
}

main().catch(err => {
  console.error('FATAL:', err.message)
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }) } catch(_) {}
  process.exit(1)
})
