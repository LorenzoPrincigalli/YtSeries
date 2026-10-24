// @ts-check
// UI added to YouTube pages: a sidebar link and an "Add to Series" button on
// playlist pages. Idempotent — safe to call on every (throttled) DOM change.
//
// Every element is stamped with the owning script instance: after an
// extension update an orphaned copy of this script may still be on the page,
// and only the current instance's (working) UI must remain.
import { EVENTS } from '../shared/events.js'
import { t } from '../shared/i18n.js'
import { h } from '../shared/dom.js'
import { SELECTORS, currentPageIds, findVisible } from './youtubeDom.js'
import { showToast } from './toast.js'
import { NOTE_BAR_CLASS } from './noteButton.js'
import { PROGRESS_UI } from './progressOverlay.js'

const SIDEBAR_ID = 'yt-series-sidebar-section'
const BUTTON_CLASS = 'yt-series-add-btn'
const BUTTON_ID = 'yt-series-add-btn'
// Includes UI made by pre-1.2 copies of this script (id only, no class or
// owner): an orphaned old copy keeps re-adding an "Add to Series" button.
// Notes bar included: every piece of UI an orphaned copy may leave behind.
const OWNED = `#${SIDEBAR_ID}, .${BUTTON_CLASS}, #${BUTTON_ID}, .${NOTE_BAR_CLASS}, ${PROGRESS_UI}`
const LOOKUP_RETRY_MS = 2000
const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * The YT Series mark (TV + red play), drawn inline. Loading the extension's
 * PNG into youtube.com needs web_accessible_resources and fails from an
 * orphaned copy of this script ("Unsafe attempt to load URL").
 */
