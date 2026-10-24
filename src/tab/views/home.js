// @ts-check
// Main content area: home (hero + rows + search results) and saved library.
import { t } from '../../shared/i18n.js'
import { logger } from '../../shared/logger.js'
import { h, mount, byId } from '../../shared/dom.js'
import { svg } from '../../shared/icons.js'
import { getState, getUi, setUi } from '../core/store.js'
import { errorMessage } from '../ui/feedback.js'
import * as actions from '../actions.js'
import { seriesRow, playlistRow, libraryGrid, libraryList, heroCarousel, channelCard } from '../components/cards.js'
import { LIBRARY_FILTERS, libraryView } from '../features/libraryMenu.js'
import { renderCollections } from '../components/collections.js'
import { renderSchedule } from './schedule.js'
import { manageCollection } from '../features/collections.js'
import { shareSeries } from '../features/share.js'
import { clearSearch } from '../features/header.js'
import { filterSeries, isInProgress, thisWeekSeries, heroSeries, collectionNames, pickRecommendations, isChannelFollowed } from '../seriesView.js'

const log = logger.child('home')
const ROW_LIMIT = 10

let disposeHero = null
/** Which channel set the recommendations were loaded (or are loading) for. */
const recommendations = { loadedKey: null, loadingKey: null }

/** @param {any} series */
const openDetail = series => setUi({ detailId: series.playlistId })
/** @param {any} playlist */
const addFromSearch = async playlist => {
  if (await actions.addPlaylistById(playlist.playlistId)) clearSearch()
}

/** @param {HTMLElement} main */
export function renderMain(main) {
  // A broadcast can re-render Saved while the user types in its search box.
  const typing = document.activeElement?.id === 'savedSearchInput'
  disposeHero?.()
  disposeHero = null
  const state = getState()
  const ui = getUi()
  if (!state) return
  const all = Object.values(state.series || {})

  mount(main,
    ui.search && searchHeader(ui),
    ui.section === 'saved' ? savedLibrary(all, ui)
      : ui.section === 'schedule' && !ui.search ? renderSchedule(all)
        : home(all, ui))
  if (typing) byId('savedSearchInput')?.focus()
}

/** @param {import('../core/store.js').UiState} ui */
function searchHeader(ui) {
  const status = ui.searchStatus === 'hint' ? h('p', { class: 'search-header-hint' }, t('search_hint'))
      : ui.searchStatus === 'loading' ? h('p', { class: 'search-header-hint', role: 'status' }, t('searching'))
        : ui.searchStatus === 'error' ? h('p', { class: 'search-header-hint search-header-error', role: 'alert' }, errorMessage({ code: ui.searchError }, 'search_failed'))
          : null
  return h('div', { class: 'search-header' }, h('h2', { class: 'search-header-title' }, `"${ui.search}"`), status)
}

/** @param {any[]} all @param {import('../core/store.js').UiState} ui */
function home(all, ui) {
  const results = ui.searchResults
  const hasResults = Boolean(results && (results.playlists.length || results.channels.length))

  if (!all.length && !ui.search) {
    return h('div', { class: 'empty-state' },
      h('h2', { class: 'empty-state-title' }, t('welcome_title')),
      h('p', { class: 'empty-state-desc' }, t('welcome_desc')))
  }
  if (!all.length && results && !hasResults) {
    return h('div', { class: 'empty-state' }, h('p', { class: 'empty-state-desc' }, t('no_results_for', { query: ui.search })))
  }

  const collection = ui.collection && all.some(s => s.collection === ui.collection) ? ui.collection : ''
  const filtered = filterSeries(all, { search: ui.search, collection, filter: ui.filter })
  const showcase = !ui.search && ui.filter === 'all' && !collection
  const sections = []

  if (!filtered.length && all.length && !hasResults) sections.push(h('p', { class: 'search-empty' }, t('filtered_empty')))

  if (showcase) {
    const hero = heroSeries(all)
    if (hero.length) {
      const carousel = heroCarousel(hero, actions.continueWatching, openDetail)
      disposeHero = carousel.dispose
      sections.push(carousel.element)
    }
    const week = thisWeekSeries(all)
    if (week.length) sections.push(seriesRow(t('this_week'), week.slice(0, ROW_LIMIT), openDetail))
  }
  if (ui.filter === 'all') {
    const watching = filtered.filter(isInProgress).slice(0, ROW_LIMIT)
    if (watching.length) sections.push(seriesRow(t('in_progress'), watching, openDetail))
  }
  if (ui.filter === 'new') {
    const fresh = filtered.filter(s => s.newEpisodesCount > 0)
    if (fresh.length) sections.push(seriesRow(t('new_episodes'), fresh, openDetail))
  } else if (filtered.length) {
    sections.push(seriesRow(t('my_series'), filtered, openDetail))
  }

  if (results) {
    // Playlists first (what the user is looking for), then a short list of channels.
    sections.push(playlistRow(t('search_playlists_title'), results.playlists, addFromSearch))
    if (results.channels.length) sections.push(channelResults(results.channels))
  }

  if (showcase && all.length) sections.push(recommendedSection(all, ui))
  return sections
}

