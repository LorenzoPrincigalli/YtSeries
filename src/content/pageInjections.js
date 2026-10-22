// @ts-check
// UI added to YouTube pages: a sidebar link and an "Add to Series" button on
// playlist pages. Idempotent — safe to call on every (throttled) DOM change.
import { EVENTS } from '../shared/events.js'
import { t } from '../shared/i18n.js'
import { h } from '../shared/dom.js'
import { SELECTORS, currentPageIds } from './youtubeDom.js'
import { showToast } from './toast.js'

const SIDEBAR_ID = 'yt-series-sidebar-section'
const BUTTON_ID = 'yt-series-add-btn'

export class PageInjections {
  /** @param {{ send: (type: string, payload?: any) => Promise<any> }} messenger */
  constructor(messenger) {
    this.messenger = messenger
    this.buttonFor = null // playlist id the current button (or pending lookup) belongs to
    this.buttonToken = 0  // invalidates lookups started for a previous playlist
    this.pending = false
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

  /** Drops the button when the user navigates to another playlist. */
  resetButton() {
    this.buttonFor = null
    this.buttonToken++
    this.pending = false
    for (const button of document.querySelectorAll(`#${BUTTON_ID}`)) button.remove()
  }

  injectAddButton() {
    const { playlistId } = currentPageIds()
    if (!playlistId) return
    if (this.buttonFor === playlistId && (this.pending || document.getElementById(BUTTON_ID))) return
    const container = document.querySelector(SELECTORS.playlistActions) || document.querySelector(SELECTORS.playlistHeader)
    if (!container) return

    this.resetButton()
    this.buttonFor = playlistId
    const token = this.buttonToken
    this.pending = true
    this.messenger.send(EVENTS.PLAYLIST_EXISTS, { playlistId }).then(response => {
      if (token !== this.buttonToken) return
      this.pending = false
      if (currentPageIds().playlistId !== playlistId || document.getElementById(BUTTON_ID)) return
      if (!container.isConnected) { this.buttonFor = null; return } // YouTube re-rendered; retry on next mutation
      container.append(this.createButton(playlistId, Boolean(response.success && response.exists)))
    })
  }

  /** @param {string} playlistId @param {boolean} saved */
  createButton(playlistId, saved) {
    const button = h('button', { type: 'button', id: BUTTON_ID, class: ['yt-series-add-btn', saved && 'is-saved'], dataset: { playlistId } },
      saved ? t('content_view_on_yt_series') : t('content_add_to_series'))
    let isSaved = saved
    button.addEventListener('click', async () => {
      if (isSaved) { this.openDashboard(); return }
      button.disabled = true
      button.textContent = t('adding')
      const url = new URL('https://www.youtube.com/playlist')
      url.searchParams.set('list', playlistId)
      const response = await this.messenger.send(EVENTS.PLAYLIST_ADD, { url: url.href })
      button.disabled = false
      if (response.success) {
        isSaved = true
        button.classList.add('is-saved')
        button.textContent = t('content_view_on_yt_series')
        return
      }
      button.textContent = t('content_add_to_series')
      const code = String(response.error || '').toLowerCase()
      const reason = t(`error_${code}`)
      showToast(response.error === 'CONTEXT_INVALIDATED'
        ? t('error_context_invalidated')
        : `${t('content_could_not_add')}${reason !== `error_${code}` ? `: ${reason}` : ''}`)
    })
    return button
  }
}
