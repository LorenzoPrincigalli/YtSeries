// Chrome Web Store promo tiles: small 440×280 and marquee 1400×560, 24-bit PNG
// (no alpha), rendered natively at that size. They reuse the store screenshots,
// so run `npm run screenshots` first when the UI changes.
//   npm run promo   →   src/assets/store/promo-small.png, promo-marquee.png
import { chromium } from 'playwright'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const store = join(root, 'src', 'assets', 'store')
const shots = join(store, 'screenshots')

const dataUri = async (file, type) => `data:${type};base64,${(await readFile(file)).toString('base64')}`
const font = weight => dataUri(join(root, 'src', 'tab', 'fonts', `poppins-${weight}-latin.woff2`), 'font/woff2')
const shot = name => dataUri(join(shots, name), 'image/png')

const [regular, semibold, bold, home, detail] = await Promise.all([
  font(400), font(600), font(700), shot('screenshot-01-home.png'), shot('screenshot-02-detail.png')
])

/** The "‹YT.▢▢▢ series›" wordmark from the extension icon, as vector. @param {number} size font size in px */
const wordmark = size => `
  <div class="mark" style="font-size:${size}px">
    <svg class="br" viewBox="0 0 10 24"><path d="M9 1 1 12l8 11"/></svg>
    <span class="stack">
      <span class="yt">YT.<span class="eps"><i></i><i></i><i></i></span></span>
      <span class="series">series</span>
    </span>
    <svg class="br end" viewBox="0 0 10 24"><path d="m1 1 8 11-8 11"/></svg>
  </div>`

const BASE = `
  @font-face { font-family: Poppins; font-weight: 400; src: url(${regular}) format('woff2'); }
  @font-face { font-family: Poppins; font-weight: 600; src: url(${semibold}) format('woff2'); }
  @font-face { font-family: Poppins; font-weight: 700; src: url(${bold}) format('woff2'); }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body {
    font-family: Poppins, sans-serif; color: #fff;
    background:
      radial-gradient(ellipse at 78% 30%, rgba(212, 0, 0, .38), transparent 58%),
      radial-gradient(ellipse at 10% 110%, rgba(212, 0, 0, .18), transparent 50%),
      #0d0d0d;
  }
  .mark { display: inline-flex; align-items: center; gap: .08em; line-height: .86; font-weight: 700; color: #f2f0ec; }
  .mark .br { width: .32em; height: .78em; align-self: flex-start; margin-top: .06em; fill: none; stroke: #d9d6d0; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .mark .br.end { align-self: flex-end; margin: 0 0 .04em; }
  .mark .stack { display: flex; flex-direction: column; }
  .mark .yt { display: flex; align-items: flex-end; letter-spacing: -.02em; }
  .mark .eps { display: inline-flex; gap: .07em; margin: 0 0 .1em .12em; }
  .mark .eps i { width: .27em; height: .62em; border: .065em solid currentColor; border-radius: .05em; }
  .mark .series { letter-spacing: -.01em; }
  .accent { color: #ff2b2b; }
  /* Browser window around a real screenshot. */
  .window { position: absolute; border-radius: 14px; overflow: hidden; background: #1b1b1b;
    box-shadow: 0 30px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.08); }
  .window .bar { height: 30px; display: flex; align-items: center; gap: 7px; padding: 0 13px; background: #232323; }
  .window .bar i { width: 11px; height: 11px; border-radius: 50%; background: #3d3d3d; }
  .window .bar i:first-child { background: #ff5f57; } .window .bar i:nth-child(2) { background: #febc2e; } .window .bar i:nth-child(3) { background: #28c840; }
  .window img { display: block; width: 100%; }
`

const MARQUEE = `
  <style>${BASE}
    .copy { position: absolute; left: 86px; top: 0; bottom: 0; width: 520px; display: flex; flex-direction: column; justify-content: center; }
    h1 { margin-top: 38px; font-size: 42px; line-height: 1.12; font-weight: 700; letter-spacing: -.02em; }
    p { margin-top: 18px; font-size: 21px; line-height: 1.5; color: #c9c6c1; }
    .pills { display: flex; gap: 10px; margin-top: 30px; }
    .pills span { padding: 8px 16px; border-radius: 999px; font-size: 15px; font-weight: 600; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); }
    .main { left: 660px; top: 70px; width: 880px; transform: perspective(1800px) rotateY(-9deg); transform-origin: left center; }
    /* Just the series dialog from the detail screenshot (its 740×680 card at 270,60). */
    .card { position: absolute; left: 600px; top: 296px; width: 370px; height: 340px; border-radius: 12px;
      background: url(${detail}) -135px -30px / 640px 400px no-repeat;
      box-shadow: 0 24px 70px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.1); }
  </style>
  <div class="copy">
    ${wordmark(46)}
    <h1>Turn YouTube playlists<br>into <span class="accent">TV series</span></h1>
    <p>Track every episode, resume where you left off and never miss a new one.</p>
    <div class="pills"><span>Progress</span><span>Resume</span><span>New episodes</span></div>
  </div>
  <div class="window main"><div class="bar"><i></i><i></i><i></i></div><img src="${home}" alt=""></div>
  <div class="card"></div>
`

const SMALL = `
  <style>${BASE}
    body { background: radial-gradient(ellipse at 50% 0%, rgba(212, 0, 0, .45), transparent 65%), #0d0d0d; }
    .copy { position: absolute; left: 0; right: 0; top: 30px; display: flex; flex-direction: column; align-items: center; text-align: center; }
    h1 { margin-top: 14px; font-size: 24px; line-height: 1.2; font-weight: 700; letter-spacing: -.01em; }
    .shot { left: 50px; right: 50px; top: 168px; border-radius: 10px; }
    .shot .bar { height: 18px; gap: 5px; padding: 0 9px; } .shot .bar i { width: 7px; height: 7px; }
  </style>
  <div class="copy">
    ${wordmark(34)}
    <h1>YouTube playlists as <span class="accent">TV series</span></h1>
  </div>
  <div class="window shot"><div class="bar"><i></i><i></i><i></i></div><img src="${home}" alt=""></div>
`

const TILES = [
  { file: 'promo-small.png', width: 440, height: 280, html: SMALL },
  { file: 'promo-marquee.png', width: 1400, height: 560, html: MARQUEE }
]

const browser = await chromium.launch()
for (const tile of TILES) {
  const page = await browser.newPage({ viewport: { width: tile.width, height: tile.height }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${tile.html}</body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => [...document.images].every(img => img.complete))
  const file = join(store, tile.file)
  await sharp(await page.screenshot({ type: 'png' })).removeAlpha().png({ compressionLevel: 9 }).toFile(file)
  const meta = await sharp(file).metadata()
  if (meta.width !== tile.width || meta.height !== tile.height || meta.hasAlpha) throw new Error(`${tile.file}: ${meta.width}x${meta.height} alpha=${meta.hasAlpha}`)
  console.log(`✓ ${tile.file} (${meta.width}×${meta.height}, ${meta.channels} channels)`)
  await page.close()
}
await browser.close()
