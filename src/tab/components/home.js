import { t } from '../../shared/i18n.js'

class HomePage {
  constructor() {
    this.isPro = false
    this._heroTimer = null
  }

  setPro(isPro) {
    this.isPro = isPro
  }

  destroy() {
    if (this._heroTimer) {
      clearInterval(this._heroTimer)
      this._heroTimer = null
    }
  }

  renderFeaturedHero(seriesList, onContinue, onClick) {
    const section = document.createElement('section')
    section.className = 'hero-featured'

    const grid = document.createElement('div')
    grid.className = 'hero-featured-grid'

    const take = Math.min(seriesList.length, 3)

    for (let i = 0; i < take; i++) {
      const s = seriesList[i]
      const watchedCount = s.videos.filter(v => v.watched).length
      let lastWatched = null;
      for (const v of s.videos) {
        if ((v.watched || v.progress > 0) && v.watchedAt) {
          if (!lastWatched || v.watchedAt > lastWatched.watchedAt) lastWatched = v;
        }
      }
      if (!lastWatched) {
        for (let j = s.videos.length - 1; j >= 0; j--) {
          if (s.videos[j].progress > 0 || s.videos[j].watched) {
            lastWatched = s.videos[j];
            break;
          }
        }
      }
      const progress = lastWatched ? (lastWatched.watched ? 100 : (lastWatched.progress || 0)) : 0;

      const card = document.createElement('div')
      card.className = `hero-featured-card${take === 3 && i === 2 ? ' hero-featured-tall' : ''}`
      card.addEventListener('click', () => onClick(s))

      const img = document.createElement('img')
      img.className = 'hero-featured-img'
      img.src = s.thumbnail || ''
      img.alt = s.title
      img.onerror = function () { this.src = '' }

      const gradient = document.createElement('div')
      gradient.className = 'hero-featured-gradient'

      const content = document.createElement('div')
      content.className = 'hero-featured-content'

      const h3 = document.createElement('h3')
      h3.className = 'hero-featured-title'
      h3.textContent = s.title

      const subtitle = document.createElement('p')
      subtitle.className = 'hero-featured-subtitle'
      subtitle.textContent = s.channelTitle || ''

      const progressOuter = document.createElement('div')
      progressOuter.className = 'hero-featured-progress'
      const progressBar = document.createElement('div')
      progressBar.className = 'hero-featured-progress-bar'
      progressBar.style.width = `${progress}%`
      progressOuter.appendChild(progressBar)

      const btn = document.createElement('button')
      btn.className = 'hero-featured-btn'
      const btnLabel = watchedCount > 0 ? t('continue_watching') : t('start')
      btn.textContent = `\u25B6 ${btnLabel}`
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        onContinue(s)
      })

      content.appendChild(h3)
      content.appendChild(subtitle)
      content.appendChild(progressOuter)
      content.appendChild(btn)

      card.appendChild(img)
      card.appendChild(gradient)
      card.appendChild(content)

