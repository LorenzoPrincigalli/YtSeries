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
import * as actions from '../actions.js'
import { isChannelFollowed, isChannelSeries, collectionNames, watchedCount, nextEpisode, findNewEpisode, isNewEpisode, latestEpisode, watchUrl, formatDuration, formatLength } from '../seriesView.js'
import { countedVideos, timeLeft, finishEstimate, suggestedExclusions, dormantMonths } from '../../shared/seriesStats.js'
import { notesSection, activeNotes } from './notes.js'
import { followButton } from './cards.js'
import { shareSeries } from '../features/share.js'

const log = logger.child('detail')
const MODAL_ID = 'detailModal'

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

export class DetailView {
  constructor() {
    this.renderedId = null
    this.sort = 'default'
    /** @type {Map<string, Promise<any[]>>} channel playlists, fetched once per session */
    this.channelCache = new Map()
    this.closeFolderPicker = null
    /** Series whose "exclude trailers?" suggestion was dismissed this session. */
    this.dismissedSuggestions = new Set()
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
    safeRender(this.body, 'detail', () => this.render(series))
    this.body.scrollTop = scrollTop
    if (firstOpen) {
      this.renderedId = detailId
      openModal(MODAL_ID, {
        onClose: () => { this.renderedId = null; this.closeFolderPicker?.(false); setUi({ detailId: null }) },
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
    this.closeFolderPicker?.(false)
    const title = document.getElementById('detailModalTitle')
    if (title) title.textContent = series.title
    const newEpisode = findNewEpisode(series)
    mount(this.body,
      this.renderInfo(series),
      this.renderSuggestion(series),
      this.renderEndedSuggestion(series),
      newEpisode && this.renderNewEpisode(series, newEpisode),
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
      'aria-expanded': 'false'
    }, svg('folder'))
    folderButton.addEventListener('click', () => this.openFolderPicker(series, folderButton))

    return h('div', { class: 'detail-info' },
      h('div', { class: 'detail-hero' },
        img({ class: 'detail-hero-img', src: series.videos[0]?.thumbnail || series.thumbnail, loading: 'eager' }),
        h('div', { class: 'detail-hero-gradient' }),
        h('div', { class: 'detail-hero-content' },
          h('h1', { class: 'detail-hero-title' }, series.title),
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
        h('div', { class: 'detail-actions' },
          next && h('button', { type: 'button', class: 'btn-primary btn-with-icon', onClick: () => actions.continueWatching(series) },
            svg('play'), t('continue_ep', { n: series.videos.indexOf(next) + 1 })),
          h('button', { type: 'button', class: 'btn-secondary', onClick: () => actions.toggleComplete(series.playlistId) },
            series.completed ? t('mark_incomplete') : t('mark_complete')),
          // A followed channel keeps publishing: no "mark as ended" (only an undo, should one be flagged).
          (!isChannelSeries(series.playlistId) || series.ended) && h('button', {
            type: 'button',
            class: 'btn-secondary btn-with-icon',
            'aria-pressed': String(Boolean(series.ended)),
            title: series.ended ? t('mark_ongoing_named', { title: series.title }) : t('mark_ended_named', { title: series.title }),
            onClick: () => actions.setSeriesEnded(series.playlistId, !series.ended)
          }, svg('flag'), series.ended ? t('mark_ongoing') : t('mark_ended')),
          h('button', { type: 'button', class: 'btn-secondary detail-refresh-btn', title: t('refresh'), 'aria-label': t('refresh'), onClick: event => this.refresh(series, event.currentTarget) }, svg('refresh')),
          folderButton,
          h('button', { type: 'button', class: 'btn-secondary detail-share-btn', title: t('share'), 'aria-label': t('share_series_named', { title: series.title }), onClick: () => shareSeries(series.title, [series]) }, svg('share')),
          h('button', { type: 'button', class: 'btn-secondary text-error', title: t('delete'), 'aria-label': t('delete'), onClick: () => this.confirmDelete(series) }, svg('trash')))))
  }

  /** Offers to leave trailers/teasers out of the progress, once per series and session. @param {any} series */
  renderSuggestion(series) {
    const ids = suggestedExclusions(series)
    if (!ids.length || this.dismissedSuggestions.has(series.playlistId)) return null
    return h('div', { class: 'detail-suggestion', role: 'note' },
      h('p', { class: 'detail-suggestion-text' }, t('suggest_exclude', { n: ids.length })),
      h('div', { class: 'detail-suggestion-actions' },
        h('button', { type: 'button', class: 'btn-primary', onClick: () => actions.setEpisodesExcluded(series.playlistId, ids, true) }, t('exclude_them')),
        h('button', {
          type: 'button',
          class: 'btn-secondary',
          onClick: () => { this.dismissedSuggestions.add(series.playlistId); this.sync() }
        }, t('close'))))
  }

  /** Long silence and no release rhythm: ask whether the series has ended, once per series and session. @param {any} series */
  renderEndedSuggestion(series) {
    const months = dormantMonths(series)
    if (months === null || this.dismissedSuggestions.has(`ended:${series.playlistId}`)) return null
    return h('div', { class: 'detail-suggestion', role: 'note' },
      h('p', { class: 'detail-suggestion-text' }, t('suggest_ended', { n: months })),
      h('div', { class: 'detail-suggestion-actions' },
        h('button', { type: 'button', class: 'btn-primary', onClick: () => actions.setSeriesEnded(series.playlistId, true) }, t('suggest_ended_yes')),
        h('button', {
          type: 'button',
          class: 'btn-secondary',
          onClick: () => { this.dismissedSuggestions.add(`ended:${series.playlistId}`); this.sync() }
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
  renderNewEpisode(series, video) {
    return h('div', { class: 'detail-new-highlight' },
      h('div', { class: 'new-accent-bar' }),
      h('div', { class: 'detail-new-highlight-body' },
        img({ class: 'detail-new-highlight-thumb', src: video.thumbnail }),
        h('div', { class: 'detail-new-highlight-info' },
          h('div', { class: 'detail-new-highlight-title' }, h('span', { class: 'new-badge' }, t('new_episode'))),
          h('div', { class: 'detail-new-highlight-episode' }, video.title),
          video.publishedAt && h('div', { class: 'detail-new-highlight-date' }, shortDate(video.publishedAt)),
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
    this.closeFolderPicker = (restoreFocus = true) => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', keyboard, true)
      window.removeEventListener('resize', resize)
      picker.remove()
      anchor.setAttribute('aria-expanded', 'false')
      this.closeFolderPicker = null
      if (restoreFocus && anchor.isConnected) anchor.focus()
    }
    anchor.setAttribute('aria-expanded', 'true')
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keyboard, true)
    window.addEventListener('resize', resize)
    input.focus()
  }
}
