// @ts-check
// Header: navigation (home / saved / filters) and the search box.
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

/** @param {{ section?: 'home' | 'saved', filter?: any }} target */
function navigate({ section = 'home', filter = 'all' }) {
  clearSearch()
  setUi({ section, filter, collection: '' })
  window.scrollTo({ top: 0 })
}

/** Reflects the current section/filter on the nav links (active + aria-current). */
function syncNav() {
  const { section, filter } = getUi()
  for (const link of document.querySelectorAll('.nav-link')) {
    const el = /** @type {HTMLElement} */ (link)
    const active = el.dataset.view === 'saved' ? section === 'saved'
      : el.dataset.view === 'home' ? section === 'home' && filter === 'all'
        : section === 'home' && el.dataset.filter === filter
    el.classList.toggle('active', active)
    if (active) el.setAttribute('aria-current', 'page')
    else el.removeAttribute('aria-current')
  }
  const clear = byId('searchClear')
  if (clear) clear.classList.toggle('hidden', !getUi().search)
}

export function initHeader() {
  for (const link of document.querySelectorAll('.nav-link')) {
    link.addEventListener('click', event => {
      event.preventDefault()
      const el = /** @type {HTMLElement} */ (link)
      if (el.dataset.view === 'saved') navigate({ section: 'saved' })
      else navigate({ section: 'home', filter: el.dataset.filter || 'all' })
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
    if (event.key === 'Enter' && search && section !== 'saved' && searchStatus !== 'loading') {
      clearTimeout(hintTimer)
      actions.searchYouTube(search)
    } else if (event.key === 'Escape' && search) {
      clearSearch()
    }
  })
  byId('searchClear')?.addEventListener('click', () => { clearSearch(); input.focus() })

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