      grid.appendChild(card)
    }

    section.appendChild(grid)
    return section
  }

  renderRow(title, seriesList, onClick) {
    const section = document.createElement('section')
    section.className = 'series-row'

    const h2 = document.createElement('h2')
    h2.className = 'section-title'
    h2.textContent = title
    section.appendChild(h2)

    const btnLeft = document.createElement('button')
    btnLeft.className = 'carousel-btn carousel-btn-left'
    btnLeft.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>'

    const btnRight = document.createElement('button')
    btnRight.className = 'carousel-btn carousel-btn-right'
    btnRight.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>'

    const carouselWrapper = document.createElement('div')
    carouselWrapper.className = 'carousel-wrapper'

    const grid = document.createElement('div')
    grid.className = 'carousel-grid'

    for (let i = 0; i < seriesList.length; i++) {
      const card = this._createCard(seriesList[i], onClick)
      card.style.setProperty('--i', i)
      card.classList.add('card-reveal')
      grid.appendChild(card)
    }

    carouselWrapper.appendChild(grid)

    const scrollAmount = 312

    btnLeft.addEventListener('click', () => {
      grid.scrollBy({ left: -scrollAmount, behavior: 'smooth' })
    })

    btnRight.addEventListener('click', () => {
      grid.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    })

    let mouseDown = false
    let startX = 0
    let scrollLeftStart = 0

    grid.addEventListener('mousedown', (e) => {
      mouseDown = true
      startX = e.pageX - grid.offsetLeft
      scrollLeftStart = grid.scrollLeft
      grid.classList.add('dragging')
    })

    grid.addEventListener('mouseleave', () => {
      if (mouseDown) {
        mouseDown = false
        grid.classList.remove('dragging')
      }
    })

    grid.addEventListener('mouseup', () => {
      mouseDown = false
      grid.classList.remove('dragging')
    })

    grid.addEventListener('mousemove', (e) => {
      if (!mouseDown) return
      e.preventDefault()
      const x = e.pageX - grid.offsetLeft
      const walk = (x - startX) * 1.5
      grid.scrollLeft = scrollLeftStart - walk
    })

    section.appendChild(btnLeft)
    section.appendChild(carouselWrapper)
    section.appendChild(btnRight)
    return section
  }

  renderSearchPlaylists(playlists, onAdd, title) {
    if (!playlists || playlists.length === 0) return document.createDocumentFragment()

    const section = document.createElement('section')
    section.className = 'series-row'

    const h2 = document.createElement('h2')
    h2.className = 'section-title'
    h2.textContent = title || 'YouTube Playlists'
    section.appendChild(h2)

    const btnLeft = document.createElement('button')
    btnLeft.className = 'carousel-btn carousel-btn-left'
    btnLeft.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>'

    const btnRight = document.createElement('button')
    btnRight.className = 'carousel-btn carousel-btn-right'
    btnRight.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>'

    const carouselWrapper = document.createElement('div')
    carouselWrapper.className = 'carousel-wrapper'

    const grid = document.createElement('div')
    grid.className = 'carousel-grid'

    for (const pl of playlists) {
      const card = document.createElement('div')
      card.className = 'series-card search-playlist-card'
      card.dataset.id = pl.playlistId

      const thumb = document.createElement('div')
      thumb.className = 'card-thumbnail'

      const img = document.createElement('img')
      img.className = 'card-thumb-img'
      img.src = pl.thumbnail || ''
      img.alt = pl.title
      img.onerror = function () { this.src = '' }
      thumb.appendChild(img)

      const addOverlay = document.createElement('div')
      addOverlay.className = 'card-add-overlay'
      addOverlay.textContent = '+'
      addOverlay.addEventListener('click', (e) => {
        e.stopPropagation()
        onAdd(pl)
      })
      thumb.appendChild(addOverlay)

      card.appendChild(thumb)

      const info = document.createElement('div')
      info.className = 'card-info'

      const titleEl = document.createElement('div')
      titleEl.className = 'card-title'
      titleEl.textContent = pl.title
      info.appendChild(titleEl)

      const subtitleEl = document.createElement('div')
      subtitleEl.className = 'card-subtitle'
      subtitleEl.textContent = pl.channelTitle || ''
      info.appendChild(subtitleEl)

      card.appendChild(info)

      card.addEventListener('click', () => onAdd(pl))

      grid.appendChild(card)
    }

    const scrollAmount = 312
    btnLeft.addEventListener('click', () => grid.scrollBy({ left: -scrollAmount, behavior: 'smooth' }))
    btnRight.addEventListener('click', () => grid.scrollBy({ left: scrollAmount, behavior: 'smooth' }))

    section.appendChild(btnLeft)
    carouselWrapper.appendChild(grid)
    section.appendChild(carouselWrapper)
    section.appendChild(btnRight)

    return section
  }

  renderChannelCard(channel, onPlaylistClick, onFetchPlaylists) {
    const section = document.createElement('section')
    section.className = 'channel-section'

    const card = document.createElement('div')
    card.className = 'channel-card'

    const avatar = document.createElement('img')
    avatar.className = 'channel-avatar'
    avatar.src = channel.thumbnail || ''
    avatar.alt = channel.title

    const info = document.createElement('div')
    info.className = 'channel-info'

    const title = document.createElement('div')
    title.className = 'channel-title'
    title.textContent = channel.title

    const desc = document.createElement('div')
    desc.className = 'channel-desc'
    desc.textContent = channel.description || ''

    info.appendChild(title)
    info.appendChild(desc)

    const expandBtn = document.createElement('button')
    expandBtn.className = 'btn-primary channel-expand-btn'
    expandBtn.textContent = t('see_playlists')

    const playlistContainer = document.createElement('div')
    playlistContainer.className = 'channel-playlists hidden'

    expandBtn.addEventListener('click', async () => {
      if (playlistContainer.classList.contains('hidden')) {
        expandBtn.textContent = t('loading_dots')
        expandBtn.disabled = true
        playlistContainer.classList.remove('hidden')
        try {
          const playlists = await onFetchPlaylists(channel.channelId)
          if (playlists && playlists.length > 0) {
            playlistContainer.innerHTML = ''
            const grid = document.createElement('div')
            grid.className = 'carousel-grid'
            for (const pl of playlists) {
              const plCard = document.createElement('div')
              plCard.className = 'series-card channel-playlist-card'

              const thumb = document.createElement('div')
              thumb.className = 'card-thumbnail'
              const img = document.createElement('img')
              img.className = 'card-thumb-img'
              img.src = pl.thumbnail || ''
              img.alt = pl.title
              thumb.appendChild(img)
              plCard.appendChild(thumb)

              const infoEl = document.createElement('div')
              infoEl.className = 'card-info'
              const titleEl = document.createElement('div')
              titleEl.className = 'card-title'
              titleEl.textContent = pl.title
              infoEl.appendChild(titleEl)
              const subtitleEl = document.createElement('div')
              subtitleEl.className = 'card-subtitle'
              subtitleEl.textContent = `${pl.videoCount || '?'} video`
              infoEl.appendChild(subtitleEl)
              plCard.appendChild(infoEl)

              plCard.addEventListener('click', () => onPlaylistClick(pl))

              const addBtn = document.createElement('button')
              addBtn.className = 'card-add-overlay'
              addBtn.textContent = '+'
              addBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                onPlaylistClick(pl)
              })
              thumb.appendChild(addBtn)

              grid.appendChild(plCard)
            }
            playlistContainer.appendChild(grid)
          } else {
            playlistContainer.innerHTML = `<p class="search-empty">${t('no_playlists_found')}</p>`
          }
        } catch (err) {
          playlistContainer.innerHTML = `<p class="search-empty">${t('load_error')}</p>`
        }
        expandBtn.textContent = t('hide')
        expandBtn.disabled = false
      } else {
        playlistContainer.classList.add('hidden')
    expandBtn.textContent = t('see_playlists')
      }
    })

    card.appendChild(avatar)
    card.appendChild(info)
    card.appendChild(expandBtn)
    section.appendChild(card)
    section.appendChild(playlistContainer)

    return section
  }

  _getPreviewVideo(series) {
    const unwatched = series.videos.find(v => !v.watched)
    return unwatched || series.videos[0] || null
  }

  _createCard(series, onClick) {
    const watchedCount = series.videos.filter(v => v.watched).length
    // Mostra la barra solo per il video in corso (non watched, ma con progress > 0), oppure 100% se tutti sono watched
    let progress = 0;
    const inProgress = series.videos.find(v => !v.watched && v.progress > 0);
    if (inProgress) {
      progress = inProgress.progress || 0;
    } else if (series.videos.length > 0 && series.videos.every(v => v.watched)) {
      progress = 100;
    }
    const isComplete = series.completed || (series.videos.length > 0 && watchedCount === series.videos.length)
    const hasNew = series.newEpisodesCount > 0
    const previewVideo = this._getPreviewVideo(series)

    const card = document.createElement('div')
    card.className = 'series-card'
    card.dataset.id = series.playlistId
    card.addEventListener('click', () => onClick(series))

    const thumb = document.createElement('div')
    thumb.className = 'card-thumbnail'

    const img = document.createElement('img')
    img.className = 'card-thumb-img'
    img.src = series.thumbnail || ''
    img.alt = series.title
    img.onerror = function () { this.src = '' }
    thumb.appendChild(img)

    const playOverlay = document.createElement('div')
    playOverlay.className = 'card-play-overlay'
    const playBtn = document.createElement('button')
    playBtn.className = 'card-play-btn'
    playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (previewVideo) {
        window.open(`https://www.youtube.com/watch?v=${previewVideo.id}&list=${series.playlistId}`, '_blank', 'noopener')
      }
    })
    playOverlay.appendChild(playBtn)
    thumb.appendChild(playOverlay)

    if (hasNew && this.isPro && !isComplete) {
      const badge = document.createElement('span')
      badge.className = 'card-badge card-badge-new'
      badge.textContent = t('new_badge', { n: series.newEpisodesCount })
      thumb.appendChild(badge)
    } else if (isComplete && series.videos.length > 0) {
      const badge = document.createElement('span')
      badge.className = 'card-badge card-badge-complete'
      badge.textContent = t('done')
      thumb.appendChild(badge)
    }

    const progressOverlay = document.createElement('div')
    progressOverlay.className = 'card-progress-overlay'

    const progressBar = document.createElement('div')
    progressBar.className = 'card-progress-bar'
    progressBar.style.width = `${progress}%`
    progressOverlay.appendChild(progressBar)
    thumb.appendChild(progressOverlay)

    card.appendChild(thumb)

    const info = document.createElement('div')
    info.className = 'card-info'

    const titleEl = document.createElement('div')
    titleEl.className = 'card-title'
    titleEl.textContent = series.title || 'Untitled'
    info.appendChild(titleEl)

    const subtitleEl = document.createElement('div')
    subtitleEl.className = 'card-subtitle'
    const epLabel = series.videos.length !== 1 ? t('episodes') : t('episode')
    subtitleEl.textContent = series.channelTitle
      ? `${series.channelTitle} \u00B7 ${series.videos.length} ${epLabel}`
      : `${series.videos.length} ${epLabel}`
    info.appendChild(subtitleEl)

    // Netflix-style hover: show next episode thumbnail + title
    const nextEp = (() => {
      if (series.completed || series.videos.length === 0) return null
      const unwatched = series.videos.find(v => !v.watched)
      if (unwatched) return unwatched
      return null
    })()
    if (nextEp) {
      const nextOverlay = document.createElement('div')
      nextOverlay.className = 'card-next-overlay'

      const nextImg = document.createElement('img')
      nextImg.className = 'card-next-img'
      nextImg.src = nextEp.thumbnail || ''
      nextImg.alt = nextEp.title
      nextImg.loading = 'lazy'
      nextOverlay.appendChild(nextImg)

      const nextLabel = document.createElement('div')
      nextLabel.className = 'card-next-label'
      nextLabel.textContent = nextEp.title
      nextOverlay.appendChild(nextLabel)

      thumb.appendChild(nextOverlay)
    }

    card.appendChild(info)

    return card
  }
}

export { HomePage }
