import { EVENTS } from '../../shared/events.js'
import { t } from '../../shared/i18n.js'

class DetailPage {
  constructor() {
    this._ensureModal()
    this.series = null
    this.callbacks = {}
  }

  _ensureModal() {
    if (document.getElementById('detailModal')) return

    const modal = document.createElement('div')
    modal.id = 'detailModal'
    modal.className = 'modal-overlay hidden'

    const backdrop = document.createElement('div')
    backdrop.className = 'modal-backdrop'
    modal.appendChild(backdrop)

    const content = document.createElement('div')
    content.className = 'modal modal-detail'

    const header = document.createElement('div')
    header.className = 'modal-header modal-header-detail'

    const close = document.createElement('button')
    close.className = 'modal-close'
    close.id = 'detailModalClose'
    close.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>'
    close.addEventListener('click', () => this.close())
    header.appendChild(close)

    content.appendChild(header)

    const body = document.createElement('div')
    body.className = 'modal-body modal-detail-body'
    body.id = 'detailModalBody'
    content.appendChild(body)

    modal.appendChild(content)
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target === backdrop) this.close()
    })

    document.body.appendChild(modal)
  }

  async render(series, { onWatch, onBack, onRefresh, onCompleteToggle, onAddSeries, isPro }) {

    this.callbacks = { onWatch, onBack, onRefresh, onCompleteToggle, onAddSeries }
    this.series = series

    const body = document.getElementById('detailModalBody')
    body.innerHTML = ''

    body.appendChild(this._renderInfo(series))
    // Sezione "Nuovo episodio" in evidenza (solo Pro)
    if (isPro) {
      const newEp = this._findNewEpisode(series)
      if (newEp) {
        body.appendChild(this._renderNewEpisodeHighlight(series, newEp))
      }
    }
    body.appendChild(this._renderEpisodes(series))
    body.appendChild(this._renderMoreSection(series))

    document.getElementById('detailModal').classList.remove('hidden')
    document.body.style.overflow = 'hidden'

    this._observeRelatedSection(series)
  }

  // Trova il primo episodio "nuovo" (pubblicato negli ultimi 7 giorni e non visto)
  _findNewEpisode(series) {
    const now = new Date()
    return series.videos.find(v => {
      if (!v.publishedAt || v.watched) return false
      const pubDate = new Date(v.publishedAt)
      const diffDays = (now - pubDate) / (1000 * 60 * 60 * 24)
      return diffDays <= 7
    })
  }

  // Rende la sezione in evidenza per il nuovo episodio
  _renderNewEpisodeHighlight(series, video) {
    const section = document.createElement('div')
    section.className = 'detail-new-highlight'

    const accent = document.createElement('div')
    accent.className = 'new-accent-bar'
    section.appendChild(accent)

    const body = document.createElement('div')
    body.className = 'detail-new-highlight-body'
    section.appendChild(body)

    const img = document.createElement('img')
    img.src = video.thumbnail || ''
    img.alt = video.title
    img.className = 'detail-new-highlight-thumb'
    body.appendChild(img)

    const info = document.createElement('div')
    info.className = 'detail-new-highlight-info'

    const title = document.createElement('div')
    const badge = document.createElement('span')
    badge.className = 'new-badge'
    badge.textContent = t('new_episode')
    title.appendChild(badge)
    title.className = 'detail-new-highlight-title'
    info.appendChild(title)

    const epTitle = document.createElement('div')
    epTitle.textContent = video.title
    epTitle.className = 'detail-new-highlight-episode'
    info.appendChild(epTitle)

    if (video.publishedAt) {
      const dateEl = document.createElement('div')
      const d = new Date(video.publishedAt)
      dateEl.textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      dateEl.className = 'detail-new-highlight-date'
      info.appendChild(dateEl)
    }

    const btn = document.createElement('button')
    btn.className = 'btn-primary'
    btn.textContent = t('watch_now')
    btn.onclick = () => {
      window.open(`https://www.youtube.com/watch?v=${video.id}&list=${series.playlistId}`, '_blank', 'noopener')
    }
    info.appendChild(btn)

    body.appendChild(info)
    return section
  }

  close() {
    document.getElementById('detailModal').classList.add('hidden')
    document.body.style.overflow = ''
    this.series = null
  }

  _renderInfo(series) {
    const watchedCount = series.videos.filter(v => v.watched).length
    const progress = series.videos.length > 0 ? (watchedCount / series.videos.length) * 100 : 0
    const nextEpisode = series.videos.find(v => !v.watched)
    const nextIndex = nextEpisode ? series.videos.indexOf(nextEpisode) + 1 : series.videos.length

    const heroImage = series.videos[0]?.thumbnail || series.thumbnail || ''

    const container = document.createElement('div')
    container.className = 'detail-info'

    const hero = document.createElement('div')
    hero.className = 'detail-hero'

    const heroImg = document.createElement('img')
    heroImg.className = 'detail-hero-img'
    heroImg.src = heroImage
    heroImg.alt = series.title
    heroImg.onerror = function () { this.style.display = 'none' }
    hero.appendChild(heroImg)

    const heroGradient = document.createElement('div')
    heroGradient.className = 'detail-hero-gradient'
    hero.appendChild(heroGradient)

    const heroContent = document.createElement('div')
    heroContent.className = 'detail-hero-content'

    const heroTitle = document.createElement('h1')
    heroTitle.className = 'detail-hero-title'
    heroTitle.textContent = series.title
    heroContent.appendChild(heroTitle)

    if (series.channelTitle && series.channelId) {
      const heroChannel = document.createElement('span')
      heroChannel.className = 'detail-hero-channel'
      heroChannel.textContent = series.channelTitle
      heroChannel.dataset.channelId = series.channelId
      heroChannel.addEventListener('click', (e) => {
        e.stopPropagation()
        this._openChannelModal(series.channelId, series.channelTitle, series.playlistId, this.callbacks.onRefresh)
      })
      heroContent.appendChild(heroChannel)
    }

    hero.appendChild(heroContent)
    container.appendChild(hero)

    const info = document.createElement('div')
    info.className = 'detail-info-body'

    const meta = document.createElement('div')
    meta.className = 'detail-meta-row'

    const eps = document.createElement('span')
    const epLabel = series.videos.length !== 1 ? t('episodes') : t('episode')
    eps.textContent = `${series.videos.length} ${epLabel}`
    meta.appendChild(eps)

    const dot = document.createElement('span')
    dot.textContent = ' \u00B7 '
    meta.appendChild(dot)

    const pct = document.createElement('span')
    pct.textContent = `${watchedCount}/${series.videos.length} ${t('watched')} (${Math.round(progress)}%)`
    meta.appendChild(pct)

    if (series.videos.length > 0) {
      const lastVideo = series.videos.reduce((latest, v) => {
        return !latest || (v.publishedAt && v.publishedAt > latest.publishedAt) ? v : latest
      })
      if (lastVideo && lastVideo.publishedAt) {
        const date = new Date(lastVideo.publishedAt)
        const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        const dot2 = document.createElement('span')
        dot2.textContent = ' \u00B7 '
        meta.appendChild(dot2)
        const lastEp = document.createElement('span')
        lastEp.textContent = `${t('last_video')}: ${dateStr}`
        meta.appendChild(lastEp)
      }
    }

    info.appendChild(meta)

    const progressContainer = document.createElement('div')
    progressContainer.className = 'detail-progress-bar'

    const progressFill = document.createElement('div')
    progressFill.className = 'detail-progress-fill'
    progressFill.style.width = `${progress}%`
    progressContainer.appendChild(progressFill)

    info.appendChild(progressContainer)

    if (series.description) {
      const desc = document.createElement('p')
      desc.className = 'detail-hero-desc'
      desc.textContent = series.description
      info.appendChild(desc)
    }

    const actions = document.createElement('div')
    actions.className = 'detail-actions'

    if (nextEpisode) {
      const resume = document.createElement('button')
      resume.className = 'btn-primary'
      resume.textContent = `\u25B6 ${t('continue_ep', { n: nextIndex })}`
      resume.addEventListener('click', () => {
        window.open(`https://www.youtube.com/watch?v=${nextEpisode.id}&list=${series.playlistId}`, '_blank', 'noopener')
      })
      actions.appendChild(resume)
    }

    const completeBtn = document.createElement('button')
    completeBtn.className = 'btn-secondary'
    completeBtn.textContent = series.completed ? t('mark_incomplete') : t('mark_complete')
    completeBtn.addEventListener('click', () => this.callbacks.onCompleteToggle(series.playlistId))
    actions.appendChild(completeBtn)

    const refresh = document.createElement('button')
    refresh.className = 'btn-secondary'
    refresh.textContent = '\u21BB'
    refresh.title = t('refresh')
    refresh.addEventListener('click', () => this.callbacks.onRefresh(series.playlistId))
    actions.appendChild(refresh)

    const del = document.createElement('button')
    del.className = 'btn-secondary text-error'
    del.textContent = `\uD83D\uDDD1 ${t('delete')}`
    del.addEventListener('click', () => this._confirmDelete(series))
    actions.appendChild(del)

    info.appendChild(actions)
    container.appendChild(info)
    return container
  }

  _renderEpisodes(series) {
    const section = document.createElement('div')
    section.className = 'detail-episodes'

    // Header con titolo, selezione multipla e bottone
    const header = document.createElement('div')
    header.className = 'episodes-header'

    const h3 = document.createElement('h3')
    h3.textContent = t('episodes_title')
    header.appendChild(h3)

    const rightGroup = document.createElement('div')
    rightGroup.className = 'episodes-header-right'

    // Select ordinamento
    const sortSelect = document.createElement('select')
    sortSelect.className = 'episode-sort'
    const sorts = ['default', 'date_desc', 'date_asc', 'unwatched_first', 'watched_first']
    const sortLabels = {
      default: t('sort_default'),
      date_desc: t('sort_date_desc'),
      date_asc: t('sort_date_asc'),
      unwatched_first: t('sort_unwatched'),
      watched_first: t('sort_watched')
    }
    for (const key of sorts) {
      const opt = document.createElement('option')
      opt.value = key
      opt.textContent = sortLabels[key]
      sortSelect.appendChild(opt)
    }
    rightGroup.appendChild(sortSelect)

    // Bottone segna come visto
    const markBtn = document.createElement('button')
    markBtn.className = 'btn-primary'
    markBtn.textContent = t('mark_as_watched')
    markBtn.disabled = true
    rightGroup.appendChild(markBtn)

    header.appendChild(rightGroup)
    section.appendChild(header)

    // Stato selezione
    let selectedIds = new Set()

    const grid = document.createElement('div')
    grid.className = 'episode-grid'

    const renderEpisodes = (sortMode) => {
      grid.innerHTML = ''
      let videos = [...series.videos]
      switch (sortMode) {
        case 'date_desc':
          videos.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
          break
        case 'date_asc':
          videos.sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''))
          break
        case 'unwatched_first':
          videos.sort((a, b) => (a.watched === b.watched ? 0 : a.watched ? 1 : -1))
          break
        case 'watched_first':
          videos.sort((a, b) => (a.watched === b.watched ? 0 : a.watched ? -1 : 1))
          break
      }
      videos.forEach((v, i) => {
        const originalIndex = series.videos.indexOf(v)
        grid.appendChild(this._createEpisodeCard(series, v, originalIndex >= 0 ? originalIndex : i, selectedIds, onSelect))
      })
      // Aggiorna stato bottone
      markBtn.disabled = selectedIds.size === 0
    }

    // Gestore selezione
    const onSelect = (id, checked) => {
      if (checked) selectedIds.add(id)
      else selectedIds.delete(id)
      markBtn.disabled = selectedIds.size === 0
    }

    // Azione segna come visto
    markBtn.onclick = async () => {
      if (!selectedIds.size) return
      for (const v of series.videos) {
        if (selectedIds.has(v.id) && !v.watched) {
          this.callbacks.onWatch(series.playlistId, v.id)
        }
      }
      selectedIds.clear()
    }

    renderEpisodes(sortSelect.value)
    sortSelect.addEventListener('change', () => renderEpisodes(sortSelect.value))

    section.appendChild(grid)
    return section
  }

  _createEpisodeCard(series, video, index, selectedIds = new Set(), onSelect = null) {

    const card = document.createElement('div')
    card.className = 'episode-card'
    card.dataset.videoId = video.id

    // Checkbox selezione multipla
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = selectedIds && selectedIds.has(video.id)
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation()
      if (typeof onSelect === 'function') onSelect(video.id, checkbox.checked)
    })
    card.appendChild(checkbox)

    card.addEventListener('click', () => {
      window.open(`https://www.youtube.com/watch?v=${video.id}&list=${series.playlistId}`, '_blank', 'noopener')
    })

    const img = document.createElement('img')
    img.className = 'episode-thumb'
    img.src = video.thumbnail || ''
    img.alt = video.title
    img.loading = 'lazy'
    img.onerror = function () { this.src = '' }
    card.appendChild(img)

    // Progress bar overlay (Netflix-style)
    if (video.progress > 0 && !video.watched) {
      const progressOverlay = document.createElement('div')
      progressOverlay.className = 'episode-progress-overlay'
      const progressBar = document.createElement('div')
      progressBar.className = 'episode-progress-bar'
      progressBar.style.width = `${video.progress}%`
      progressOverlay.appendChild(progressBar)
      card.appendChild(progressOverlay)
    }

    const info = document.createElement('div')
    info.className = 'episode-info'

    const num = document.createElement('div')
    num.className = 'episode-number'
    const dur = video.duration ? this._formatDuration(video.duration) : ''
    num.textContent = `${t('episode')} ${index + 1}${dur ? ` \u00B7 ${dur}` : ''}`
    info.appendChild(num)

    const title = document.createElement('div')
    title.className = 'episode-title'
    // Evidenzia "nuovo" se pubblicato negli ultimi 7 giorni e non visto
    let isNew = false
    if (video.publishedAt && !video.watched) {
      const pubDate = new Date(video.publishedAt)
      const now = new Date()
      const diffDays = (now - pubDate) / (1000 * 60 * 60 * 24)
      if (diffDays <= 7) isNew = true
    }
    if (isNew) {
      const badge = document.createElement('span')
      badge.className = 'new-dot'
      badge.textContent = 'new'
      const wrapper = document.createElement('span')
      wrapper.appendChild(badge)
      wrapper.appendChild(document.createTextNode(' ' + video.title))
      title.appendChild(wrapper)
    } else {
      title.textContent = video.title
    }
    info.appendChild(title)

    if (video.publishedAt) {
      const dateEl = document.createElement('div')
      dateEl.className = 'episode-date'
      const d = new Date(video.publishedAt)
      dateEl.textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      info.appendChild(dateEl)
    }

    const status = document.createElement('span')
    status.className = `episode-status ${video.watched ? 'episode-status-watched' : 'episode-status-unwatched'}`
    status.textContent = video.watched ? `\u2713 ${t('watched')}` : `\u25CF ${t('unwatched')}`
    info.appendChild(status)

    card.appendChild(info)
    return card
  }

  _observeRelatedSection(series) {
    if (!series.channelId) {
      const section = document.getElementById('detailMoreSection')
      if (section) {
        const loader = section.querySelector('.more-loading')
        if (loader) loader.textContent = t('no_channel_info')
      }
      return
    }

    const section = document.getElementById('detailMoreSection')
    if (!section) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        observer.disconnect()
        this._loadRelatedPlaylists(series)
      }
    }, { root: document.getElementById('detailModalBody'), rootMargin: '100px' })

    observer.observe(section)
  }

  _renderMoreSection(series) {
    const section = document.createElement('div')
    section.className = 'detail-more'
    section.id = 'detailMoreSection'

    const h3 = document.createElement('h3')
    h3.textContent = t('more_from', { channel: series.channelTitle || t('this_channel') })
    section.appendChild(h3)

    const loader = document.createElement('div')
    loader.className = 'more-loading'
    loader.textContent = t('loading')
    section.appendChild(loader)

    return section
  }

  async _loadRelatedPlaylists(series) {
    if (!series.channelId) {
      const section = document.getElementById('detailMoreSection')
      if (section) {
        const loader = section.querySelector('.more-loading')
        if (loader) {
          loader.textContent = t('no_channel_info')
        }
      }
      return
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: EVENTS.FETCH_CHANNEL_PLAYLISTS,
        payload: { channelId: series.channelId, excludePlaylistId: series.playlistId }
      })

      const section = document.getElementById('detailMoreSection')
      if (!section) return

      const loader = section.querySelector('.more-loading')
      if (!loader) return

      if (response.success && response.playlists && response.playlists.length > 0) {
        loader.remove()

        const row = document.createElement('div')
        row.className = 'more-row'

        for (const pl of response.playlists) {
          row.appendChild(this._createRelatedCard(pl))
        }

        section.appendChild(row)
      } else {
        loader.textContent = t('no_related_found')
      }
    } catch (err) {
      const loader = document.querySelector('#detailMoreSection .more-loading')
      if (loader) loader.textContent = t('related_error')
    }
  }

  _createRelatedCard(playlist) {
    const card = document.createElement('div')
    card.className = 'related-card'
    card.addEventListener('click', () => {
      if (this.callbacks.onAddSeries) this.callbacks.onAddSeries(playlist.playlistId)
    })

    const img = document.createElement('img')
    img.className = 'related-card-thumb'
    img.src = playlist.thumbnail || ''
    img.alt = playlist.title
    img.loading = 'lazy'
    img.onerror = function () { this.src = '' }
    card.appendChild(img)

    const title = document.createElement('div')
    title.className = 'related-card-title'
    title.textContent = playlist.title
    card.appendChild(title)

    const count = document.createElement('div')
    count.className = 'related-card-count'
    const vidLabel = playlist.videoCount !== 1 ? t('videos') : t('video')
    count.textContent = `${playlist.videoCount || '?'} ${vidLabel}`
    card.appendChild(count)

    return card
  }

  _confirmDelete(series) {
    const existing = document.getElementById('confirmDeleteModal')
    if (existing) existing.remove()

    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.id = 'confirmDeleteModal'

    const backdrop = document.createElement('div')
    backdrop.className = 'modal-backdrop'
    overlay.appendChild(backdrop)

    const modal = document.createElement('div')
    modal.className = 'modal'

    const header = document.createElement('div')
    header.className = 'modal-header'
    const h2 = document.createElement('h2')
    h2.textContent = t('delete_series')
    header.appendChild(h2)
    modal.appendChild(header)

    const body = document.createElement('div')
    body.className = 'modal-body'
    const p = document.createElement('p')
    p.textContent = t('delete_confirm', { title: series.title })
    body.appendChild(p)
    modal.appendChild(body)

    const footer = document.createElement('div')
    footer.className = 'modal-footer'
    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'btn-secondary'
    cancelBtn.id = 'cancelDeleteBtn'
    cancelBtn.textContent = t('cancel')
    const confirmBtn = document.createElement('button')
    confirmBtn.className = 'btn-primary'
    confirmBtn.id = 'confirmDeleteBtn'
    confirmBtn.textContent = t('delete')
    footer.appendChild(cancelBtn)
    footer.appendChild(confirmBtn)
    modal.appendChild(footer)

    overlay.appendChild(modal)

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove()
    })
    document.body.appendChild(overlay)

    cancelBtn.onclick = () => overlay.remove()
    confirmBtn.onclick = async () => {
      overlay.remove()
      this.close()
      this.callbacks.onBack()
      window.dispatchEvent(new CustomEvent('yt-series-delete', { detail: { playlistId: series.playlistId } }))
    }
  }

  async _openChannelModal(channelId, channelTitle, excludePlaylistId, onRefresh) {
    const existing = document.getElementById('channelModal')
    if (existing) existing.remove()

    this._channelCache = this._channelCache || {}

    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.id = 'channelModal'

    const backdrop = document.createElement('div')
    backdrop.className = 'modal-backdrop'
    overlay.appendChild(backdrop)

    const modal = document.createElement('div')
    modal.className = 'modal modal-channel'

    const header = document.createElement('div')
    header.className = 'modal-header'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'modal-close channel-close-btn'
    closeBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>'
    header.appendChild(closeBtn)
    const h2 = document.createElement('h2')
    h2.textContent = t('more_from', { channel: channelTitle })
    header.appendChild(h2)
    modal.appendChild(header)

    const body = document.createElement('div')
    body.className = 'modal-body'
    const loader = document.createElement('div')
    loader.className = 'more-loading'
    loader.textContent = t('loading')
    body.appendChild(loader)
    modal.appendChild(body)

    overlay.appendChild(modal)

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.channel-close-btn')) overlay.remove()
    })
    document.body.appendChild(overlay)

    if (this._channelCache[channelId]) {
      this._renderChannelPlaylists(overlay, this._channelCache[channelId], excludePlaylistId, onRefresh)
      return
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: EVENTS.FETCH_CHANNEL_PLAYLISTS,
        payload: { channelId, excludePlaylistId }
      })

      if (response.success && response.playlists) {
        this._channelCache[channelId] = response.playlists
        this._renderChannelPlaylists(overlay, response.playlists, excludePlaylistId, onRefresh)
      } else {
        const loader = overlay.querySelector('.more-loading')
        if (loader) loader.textContent = t('no_related_found')
      }
    } catch (err) {
      const loader = overlay.querySelector('.more-loading')
      if (loader) loader.textContent = t('related_error')
    }
  }

  _renderChannelPlaylists(overlay, playlists, excludePlaylistId, onRefresh) {
    const body = overlay.querySelector('.modal-body')
    if (!body) return
    body.innerHTML = ''

    if (playlists.length === 0) {
      body.innerHTML = `<div class="more-loading">${t('no_related_found')}</div>`
      return
    }

    const grid = document.createElement('div')
    grid.className = 'channel-grid'

    for (const pl of playlists) {
      grid.appendChild(this._createChannelCard(pl, onRefresh))
    }

    body.appendChild(grid)
  }

  _createChannelCard(playlist, onRefresh) {
    const card = document.createElement('div')
    card.className = 'related-card'
    card.addEventListener('click', () => {
      const overlay = document.getElementById('channelModal')
      if (overlay) overlay.remove()
      window.dispatchEvent(new CustomEvent('yt-series-add', { detail: { playlistId: playlist.playlistId } }))
    })

    const img = document.createElement('img')
    img.className = 'related-card-thumb'
    img.src = playlist.thumbnail || ''
    img.alt = playlist.title
    img.loading = 'lazy'
    img.onerror = function () { this.src = '' }
    card.appendChild(img)

    const title = document.createElement('div')
    title.className = 'related-card-title'
    title.textContent = playlist.title
    card.appendChild(title)

    const count = document.createElement('div')
    count.className = 'related-card-count'
    const vidLabel = playlist.videoCount !== 1 ? t('videos') : t('video')
    count.textContent = `${playlist.videoCount || '?'} ${vidLabel}`
    card.appendChild(count)

    return card
  }

  _formatDuration(seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }
}

export { DetailPage }
