// @ts-check
// UI added to YouTube pages: a sidebar link and an "Add to Series" button on
// playlist pages. Idempotent — safe to call on every (throttled) DOM change.
import { EVENTS } from '../shared/events.js'
import { t } from '../shared/i18n.js'
import { h } from '../shared/dom.js'
import { SELECTORS, currentPageIds, findVisible } from './youtubeDom.js'
import { showToast } from './toast.js'

const SIDEBAR_ID = 'yt-series-sidebar-section'
const BUTTON_CLASS = 'yt-series-add-btn'

/** @returns {HTMLButtonElement[]} */
const allButtons = () => [...document.querySelectorAll(`.${BUTTON_CLASS}`)]

export class PageInjections {
  /** @param {{ send: (type: string, payload?: any) => Promise<any> }} messenger */
  constructor(messenger) {
    this.messenger = messenger
    this.lookupToken = 0     // invalidates PLAYLIST_EXISTS lookups started for an older page state
    this.pendingFor = null   // playlist id with a lookup in flight
  }

  openDashboard() {
    this.messenger.send(EVENTS.OPEN_SERIES_TAB)
  }

  injectSidebarLink() {
    if (document.getElementById(SIDEBAR_ID)) return
    const sections = document.querySelectorAll(SELECTORS.guideSections)
    if (sections.length < 2) return
    const last = sections[sections.length - 1]
    last.parentNode?.insertBefore(h('div', { id: SIDEBAR_ID },
      h('div', { id: 'yt-series-section-title' }, 'YT Series'),
      h('div', { id: 'yt-series-sidebar-link' },
        h('a', { id: 'yt-series-link', href: '#', onClick: event => { event.preventDefault(); this.openDashboard() } },
          h('span', { class: 'yt-series-icon' }, h('img', { src: chrome.runtime.getURL('icons/icon16.png'), alt: '' })),
          h('span', { class: 'yt-series-label' }, 'YT Series')))), last)
  }

  /** Drops every injected button (navigation to another page/playlist). */
  resetButton() {
    this.lookupToken++
    this.pendingFor = null
    for (const button of allButtons()) button.remove()
  }

  /**
   * Keeps exactly one button, inside the playlist header the user can see.
   * YouTube keeps hidden/cached headers in the DOM and re-renders them, so
   * stray copies (other playlist, hidden header) are removed on every pass.
   */
  injectAddButton() {
    const { playlistId } = currentPageIds()
    if (!playlistId) { this.resetButton(); return }
    const container = findVisible(SELECTORS.playlistActions) || findVisible(SELECTORS.playlistHeader)
    if (!container) return

    const keep = allButtons().find(button => button.dataset.playlistId === playlistId && container.contains(button))
    for (const button of allButtons()) if (button !== keep) button.remove()
    if (keep || this.pendingFor === playlistId) return

    const token = ++this.lookupToken
    this.pendingFor = playlistId
    this.messenger.send(EVENTS.PLAYLIST_EXISTS, { playlistId }).then(response => {
      if (token !== this.lookupToken) return
      this.pendingFor = null
      if (currentPageIds().playlistId !== playlistId || !container.isConnected) return // retried on next mutation
      for (const button of allButtons()) button.remove()
      container.append(this.createButton(playlistId, Boolean(response.success && response.exists)))
    })
  }

  /**
   * Reflects library changes made elsewhere (dashboard, another tab).
   * @param {Record<string, unknown>} savedIds playlist ids present in the library
   */
  syncSavedState(savedIds) {
    for (const button of allButtons()) this.render(button, Object.hasOwn(savedIds, button.dataset.playlistId || ''))
  }

  /** @param {HTMLButtonElement} button @param {boolean} saved */
  render(button, saved) {
    button.dataset.saved = String(saved)
    button.classList.toggle('is-saved', saved)
    button.textContent = saved ? t('content_view_on_yt_series') : t('content_add_to_series')
  }

  /** @param {string} playlistId @param {boolean} saved */
  createButton(playlistId, saved) {
    const button = h('button', { type: 'button', id: 'yt-series-add-btn', class: BUTTON_CLASS, dataset: { playlistId } })
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
