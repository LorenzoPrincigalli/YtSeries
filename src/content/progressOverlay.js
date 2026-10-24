// @ts-check
// Series progress drawn on YouTube itself: a summary on the playlist page
// ("YT Series · 12/40 watched · 4 h 20 min left") and, on every playlist item
// (playlist page and the watch-page panel), a "Watched" badge, a progress bar
// and a dimmed look for excluded episodes.
//
// YouTube recycles list items for other videos while scrolling, so every pass
// compares the item's current video id with the one it was decorated for.
import { EVENTS } from '../shared/events.js'
import { t } from '../shared/i18n.js'
import { h } from '../shared/dom.js'
import { svg } from '../shared/icons.js'
import { formatDuration, formatLength } from '../shared/seriesStats.js'
import { SELECTORS, currentPageIds, findVisible } from './youtubeDom.js'

const SUMMARY_CLASS = 'yt-series-progress-summary'
const BADGE_CLASS = 'yt-series-item-badge'
const BAR_CLASS = 'yt-series-item-bar'
export const PROGRESS_UI = `.${SUMMARY_CLASS}, .${BADGE_CLASS}, .${BAR_CLASS}`
const REFRESH_DEBOUNCE_MS = 400

/** @param {Element} item @returns {string | null} */
function itemVideoId(item) {
  const href = item.querySelector(SELECTORS.itemLink)?.getAttribute('href')
  if (!href) return null
  try {
    return new URL(href, location.origin).searchParams.get('v')
  } catch {
    return null
  }
}

export class ProgressOverlay {
  /**
   * @param {{ send: (type: string, payload?: any) => Promise<any> }} messenger
   * @param {string} instance
   */
  constructor(messenger, instance) {
    this.messenger = messenger
    this.instance = instance
    /** @type {string | null} */ this.playlistId = null
    /** @type {any} */ this.data = null
    this.token = 0
    /** @type {ReturnType<typeof setTimeout> | null} */ this.refreshTimer = null
  }

  /** Playlist changed (navigation): drop decorations and load the new progress. @param {string | null} playlistId */
  setPlaylist(playlistId) {
    if (playlistId === this.playlistId) return
    this.removeOwnUi()
    this.playlistId = playlistId
    this.data = null
    this.load()
  }

  /** The library changed elsewhere: reload, coalescing bursts of broadcasts. */
  refresh() {
    if (!this.playlistId) return
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => { this.refreshTimer = null; this.load() }, REFRESH_DEBOUNCE_MS)
  }

  load() {
    const playlistId = this.playlistId
    if (!playlistId) return
    const token = ++this.token
    this.messenger.send(EVENTS.CONTENT_SERIES_PROGRESS, { playlistId }).then(response => {
      if (token !== this.token || !response?.success) return
      this.data = response.saved ? response : null
      if (!this.data) this.removeOwnUi()
      this.inject()
    })
  }

  /** Idempotent pass over the page; cheap when nothing changed. */
  inject() {
    if (!this.data || currentPageIds().playlistId !== this.playlistId) return
    this.injectSummary()
    for (const item of document.querySelectorAll(SELECTORS.playlistItems)) this.decorate(item)
  }

  injectSummary() {
    if (location.pathname !== '/playlist') return
    const container = findVisible(SELECTORS.playlistHeader)
    if (!container) return
    const { watchedCount, total, timeLeft, ended } = this.data
    const key = `${watchedCount}/${total}/${timeLeft}/${ended ? 1 : 0}`
    const existing = /** @type {HTMLElement | null} */ (document.querySelector(`.${SUMMARY_CLASS}`))
    if (existing?.dataset.owner === this.instance && existing.dataset.key === key && container.contains(existing)) return
    existing?.remove()
    const percent = total ? Math.round((watchedCount / total) * 100) : 0
    const parts = [t('content_progress_watched', { done: watchedCount, total })]
    if (timeLeft > 0 && watchedCount < total) parts.push(t('time_left', { time: formatLength(timeLeft) }))
    container.append(h('div', { class: SUMMARY_CLASS, dataset: { owner: this.instance, key } },
      h('span', { class: 'yt-series-progress-label' }, 'YT Series'),
      h('span', { class: 'yt-series-progress-text' }, parts.join(' · ')),
      ended && h('span', { class: 'yt-series-progress-ended', title: t('series_ended_desc') }, svg('flag'), t('series_ended')),
      h('span', { class: 'yt-series-progress-track', role: 'progressbar', 'aria-label': 'YT Series', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) },
        h('span', { class: 'yt-series-progress-fill', style: { width: `${percent}%` } }))))
  }

  /** @param {Element} item */
  decorate(item) {
    const el = /** @type {HTMLElement} */ (item)
    const videoId = itemVideoId(item)
    const state = videoId ? this.data.videos[videoId] : null
    const key = state ? `${videoId}:${state.w ? 1 : 0}:${state.p}:${state.x ? 1 : 0}` : ''
    if (el.dataset.ytSeriesKey === key && el.dataset.ytSeriesOwner === this.instance) return
    this.clearItem(el)
    if (!state) return
    el.dataset.ytSeriesKey = key
    el.dataset.ytSeriesOwner = this.instance
    if (state.x) { el.dataset.ytSeriesExcluded = 'true'; return }
    const thumb = item.querySelector(SELECTORS.itemThumbnail)
    if (!thumb) return
    if (state.w) thumb.append(h('span', { class: BADGE_CLASS, dataset: { owner: this.instance } }, svg('check'), t('watched')))
    else if (state.p > 0) {
      thumb.append(h('span', { class: BAR_CLASS, dataset: { owner: this.instance }, title: t('content_progress_partial', { percent: state.p, time: formatDuration(state.r || 0) }) },
        h('span', { style: { width: `${state.p}%` } })))
    }
  }

  /** @param {HTMLElement} item */
  clearItem(item) {
    for (const el of item.querySelectorAll(`.${BADGE_CLASS}, .${BAR_CLASS}`)) el.remove()
    delete item.dataset.ytSeriesKey
    delete item.dataset.ytSeriesOwner
    delete item.dataset.ytSeriesExcluded
  }

  removeOwnUi() {
    this.token++
    for (const el of document.querySelectorAll(`.${SUMMARY_CLASS}`)) if (/** @type {HTMLElement} */ (el).dataset.owner === this.instance) el.remove()
    for (const item of document.querySelectorAll('[data-yt-series-owner]')) {
      if (/** @type {HTMLElement} */ (item).dataset.ytSeriesOwner === this.instance) this.clearItem(/** @type {HTMLElement} */ (item))
    }
  }
}