const CHANNELS_SHOWN = 3

/** Channel results: the first three, the rest one click away. @param {any[]} channels */
function channelResults(channels) {
  const cards = channels.map((channel, i) => {
    const card = channelCard(channel, addFromSearch, channelId => actions.fetchChannelPlaylists(channelId),
      { followed: isChannelFollowed(getState()?.series, channel.channelId), onFollow: actions.followChannel })
    if (i >= CHANNELS_SHOWN) card.classList.add('hidden')
    return card
  })
  const more = channels.length > CHANNELS_SHOWN && h('button', {
    type: 'button',
    class: 'btn-secondary channel-more-btn',
    onClick: event => {
      const button = /** @type {HTMLElement} */ (event.currentTarget)
      for (const card of cards) card.classList.remove('hidden')
      cards[CHANNELS_SHOWN]?.querySelector('button')?.focus()
      button.remove()
    }
  }, t('search_more_channels', { n: channels.length - CHANNELS_SHOWN }))
  return h('section', { class: 'channel-results', 'aria-labelledby': 'channelResultsTitle' },
    h('h2', { class: 'section-title', id: 'channelResultsTitle' }, t('search_channels')),
    cards,
    more)
}

/** Recommendations depend only on which channels are saved. @param {any[]} all */
const channelKey = all => [...new Set(all.map(s => s.channelId).filter(Boolean))].sort().join(',')

/** @param {any[]} all @param {import('../core/store.js').UiState} ui */
function recommendedSection(all, ui) {
  const key = channelKey(all)
  // Reload when the saved channels change; keep showing the previous list meanwhile.
  if (key && recommendations.loadingKey !== key && recommendations.loadedKey !== key) {
    recommendations.loadingKey = key
    loadRecommendations(all, key)
  }
  const saved = new Set(all.map(s => s.playlistId))
  const visible = (ui.recommended || []).filter(playlist => !saved.has(playlist.playlistId))
  return visible.length ? playlistRow(t('recommended'), visible, addFromSearch) : null
}

/**
 * Fetches channel playlists for saved channels. Individual failures are
 * skipped; if every request fails nothing is cached, so the next render retries.
 * @param {any[]} all @param {string} key
 */
async function loadRecommendations(all, key) {
  /** @type {Record<string, number>} */
  const weights = {}
  for (const series of all) if (series.channelId) weights[series.channelId] = (weights[series.channelId] || 0) + 1
  const channelIds = Object.keys(weights)
  const settled = await Promise.allSettled(channelIds.map(id => actions.fetchChannelPlaylists(id)))
  if (recommendations.loadingKey !== key) return // superseded by a newer load
  recommendations.loadingKey = null
  const byChannel = new Map()
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') byChannel.set(channelIds[i], result.value)
    else log.warn('Recommendations: channel fetch failed', channelIds[i], result.reason)
  })
  if (!byChannel.size) return
  recommendations.loadedKey = key
  setUi({ recommended: pickRecommendations(byChannel, weights, new Set(all.map(s => s.playlistId))) })
}

