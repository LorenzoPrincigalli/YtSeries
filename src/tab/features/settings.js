// @ts-check
// Settings dialog: appearance, overlays, notifications, cloud sync, data
// management (export / import / backups / reset) and dev tools.
import { EVENTS } from '../../shared/events.js'
import { EXTENSION_ID, SUPPORT_URL } from '../../shared/constants.js'
import { t } from '../../shared/i18n.js'
import { logger } from '../../shared/logger.js'
import { h, byId, mount, setField } from '../../shared/dom.js'
import { send, request } from '../core/api.js'
import { getState, getSyncStatus, subscribe } from '../core/store.js'
import { guarded } from '../core/errorBoundary.js'
import { openModal, confirmDialog } from '../ui/modal.js'
import { toast, toastError, errorMessage } from '../ui/feedback.js'
import * as actions from '../actions.js'

const log = logger.child('settings')
const MODAL_ID = 'settingsModal'
const MAX_IMPORT_BYTES = 20 * 1024 * 1024

/** @param {string} section */
function showSection(section) {
  for (const tab of document.querySelectorAll('.settings-tab')) {
    const active = /** @type {HTMLElement} */ (tab).dataset.section === section
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-selected', String(active))
    tab.setAttribute('tabindex', active ? '0' : '-1')
  }
  for (const panel of document.querySelectorAll('.settings-section-content')) {
    panel.classList.toggle('active', /** @type {HTMLElement} */ (panel).dataset.section === section)
  }
}

/** Opens the dialog on a given section (default: theme). @param {string} [section] */
export function openSettings(section = 'theme') {
  populate()
  showSection(section)
  openModal(MODAL_ID)
}

function populate() {
  const settings = getState()?.settings
  if (!settings) return
  setField('themeSelect', settings.theme || 'classic-red')
  setField('languageSelect', settings.language || 'system')
  setField('nextEpisodeOverlayToggle', settings.nextEpisodeOverlay !== false)
  setField('autoRefreshToggle', Boolean(settings.autoRefresh))
  renderSync()
  // Dev tools exist only in unpacked builds (no store EXTENSION_ID yet).
  for (const el of document.querySelectorAll('[data-section="dev"]')) el.classList.toggle('hidden', Boolean(EXTENSION_ID))
}

// ── Cloud sync ───────────────────────────────────────────────────────────

/** @param {number | null | undefined} ts */
const formatSyncTime = ts => (ts ? new Date(ts).toLocaleString() : '—')

function renderSync() {
  const section = byId('cloudSyncSection')
  const tab = document.querySelector('.settings-tab[data-section="sync"]')
  const statusEl = byId('syncStatusText')
  if (!section || !statusEl) return
  const status = getSyncStatus() || {}
  section.classList.toggle('sync-unavailable', !status.configured)
  tab?.classList.toggle('hidden', !status.configured)
  if (!status.configured) return

  const loggedIn = Boolean(status.loggedIn)
  const busy = Boolean(status.syncing)
  /** @type {[string, boolean][]} */
  const buttons = [['syncLoginBtn', !loggedIn], ['syncLogoutBtn', loggedIn], ['syncNowBtn', loggedIn]]
  for (const [id, visible] of buttons) {
    const button = /** @type {HTMLButtonElement | null} */ (byId(id))
    if (!button) continue
    button.classList.toggle('hidden', !visible)
    button.disabled = busy
  }

  if (!loggedIn) { statusEl.textContent = t('sync_status_logged_out'); return }
  const parts = [
    busy ? t('sync_status_syncing')
      : status.lastError ? t('sync_status_error_generic')
        : !navigator.onLine ? t('sync_status_offline')
          : status.email ? t('sync_signed_in_as', { email: status.email }) : t('sync_status_ok')
  ]
  if (status.lastSyncAt) parts.push(t('sync_last_sync', { time: formatSyncTime(status.lastSyncAt) }))
  if (status.pendingChanges) parts.push(t('sync_pending_changes', { count: status.pendingChanges }))
  statusEl.textContent = parts.join(' · ')
}

/** @param {string} message */
function showSyncMessage(message) {
  const el = byId('syncMessage')
  if (!el) return
  el.textContent = message
  el.classList.remove('hidden')
}

async function syncLogin() {
  byId('syncMessage')?.classList.add('hidden')
  let response = await send(EVENTS.SYNC_LOGIN)
  if (!response.success && response.error === 'ACCOUNT_CHANGED' && await confirmDialog(t('sync_account_changed_confirm'))) {
    response = await send(EVENTS.SYNC_LOGIN, { allowAccountChange: true })
  }
  actions.applyResponse(response)
  if (response.success) await actions.loadState()
  else showSyncMessage(errorMessage({ code: response.error }, 'sync_login_failed'))
}

async function syncNow() {
  byId('syncMessage')?.classList.add('hidden')
  const response = await send(EVENTS.SYNC_NOW)
  actions.applyResponse(response)
  if (response.success) await actions.loadState()
  else showSyncMessage(errorMessage({ code: response.error }, 'sync_status_error_generic'))
}

// ── Data management ──────────────────────────────────────────────────────

