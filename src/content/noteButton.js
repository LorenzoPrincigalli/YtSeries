// @ts-check
// "📝 Note at 12:34" under the player when the video is an episode of a saved
// series: an inline field that saves a timestamped note through the service
// worker. Stamped with the owning script instance, like pageInjections.js.
import { EVENTS } from '../shared/events.js'
import { t } from '../shared/i18n.js'
import { h } from '../shared/dom.js'
import { formatDuration } from '../shared/seriesStats.js'
import { SELECTORS, findVisible, findVideo } from './youtubeDom.js'
import { showToast } from './toast.js'

export const NOTE_BAR_CLASS = 'yt-series-notebar'

const currentTime = () => Math.floor(findVideo()?.currentTime || 0)

export class NoteButton {
  /**
   * @param {{ send: (type: string, payload?: any) => Promise<any> }} messenger
   * @param {string} instance
   */
  constructor(messenger, instance) {
    this.messenger = messenger
    this.instance = instance
    /** @type {string | null} */ this.videoId = null
    /** @type {string | null} */ this.playlistId = null
    this.saved = false
    this.lookupToken = 0
  }

  /** New page: forget the old video and ask whether the new one is an episode. @param {string | null} videoId @param {string | null} playlistId */
  setVideo(videoId, playlistId) {
    this.remove()
    this.videoId = videoId
    this.playlistId = playlistId
    this.saved = false
    this.lookup()
  }

  /** The library changed (series added or removed elsewhere). */
  lookup() {
    if (!this.videoId) return
    const token = ++this.lookupToken
    this.messenger.send(EVENTS.CONTENT_VIDEO_SERIES, { videoId: this.videoId, playlistId: this.playlistId || '' }).then(response => {
      if (token !== this.lookupToken || !response?.success) return
      this.saved = Boolean(response.saved)
      if (this.saved) this.inject()
      else this.remove()
    })
  }

  /** @returns {HTMLElement | null} */
  ownBar() {
    const bar = /** @type {HTMLElement | null} */ (document.querySelector(`.${NOTE_BAR_CLASS}`))
    return bar?.dataset.owner === this.instance ? bar : null
  }

  remove() {
    this.ownBar()?.remove()
  }

  /** Idempotent: keeps one bar right under the visible video title. */
  inject() {
    if (!this.saved || !this.videoId) return
    const anchor = findVisible(SELECTORS.watchTitle)
    if (!anchor) return
    const bar = this.ownBar()
    if (bar && bar.dataset.videoId === this.videoId && bar.previousElementSibling === anchor) return
    bar?.remove()
    anchor.after(this.renderButton(h('div', { class: NOTE_BAR_CLASS, dataset: { owner: this.instance, videoId: this.videoId } })))
  }

  /** @param {HTMLElement} bar */
  renderButton(bar) {
    const button = h('button', { type: 'button', class: 'yt-series-note-btn' }, t('content_note_button', { time: formatDuration(currentTime()) }))
    // The label follows the player when the user is about to click.
    const relabel = () => { button.textContent = t('content_note_button', { time: formatDuration(currentTime()) }) }
    button.addEventListener('mouseenter', relabel)
    button.addEventListener('focus', relabel)
    button.addEventListener('click', () => this.openForm(bar))
    bar.replaceChildren(button)
    return bar
  }

  /** @param {HTMLElement} bar */
  openForm(bar) {
    const time = currentTime()
    const videoId = /** @type {string} */ (this.videoId)
    const input = /** @type {HTMLTextAreaElement} */ (h('textarea', {
      class: 'yt-series-note-input', maxLength: 1000, rows: 2, placeholder: t('content_note_placeholder'), 'aria-label': t('note_text')
    }))
    const close = () => { this.renderButton(bar); bar.querySelector('button')?.focus() }
    const save = async () => {
      const text = input.value.trim()
      if (!text) { input.focus(); return }
      const response = await this.messenger.send(EVENTS.NOTE_ADD, { videoId, playlistId: this.playlistId || '', time, text })
      showToast(response?.success ? t('content_note_saved', { time: formatDuration(time) }) : t('content_note_failed'))
      if (response?.success) close()
    }
    // YouTube binds single-key shortcuts (k, j, f, m…) on the document: keep typing to ourselves.
    input.addEventListener('keydown', event => {
      event.stopPropagation()
      if (event.key === 'Escape') close()
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) save()
    })
    const form = h('form', { class: 'yt-series-note-form', onSubmit: event => { event.preventDefault(); save() } },
      h('span', { class: 'yt-series-note-time' }, formatDuration(time)),
      input,
      h('button', { type: 'submit', class: 'yt-series-note-save' }, t('note_save')),
      h('button', { type: 'button', class: 'yt-series-note-cancel', onClick: close }, t('cancel')))
    bar.replaceChildren(form)
    input.focus()
  }
}