function logoIcon() {
  /** @param {string} name @param {Record<string, string>} attrs */
  const node = (name, attrs) => {
    const el = document.createElementNS(SVG_NS, name)
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
    return el
  }
  const root = node('svg', { viewBox: '0 0 24 24', width: '24', height: '24', 'aria-hidden': 'true', focusable: 'false' })
  root.append(
    node('rect', { x: '2.5', y: '4', width: '19', height: '13.5', rx: '2.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8' }),
    node('path', { d: 'M8.5 21h7', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' }),
    node('path', { d: 'M10 7.8v5.9l4.8-2.95z', fill: '#ff0000' }))
  return root
}

export class PageInjections {
  /**
   * @param {{ send: (type: string, payload?: any) => Promise<any> }} messenger
   * @param {string} instance id of the content-script instance that owns the UI
   */
  constructor(messenger, instance) {
    this.messenger = messenger
    this.instance = instance
    this.lookupToken = 0     // invalidates PLAYLIST_EXISTS lookups started for an older page state
    this.pendingFor = null   // playlist id with a lookup in flight
    this.retryAfter = 0      // after a failed lookup, wait before asking again
  }

  /** @returns {HTMLButtonElement[]} */
  ownButtons() {
    return /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll(`.${BUTTON_CLASS}`)])
      .filter(button => button.dataset.owner === this.instance)
  }

  /** Removes UI left behind by an older (orphaned) instance of this script. */
  removeForeignUi() {
    for (const el of document.querySelectorAll(OWNED)) {
      if (/** @type {HTMLElement} */ (el).dataset.owner !== this.instance) el.remove()
    }
  }

  /** Removes this instance's UI (shutdown). */
  removeOwnUi() {
    this.lookupToken++
    for (const el of document.querySelectorAll(OWNED)) {
      if (/** @type {HTMLElement} */ (el).dataset.owner === this.instance) el.remove()
    }
  }

  openDashboard() {
    this.messenger.send(EVENTS.OPEN_SERIES_TAB)
  }

  injectSidebarLink() {
    this.removeForeignUi()
    if (document.getElementById(SIDEBAR_ID)) return
    const sections = document.querySelectorAll(SELECTORS.guideSections)
    if (sections.length < 2) return
    const last = sections[sections.length - 1]
    last.parentNode?.insertBefore(h('div', { id: SIDEBAR_ID, dataset: { owner: this.instance } },
      h('div', { id: 'yt-series-section-title' }, 'YT Series'),
      h('div', { id: 'yt-series-sidebar-link' },
        h('a', { id: 'yt-series-link', href: '#', onClick: event => { event.preventDefault(); this.openDashboard() } },
          h('span', { class: 'yt-series-icon' }, logoIcon()),
          h('span', { class: 'yt-series-label' }, 'YT Series')))), last)
  }

  /** Drops the button when navigating to another page/playlist. */
  resetButton() {
    this.lookupToken++
    this.pendingFor = null
    this.retryAfter = 0
    for (const button of this.ownButtons()) button.remove()
  }

  /**
   * Keeps exactly one button, inside the playlist header the user can see.
   * YouTube keeps hidden/cached headers in the DOM and re-renders them, so
   * stray copies (other playlist, hidden header) are removed on every pass.
   * The button only appears once the saved state is known: a failed lookup
   * shows nothing (never a wrong "Add") and is retried shortly after.
   */
  injectAddButton() {
    this.removeForeignUi()
    const { playlistId } = currentPageIds()
    if (!playlistId) { this.resetButton(); return }
    const container = findVisible(SELECTORS.playlistActions) || findVisible(SELECTORS.playlistHeader)
    if (!container) return

    const keep = this.ownButtons().find(button => button.dataset.playlistId === playlistId && container.contains(button))
    for (const button of this.ownButtons()) if (button !== keep) button.remove()
    if (keep || this.pendingFor === playlistId || Date.now() < this.retryAfter) return

    const token = ++this.lookupToken
    this.pendingFor = playlistId
    this.messenger.send(EVENTS.PLAYLIST_EXISTS, { playlistId }).then(response => {
      if (token !== this.lookupToken) return
      this.pendingFor = null
      if (!response.success) {
        this.retryAfter = Date.now() + LOOKUP_RETRY_MS
        return
      }
      if (currentPageIds().playlistId !== playlistId || !container.isConnected) return // retried on next mutation
      for (const button of this.ownButtons()) button.remove()
      container.append(this.createButton(playlistId, Boolean(response.exists)))
    })
  }

  /**
   * Reflects library changes made elsewhere (dashboard, another tab).
   * @param {Record<string, unknown>} savedIds playlist ids present in the library
   */
  syncSavedState(savedIds) {
    for (const button of this.ownButtons()) this.render(button, Object.hasOwn(savedIds, button.dataset.playlistId || ''))
  }

  /** @param {HTMLButtonElement} button @param {boolean} saved */
  render(button, saved) {
    button.dataset.saved = String(saved)
    button.classList.toggle('is-saved', saved)
    button.textContent = saved ? t('content_view_on_yt_series') : t('content_add_to_series')
  }

  /** @param {string} playlistId @param {boolean} saved */
  createButton(playlistId, saved) {
    const button = h('button', { type: 'button', id: BUTTON_ID, class: BUTTON_CLASS, dataset: { playlistId, owner: this.instance } })
    this.render(button, saved)
    button.addEventListener('click', async () => {
      if (button.dataset.saved === 'true') { this.openDashboard(); return }
      button.disabled = true
      button.textContent = t('adding')
      const url = new URL('https://www.youtube.com/playlist')
      url.searchParams.set('list', playlistId)
      const response = await this.messenger.send(EVENTS.PLAYLIST_ADD, { url: url.href })
      button.disabled = false
      this.render(button, Boolean(response.success))
      if (response.success) return
      const code = String(response.error || '').toLowerCase()
      const reason = t(`error_${code}`)
      showToast(response.error === 'CONTEXT_INVALIDATED'
        ? t('error_context_invalidated')
        : `${t('content_could_not_add')}${reason !== `error_${code}` ? `: ${reason}` : ''}`)
    })
    return button
  }
}
