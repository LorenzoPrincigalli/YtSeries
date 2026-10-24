// @ts-check
// Celebration for a new badge level or a series milestone: a medal that
// spins in with a light sweep, a burst of confetti in the tier's colours and
// a short message. One at a time, queued; shown only while the tab is visible
// (a badge earned on YouTube waits for the user to come back). With
// prefers-reduced-motion it is a plain fade.
import { t } from '../../shared/i18n.js'
import { h } from '../../shared/dom.js'
import { svg } from '../../shared/icons.js'

const VISIBLE_MS = 4200
const LEAVE_MS = 350
const CONFETTI = 34
const PALETTES = {
  bronze: ['#e3a46a', '#a0582a', '#f3c79e', '#ffffff'],
  silver: ['#f1f3f6', '#9aa3ad', '#ffffff', '#c9d1da'],
  gold: ['#ffe17a', '#d49a10', '#fff1b8', '#ffffff']
}

/**
 * @typedef {{ icon: string, tier: 'bronze' | 'silver' | 'gold', label: string, title: string, detail?: string, onOpen?: () => void }} Celebration
 */

/** @type {Celebration[]} */
const queue = []
let showing = false

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** @param {Celebration} item */
export function celebrate(item) {
  queue.push(item)
  next()
}

function next() {
  if (showing || !queue.length) return
  if (document.hidden) {
    document.addEventListener('visibilitychange', next, { once: true })
    return
  }
  showing = true
  show(/** @type {Celebration} */ (queue.shift()))
}

/** @param {string} tier */
function confetti(tier) {
  const colours = PALETTES[/** @type {keyof typeof PALETTES} */ (tier)] || PALETTES.gold
  return Array.from({ length: CONFETTI }, (_, i) => {
    const angle = (i / CONFETTI) * Math.PI * 2 + Math.random() * 0.4
    const distance = 90 + Math.random() * 110
    return h('span', {
      class: ['celebration-confetti', i % 3 === 0 && 'is-round'],
      style: {
        '--dx': `${Math.cos(angle) * distance}px`,
        '--dy': `${Math.sin(angle) * distance - 40}px`,
        '--rot': `${Math.round(Math.random() * 720 - 360)}deg`,
        '--delay': `${Math.round(Math.random() * 120)}ms`,
        '--colour': colours[i % colours.length]
      }
    })
  })
}

/** @param {Celebration} item */
function show(item) {
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    document.removeEventListener('keydown', onKey)
    panel.classList.add('is-leaving')
    setTimeout(() => { panel.remove(); showing = false; next() }, LEAVE_MS)
  }
  /** @param {KeyboardEvent} event */
  const onKey = event => { if (event.key === 'Escape') close() }

  const panel = h('div', { class: ['celebration', `tier-${item.tier}`, reducedMotion() && 'is-calm'], role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'celebration-burst', 'aria-hidden': 'true' }, reducedMotion() ? null : confetti(item.tier)),
    h('button', {
      type: 'button',
      class: 'celebration-card',
      onClick: () => { close(); item.onOpen?.() }
    },
    h('span', { class: 'celebration-medal', 'aria-hidden': 'true' }, svg(/** @type {any} */ (item.icon))),
    h('span', { class: 'celebration-text' },
      h('span', { class: 'celebration-label' }, item.label),
      h('span', { class: 'celebration-title' }, item.title),
      item.detail && h('span', { class: 'celebration-detail' }, item.detail))),
    h('button', { type: 'button', class: 'celebration-close', 'aria-label': t('close'), onClick: close }, svg('close')))

  document.body.append(panel)
  document.addEventListener('keydown', onKey)
  const timer = setTimeout(close, VISIBLE_MS)
  // Hovering keeps it on screen; leaving restarts a shorter countdown.
  let hoverTimer = timer
  panel.addEventListener('mouseenter', () => { clearTimeout(hoverTimer); clearTimeout(timer) })
  panel.addEventListener('mouseleave', () => { hoverTimer = setTimeout(close, 1500) })
}
