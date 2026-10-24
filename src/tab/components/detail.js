// @ts-check
// Series detail dialog. Renders from the store whenever ui.detailId is set,
// so it always reflects the latest server state (no local copies to patch).
import { t } from '../../shared/i18n.js'
import { logger } from '../../shared/logger.js'
import { h, img, mount } from '../../shared/dom.js'
import { svg } from '../../shared/icons.js'
import { getState, getUi, setUi, subscribe } from '../core/store.js'
import { safeRender } from '../core/errorBoundary.js'
import { openModal, closeModal, confirmDialog } from '../ui/modal.js'
import { toast } from '../ui/feedback.js'
import * as actions from '../actions.js'
import { isChannelFollowed, isChannelSeries, collectionNames, watchedCount, nextEpisode, newEpisodes, isNewEpisode, latestEpisode, watchUrl, formatDuration, formatLength } from '../seriesView.js'
import { countedVideos, timeLeft, finishEstimate, suggestedExclusions, dormantMonths } from '../../shared/seriesStats.js'
import { notesSection, activeNotes } from './notes.js'
import { followButton } from './cards.js'
import { shareSeries } from '../features/share.js'

const log = logger.child('detail')
const MODAL_ID = 'detailModal'
/** How far the dialog must scroll to close the "⋯" menu (as for the "Your series" menu). */
const SCROLL_CLOSE_PX = 40

const SORTS = {
  default: null,
  date_desc: (a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''),
  date_asc: (a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''),
  unwatched_first: (a, b) => Number(a.watched) - Number(b.watched),
  watched_first: (a, b) => Number(b.watched) - Number(a.watched)
}
const SORT_LABELS = { default: 'sort_default', date_desc: 'sort_date_desc', date_asc: 'sort_date_asc', unwatched_first: 'sort_unwatched', watched_first: 'sort_watched' }

/** @param {string | undefined} iso */
const shortDate = iso => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '')
/** @param {number} at */
const dayMonth = at => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
/** 2 → "2", 2.33 → "2.3" @param {number} value */
const oneDecimal = value => String(Math.round(value * 10) / 10)
/** A followed channel keeps publishing: no "mark as ended" (only an undo, should one be flagged). @param {any} series */
const canToggleEnded = series => !isChannelSeries(series.playlistId) || Boolean(series.ended)

export class DetailView {
  constructor() {
    this.renderedId = null
    this.sort = 'default'
    /** @type {Map<string, Promise<any[]>>} channel playlists, fetched once per session */
    this.channelCache = new Map()
    this.closeFolderPicker = null
    this.closeMoreMenu = null
    this.body = this.ensureModal()
    subscribe(() => this.sync())
  }

  ensureModal() {
    let body = document.getElementById('detailModalBody')
    if (body) return body
    body = h('div', { class: 'modal-body modal-detail-body', id: 'detailModalBody' })
    document.body.append(h('div', { id: MODAL_ID, class: 'modal-overlay hidden' },
      h('div', { class: 'modal-backdrop' }),
      h('div', { class: 'modal modal-detail' },
        h('div', { class: 'modal-header modal-header-detail' },
          h('h2', { class: 'visually-hidden', id: 'detailModalTitle' }),
          h('button', { type: 'button', class: 'modal-close', 'aria-label': t('close'), onClick: () => closeModal(MODAL_ID) }, svg('close'))),
        body)))
    return body
  }

