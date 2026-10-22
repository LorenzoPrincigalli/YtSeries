// @ts-check
// Presentational building blocks for the home and library views. Each
// function takes data + callbacks and returns DOM; none reads global state.
import { t } from '../../shared/i18n.js'
import { h, img } from '../../shared/dom.js'
import { svg } from '../../shared/icons.js'
import { isInProgress, isComplete, cardProgress, heroProgress, nextEpisode, watchUrl } from '../seriesView.js'

const SCROLL_STEP = 312
const HERO_INTERVAL_MS = 10_000

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** @param {number} percent */
const progressStyle = percent => ({ '--progress': `${Math.max(0, Math.min(100, percent))}%` })

/** @param {number} count */
const episodesLabel = count => `${count} ${count === 1 ? t('episode') : t('episodes')}`

/**
 * Library card. The whole card is mouse-clickable; keyboard users reach the
 * same action through the title button, so there are no nested interactive
 * roles.
 * @param {any} series @param {(series: any) => void} onOpen @param {number} [index]
 */
export function seriesCard(series, onOpen, index = 0) {
  const complete = isComplete(series)
  const next = !series.completed ? nextEpisode(series) : null
  const preview = next || series.videos[0] || null
  const open = () => onOpen(series)

  const playButton = h('button', {
    type: 'button',
    class: 'card-play-btn',
    'aria-label': t('play_episode', { title: preview?.title || series.title }),
    onClick: event => {
      event.stopPropagation()
      if (preview) window.open(watchUrl(preview.id, series.playlistId), '_blank', 'noopener')
    }
  }, svg('play'))

  const badge = series.newEpisodesCount > 0 && !complete
    ? h('span', { class: 'card-badge card-badge-new' }, t('new_badge', { n: series.newEpisodesCount }))
    : complete && series.videos.length > 0
      ? h('span', { class: 'card-badge card-badge-complete' }, t('done'))
      : null

  const card = h('div', { class: 'series-card card-reveal', style: { '--i': index }, dataset: { id: series.playlistId }, onClick: open },
    h('div', { class: 'card-thumbnail' },
      img({ class: 'card-thumb-img', src: series.thumbnail, alt: '' }),
      h('div', { class: 'card-play-overlay' }, playButton),
      badge,
      h('div', { class: 'card-progress-overlay' }, h('div', { class: 'card-progress-bar', style: progressStyle(cardProgress(series)) })),
      next && h('div', { class: 'card-next-overlay', 'aria-hidden': 'true' },
        img({ class: 'card-next-img', src: next.thumbnail }),
        h('div', { class: 'card-next-label' }, next.title))),
    h('div', { class: 'card-info' },
      h('button', { type: 'button', class: 'card-title card-title-btn', onClick: event => { event.stopPropagation(); open() } }, series.title || t('untitled')),
      h('div', { class: 'card-subtitle' },
        series.channelTitle ? `${series.channelTitle} · ${episodesLabel(series.videos.length)}` : episodesLabel(series.videos.length))))
  return card
}

/**
 * Card for a playlist that is not saved yet (search, channel, recommended).
 * @param {any} playlist @param {(playlist: any) => void} onAdd @param {number} index @param {string} [extraClass]
 */
export function playlistCard(playlist, onAdd, index, extraClass = 'search-playlist-card') {
  const add = () => onAdd(playlist)
  const subtitle = extraClass === 'channel-playlist-card'
    ? `${playlist.videoCount || '?'} ${playlist.videoCount === 1 ? t('video') : t('videos')}`
    : playlist.channelTitle || ''
  return h('div', { class: ['series-card', extraClass, 'card-reveal'], style: { '--i': index }, dataset: { id: playlist.playlistId }, onClick: add },
    h('div', { class: 'card-thumbnail' },
      img({ class: 'card-thumb-img', src: playlist.thumbnail }),
      h('button', {
        type: 'button',
        class: 'card-add-overlay',
        'aria-label': t('add_named_series', { title: playlist.title }),
        onClick: event => { event.stopPropagation(); add() }
      }, '+')),
    h('div', { class: 'card-info' },
      h('div', { class: 'card-title' }, playlist.title),
      h('div', { class: 'card-subtitle' }, subtitle)))
}

