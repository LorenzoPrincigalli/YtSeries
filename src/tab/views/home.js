// @ts-check
// Main content area: home (hero + rows + search results) and saved library.
import { t } from '../../shared/i18n.js'
import { logger } from '../../shared/logger.js'
import { h, mount } from '../../shared/dom.js'
import { getState, getUi, setUi } from '../core/store.js'
import { errorMessage } from '../ui/feedback.js'
import * as actions from '../actions.js'
import { seriesRow, playlistRow, libraryGrid, heroCarousel, channelCard } from '../components/cards.js'
import { renderCollections } from '../components/collections.js'
import { weekStrip } from '../components/weekStrip.js'
import { renderSchedule } from './schedule.js'
import { manageCollection } from '../features/collections.js'
import { openSettings } from '../features/settings.js'
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
}

/** @param {import('../core/store.js').UiState} ui */
function searchHeader(ui) {
  const status = ui.section === 'saved' ? null
    : ui.searchStatus === 'hint' ? h('p', { class: 'search-header-hint' }, t('search_hint'))
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
    sections.push(weekStrip(all, getState()?.settings?.weeklyGoal || 0, () => openSettings('goals')))
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
    sections.push(playlistRow('YouTube', results.playlists, addFromSearch))
    for (const channel of results.channels) {
      sections.push(channelCard(channel, addFromSearch, channelId => actions.fetchChannelPlaylists(channelId),
        { followed: isChannelFollowed(getState()?.series, channel.channelId), onFollow: actions.followChannel }))
    }
  }

  if (showcase && all.length) sections.push(recommendedSection(all, ui))
  return sections
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
  const filtered = filterSeries(all, { search: ui.search, collection, filter: ui.filter })

  if (collection) {
    requestAnimationFrame(() => {
      const scroller = shelf.querySelector('.collections-shelf')
      const selected = /** @type {HTMLElement | null} */ (shelf.querySelector('[aria-pressed="true"]'))
      if (scroller && selected) scroller.scrollLeft = Math.max(0, selected.offsetLeft - /** @type {HTMLElement} */ (scroller).offsetLeft - 12)
    })
  }

  return [
    shelf,
    h('h2', { class: 'collection-content-title', tabIndex: -1 }, collection || t('all_saved')),
    managementModes.length > 0 && h('div', { class: 'collection-management' },
      managementModes.map(mode => h('button', { type: 'button', class: 'btn-secondary', onClick: () => manageCollection(mode, collection) }, t(labels[mode])))),
    !filtered.length && h('p', { class: 'search-empty' }, t(collection && !ui.search ? 'collection_empty' : all.length ? 'filtered_empty' : 'saved_empty')),
    libraryGrid(filtered, openDetail)
  ]
}
