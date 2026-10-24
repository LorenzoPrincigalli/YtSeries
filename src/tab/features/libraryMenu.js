// @ts-check
// "Your series" header menu: the library filters (all, in progress, completed,
// new episodes, with counts). Choosing one opens the "Your series" page, where
// the grid/list view is chosen. Menu button pattern: Enter/Space/ArrowDown
// open it, arrows move, Escape and Tab close it.
import { t } from '../../shared/i18n.js'
import { h, byId } from '../../shared/dom.js'
import { svg } from '../../shared/icons.js'
import { getState, getUi, subscribe } from '../core/store.js'
import { isInProgress, isComplete } from '../seriesView.js'
import { navigate } from './header.js'

/** Library filters, in menu order: filter id, label key, icon, predicate. */
export const LIBRARY_FILTERS = /** @type {const} */ ([
  { filter: 'all', label: 'filter_all', icon: 'stack', match: () => true },
  { filter: 'watching', label: 'watching', icon: 'play', match: isInProgress },
  { filter: 'completed', label: 'completed', icon: 'check', match: isComplete },
  { filter: 'new', label: 'new_episodes', icon: 'film', match: (/** @type {any} */ series) => series.newEpisodesCount > 0 }
])

/** @param {any} state */
export const libraryView = state => (state?.settings?.libraryView === 'list' ? 'list' : 'grid')

let open = false
/** Scroll position when the menu opened: only a real scroll closes it. */
let openedAtY = 0
const SCROLL_CLOSE_PX = 40

function items() {
  return /** @type {HTMLElement[]} */ ([...(byId('libraryMenu')?.querySelectorAll('[role^="menuitem"]') || [])])
}

/** @param {boolean} [restoreFocus] */
function close(restoreFocus = false) {
  if (!open) return
  open = false
  byId('libraryMenu')?.classList.add('hidden')
  const button = byId('libraryMenuBtn')
  button?.setAttribute('aria-expanded', 'false')
  document.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll)
  if (restoreFocus) button?.focus()
}

/** @param {Event} event */
function onOutside(event) {
  const target = /** @type {Node} */ (event.target)
  if (!byId('libraryMenu')?.contains(target) && !byId('libraryMenuBtn')?.contains(target)) close()
}

function onResize() { close() }

// Images loading or scroll anchoring nudge the page by a few pixels: ignore those.
function onScroll() { if (Math.abs(window.scrollY - openedAtY) > SCROLL_CLOSE_PX) close() }

function render() {
  const panel = /** @type {HTMLElement} */ (byId('libraryMenu'))
  const state = getState()
  const all = Object.values(state?.series || {})
  const { section, filter } = getUi()
  const choose = (/** @type {string} */ next) => { close(); navigate({ section: 'saved', filter: next }) }
  panel.replaceChildren(
    h('div', { class: 'nav-menu-group', role: 'group', 'aria-label': t('library_filters') },
      LIBRARY_FILTERS.map(entry => h('button', {
        type: 'button',
        role: 'menuitemradio',
        class: 'nav-menu-item',
        'aria-checked': String(section === 'saved' && filter === entry.filter),
        tabIndex: -1,
        onClick: () => choose(entry.filter)
      },
      svg(/** @type {any} */ (entry.icon)),
      h('span', { class: 'nav-menu-label' }, t(entry.label)),
      h('span', { class: 'nav-menu-count' }, String(all.filter(entry.match).length))))))
}

/** @param {boolean} focusFirst */
function show(focusFirst) {
  const button = /** @type {HTMLElement} */ (byId('libraryMenuBtn'))
  const panel = /** @type {HTMLElement} */ (byId('libraryMenu'))
  render()
  const rect = button.getBoundingClientRect()
  panel.style.setProperty('--menu-top', `${Math.round(rect.bottom + 8)}px`)
  panel.style.setProperty('--menu-left', `${Math.round(Math.max(8, Math.min(rect.left, window.innerWidth - 288)))}px`)
  panel.classList.remove('hidden')
  button.setAttribute('aria-expanded', 'true')
  open = true
  openedAtY = window.scrollY
  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, { passive: true })
  const list = items()
  // Focus goes into the menu, on the current choice (the first item from the keyboard).
  const target = (!focusFirst && list.find(item => item.getAttribute('aria-checked') === 'true')) || list[0]
  target?.focus()
}

export function initLibraryMenu() {
  const button = byId('libraryMenuBtn')
  const panel = byId('libraryMenu')
  if (!button || !panel) return
  button.addEventListener('click', () => (open ? close() : show(false)))
  button.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); show(true) }
  })
  panel.addEventListener('keydown', event => {
    const list = items()
    const index = list.indexOf(/** @type {HTMLElement} */ (document.activeElement))
    if (event.key === 'Escape') { event.preventDefault(); close(true) }
    else if (event.key === 'Tab') close()
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); list[(index + 1) % list.length]?.focus() }
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); list[(index - 1 + list.length) % list.length]?.focus() }
    else if (event.key === 'Home') { event.preventDefault(); list[0]?.focus() }
    else if (event.key === 'End') { event.preventDefault(); list[list.length - 1]?.focus() }
  })
  // Counts and checked states follow the library while the menu is open.
  subscribe(changed => {
    if (!open || !changed.has('server')) return
    const index = items().indexOf(/** @type {HTMLElement} */ (document.activeElement))
    render()
    if (index >= 0) items()[index]?.focus()
  })
}
