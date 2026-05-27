// Screenshot script for Chrome Web Store listing
// Run from playwright skill: node run.js C:\Progetti\YTSeries\src\assets\scripts\screenshots.cjs

const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const EXTENSION_PATH = 'C:\\Progetti\\YTSeries'
const EXTENSION_ID = 'ahmcjoaafnfblmjeohlclcngdlibdpbj'
const TAB_URL = `chrome-extension://${EXTENSION_ID}/src/tab/index.html`
const OUTPUT_DIR = EXTENSION_PATH + '\\src\\assets\\store'
const STORAGE_KEY = 'yts_series_data'

// Inject mock data into chrome.storage.local via the extension tab
async function injectMockData(page) {
  const mockDataPath = EXTENSION_PATH + '\\src\\assets\\scripts\\mock-data.cjs'
  const { SERIES } = require(mockDataPath)

  // Build the series map
  const seriesMap = {}
  for (const s of SERIES) {
    seriesMap[s.playlistId] = s
  }

  await page.evaluate((data) => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ series: data }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError)
        else resolve()
      })
    })
  }, seriesMap)

  console.log(`✓ Injected ${Object.keys(seriesMap).length} series into storage`)
}

async function waitForApp(page, timeout = 10000) {
  // Wait for the app to render (look for the series-row element)
  await page.waitForSelector('.series-row', { timeout })
  console.log('✓ App rendered')
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// Clean the output directory
function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

async function takeScreenshots() {
  console.log('=== YT Series Screenshot Generator ===\n')

  ensureOutputDir()

  // Launch Chromium
  const userDataDir = EXTENSION_PATH + '\\pw-profile'
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  })
  const browser = context // for compatibility

  try {
    const page = context.pages()[0] || await context.newPage()
    await page.setViewportSize({ width: 1280, height: 800 })

    // -------------------------------------------------------
    // Navigate to extension tab
    // -------------------------------------------------------
    console.log('Navigating to extension tab...')
    await page.goto(TAB_URL, { waitUntil: 'load', timeout: 15000 })
    await sleep(2000)
    console.log('Current URL:', page.url())

    // Inject mock data
    await injectMockData(page)

    // Force SW to re-read from storage by sending a custom message
    console.log('Forcing service worker to reload state from storage...')
    await page.evaluate(() => {
      chrome.runtime.sendMessage({ type: 'RELOAD_STATE' })
    })
    await sleep(500)

    // Reload the page to get fresh state
    await page.reload({ waitUntil: 'load', timeout: 15000 })
    await sleep(3000)

    // Check page content
    const pageText = await page.evaluate(() => document.body.innerText)
    console.log('Page text after reload:', pageText.substring(0, 500))

    // Wait for the page to render fully
    await waitForApp(page)
    await sleep(1000)

    // Wait for card thumbnails to load
    await page.waitForFunction(() => {
      const imgs = document.querySelectorAll('.card-thumb-img')
      if (imgs.length === 0) return false
      return Array.from(imgs).every(img => img.complete && img.naturalWidth > 0)
    }, { timeout: 10000 }).catch(() => console.log('⚠ Some thumbnails did not load'))
    console.log('✓ Thumbnails loaded')

    // -------------------------------------------------------
    // SCREENSHOT 1: Home page with hero + carousels
    // -------------------------------------------------------
    console.log('\n--- Screenshot 1: Home Page ---')
    await page.evaluate(() => window.scrollTo(0, 0))
    await sleep(500)
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'screenshot-01-home.png'),
      fullPage: true,
    })
    console.log('✓ screenshot-01-home.png saved')

    // -------------------------------------------------------
    // SCREENSHOT 2: Series rows (scrolled down past hero)
    // -------------------------------------------------------
    console.log('\n--- Screenshot 2: Series Carousels ---')
    // Scroll to the "My Series" section
    const seriesRows = await page.locator('.section-title').all()
    if (seriesRows.length > 1) {
      await seriesRows[1].scrollIntoViewIfNeeded()
      await sleep(500)
    }
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'screenshot-02-carousels.png'),
      fullPage: false,
    })
    console.log('✓ screenshot-02-carousels.png saved')

    // -------------------------------------------------------
    // SCREENSHOT 3: Detail modal
    // -------------------------------------------------------
    console.log('\n--- Screenshot 3: Detail Modal ---')
    // Click the first series card to open detail modal
    const firstCard = await page.locator('.series-card').first()
    if (firstCard) {
      await firstCard.click()
      await sleep(1000)

      // Wait for modal to appear
      await page.waitForSelector('.detail-modal, .modal-overlay', { timeout: 5000 }).catch(() => {})
      await sleep(500)

      await page.screenshot({
        path: path.join(OUTPUT_DIR, 'screenshot-03-detail.png'),
        fullPage: false,
      })
      console.log('✓ screenshot-03-detail.png saved')

      // Close modal via JS
      await page.evaluate(() => {
        const modal = document.getElementById('detailModal')
        if (modal) modal.classList.add('hidden')
        const overlay = document.querySelector('.modal-overlay')
        if (overlay) overlay.classList.add('hidden')
      })
      await sleep(800)
    } else {
      console.log('⚠ No series card found, skipping detail screenshot')
    }

    // -------------------------------------------------------
    // SCREENSHOT 4: Filtered view (Completate / Completed)
    // -------------------------------------------------------
    console.log('\n--- Screenshot 4: Filtered View ---')
    // Click the "Completate" / "Completed" filter chip
    const filterChips = await page.locator('.filter-chip').all()
    let chipClicked = false
    for (const chip of filterChips) {
      const text = await chip.textContent()
      if (text.toLowerCase().includes('complet') || text.toLowerCase() === 'completed') {
        await chip.click()
        await sleep(800)
        chipClicked = true
        console.log('Clicked filter:', text.trim())
        break
      }
    }
    if (!chipClicked) {
      // Try the second chip (index 2) as fallback
      if (filterChips.length > 2) {
        await filterChips[2].click()
        await sleep(800)
      }
    }

    await page.evaluate(() => window.scrollTo(0, 0))
    await sleep(500)
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'screenshot-04-filtered.png'),
      fullPage: true,
    })
    console.log('✓ screenshot-04-filtered.png saved')

    // Reset filter - click "Tutte" / "All" (first chip)
    if (filterChips.length > 0) {
      await filterChips[0].click()
      await sleep(500)
    }

    // -------------------------------------------------------
    // SCREENSHOT 5: Settings page
    // -------------------------------------------------------
    console.log('\n--- Screenshot 5: Settings ---')
    // The settings ⚙ icon is in the top bar. Click it.
    const settingsIcon = await page.locator('button:has-text("⚙"), .settings-btn, [aria-label*="Settings"], [aria-label*="Impostazioni"]').first()
    if (await settingsIcon.isVisible().catch(() => false)) {
      await settingsIcon.click()
      await sleep(1000)
    } else {
      // Try clicking any button or element containing ⚙
      const gearElements = await page.locator('text=⚙').all()
      if (gearElements.length > 0) {
        await gearElements[0].click()
        await sleep(1000)
      } else {
        console.log('⚠ Settings icon not found')
      }
    }

    await sleep(500)
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'screenshot-05-settings.png'),
      fullPage: false,
    })
    console.log('✓ screenshot-05-settings.png saved')

    // -------------------------------------------------------
    // SCREENSHOT 6: YouTube Sidebar Integration
    // -------------------------------------------------------
    // This one requires YouTube, skip for now
    console.log('\n--- Skipping YouTube Sidebar (requires live YouTube) ---')

    console.log('\n=== All screenshots saved to:', OUTPUT_DIR, '===')

  } catch (err) {
    console.error('Error during screenshot capture:', err.message)
    console.error(err.stack)
    // Take a debug screenshot of whatever state we're in
    try {
      const pages = context ? context.pages() : []
      for (const p of pages) {
        await p.screenshot({ path: path.join(OUTPUT_DIR, 'debug-error.png') })
      }
    } catch(e) {}
    throw err
  } finally {
    await context.close()
  }
}

takeScreenshots().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
