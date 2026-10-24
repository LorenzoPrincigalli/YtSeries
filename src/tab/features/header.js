// @ts-check
// Header: navigation (Home, "Your series" menu, Upcoming) and the search box.
import { byId } from '../../shared/dom.js'
import { getUi, setUi, subscribe } from '../core/store.js'
import * as actions from '../actions.js'

const SEARCH_HINT_DELAY_MS = 2000
const MAX_QUERY = 200
let hintTimer = null

export function clearSearch() {
  clearTimeout(hintTimer)
  const input = /** @type {HTMLInputElement | null} */ (byId('searchInput'))
  if (input) input.value = ''
  setUi({ search: '', searchResults: null, searchStatus: 'idle', searchError: null })
}

/** @param {{ section?: 'home' | 'saved' | 'schedule', filter?: any }} target */
export function navigate({ section = 'home', filter = 'all' }) {
  clearSearch()
  setUi({ section, filter, collection: '', savedSearch: '' })
  window.scrollTo({ top: 0, behavior: 'instant' })
}

/** Reflects the current section/filter on the nav links (active + aria-current). */
function syncNav() {
  const { section } = getUi()
  for (const link of document.querySelectorAll('.nav-link')) {
    const el = /** @type {HTMLElement} */ (link)
    const active = section === el.dataset.view
    el.classList.toggle('active', active)
    // The "Your series" button opens a menu: it is marked active, not as the current page.
    if (active && el.tagName === 'A') el.setAttribute('aria-current', 'page')
    else el.removeAttribute('aria-current')
  }
  // Saved has its own search box; the header one is hidden there (CSS).
  document.body.dataset.section = section
  // Phone: the search row stays open while there is a query.
  byId('header')?.classList.toggle('has-search', Boolean(getUi().search))
  const clear = byId('searchClear')
  if (clear) clear.classList.toggle('hidden', !getUi().search)
}

export function initHeader() {
  for (const link of document.querySelectorAll('a.nav-link')) {
    link.addEventListener('click', event => {
      event.preventDefault()
      const view = /** @type {HTMLElement} */ (link).dataset.view
      navigate({ section: view === 'schedule' ? 'schedule' : 'home' })
    })
  }

  const input = /** @type {HTMLInputElement} */ (byId('searchInput'))
  // Typing filters the local library instantly; Enter queries YouTube.
  input.addEventListener('input', () => {
    const search = input.value.trim().toLowerCase().slice(0, MAX_QUERY)
    clearTimeout(hintTimer)
    if (!search) { clearSearch(); return }
    setUi({ search, searchStatus: getUi().searchResults ? getUi().searchStatus : 'idle' })
    if (!getUi().searchResults) hintTimer = setTimeout(() => setUi({ searchStatus: 'hint' }), SEARCH_HINT_DELAY_MS)
  })
  input.addEventListener('keydown', event => {
    const { search, section, searchStatus } = getUi()
    if (event.key === 'Enter' && search && searchStatus !== 'loading') {
      clearTimeout(hintTimer)
      // YouTube results live on Home: from Saved or Upcoming, Enter takes you there.
      if (section !== 'home') setUi({ section: 'home', filter: 'all', collection: '' })
      actions.searchYouTube(search)
    } else if (event.key === 'Escape' && search) {
      clearSearch()
    }
  })
  byId('searchClear')?.addEventListener('click', () => { clearSearch(); input.focus() })

  // Phone: the magnifier opens (and closes) the search row.
  const toggle = byId('searchToggle')
  toggle?.addEventListener('click', () => {
    const open = !byId('header')?.classList.contains('search-open')
    byId('header')?.classList.toggle('search-open', open)
    toggle.setAttribute('aria-expanded', String(open))
    if (open) input.focus()
  })
  input.addEventListener('blur', () => {
    if (input.value) return
    byId('header')?.classList.remove('search-open')
    toggle?.setAttribute('aria-expanded', 'false')
  })

  const header = byId('header')
  let ticking = false
  window.addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      header?.classList.toggle('scrolled', window.scrollY > 0)
      ticking = false
    })
  }, { passive: true })

  subscribe(syncNav)
}
