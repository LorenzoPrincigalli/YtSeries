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
    close.textContent = '\u00D7'
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

  async render(series, { onWatch, onBack, onRefresh, onCompleteToggle }) {
    this.series = series
    this.callbacks = { onWatch, onBack, onRefresh, onCompleteToggle }

    const body = document.getElementById('detailModalBody')
    body.innerHTML = ''

    body.appendChild(this._renderInfo(series))
    body.appendChild(this._renderEpisodes(series))
    body.appendChild(this._renderMoreSection(series))

    document.getElementById('detailModal').classList.remove('hidden')
    document.body.style.overflow = 'hidden'

    this._loadRelatedPlaylists(series)
  }

  close() {
    document.getElementById('detailModal').classList.add('hidden')
    document.body.style.overflow = ''
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
        window.open(`https://www.youtube.com/watch?v=${nextEpisode.id}&list=${series.playlistId}`, '_blank')
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
    refresh.textContent = `\u21BB ${t('refresh')}`
    refresh.addEventListener('click', () => this.callbacks.onRefresh(series.playlistId))
    actions.appendChild(refresh)

    const del = document.createElement('button')
    del.className = 'btn-secondary'
    del.style.color = 'var(--primary)'
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

    const header = document.createElement('div')
    header.className = 'episodes-header'

    const h3 = document.createElement('h3')
    h3.textContent = t('episodes_title')
    header.appendChild(h3)

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
    header.appendChild(sortSelect)
    section.appendChild(header)

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
        grid.appendChild(this._createEpisodeCard(series, v, originalIndex >= 0 ? originalIndex : i))
      })
    }

    renderEpisodes(sortSelect.value)
    sortSelect.addEventListener('change', () => renderEpisodes(sortSelect.value))

    section.appendChild(grid)
    return section
  }

  _createEpisodeCard(series, video, index) {
    const card = document.createElement('div')
    card.className = 'episode-card'
    card.dataset.videoId = video.id

    card.addEventListener('click', () => {
      if (!video.watched) {
        this.callbacks.onWatch(series.playlistId, video.id)
      }
      window.open(`https://www.youtube.com/watch?v=${video.id}&list=${series.playlistId}`, '_blank')
    })

    const img = document.createElement('img')
    img.className = 'episode-thumb'
    img.src = video.thumbnail || ''
    img.alt = video.title
    img.loading = 'lazy'
    img.onerror = function () { this.src = '' }
    card.appendChild(img)

    const info = document.createElement('div')
    info.className = 'episode-info'

    const num = document.createElement('div')
    num.className = 'episode-number'
    const dur = video.duration ? this._formatDuration(video.duration) : ''
    num.textContent = `${t('episode')} ${index + 1}${dur ? ` \u00B7 ${dur}` : ''}`
    info.appendChild(num)

    const title = document.createElement('div')
    title.className = 'episode-title'
    title.textContent = video.title
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
      this.callbacks.onRefresh(playlist.playlistId)
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
    overlay.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal">
        <div class="modal-header">
          <h2>${t('delete_series')}</h2>
        </div>
        <div class="modal-body">
          <p>${t('delete_confirm', { title: series.title })}</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="cancelDeleteBtn">${t('cancel')}</button>
          <button class="btn-primary" id="confirmDeleteBtn" style="background:var(--primary)">${t('delete')}</button>
        </div>
      </div>
    `
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove()
    })
    document.body.appendChild(overlay)

    overlay.querySelector('#cancelDeleteBtn').onclick = () => overlay.remove()
    overlay.querySelector('#confirmDeleteBtn').onclick = async () => {
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
    overlay.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal modal-channel">
        <div class="modal-header">
          <button class="modal-close channel-close-btn">&times;</button>
          <h2>${t('more_from', { channel: channelTitle })}</h2>
        </div>
        <div class="modal-body">
          <div class="more-loading">${t('loading')}</div>
        </div>
      </div>
    `
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
