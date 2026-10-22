// Toolbar popup: library stats, sync indicator and shortcuts. Bundled by
// esbuild, so it shares events, i18n and theme tokens with the dashboard.
import { EVENTS } from '../shared/events.js'
import { SUPPORT_URL, THEMES } from '../shared/constants.js'
import { t, setLanguage } from '../shared/i18n.js'
import { logger } from '../shared/logger.js'

const log = logger.child('popup')
const byId = id => document.getElementById(id)

function send(type, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, payload }, response => {
      if (chrome.runtime.lastError) {
        log.warn(`${type} failed`, chrome.runtime.lastError.message)
        resolve({ success: false, error: 'RUNTIME_ERROR' })
      } else {
        resolve(response ?? { success: false, error: 'NO_RESPONSE' })
      }
    })
  })
}

function translate() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
}

/** @returns {'connected' | 'error' | 'syncing' | 'offline' | 'logged_out' | null} */
function syncMode(status) {
  if (!status?.configured) return null
  if (!status.loggedIn) return 'logged_out'
  if (status.syncing) return 'syncing'
  if (status.lastError) return 'error'
  if (!navigator.onLine) return 'offline'
  return 'connected'
}

function renderSync(status) {
  const dot = byId('syncDot')
  const hint = byId('syncHint')
  const mode = syncMode(status)
  dot.className = 'sync-dot'
  dot.classList.toggle('hidden', !mode)
  hint.classList.toggle('hidden', !mode)
  if (!mode) return
  if (['connected', 'error', 'syncing'].includes(mode)) dot.classList.add(mode)
  const label = t(`popup_sync_${mode}`)
  dot.setAttribute('aria-label', label)
  dot.title = label
  hint.textContent = label
}

function renderStats(state) {
  const series = Object.values(state.series || {})
  const unwatched = series.reduce((sum, s) => sum + (s.videos || []).filter(v => !v.watched).length, 0)
  const fresh = series.reduce((sum, s) => sum + (s.newEpisodesCount || 0), 0)
  byId('seriesCount').textContent = String(series.length)
  byId('unwatchedCount').textContent = String(unwatched)
  byId('newCount').textContent = String(fresh)
}

function openAndClose(url) {
  chrome.tabs.create({ url })
  window.close()
}

async function init() {
  byId('openDashboard').addEventListener('click', async () => {
    await send(EVENTS.OPEN_SERIES_TAB)
    window.close()
  })
  byId('openSettings').addEventListener('click', () => openAndClose(chrome.runtime.getURL('src/tab/index.html?settings=1')))
  byId('supportBtn').addEventListener('click', () => openAndClose(SUPPORT_URL))
  translate()

  const response = await send(EVENTS.STATE_GET)
  if (!response.success || !response.state) {
    byId('loadError').classList.remove('hidden')
    return
  }
  const { settings = {} } = response.state
  document.documentElement.dataset.theme = THEMES.includes(settings.theme) ? settings.theme : 'classic-red'
  setLanguage(settings.language && settings.language !== 'system' ? settings.language : null)
  document.documentElement.lang = settings.language && settings.language !== 'system' ? settings.language : navigator.language.split('-')[0]
  translate()
  renderStats(response.state)
  renderSync(response.syncStatus)
}

init().catch(err => {
  log.error('Popup failed to initialise', err)
  byId('loadError')?.classList.remove('hidden')
})
