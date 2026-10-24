// @ts-check
// "Watch next episode" card shown near the end of an episode. One instance
// per playback session; dismissal is remembered for that session only. When
// the last episode ends it says so instead: the series has ended, or the user
// is caught up (and can mark it as ended from there).
import { EVENTS } from '../shared/events.js'
import { t } from '../shared/i18n.js'
import { h } from '../shared/dom.js'
import { svg } from '../shared/icons.js'
import { isAdPlaying, isMusicContent, playerMode, SELECTORS } from './youtubeDom.js'

export class NextEpisodeOverlay {
  /**
   * @param {{ send: (type: string, payload?: any) => Promise<any> }} messenger
   * @param {() => boolean} isEnabled
   */
  constructor(messenger, isEnabled) {
    this.messenger = messenger
    this.isEnabled = isEnabled
    this.element = null
    this.dismissed = false
    this.requestToken = 0
    this.pending = false
    this.cleanup = []
  }

  get active() {
    return Boolean(this.element) || this.pending
  }

  /** Cancels any in-flight lookup and removes the card. @param {{ dismiss?: boolean }} [options] */
  hide({ dismiss = false } = {}) {
    if (dismiss) this.dismissed = true
    this.requestToken++
    this.pending = false
    for (const undo of this.cleanup.splice(0)) undo()
    this.element?.remove()
    this.element = null
  }

  /**
   * Looks up the next unwatched episode and shows the card, unless anything
   * changed meanwhile (session ended, user dismissed, ad started…).
   * @param {string} videoId @param {string} playlistId @param {() => boolean} sessionCurrent
   * @param {{ atEnd?: boolean }} [options] atEnd: the video finished, so "all watched" is worth saying
   */
  async maybeShow(videoId, playlistId, sessionCurrent, { atEnd = false } = {}) {
    if (this.active || this.dismissed || !this.isEnabled() || isMusicContent() || isAdPlaying()) return
    const token = ++this.requestToken
    this.pending = true
    const stillWanted = () => token === this.requestToken && !this.element && !this.dismissed && this.isEnabled() && !isAdPlaying() && sessionCurrent()
    try {
      const exists = await this.messenger.send(EVENTS.PLAYLIST_EXISTS, { playlistId })
      if (!stillWanted() || !exists.success || !exists.exists) return
      const next = await this.messenger.send(EVENTS.GET_NEXT_EPISODE, { videoId, playlistId })
      if (!stillWanted() || !next.success) return
      if (next.nextEpisode) this.render(next.nextEpisode, videoId, playlistId)
      else if (atEnd && next.allWatched) this.renderFinale(playlistId, Boolean(next.ended))
    } finally {
      if (token === this.requestToken) this.pending = false
    }
  }

  /** @param {{ id: string, title: string }} episode @param {string} sourceVideoId @param {string} playlistId */
  render(episode, sourceVideoId, playlistId) {
    const watchNext = () => {
      this.messenger.send(EVENTS.EPISODE_WATCH, { videoId: sourceVideoId, playlistId })
      this.hide({ dismiss: true })
      const url = new URL('https://www.youtube.com/watch')
      url.searchParams.set('v', episode.id)
      url.searchParams.set('list', playlistId)
      window.location.href = url.href
    }

    this.mount(t('content_next_episode'),
      h('div', { class: 'yt-series-next-title' }, episode.title),
      h('button', { type: 'button', class: 'yt-series-next-btn', onClick: watchNext },
        svg('play', { class: 'yt-series-next-icon yt-series-next-icon-fill' }),
        h('span', null, t('content_watch_next'))))
  }

  /** Last episode finished. @param {string} playlistId @param {boolean} ended */
  renderFinale(playlistId, ended) {
    const message = h('div', { class: 'yt-series-next-text' }, ended ? t('content_series_ended') : t('content_caught_up'))
    if (ended) { this.mount(t('content_all_watched'), message); return }
    const markEnded = h('button', { type: 'button', class: 'yt-series-next-btn yt-series-next-btn-secondary' },
      svg('flag', { class: 'yt-series-next-icon' }), h('span', null, t('mark_ended')))
    markEnded.addEventListener('click', async () => {
      markEnded.disabled = true
      const response = await this.messenger.send(EVENTS.SERIES_ENDED_SET, { playlistId, ended: true })
      if (!markEnded.isConnected) return
      if (!response?.success) { markEnded.disabled = false; return }
      message.textContent = t('content_series_ended')
      markEnded.remove()
    })
    this.mount(t('content_all_watched'), message, markEnded)
  }

  /** Shared card shell: label, content (first item under the label), close button, mode tracking. @param {string} label @param {...HTMLElement} content */
  mount(label, ...content) {
    this.element = h('div', { class: 'yt-series-next-overlay', role: 'dialog', 'aria-label': label, 'aria-live': 'polite' },
      h('div', { class: 'yt-series-next-content' },
        h('button', { type: 'button', class: 'yt-series-next-close', 'aria-label': t('close'), onClick: () => this.hide({ dismiss: true }) }, svg('close')),
        h('div', { class: 'yt-series-next-info' },
          h('div', { class: 'yt-series-next-label' }, label),
          content[0]),
        content.slice(1)))
    document.body.append(this.element)
    this.reposition()

    const reposition = () => this.reposition()
    const onKeydown = event => {
      if (event.key === 'Escape' && this.element) {
        event.stopPropagation()
        this.hide({ dismiss: true })
      }
    }
    const modeObserver = new MutationObserver(reposition)
    const flexy = document.querySelector(SELECTORS.watchFlexy)
    if (flexy) modeObserver.observe(flexy, { attributes: true, attributeFilter: ['theater-mode'] })
    document.addEventListener('fullscreenchange', reposition)
    document.addEventListener('keydown', onKeydown)
    this.cleanup.push(
      () => modeObserver.disconnect(),
      () => document.removeEventListener('fullscreenchange', reposition),
      () => document.removeEventListener('keydown', onKeydown))
  }

  /** Keeps the card inside the fullscreen element and styled per player mode. */
  reposition() {
    if (!this.element) return
    const fullscreen = document.fullscreenElement
    if (fullscreen?.tagName === 'VIDEO') { this.hide(); return } // nothing can render over a bare <video>
    const host = fullscreen || document.body
    if (this.element.parentElement !== host) host.append(this.element)
    this.element.classList.remove('mode-normal', 'mode-cinema', 'mode-full', 'mode-mini')
    this.element.classList.add(`mode-${playerMode()}`)
  }
}
