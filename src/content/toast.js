// @ts-check
import { h } from '../shared/dom.js'

const VISIBLE_MS = 4000
const FADE_MS = 300

/** Small notice on the YouTube page (styled by content.css). @param {string} message */
export function showToast(message) {
  document.querySelector('.yt-series-toast')?.remove()
  const toast = h('div', { class: 'yt-series-toast', role: 'status', 'aria-live': 'polite' }, h('span', null, message))
  document.body.append(toast)
  requestAnimationFrame(() => toast.classList.add('is-visible'))
  setTimeout(() => {
    toast.classList.remove('is-visible')
    setTimeout(() => toast.remove(), FADE_MS)
  }, VISIBLE_MS)
}