/** Horizontal carousel scaffolding shared by every row. @param {string} title @param {HTMLElement[]} cards */
function carouselRow(title, cards) {
  const grid = h('div', { class: 'carousel-grid' }, cards)
  enableDragScroll(grid)
  return h('section', { class: 'series-row', 'aria-label': title },
    h('h2', { class: 'section-title' }, title),
    h('button', { type: 'button', class: 'carousel-btn carousel-btn-left', 'aria-label': t('scroll_left'), onClick: () => grid.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' }) }, svg('chevronLeft')),
    h('div', { class: 'carousel-wrapper' }, grid),
    h('button', { type: 'button', class: 'carousel-btn carousel-btn-right', 'aria-label': t('scroll_right'), onClick: () => grid.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' }) }, svg('chevronRight')))
}

/** Click-and-drag horizontal scrolling for mouse users. @param {HTMLElement} grid */
function enableDragScroll(grid) {
  let dragging = false
  let startX = 0
  let startScroll = 0
  let moved = false
  grid.addEventListener('mousedown', event => {
    dragging = true
    moved = false
    startX = event.pageX
    startScroll = grid.scrollLeft
  })
  const stop = () => { dragging = false; grid.classList.remove('is-dragging') }
  grid.addEventListener('mouseleave', stop)
  grid.addEventListener('mouseup', stop)
  grid.addEventListener('mousemove', event => {
    if (!dragging) return
    const delta = event.pageX - startX
    if (Math.abs(delta) > 4) { moved = true; grid.classList.add('is-dragging') }
    event.preventDefault()
    grid.scrollLeft = startScroll - delta * 1.5
  })
  // A drag must not also count as a click on the card under the pointer.
  grid.addEventListener('click', event => { if (moved) { event.stopPropagation(); moved = false } }, true)
}

/** @param {string} title @param {any[]} seriesList @param {(series: any) => void} onOpen */
export function seriesRow(title, seriesList, onOpen) {
  return carouselRow(title, seriesList.map((series, i) => seriesCard(series, onOpen, i)))
}

/** @param {string} title @param {any[]} playlists @param {(playlist: any) => void} onAdd */
export function playlistRow(title, playlists, onAdd) {
  return playlists.length ? carouselRow(title, playlists.map((playlist, i) => playlistCard(playlist, onAdd, i))) : null
}

/** @param {any[]} seriesList @param {(series: any) => void} onOpen */
export function libraryGrid(seriesList, onOpen) {
  return h('div', { class: 'collection-library-grid' }, seriesList.map((series, i) => seriesCard(series, onOpen, i)))
}

/**
 * Auto-advancing hero carousel. Returns the element and a dispose function
 * that stops its timer (called before every re-render).
 * @param {any[]} seriesList @param {(series: any) => void} onContinue @param {(series: any) => void} onOpen
 */
export function heroCarousel(seriesList, onContinue, onOpen) {
  let current = 0
  let timer = null
  const slides = []
  const dots = []

  const goTo = index => {
    if (index === current) return
    slides[current].classList.remove('active')
    slides[current].setAttribute('aria-hidden', 'true')
    dots[current].classList.remove('active')
    dots[current].setAttribute('aria-current', 'false')
    current = index
    slides[current].classList.add('active')
    slides[current].setAttribute('aria-hidden', 'false')
    dots[current].classList.add('active')
    dots[current].setAttribute('aria-current', 'true')
    restart()
  }
  const stop = () => { clearInterval(timer); timer = null }
  const restart = () => {
    stop()
    if (slides.length > 1 && !prefersReducedMotion()) timer = setInterval(() => goTo((current + 1) % slides.length), HERO_INTERVAL_MS)
  }

  seriesList.forEach((series, i) => {
    const label = isInProgress(series) ? t('continue_watching') : t('start')
    slides.push(h('div', { class: ['hero-carousel-slide', i === 0 && 'active'], dataset: { index: i }, 'aria-hidden': String(i !== 0), onClick: () => onOpen(series) },
      img({ class: 'hero-backdrop', src: series.thumbnail, loading: i === 0 ? 'eager' : 'lazy' }),
      h('div', { class: 'hero-gradient' }),
      h('div', { class: 'hero-content' },
        h('h1', { class: 'hero-title' },
          h('button', { type: 'button', class: 'hero-title-btn', onClick: event => { event.stopPropagation(); onOpen(series) } }, series.title)),
        h('p', { class: 'hero-subtitle' }, series.channelTitle || ''),
        h('div', { class: 'hero-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(heroProgress(series))) },
          h('div', { class: 'hero-progress-bar', style: progressStyle(heroProgress(series)) })),
        h('div', { class: 'hero-btn-group' },
          h('button', { type: 'button', class: 'hero-btn hero-btn-play', onClick: event => { event.stopPropagation(); onContinue(series) } }, `▶ ${label}`)))))
    dots.push(h('button', {
      type: 'button',
      class: ['hero-dot', i === 0 && 'active'],
      'aria-label': t('hero_slide', { n: i + 1, total: seriesList.length }),
      'aria-current': String(i === 0),
      onClick: event => { event.stopPropagation(); goTo(i) }
    }))
  })

  const section = h('section', { class: 'hero-section hero-carousel', 'aria-roledescription': 'carousel', 'aria-label': t('featured_series'), onMouseenter: stop, onMouseleave: restart, onFocusin: stop, onFocusout: restart },
    h('div', { class: 'hero-carousel-slides' }, slides),
    h('div', { class: 'hero-dots' }, dots))
  restart()
  return { element: section, dispose: stop }
}

/**
 * Channel search result with an expandable list of its playlists.
 * @param {any} channel @param {(playlist: any) => void} onAdd @param {(channelId: string) => Promise<any[]>} loadPlaylists
 */
export function channelCard(channel, onAdd, loadPlaylists) {
  const container = h('div', { class: 'channel-playlists hidden', id: `channel-${channel.channelId}` })
  const toggle = h('button', { type: 'button', class: 'btn-primary channel-expand-btn', 'aria-expanded': 'false', 'aria-controls': container.id }, t('see_playlists'))
  let loaded = false

  toggle.addEventListener('click', async () => {
    const opening = container.classList.contains('hidden')
    container.classList.toggle('hidden', !opening)
    toggle.setAttribute('aria-expanded', String(opening))
    toggle.textContent = opening ? t('hide') : t('see_playlists')
    if (!opening || loaded) return
    toggle.disabled = true
    toggle.textContent = t('loading_dots')
    try {
      const playlists = await loadPlaylists(channel.channelId)
      loaded = true
      container.replaceChildren(playlists.length
        ? h('div', { class: 'carousel-grid' }, playlists.map((playlist, i) => playlistCard(playlist, onAdd, i, 'channel-playlist-card')))
        : h('p', { class: 'search-empty' }, t('no_playlists_found')))
    } catch {
      container.replaceChildren(h('p', { class: 'search-empty', role: 'alert' }, t('load_error')))
    } finally {
      toggle.disabled = false
      toggle.textContent = t('hide')
    }
  })

  return h('section', { class: 'channel-section' },
    h('div', { class: 'channel-card' },
      img({ class: 'channel-avatar', src: channel.thumbnail }),
      h('div', { class: 'channel-info' },
        h('div', { class: 'channel-title' }, channel.title),
        h('div', { class: 'channel-desc' }, channel.description || '')),
      toggle),
    container)
}