/** @param {any[]} all @param {import('../core/store.js').UiState} ui */
function savedLibrary(all, ui) {
  const state = getState()
  const names = collectionNames(state)
  const collection = ui.collection && names.includes(ui.collection) ? ui.collection : ''

  const shelf = renderCollections(all, collection, name => {
    setUi({ collection: name })
    requestAnimationFrame(() => {
      const selector = name ? '.collection-content-title' : '.collection-tile[data-collection=""]'
      const target = document.querySelector(selector)
      if (target instanceof HTMLElement) target.focus({ preventScroll: true })
    })
  }, state.collections || [], () => manageCollection('create', ''))

  /** @type {('add' | 'edit' | 'move' | 'delete')[]} */
  const allModes = ['add', 'edit', 'move', 'delete']
  const managementModes = collection ? allModes.filter(mode => mode !== 'move' || all.some(s => s.collection === collection)) : []
  const labels = { add: 'add_collection_series', edit: 'edit_collection', move: 'move_series', delete: 'delete_collection' }
  // Saved has its own search box above the list (the header one is hidden
  // here): it filters in place, without re-rendering the page, so typing keeps focus.
  const view = libraryView(state)
  const results = h('div', { class: 'saved-results' })
  /** @param {string} query */
  const showResults = query => {
    const filtered = filterSeries(all, { search: query, collection, filter: ui.filter })
    mount(results, filtered.length ? (view === 'list' ? libraryList : libraryGrid)(filtered, openDetail)
      : h('p', { class: 'search-empty' }, query ? t('saved_search_empty', { query }) : t(collection ? 'collection_empty' : all.length ? 'filtered_empty' : 'saved_empty')))
  }
  showResults(ui.savedSearch)
  const search = /** @type {HTMLInputElement} */ (h('input', {
    type: 'search',
    id: 'savedSearchInput',
    class: 'saved-search-input',
    value: ui.savedSearch,
    placeholder: t('saved_search_placeholder'),
    'aria-label': t('saved_search_placeholder'),
    maxLength: 200
  }))
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase()
    setUi({ savedSearch: query })
    showResults(query)
  })
  search.addEventListener('keydown', event => { if (event.key === 'Escape' && search.value) { search.value = ''; setUi({ savedSearch: '' }); showResults('') } })

  if (collection) {
    requestAnimationFrame(() => {
      const scroller = shelf.querySelector('.collections-shelf')
      const selected = /** @type {HTMLElement | null} */ (shelf.querySelector('[aria-pressed="true"]'))
      if (scroller && selected) scroller.scrollLeft = Math.max(0, selected.offsetLeft - /** @type {HTMLElement} */ (scroller).offsetLeft - 12)
    })
  }

  return [
    shelf,
    all.length > 0 && h('div', { class: 'library-toolbar' },
      h('div', { class: 'saved-search' }, svg('search'), search),
      h('div', { class: 'library-chips', role: 'group', 'aria-label': t('library_filters') },
        LIBRARY_FILTERS.map(entry => h('button', {
          type: 'button',
          class: 'library-chip',
          'aria-pressed': String(ui.filter === entry.filter),
          onClick: () => setUi({ filter: entry.filter })
        }, t(entry.label)))),
      h('div', { class: 'library-views', role: 'group', 'aria-label': t('library_view') },
        [['grid', 'view_grid'], ['list', 'view_list']].map(([value, label]) => h('button', {
          type: 'button',
          class: 'library-view-btn',
          'aria-pressed': String(view === value),
          'aria-label': t(label),
          title: t(label),
          onClick: () => { if (view !== value) actions.updateSettings({ libraryView: value }) }
        }, svg(value === 'grid' ? 'grid' : 'list'))))),
    h('h2', { class: 'collection-content-title', tabIndex: -1 },
      collection || t(LIBRARY_FILTERS.find(entry => entry.filter === ui.filter)?.label || 'filter_all')),
    managementModes.length > 0 && h('div', { class: 'collection-management' },
      managementModes.map(mode => h('button', { type: 'button', class: 'btn-secondary', onClick: () => manageCollection(mode, collection) }, t(labels[mode]))),
      all.some(s => s.collection === collection) && h('button', {
        type: 'button',
        class: 'btn-secondary',
        onClick: () => shareSeries(collection, all.filter(s => s.collection === collection))
      }, t('share_collection'))),
    results
  ]
}