function exportLibrary() {
  const series = getState()?.series
  if (!series || !Object.keys(series).length) { toast(t('no_data_to_export'), { variant: 'error' }); return }
  const url = URL.createObjectURL(new Blob([JSON.stringify(series, null, 2)], { type: 'application/json' }))
  const link = h('a', { href: url, download: `yt-series-backup-${new Date().toISOString().slice(0, 10)}.json` })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** @param {HTMLInputElement} input */
async function importLibrary(input) {
  const file = input.files?.[0]
  input.value = '' // allow re-selecting the same file
  if (!file) return
  if (file.size > MAX_IMPORT_BYTES) { toast(t('invalid_import_format'), { variant: 'error' }); return }
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    toast(t('invalid_import_format'), { variant: 'error' })
    return
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length) {
    toast(t('invalid_import_format'), { variant: 'error' })
    return
  }
  if (!await confirmDialog(t('import_confirm', { count: Object.keys(data).length }))) return
  // Full validation happens in the background (normalizeSeriesBackup).
  try {
    await request(EVENTS.IMPORT_SERIES, { series: data })
    await actions.loadState()
    toast(t('import_done'), { variant: 'success' })
  } catch (err) {
    log.warn('Import failed', err)
    toastError(err, 'import_error')
  }
}

async function showBackups() {
  const list = byId('backupList')
  if (!list) return
  list.classList.remove('hidden')
  mount(list, h('p', { role: 'status' }, t('loading')))
  const response = await send(EVENTS.BACKUP_LIST)
  if (!response.success) { mount(list, h('p', { role: 'alert' }, t('load_error'))); return }
  if (!response.backups?.length) { mount(list, h('p', null, t('no_backups'))); return }
  mount(list, response.backups.map(backup => h('div', { class: 'backup-row' },
    h('span', null, `${new Date(backup.at).toLocaleString()} · ${backup.seriesCount} ${t('series_count')}`),
    h('button', {
      type: 'button',
      class: 'btn-secondary',
      onClick: guarded(async () => {
        if (!await confirmDialog(t('restore_backup_confirm'))) return
        if (await actions.command(EVENTS.BACKUP_RESTORE, { id: backup.id }, 'restore_backup_error')) {
          list.classList.add('hidden')
          toast(t('restore_backup_done'), { variant: 'success' })
        }
      })
    }, t('restore_backup')))))
}

async function resetAll() {
  if (!await confirmDialog(t('reset_confirm'), { confirmLabel: t('reset_btn'), danger: true })) return
  const response = await actions.command(EVENTS.STORAGE_RESET, {}, 'reset_error')
  if (!response) return
  await actions.loadState()
  populate()
  toast(t('reset_done'), { variant: 'success' })
}

async function loadDemo(button) {
  button.disabled = true
  const response = await actions.command(EVENTS.LOAD_DEMO_DATA, {}, 'something_wrong')
  if (response) toast(t('demo_loaded', { n: response.count }), { variant: 'success' })
  button.disabled = false
}

export function initSettings() {
  byId('settingsBtn')?.addEventListener('click', () => openSettings())
  byId('headerProBtn')?.addEventListener('click', () => window.open(SUPPORT_URL, '_blank', 'noopener'))

  const tabs = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.settings-tab')])
  const sidebar = document.querySelector('.settings-sidebar')
  sidebar?.setAttribute('role', 'tablist')
  sidebar?.setAttribute('aria-orientation', 'vertical')
  for (const tab of tabs) {
    tab.setAttribute('role', 'tab')
    tab.addEventListener('click', () => showSection(tab.dataset.section || 'theme'))
    // Arrow keys move between tabs (WAI-ARIA tabs pattern).
    tab.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const visible = tabs.filter(item => !item.classList.contains('hidden'))
      const next = visible[(visible.indexOf(tab) + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length]
      next.focus()
      showSection(next.dataset.section || 'theme')
    })
  }

  byId('themeSelect')?.addEventListener('change', event => actions.updateSettings({ theme: /** @type {HTMLSelectElement} */ (event.target).value }))
  byId('languageSelect')?.addEventListener('change', event => actions.updateSettings({ language: /** @type {HTMLSelectElement} */ (event.target).value }))
  byId('nextEpisodeOverlayToggle')?.addEventListener('change', event => actions.updateSettings({ nextEpisodeOverlay: /** @type {HTMLInputElement} */ (event.target).checked }))
  byId('autoRefreshToggle')?.addEventListener('change', event => actions.updateSettings({ autoRefresh: /** @type {HTMLInputElement} */ (event.target).checked }))

  byId('syncLoginBtn')?.addEventListener('click', guarded(syncLogin))
  byId('syncLogoutBtn')?.addEventListener('click', guarded(async () => actions.applyResponse(await send(EVENTS.SYNC_LOGOUT))))
  byId('syncNowBtn')?.addEventListener('click', guarded(syncNow))

  byId('resetStorageBtn')?.addEventListener('click', guarded(resetAll))
  byId('exportDataBtn')?.addEventListener('click', exportLibrary)
  byId('importDataBtn')?.addEventListener('click', () => byId('importFileInput')?.click())
  byId('importFileInput')?.addEventListener('change', event => guarded(importLibrary)(/** @type {HTMLInputElement} */ (event.target)))
  byId('showBackupsBtn')?.addEventListener('click', guarded(showBackups))
  byId('loadDemoBtn')?.addEventListener('click', event => guarded(loadDemo)(event.currentTarget))

  window.addEventListener('online', renderSync)
  window.addEventListener('offline', renderSync)
  subscribe(changed => {
    if (!changed.has('server')) return
    renderSync()
    const settings = getState()?.settings
    if (settings) {
      // Keep controls in sync if settings change in another tab/device.
      setField('themeSelect', settings.theme || 'classic-red')
      setField('languageSelect', settings.language || 'system')
      setField('nextEpisodeOverlayToggle', settings.nextEpisodeOverlay !== false)
      setField('autoRefreshToggle', Boolean(settings.autoRefresh))
    }
  })
}