  /** Opens, re-renders or closes to match ui.detailId. */
  sync() {
    const { detailId } = getUi()
    const series = detailId ? getState()?.series?.[detailId] : null
    if (!series) {
      if (this.renderedId) this.hide()
      return
    }
    const firstOpen = this.renderedId !== detailId
    if (firstOpen) this.sort = 'default'
    const scrollTop = firstOpen ? 0 : this.body.scrollTop
    // Re-rendering replaces the action buttons: popups anchored to them close
    // (focus back on their button) and keyboard focus stays on the same action.
    this.closeFolderPicker?.()
    this.closeMoreMenu?.()
    const focused = /** @type {HTMLElement | null} */ (document.activeElement)
    const focusKey = !firstOpen && focused && this.body.contains(focused) ? focused.dataset.focusKey : undefined
    safeRender(this.body, 'detail', () => this.render(series))
    this.body.scrollTop = scrollTop
    if (focusKey) /** @type {HTMLElement | null} */ (this.body.querySelector(`[data-focus-key="${focusKey}"]`))?.focus()
    if (firstOpen) {
      this.renderedId = detailId
      openModal(MODAL_ID, {
        onClose: () => { this.renderedId = null; this.closeFolderPicker?.(false); this.closeMoreMenu?.(false); setUi({ detailId: null }) },
        // The card that opened the dialog may have been re-rendered meanwhile: refocus its replacement.
        returnFocus: () => document.querySelector(`[data-id="${CSS.escape(detailId)}"] .card-title-btn`)
      })
    }
  }

  hide() {
    this.renderedId = null
    closeModal(MODAL_ID)
  }

  /** @param {any} series */
  render(series) {
    const title = document.getElementById('detailModalTitle')
    if (title) title.textContent = series.title
    const fresh = newEpisodes(series)
    mount(this.body,
      this.renderInfo(series),
      this.renderSuggestion(series),
      this.renderEndedSuggestion(series),
      fresh.length > 0 && this.renderNewEpisode(series, fresh[0], fresh.length - 1),
      notesSection(series),
      this.renderEpisodes(series),
      this.renderRelated(series))
  }

  /** @param {any} series */
  renderInfo(series) {
    const total = countedVideos(series).length
    const excluded = series.videos.length - total
    const watched = watchedCount(series)
    const percent = total ? (watched / total) * 100 : 0
    const next = nextEpisode(series)
    const latest = latestEpisode(series)

    const meta = [`${total} ${total === 1 ? t('episode') : t('episodes')}`, `${watched}/${total} ${t('watched')} (${Math.round(percent)}%)`]
    if (excluded) meta.push(t('excluded_count', { n: excluded }))
    if (latest) meta.push(`${t('last_video')}: ${shortDate(latest.publishedAt)}`)

    const left = series.completed ? 0 : timeLeft(series)
    const estimate = series.completed ? null : finishEstimate(series)
    const pace = [
      left > 0 && t('time_left', { time: formatLength(left) }),
      estimate && t('finish_estimate', { pace: oneDecimal(estimate.pacePerWeek), date: dayMonth(estimate.finishAt) })
    ].filter(Boolean).join(' · ')

    const folderButton = h('button', {
      type: 'button',
      class: ['folder-icon-btn', series.collection && 'assigned'],
      title: t('collection'),
      'aria-label': series.collection ? `${t('collection')}: ${series.collection}` : t('collection'),
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      dataset: { focusKey: 'folder' }
    }, svg('folder'))
    folderButton.addEventListener('click', () => this.openFolderPicker(series, folderButton))

    const moreButton = h('button', {
      type: 'button',
      class: 'btn-secondary detail-more-btn',
      title: t('more_actions'),
      'aria-label': t('more_actions'),
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      dataset: { focusKey: 'more' }
    }, svg('more'))
    moreButton.addEventListener('click', () => (this.closeMoreMenu ? this.closeMoreMenu() : this.openMoreMenu(series, moreButton)))
    moreButton.addEventListener('keydown', event => {
      if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || this.closeMoreMenu) return
      event.preventDefault()
      this.openMoreMenu(series, moreButton, event.key === 'ArrowUp')
    })

