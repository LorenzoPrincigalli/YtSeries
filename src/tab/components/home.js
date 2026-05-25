import { t } from '../../shared/i18n.js'

class HomePage {
  renderHeroCarousel(seriesList, onContinue, onClick) {
    const section = document.createElement('section')
    section.className = 'hero-section hero-carousel'

    const slidesContainer = document.createElement('div')
    slidesContainer.className = 'hero-carousel-slides'

    let currentIndex = 0
    let autoTimer = null

    const slides = []
    const dots = []

    for (let i = 0; i < seriesList.length; i++) {
      const s = seriesList[i]
      const watchedCount = s.videos.filter(v => v.watched).length
      const progress = s.videos.length > 0 ? (watchedCount / s.videos.length) * 100 : 0

      const slide = document.createElement('div')
      slide.className = `hero-carousel-slide${i === 0 ? ' active' : ''}`
      slide.dataset.index = i

      const img = document.createElement('img')
      img.className = 'hero-backdrop'
      img.src = s.thumbnail || ''
      img.alt = s.title
      img.onerror = function () { this.src = '' }

      const gradient = document.createElement('div')
      gradient.className = 'hero-gradient'

      const content = document.createElement('div')
      content.className = 'hero-content'

      const h1 = document.createElement('h1')
      h1.className = 'hero-title'
      h1.textContent = s.title

      const subtitle = document.createElement('p')
      subtitle.className = 'hero-subtitle'
      subtitle.textContent = s.channelTitle || ''

      const progressContainer = document.createElement('div')
      progressContainer.className = 'hero-progress'
      const progressBar = document.createElement('div')
      progressBar.className = 'hero-progress-bar'
      progressBar.style.width = `${progress}%`
      progressContainer.appendChild(progressBar)

      const previewVideo = s.videos[0]
      const btnPreview = document.createElement('button')
      btnPreview.className = 'hero-btn hero-btn-preview'
      btnPreview.textContent = `\u25B6 Anteprima`
      btnPreview.addEventListener('click', (e) => {
        e.stopPropagation()
        if (previewVideo) {
          showPreview(s, previewVideo.id)
        }
      })

      const btn = document.createElement('button')
      btn.className = 'hero-btn hero-btn-play'
      const btnLabel = watchedCount > 0 ? t('continue_watching') : 'Inizia'
      btn.textContent = `\u25B6 ${btnLabel}`
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        onContinue(s)
      })

      const btnGroup = document.createElement('div')
      btnGroup.className = 'hero-btn-group'
      btnGroup.appendChild(btnPreview)
      btnGroup.appendChild(btn)

      content.appendChild(h1)
      content.appendChild(subtitle)
      content.appendChild(progressContainer)
      content.appendChild(btnGroup)

      slide.appendChild(img)
      slide.appendChild(gradient)
      slide.appendChild(content)

      slide.addEventListener('click', () => onClick(s))

      slidesContainer.appendChild(slide)
      slides.push(slide)

