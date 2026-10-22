// Dashboard entry point: wires features to the store. Rendering lives in
// views/ and components/, intents in actions.js, state in core/store.js.
import { EVENTS } from '../shared/events.js'
import { t } from '../shared/i18n.js'
import { logger } from '../shared/logger.js'
import { byId, h, mount } from './core/dom.js'
import { getState, setServer, setUi, subscribe } from './core/store.js'
import { safeRender, installGlobalErrorHandlers } from './core/errorBoundary.js'
import { initModalTriggers } from './ui/modal.js'
import { applyCachedTheme, applyTheme } from './theme.js'
import { applyLanguage, translateStatic } from './i18nDom.js'
import { loadState } from './actions.js'
import { renderMain } from './views/home.js'
import { DetailView } from './components/detail.js'
import { initHeader } from './features/header.js'
import { initActivity } from './features/activity.js'
import { initSettings, openSettings } from './features/settings.js'
import { initAddPlaylist } from './features/addPlaylist.js'
import { initFooter } from './features/footer.js'

const log = logger.child('tab')

let appliedLanguage = null
let appliedTheme = null

/** Re-applies theme/language only when they actually change. */
function applySettings() {
  const settings = getState()?.settings
  if (!settings) return
  if (settings.theme !== appliedTheme) {
    appliedTheme = settings.theme
    applyTheme(settings.theme)
  }
  if (settings.language !== appliedLanguage) {
    appliedLanguage = settings.language
    applyLanguage(settings.language)
    translateStatic()
  }
}

function renderLoadError() {
  mount(/** @type {HTMLElement} */ (byId('mainContent')), h('div', { class: 'empty-state', role: 'alert' },
    h('div', { class: 'empty-state-icon', 'aria-hidden': 'true' }, '⚠️'),
    h('h2', { class: 'empty-state-title' }, t('something_wrong')),
    h('p', { class: 'empty-state-desc' }, t('load_failed_msg')),
    h('button', { type: 'button', class: 'btn-primary', onClick: () => boot() }, t('retry'))))
}

function listenForBroadcasts() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender?.id !== chrome.runtime.id) return
    if (message?.type === EVENTS.STATE_UPDATED && message.state) setServer({ state: message.state, syncStatus: message.syncStatus })
  })
}

/** Deep links: ?settings=1 opens settings, ?series=<id> opens a series. */
function handleDeepLinks() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('settings') === '1') openSettings('theme')
  const seriesId = params.get('series')
  if (seriesId && Object.hasOwn(getState()?.series || {}, seriesId)) setUi({ detailId: seriesId })
}

async function boot() {
  const main = /** @type {HTMLElement} */ (byId('mainContent'))
  main.setAttribute('aria-busy', 'true')
  try {
    await loadState()
  } catch (err) {
    log.error('Initial state load failed', err)
    renderLoadError()
    return
  } finally {
    main.removeAttribute('aria-busy')
  }
  handleDeepLinks()
}

function init() {
  installGlobalErrorHandlers()
  applyCachedTheme()
  translateStatic()

  const main = /** @type {HTMLElement} */ (byId('mainContent'))
  subscribe(() => {
    applySettings()
    safeRender(main, 'main', () => renderMain(main))
  })

  new DetailView()
  initModalTriggers()
  initHeader()
  initActivity()
  initSettings()
  initAddPlaylist()
  initFooter()
  listenForBroadcasts()

  // Refresh when the tab regains focus (another device may have synced).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getState()) loadState().catch(err => log.warn('Background refresh failed', err))
  })

  boot()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()