    return h('div', { class: 'detail-info' },
      h('div', { class: 'detail-hero' },
        img({ class: 'detail-hero-img', src: series.videos[0]?.thumbnail || series.thumbnail, loading: 'eager' }),
        h('div', { class: 'detail-hero-gradient' }),
        h('div', { class: 'detail-hero-content' },
          // Initial focus when the dialog opens: the title, not the first button.
          h('h1', { class: 'detail-hero-title', tabIndex: -1, autofocus: true }, series.title),
          series.channelTitle && series.channelId && h('button', {
            type: 'button',
            class: 'detail-hero-channel',
            dataset: { channelId: series.channelId },
            onClick: () => this.openChannelModal(series)
          }, series.channelTitle))),
      h('div', { class: 'detail-info-body' },
        h('div', { class: 'detail-meta-row' },
          series.ended && h('span', { class: 'detail-ended-chip', title: t('series_ended_desc') }, t('series_ended')),
          meta.join(' · ')),
        pace && h('div', { class: 'detail-pace-row' }, pace),
        h('div', { class: 'detail-progress-bar', role: 'progressbar', 'aria-label': t('watched'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(percent)) },
          h('div', { class: 'detail-progress-fill', style: { '--progress': `${percent}%` } })),
        series.description && h('p', { class: 'detail-hero-desc' }, series.description),
        // Phone: "Continue" and "⋯" (the menu holds the .detail-secondary actions).
        h('div', { class: 'detail-actions' },
          next && h('button', { type: 'button', class: 'btn-primary btn-with-icon', dataset: { focusKey: 'continue' }, onClick: () => actions.continueWatching(series) },
            svg('play'), t('continue_ep', { n: series.videos.indexOf(next) + 1 })),
          // Nothing left to watch: the completed toggle stays in view on phone too.
          h('button', { type: 'button', class: ['btn-secondary', next && 'detail-secondary'], dataset: { focusKey: 'complete' }, onClick: () => actions.toggleComplete(series.playlistId) },
            series.completed ? t('mark_incomplete') : t('mark_complete')),
          canToggleEnded(series) && h('button', {
            type: 'button',
            class: 'btn-secondary btn-with-icon detail-secondary',
            'aria-pressed': String(Boolean(series.ended)),
            title: series.ended ? t('mark_ongoing_named', { title: series.title }) : t('mark_ended_named', { title: series.title }),
            dataset: { focusKey: 'ended' },
            onClick: () => actions.setSeriesEnded(series.playlistId, !series.ended)
          }, svg('flag'), series.ended ? t('mark_ongoing') : t('mark_ended')),
          // The icon buttons wrap as one group, never one of them alone on a row.
          h('div', { class: 'detail-icon-actions detail-secondary' },
            h('button', { type: 'button', class: 'btn-secondary detail-refresh-btn', title: t('refresh'), 'aria-label': t('refresh'), dataset: { focusKey: 'refresh' }, onClick: event => this.refresh(series, event.currentTarget) }, svg('refresh')),
            folderButton,
            h('button', { type: 'button', class: 'btn-secondary detail-share-btn', title: t('share'), 'aria-label': t('share_series_named', { title: series.title }), dataset: { focusKey: 'share' }, onClick: () => shareSeries(series.title, [series]) }, svg('share')),
            h('button', { type: 'button', class: 'btn-secondary text-error', title: t('delete'), 'aria-label': t('delete'), dataset: { focusKey: 'delete' }, onClick: () => this.confirmDelete(series) }, svg('trash'))),
          moreButton)))
  }

  /**
   * Phone: the secondary actions in a menu under "⋯" (menu button pattern, as
   * in the "Your series" menu). Choosing an item puts focus back on "⋯".
   * @param {any} series @param {HTMLButtonElement} anchor @param {boolean} [focusLast]
   */
  openMoreMenu(series, anchor, focusLast = false) {
    this.closeFolderPicker?.(false)
    /** @param {Parameters<typeof svg>[0]} icon @param {string} label @param {() => void} run */
    const item = (icon, label, run, danger = false) => h('button', {
      type: 'button',
      role: 'menuitem',
      class: ['nav-menu-item', danger && 'nav-menu-item-danger'],
      tabIndex: -1,
      onClick: () => { this.closeMoreMenu?.(); run() }
    }, svg(icon), h('span', { class: 'nav-menu-label' }, label))
    const menu = h('div', { class: 'nav-menu-panel detail-more-menu', role: 'menu', 'aria-label': t('more_actions') },
      nextEpisode(series) && item('check', series.completed ? t('mark_incomplete') : t('mark_complete'), () => actions.toggleComplete(series.playlistId)),
      canToggleEnded(series) && item('flag', series.ended ? t('mark_ongoing') : t('mark_ended'), () => actions.setSeriesEnded(series.playlistId, !series.ended)),
      item('refresh', t('refresh'), async () => {
        // No spinning button here: a toast says when the episode list is up to date.
        if (await actions.refreshSeries(series.playlistId)) toast(t('series_refreshed'), { variant: 'success' })
      }),
      item('folder', t('collection'), () => this.openFolderPicker(series, anchor)),
      item('share', t('share'), () => shareSeries(series.title, [series])),
      item('trash', t('delete'), () => this.confirmDelete(series), true))
    document.body.append(menu)

    // Below "⋯" when it fits, otherwise above; right-aligned with it.
    const rect = anchor.getBoundingClientRect()
    const below = rect.bottom + 8
    const top = below + menu.offsetHeight <= window.innerHeight - 12 ? below : Math.max(12, rect.top - 8 - menu.offsetHeight)
    menu.style.setProperty('--menu-top', `${Math.round(top)}px`)
    menu.style.setProperty('--menu-left', `${Math.round(Math.max(12, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 12)))}px`)

    const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('[role="menuitem"]')])
    menu.addEventListener('keydown', event => {
      const index = items.indexOf(/** @type {HTMLElement} */ (document.activeElement))
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation() // close the menu, not the detail dialog
        this.closeMoreMenu?.()
      } else if (event.key === 'Tab') this.closeMoreMenu?.() // Tab then moves on from "⋯"
      else if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus() }
      else if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus() }
      else if (event.key === 'Home') { event.preventDefault(); items[0]?.focus() }
      else if (event.key === 'End') { event.preventDefault(); items.at(-1)?.focus() }
    })
    const outside = event => { if (!menu.contains(event.target) && !anchor.contains(event.target)) this.closeMoreMenu?.(false) }
    const dismiss = () => this.closeMoreMenu?.(false)
    // A real scroll of the dialog closes it; a scroll event still in flight from
    // before it opened, or images nudging the list, do not.
    const openedAt = this.body.scrollTop
    const onScroll = () => { if (Math.abs(this.body.scrollTop - openedAt) > SCROLL_CLOSE_PX) dismiss() }
    this.closeMoreMenu = (restoreFocus = true) => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', dismiss)
      this.body.removeEventListener('scroll', onScroll)
      menu.remove()
      anchor.setAttribute('aria-expanded', 'false')
      this.closeMoreMenu = null
      if (restoreFocus && anchor.isConnected) anchor.focus()
    }
    anchor.setAttribute('aria-expanded', 'true')
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', dismiss)
    this.body.addEventListener('scroll', onScroll, { passive: true })
    const first = focusLast ? items.at(-1) : items[0]
    first?.focus()
  }

  /** Offers to leave trailers/teasers out of the progress, until closed once for this series. @param {any} series */
  renderSuggestion(series) {
    const ids = suggestedExclusions(series)
    if (!ids.length || series.dismissedSuggestions?.includes('exclusions')) return null
    return h('div', { class: 'detail-suggestion', role: 'note' },
      h('p', { class: 'detail-suggestion-text' }, t('suggest_exclude', { n: ids.length })),
      h('div', { class: 'detail-suggestion-actions' },
        h('button', { type: 'button', class: 'btn-primary', onClick: () => actions.setEpisodesExcluded(series.playlistId, ids, true) }, t('exclude_them')),
        h('button', {
          type: 'button',
          class: 'btn-secondary',
          onClick: () => actions.dismissSuggestion(series.playlistId, 'exclusions')
        }, t('close'))))
  }

  /** Long silence and no release rhythm: ask whether the series has ended, until closed once. @param {any} series */
  renderEndedSuggestion(series) {
    const months = dormantMonths(series)
    if (months === null || series.dismissedSuggestions?.includes('ended')) return null
    return h('div', { class: 'detail-suggestion', role: 'note' },
      h('p', { class: 'detail-suggestion-text' }, t('suggest_ended', { n: months })),
      h('div', { class: 'detail-suggestion-actions' },
        h('button', { type: 'button', class: 'btn-primary', onClick: () => actions.setSeriesEnded(series.playlistId, true) }, t('suggest_ended_yes')),
        h('button', {
          type: 'button',
          class: 'btn-secondary',
          onClick: () => actions.dismissSuggestion(series.playlistId, 'ended')
        }, t('close'))))
  }

  /** @param {any} series @param {HTMLButtonElement} button */
  async refresh(series, button) {
    button.disabled = true
    button.setAttribute('aria-busy', 'true')
    await actions.refreshSeries(series.playlistId)
    if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy') }
  }

  /** @param {any} series @param {any} video */
  renderNewEpisode(series, video, more = 0) {
    return h('div', { class: 'detail-new-highlight' },
      h('div', { class: 'new-accent-bar' }),
      h('div', { class: 'detail-new-highlight-body' },
        img({ class: 'detail-new-highlight-thumb', src: video.thumbnail }),
        h('div', { class: 'detail-new-highlight-info' },
          h('div', { class: 'detail-new-highlight-title' }, h('span', { class: 'new-badge' }, t('new_episode'))),
          h('div', { class: 'detail-new-highlight-episode' }, video.title),
          video.publishedAt && h('div', { class: 'detail-new-highlight-date' }, shortDate(video.publishedAt)),
          more > 0 && h('div', { class: 'detail-new-highlight-date' }, t('new_more', { n: more })),
          h('a', { class: 'btn-primary', href: watchUrl(video.id, series.playlistId), target: '_blank', rel: 'noopener noreferrer' }, t('watch_now')))))
  }

  /** @param {any} series */
  renderEpisodes(series) {
    const grid = h('div', { class: 'episode-grid' })
    /** @type {Map<string, number>} */
    const noteCounts = new Map()
    for (const note of activeNotes(series)) noteCounts.set(note.v, (noteCounts.get(note.v) || 0) + 1)
    const draw = () => {
      const compare = SORTS[this.sort]
      const videos = compare ? [...series.videos].sort(compare) : series.videos
      grid.replaceChildren(...videos.map(video => this.episodeCard(series, video, series.videos.indexOf(video), noteCounts.get(video.id) || 0)))
    }
    const select = h('select', { class: 'episode-sort', 'aria-label': t('sort_episodes') },
      Object.keys(SORTS).map(key => h('option', { value: key, selected: key === this.sort }, t(SORT_LABELS[key]))))
    select.addEventListener('change', () => { this.sort = select.value; draw() })
    draw()
    return h('div', { class: 'detail-episodes' },
      h('div', { class: 'episodes-header' }, h('h3', null, t('episodes_title')), h('div', { class: 'episodes-header-right' }, select)),
      grid)
  }

  /** @param {any} series @param {any} video @param {number} index @param {number} [notes] */
  episodeCard(series, video, index, notes = 0) {
    const href = watchUrl(video.id, series.playlistId, video.watched ? 0 : video.resumeTime)
    const number = `${t('episode')} ${index + 1}${video.duration ? ` · ${formatDuration(video.duration)}` : ''}`
    return h('div', { class: ['episode-card', video.excluded && 'episode-excluded'], dataset: { videoId: video.id }, onClick: () => window.open(href, '_blank', 'noopener') },
      img({ class: 'episode-thumb', src: video.thumbnail }),
      video.progress > 0 && !video.watched && h('div', { class: 'episode-progress-overlay' },
        h('div', { class: 'episode-progress-bar', style: { '--progress': `${video.progress}%` } })),
      h('div', { class: 'episode-info' },
        h('div', { class: 'episode-number' }, number,
          notes > 0 && h('span', { class: 'episode-notes-chip', title: t('notes_chip', { n: notes }) }, svg('note'), String(notes))),
        h('div', { class: 'episode-title' },
          h('a', { class: 'episode-title-link', href, target: '_blank', rel: 'noopener noreferrer', onClick: event => event.stopPropagation() },
            isNewEpisode(video) && h('span', { class: 'new-dot' }, t('new_short')),
            isNewEpisode(video) ? ` ${video.title}` : video.title)),
        video.publishedAt && h('div', { class: 'episode-date' }, shortDate(video.publishedAt)),
        h('button', {
          type: 'button',
          class: ['episode-status', video.watched ? 'episode-status-watched' : 'episode-status-unwatched'],
          'aria-pressed': String(Boolean(video.watched)),
          'aria-label': video.watched ? t('mark_unwatched_named', { title: video.title }) : t('mark_watched_named', { title: video.title }),
          onClick: event => { event.stopPropagation(); actions.setEpisodeWatched(series.playlistId, video.id, !video.watched) }
        },
        h('span', { class: 'episode-status-icon', 'aria-hidden': 'true' }, svg('check')),
        h('span', { class: 'episode-status-label' }, video.watched ? t('watched') : t('unwatched'))),
        h('button', {
          type: 'button',
          class: 'episode-exclude-btn',
          'aria-pressed': String(Boolean(video.excluded)),
          'aria-label': video.excluded ? t('include_named', { title: video.title }) : t('exclude_named', { title: video.title }),
          onClick: event => { event.stopPropagation(); actions.setEpisodesExcluded(series.playlistId, [video.id], !video.excluded) }
        }, video.excluded ? t('include_short') : t('exclude_short'))))
  }

  /** @param {any} series */
  renderRelated(series) {
    const status = h('div', { class: 'more-loading', role: 'status' }, series.channelId ? t('loading') : t('no_channel_info'))
    const section = h('div', { class: 'detail-more', id: 'detailMoreSection' },
      h('h3', null, t('more_from', { channel: series.channelTitle || t('this_channel') })),
      status)
    if (!series.channelId) return section

    // Load lazily, only when the user scrolls near the section.
    const observer = new IntersectionObserver(async entries => {
      if (!entries[0].isIntersecting) return
      observer.disconnect()
      try {
        const playlists = await this.channelPlaylists(series.channelId, series.playlistId)
        if (!section.isConnected) return
        if (!playlists.length) { status.textContent = t('no_related_found'); return }
        status.replaceWith(h('div', { class: 'more-row' }, playlists.map(playlist => this.relatedCard(playlist, () => actions.addPlaylistById(playlist.playlistId)))))
      } catch (err) {
        log.warn('Related playlists failed', err)
        status.textContent = t('related_error')
      }
    }, { root: this.body, rootMargin: '100px' })
    queueMicrotask(() => observer.observe(section))
    return section
  }

  /** @param {string} channelId @param {string} excludeId */
  channelPlaylists(channelId, excludeId) {
    if (!this.channelCache.has(channelId)) {
      const pending = actions.fetchChannelPlaylists(channelId)
      pending.catch(() => this.channelCache.delete(channelId)) // never cache a failure
      this.channelCache.set(channelId, pending)
    }
    return /** @type {Promise<any[]>} */ (this.channelCache.get(channelId)).then(list => list.filter(p => p.playlistId !== excludeId))
  }

  /** @param {any} playlist @param {() => void} onAdd */
  relatedCard(playlist, onAdd) {
    return h('button', { type: 'button', class: 'related-card', 'aria-label': t('add_named_series', { title: playlist.title }), onClick: onAdd },
      img({ class: 'related-card-thumb', src: playlist.thumbnail }),
      h('span', { class: 'related-card-title' }, playlist.title),
      h('span', { class: 'related-card-count' }, `${playlist.videoCount || '?'} ${playlist.videoCount === 1 ? t('video') : t('videos')}`))
  }

  /** @param {any} series */
  async openChannelModal(series) {
    document.getElementById('channelModal')?.remove()
    const body = h('div', { class: 'modal-body' }, h('div', { class: 'more-loading', role: 'status' }, t('loading')))
    const overlay = h('div', { class: 'modal-overlay hidden', id: 'channelModal' },
      h('div', { class: 'modal-backdrop' }),
      h('div', { class: 'modal modal-channel' },
        h('div', { class: 'modal-header' },
          h('button', { type: 'button', class: 'modal-close channel-close-btn', 'aria-label': t('close'), onClick: () => closeModal('channelModal') }, svg('close')),
          h('h2', null, t('more_from', { channel: series.channelTitle })),
          !isChannelSeries(series.playlistId) && followButton(series.channelId, isChannelFollowed(getState()?.series, series.channelId), actions.followChannel)),
        body))
    document.body.append(overlay)
    openModal('channelModal', { onClose: () => overlay.remove() })
    try {
      const playlists = await this.channelPlaylists(series.channelId, series.playlistId)
      mount(body, playlists.length
        ? h('div', { class: 'channel-grid' }, playlists.map(playlist => this.relatedCard(playlist, () => {
          closeModal('channelModal')
          actions.addPlaylistById(playlist.playlistId)
        })))
        : h('div', { class: 'more-loading' }, t('no_related_found')))
    } catch (err) {
      log.warn('Channel playlists failed', err)
      mount(body, h('div', { class: 'more-loading', role: 'alert' }, t('related_error')))
    }
  }

  /** @param {any} series */
  async confirmDelete(series) {
    if (await confirmDialog(t('delete_confirm', { title: series.title }), { confirmLabel: t('delete'), danger: true })) {
      await actions.deleteSeries(series.playlistId)
    }
  }

  /** @param {any} series @param {HTMLButtonElement} anchor */
  openFolderPicker(series, anchor) {
    this.closeFolderPicker?.(false)
    const apply = folder => {
      this.closeFolderPicker?.()
      actions.setSeriesCollection(series.playlistId, folder)
    }
    const input = h('input', { maxLength: 40, placeholder: t('new_folder'), 'aria-label': t('new_folder') })
    const create = () => { if (input.value.trim()) apply(input.value.trim()) }
    input.addEventListener('keydown', event => { if (event.key === 'Enter') create() })

    const picker = h('div', { id: 'folderPicker', class: 'folder-picker', role: 'dialog', 'aria-label': t('collection') },
      h('strong', null, t('folder_picker')),
      h('button', { type: 'button', class: 'folder-picker-option', onClick: () => apply('') }, t('no_folder')),
      collectionNames(getState()).map(folder => h('button', {
        type: 'button',
        class: ['folder-picker-option', folder === series.collection && 'selected'],
        'aria-pressed': String(folder === series.collection),
        onClick: () => apply(folder)
      }, folder)),
      h('div', { class: 'folder-picker-create' }, input, h('button', { type: 'button', onClick: create }, t('create_folder'))))
    document.body.append(picker)

    const rect = anchor.getBoundingClientRect()
    picker.style.setProperty('--picker-top', `${Math.max(12, Math.min(window.innerHeight - picker.offsetHeight - 12, rect.bottom + 8))}px`)
    picker.style.setProperty('--picker-left', `${Math.max(12, Math.min(window.innerWidth - picker.offsetWidth - 12, rect.left))}px`)

    const outside = event => { if (!picker.contains(event.target) && !anchor.contains(event.target)) this.closeFolderPicker?.(false) }
    const keyboard = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation() // close the picker, not the detail dialog
      this.closeFolderPicker?.()
    }
    const resize = () => this.closeFolderPicker?.(false)
    // From the "⋯" menu (phone) the anchor is the menu button: its aria-expanded is the menu's.
    const ownsPicker = anchor.getAttribute('aria-haspopup') === 'dialog'
    this.closeFolderPicker = (restoreFocus = true) => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', keyboard, true)
      window.removeEventListener('resize', resize)
      picker.remove()
      if (ownsPicker) anchor.setAttribute('aria-expanded', 'false')
      this.closeFolderPicker = null
      if (restoreFocus && anchor.isConnected) anchor.focus()
    }
    if (ownsPicker) anchor.setAttribute('aria-expanded', 'true')
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keyboard, true)
    window.addEventListener('resize', resize)
    input.focus()
  }
}