      const dot = document.createElement('span')
      dot.className = `hero-dot${i === 0 ? ' active' : ''}`
      dot.addEventListener('click', (e) => {
        e.stopPropagation()
        goTo(i)
      })
      dots.push(dot)
    }

    const dotsContainer = document.createElement('div')
    dotsContainer.className = 'hero-dots'
    for (const dot of dots) dotsContainer.appendChild(dot)

    section.appendChild(slidesContainer)
    section.appendChild(dotsContainer)

    function goTo(index) {
      if (index === currentIndex) return
      slides[currentIndex].classList.remove('active')
      dots[currentIndex].classList.remove('active')
      currentIndex = index
      slides[currentIndex].classList.add('active')
      dots[currentIndex].classList.add('active')
      resetAuto()
    }

    function next() {
      goTo((currentIndex + 1) % slides.length)
    }

    function resetAuto() {
      if (autoTimer) clearInterval(autoTimer)
      autoTimer = setInterval(next, 10000)
    }

    if (slides.length > 1) resetAuto()

    function showPreview(series, videoId) {
      const overlay = document.createElement('div')
      overlay.className = 'hero-preview-overlay'

      const iframe = document.createElement('iframe')
      iframe.className = 'hero-preview-iframe'
      iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=1&modestbranding=1&rel=0&iv_load_policy=3&enablejsapi=1&origin=https%3A%2F%2Fwww.youtube-nocookie.com`
      iframe.allow = 'autoplay; encrypted-media'
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')

      const closeBtn = document.createElement('button')
      closeBtn.className = 'hero-preview-close'
      closeBtn.textContent = '\u2715'
      closeBtn.addEventListener('click', () => {
        overlay.remove()
        if (autoTimer) clearInterval(autoTimer)
        if (slides.length > 1) resetAuto()
      })

      overlay.appendChild(iframe)
      overlay.appendChild(closeBtn)

      if (autoTimer) clearInterval(autoTimer)
      section.appendChild(overlay)

      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.remove()
          if (slides.length > 1) resetAuto()
        }
      }, 20000)
    }

    section.addEventListener('mouseenter', () => {
      if (autoTimer) clearInterval(autoTimer)
    })
    section.addEventListener('mouseleave', () => {
      if (slides.length > 1) resetAuto()
    })

    return section
  }

  renderRow(title, seriesList, onClick) {
    const section = document.createElement('section')
    section.className = 'series-row'

    const h2 = document.createElement('h2')
    h2.className = 'section-title'
    h2.textContent = title
    section.appendChild(h2)

    const carouselWrapper = document.createElement('div')
    carouselWrapper.className = 'carousel-wrapper'

    const btnLeft = document.createElement('button')
    btnLeft.className = 'carousel-btn carousel-btn-left'
    btnLeft.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>'

    const btnRight = document.createElement('button')
    btnRight.className = 'carousel-btn carousel-btn-right'
    btnRight.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>'

    const grid = document.createElement('div')
    grid.className = 'carousel-grid'

    for (const s of seriesList) {
      const card = this._createCard(s, onClick)
      grid.appendChild(card)
    }

    carouselWrapper.appendChild(btnLeft)
    carouselWrapper.appendChild(grid)
    carouselWrapper.appendChild(btnRight)

    const scrollAmount = 320

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
      grid.style.cursor = 'grabbing'
    })

    grid.addEventListener('mouseleave', () => {
      if (mouseDown) {
        mouseDown = false
        grid.style.cursor = ''
      }
    })

    grid.addEventListener('mouseup', () => {
      mouseDown = false
      grid.style.cursor = ''
    })

    grid.addEventListener('mousemove', (e) => {
      if (!mouseDown) return
      e.preventDefault()
      const x = e.pageX - grid.offsetLeft
      const walk = (x - startX) * 1.5
      grid.scrollLeft = scrollLeftStart - walk
    })

    section.appendChild(carouselWrapper)
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

    const carouselWrapper = document.createElement('div')
    carouselWrapper.className = 'carousel-wrapper'

    const btnLeft = document.createElement('button')
    btnLeft.className = 'carousel-btn carousel-btn-left'
    btnLeft.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>'

    const btnRight = document.createElement('button')
    btnRight.className = 'carousel-btn carousel-btn-right'
    btnRight.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>'

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
      img.loading = 'lazy'
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

    const scrollAmount = 320
    btnLeft.addEventListener('click', () => grid.scrollBy({ left: -scrollAmount, behavior: 'smooth' }))
    btnRight.addEventListener('click', () => grid.scrollBy({ left: scrollAmount, behavior: 'smooth' }))

    carouselWrapper.appendChild(btnLeft)
    carouselWrapper.appendChild(grid)
    carouselWrapper.appendChild(btnRight)
    section.appendChild(carouselWrapper)

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
    expandBtn.textContent = 'Vedi playlist'

    const playlistContainer = document.createElement('div')
    playlistContainer.className = 'channel-playlists hidden'

    expandBtn.addEventListener('click', async () => {
      if (playlistContainer.classList.contains('hidden')) {
        expandBtn.textContent = 'Caricamento...'
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
              img.loading = 'lazy'
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
            playlistContainer.innerHTML = '<p class="search-empty">Nessuna playlist trovata</p>'
          }
        } catch (err) {
          playlistContainer.innerHTML = '<p class="search-empty">Errore caricamento</p>'
        }
        expandBtn.textContent = 'Nascondi'
        expandBtn.disabled = false
      } else {
        playlistContainer.classList.add('hidden')
        expandBtn.textContent = 'Vedi playlist'
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
    const progress = series.videos.length > 0 ? (watchedCount / series.videos.length) * 100 : 0
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
    img.loading = 'lazy'
    img.onerror = function () { this.src = '' }
    thumb.appendChild(img)

    if (hasNew && !isComplete) {
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
    titleEl.textContent = series.title
    info.appendChild(titleEl)

    const subtitleEl = document.createElement('div')
    subtitleEl.className = 'card-subtitle'
    const epLabel = series.videos.length !== 1 ? t('episodes') : t('episode')
    subtitleEl.textContent = series.channelTitle
      ? `${series.channelTitle} \u00B7 ${series.videos.length} ${epLabel}`
      : `${series.videos.length} ${epLabel}`
    info.appendChild(subtitleEl)

    card.appendChild(info)

    if (previewVideo) {
      this._attachHoverPreview(thumb, img, card, previewVideo.id)
    }

    return card
  }

  _attachHoverPreview(thumbContainer, thumbImg, card, videoId) {
    let iframe = null
    let enterTimeout = null
    let checkTimeout = null
    let notice = null
    let ytReady = false
    let ytError = false

    const cleanup = () => {
      if (enterTimeout) { clearTimeout(enterTimeout); enterTimeout = null }
      if (checkTimeout) { clearTimeout(checkTimeout); checkTimeout = null }
      if (iframe) { iframe.remove(); iframe = null }
      if (notice) { notice.remove(); notice = null }
      window.removeEventListener('message', onMessage)
      ytReady = false
      ytError = false
      thumbImg.style.opacity = '1'
    }

    const showNotice = (text) => {
      notice = document.createElement('div')
      notice.className = 'card-block-notice'
      notice.textContent = text
      card.appendChild(notice)
      setTimeout(() => { if (notice) { notice.remove(); notice = null } }, 5000)
    }

    const onMessage = (e) => {
      if (!iframe || e.source !== iframe.contentWindow) return
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (data.event === 'onReady') { ytReady = true }
        if (data.event === 'onError') { ytError = true }
      } catch (_) { /* ignore non-JSON messages */ }
    }

    thumbContainer.addEventListener('mouseenter', () => {
      enterTimeout = setTimeout(() => {
        if (iframe) return

        iframe = document.createElement('iframe')
        iframe.className = 'card-preview-iframe'
        iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&enablejsapi=1&origin=https%3A%2F%2Fwww.youtube-nocookie.com&modestbranding=1&rel=0&iv_load_policy=3&fs=0&disablekb=1`
        iframe.allow = 'autoplay'
        iframe.setAttribute('loading', 'lazy')
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')

        window.addEventListener('message', onMessage)
        thumbImg.style.opacity = '0'
        thumbContainer.appendChild(iframe)

        checkTimeout = setTimeout(() => {
          if (!iframe) return
          window.removeEventListener('message', onMessage)

          if (ytError) {
            iframe.style.display = 'none'
            thumbImg.style.opacity = '1'
            showNotice(t('embed_error'))
          } else if (!ytReady) {
            iframe.style.display = 'none'
            thumbImg.style.opacity = '1'
            showNotice(t('preview_blocked'))
          }
        }, 3000)
      }, 600)
    })

    thumbContainer.addEventListener('mouseleave', cleanup)
  }
}

export { HomePage }
