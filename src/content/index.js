const EVENTS = {
  OPEN_SERIES_TAB: 'OPEN_SERIES_TAB',
  EPISODE_WATCH: 'EPISODE_WATCH',
  EPISODE_PROGRESS: 'EPISODE_PROGRESS',
  GET_NEXT_EPISODE: 'GET_NEXT_EPISODE',
  PLAYLIST_ADD: 'PLAYLIST_ADD',
  PLAYLIST_EXISTS: 'PLAYLIST_EXISTS',
  STATE_GET: 'STATE_GET'
}

const TRANSLATIONS = {
  en: {
    nextEpisode: 'Next Episode',
    watchNext: 'Watch Next',
    added: 'Added',
    addToSeries: 'Add to Series'
  },
  it: {
    nextEpisode: 'Prossimo Episodio',
    watchNext: 'Guarda Prossimo',
    added: 'Aggiunto',
    addToSeries: 'Aggiungi a Serie'
  }
}

let currentVideoId = null
let currentPlaylistId = null
let videoEndListener = null
let videoDetectionInterval = null
let progressInterval = null
let progressSaveTimeout = null
let lastProgressSent = null
let nextEpisodeOverlay = null
let isContextValid = true
let playerMode = 'normal' // normal, cinema, full, mini
let addSeriesButtonInjected = false

function cleanupVideoListener() {
  if (videoDetectionInterval) {
    clearInterval(videoDetectionInterval)
    videoDetectionInterval = null
  }
  if (progressInterval) {
    clearInterval(progressInterval)
    progressInterval = null
  }
  if (progressSaveTimeout) {
    clearTimeout(progressSaveTimeout)
    progressSaveTimeout = null
  }
  if (videoEndListener) {
    videoEndListener.video.removeEventListener('ended', videoEndListener.handler)
    videoEndListener = null
  }
  if (nextEpisodeOverlay) {
    nextEpisodeOverlay.remove()
    nextEpisodeOverlay = null
  }
  lastProgressSent = null
}

function detectPlayerMode() {
  // YouTube player mode detection
  const theaterMode = document.querySelector('ytd-watch-flexy[theater-mode]') !== null
  const fullscreen = document.fullscreenElement !== null
  const miniPlayer = document.querySelector('.ytp-miniplayer') !== null

  if (miniPlayer) {
    return 'mini'
  } else if (fullscreen) {
    return 'full'
  } else if (theaterMode) {
    return 'cinema'
  } else {
    return 'normal'
  }
}

function updateOverlayPosition() {
  if (!nextEpisodeOverlay) return

  const mode = detectPlayerMode()
  playerMode = mode

  // Remove existing mode classes
  nextEpisodeOverlay.classList.remove('mode-normal', 'mode-cinema', 'mode-full', 'mode-mini')
  nextEpisodeOverlay.classList.add(`mode-${mode}`)
}

function safeSendMessage(message, callback) {
  if (!isContextValid || !chrome.runtime?.sendMessage) {
    if (callback) callback({ success: false, error: 'CONTEXT_INVALIDATED' })
    return
  }
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message
        if (error.includes('Extension context invalidated') || error.includes('message port closed')) {
          isContextValid = false
          cleanupVideoListener()
        }
        if (callback) callback({ success: false, error: 'CONTEXT_INVALIDATED' })
      } else if (callback) {
        callback(response)
      }
    })
  } catch (err) {
    isContextValid = false
    cleanupVideoListener()
    if (callback) callback({ success: false, error: 'CONTEXT_INVALIDATED' })
  }
}

function setupVideoEndDetection(videoId, playlistId) {
  cleanupVideoListener()

  let attempts = 0
  let paused = false

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      paused = true
      if (videoDetectionInterval) {
        clearInterval(videoDetectionInterval)
        videoDetectionInterval = null
      }
    } else {
      paused = false
      if (!videoDetectionInterval) startPolling()
    }
  })

  function startPolling() {
    videoDetectionInterval = setInterval(() => {
      attempts++
      const video = document.querySelector('.video-stream, .html5-main-video')
      if (video) {
        clearInterval(videoDetectionInterval)
        videoDetectionInterval = null

        // Monitoraggio progresso con throttling e debouncing (Netflix-style)
        if (progressInterval) clearInterval(progressInterval)
        progressInterval = setInterval(() => {
          try {
            if (!video.paused && !video.ended && video.currentTime > 0 && video.duration > 0) {
              const progress = Math.min(99, Math.round((video.currentTime / video.duration) * 100))
              const currentTime = Math.round(video.currentTime)
              const duration = Math.round(video.duration)

              // Mostra overlay Next Episode quando mancano 30 secondi alla fine
              const timeRemaining = duration - currentTime
              if (timeRemaining <= 30 && timeRemaining > 0 && !nextEpisodeOverlay && playlistId) {
                showNextEpisodeOverlay(videoId, playlistId)
              }

              // Debouncing: salva solo dopo 3 secondi di inattività
              if (progressSaveTimeout) {
                clearTimeout(progressSaveTimeout)
              }

              progressSaveTimeout = setTimeout(() => {
                // Throttling: non salvare più spesso di ogni 10 secondi
                const now = Date.now()
                if (!lastProgressSent || (now - lastProgressSent) >= 10000) {
                  safeSendMessage({
                    type: EVENTS.EPISODE_PROGRESS,
                    payload: {
                      videoId,
                      playlistId: playlistId || '',
                      progress,
                      currentTime,
                      duration
                    }
                  })
                  lastProgressSent = now
                }
              }, 3000) // 3 secondi di debouncing
            }
          } catch (_) {}
        }, 5000) // check ogni 5 secondi

        const onEnded = () => {
          safeSendMessage({
            type: EVENTS.EPISODE_WATCH,
            payload: { videoId, playlistId: playlistId || '' }
          })
        }

        video.addEventListener('ended', onEnded)
        videoEndListener = { video, handler: onEnded }
      } else if (attempts > 40) {
        clearInterval(videoDetectionInterval)
        videoDetectionInterval = null
      }
    }, 500)
  }

  startPolling()
}

function isMusicVideo() {
  // Check if the video is a music video by looking at YouTube's category
  const categoryElement = document.querySelector('meta[itemprop="genre"]')
  if (categoryElement) {
    const genre = categoryElement.content.toLowerCase()
    if (genre.includes('music') || genre.includes('music video')) {
      return true
    }
  }

  // Check if the video is in the Music category via YouTube's data
  const categoryBadge = document.querySelector('.badge-style-type-live')
  if (categoryBadge && categoryBadge.textContent.includes('Music')) {
    return true
  }

  // Check if the playlist is a music playlist
  const playlistTitle = document.querySelector('#header .yt-dynamic-text-view-model')
  if (playlistTitle && playlistTitle.textContent.toLowerCase().includes('music')) {
    return true
  }

  return false
}

function showNextEpisodeOverlay(videoId, playlistId) {
  if (nextEpisodeOverlay) return

  // Don't show overlay for music videos
  if (isMusicVideo()) {
    return
  }

  // Check if playlist is saved in the extension
  safeSendMessage({
    type: EVENTS.PLAYLIST_EXISTS,
    payload: { playlistId }
  }, (existsResponse) => {
    if (!existsResponse || !existsResponse.success || !existsResponse.exists) {
      return // Playlist not saved in extension
    }

    // Check if overlay is enabled in settings
    safeSendMessage({ type: EVENTS.STATE_GET }, (response) => {
      if (response && response.success && response.state && response.state.settings) {
        if (!response.state.settings.nextEpisodeOverlay) {
          return // Overlay disabled in settings
        }
      }

      safeSendMessage({
        type: EVENTS.GET_NEXT_EPISODE,
        payload: { videoId, playlistId }
      }, (nextResponse) => {
        if (nextResponse && nextResponse.success && nextResponse.nextEpisode) {
          createNextEpisodeOverlay(nextResponse.nextEpisode, playlistId, videoId)
        }
      })
    })
  })
}

function createNextEpisodeOverlay(nextEpisode, playlistId, currentVideoId) {
  // Get language from settings
  safeSendMessage({ type: EVENTS.STATE_GET }, (response) => {
    if (!response || !response.success || !response.state) return

    const language = response.state.settings.language || 'system'
    const lang = language === 'system' ? (navigator.language || 'en').split('-')[0] : language
    const t = TRANSLATIONS[lang] || TRANSLATIONS.en

    nextEpisodeOverlay = document.createElement('div')
    nextEpisodeOverlay.className = 'yt-series-next-overlay'
    nextEpisodeOverlay.innerHTML = `
      <div class="yt-series-next-content">
        <div class="yt-series-next-info">
          <div class="yt-series-next-label">${t.nextEpisode}</div>
          <div class="yt-series-next-title">${nextEpisode.title}</div>
        </div>
        <button class="yt-series-next-btn" id="ytSeriesNextBtn">
          <span class="yt-series-next-icon">▶</span>
          <span>${t.watchNext}</span>
        </button>
      </div>
    `

    document.body.appendChild(nextEpisodeOverlay)

    // Set initial position based on current mode
    updateOverlayPosition()

    // Listen for player mode changes
    const modeObserver = new MutationObserver(() => {
      updateOverlayPosition()
    })

    const playerContainer = document.querySelector('ytd-watch-flexy')
    if (playerContainer) {
      modeObserver.observe(playerContainer, { attributes: true, attributeFilter: ['theater-mode'] })
    }

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', updateOverlayPosition)

    document.getElementById('ytSeriesNextBtn').addEventListener('click', () => {
      // Marca episodio corrente come visto
      safeSendMessage({
        type: EVENTS.EPISODE_WATCH,
        payload: { videoId: currentVideoId, playlistId }
      })

      // Apre il prossimo episodio
      window.location.href = `https://www.youtube.com/watch?v=${nextEpisode.id}&list=${playlistId}`
    })
  })
}

function handlePageNavigation() {
  const url = new URL(window.location.href)
  const videoId = url.searchParams.get('v')

  if (videoId && videoId !== currentVideoId) {
    currentVideoId = videoId
    const listId = url.searchParams.get('list')
    setupVideoEndDetection(videoId, listId)
  } else if (!videoId) {
    currentVideoId = null
    cleanupVideoListener()
  }

  tryInject()
}

function isOverlayActive() {
  return !!document.querySelector('[aria-modal="true"], ytd-consent-bump-v2-renderer')
}

function getYouTubeTextColor() {
  const existing = document.querySelector('ytd-guide-entry-renderer a#endpoint')
  if (existing) {
    return window.getComputedStyle(existing).color
  }
  return '#f1f1f1'
}

function getYouTubeHoverBg() {
  const existing = document.querySelector('ytd-guide-entry-renderer a#endpoint')
  if (existing) {
    const hover = document.createElement('div')
    hover.style.cssText = 'display:none;background:var(--yt-spec-badge-chip-background)'
    document.body.appendChild(hover)
    const bg = window.getComputedStyle(hover).background
    hover.remove()
    if (bg && bg !== 'rgba(0, 0, 0, 0)') return bg
  }
  return 'rgba(255,255,255,0.1)'
}

function ensureStyles() {
  if (document.getElementById('yt-series-style')) return
  const color = getYouTubeTextColor()
  const hoverBg = getYouTubeHoverBg()
  const style = document.createElement('style')
  style.id = 'yt-series-style'
  style.textContent = `
    #yt-series-section-title {
      display: block;
      padding: 6px 24px;
      font-size: 13px;
      font-weight: 500;
      color: ${color};
      opacity: 0.7;
    }
    #yt-series-link {
      display: flex;
      align-items: center;
      padding: 0 24px;
      height: 40px;
      cursor: pointer;
      color: ${color};
      text-decoration: none;
      font-size: 14px;
      font-weight: 400;
      transition: background 0.15s;
    }
    #yt-series-link:hover {
      background: ${hoverBg};
    }
    #yt-series-link .yt-series-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      margin-right: 24px;
      flex-shrink: 0;
    }
    #yt-series-link .yt-series-icon img {
      width: 24px;
      height: 24px;
    }
    #yt-series-link .yt-series-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .yt-series-next-overlay {
      position: fixed;
      bottom: 100px;
      right: 24px;
      z-index: 9999;
      animation: slideIn 0.3s ease;
    }
    .yt-series-next-overlay.mode-cinema {
      bottom: 80px;
      right: 40px;
    }
    .yt-series-next-overlay.mode-full {
      bottom: 60px;
      right: 60px;
    }
    .yt-series-next-overlay.mode-mini {
      bottom: 20px;
      right: 20px;
      transform: scale(0.8);
    }
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    .yt-series-next-content {
      background: rgba(0, 0, 0, 0.9);
      border-radius: 12px;
      padding: 16px;
      min-width: 280px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .yt-series-next-info {
      margin-bottom: 12px;
    }
    .yt-series-next-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #ff0000;
      margin-bottom: 4px;
    }
    .yt-series-next-title {
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .yt-series-next-btn {
      width: 100%;
      padding: 12px 16px;
      background: #ff0000;
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s, transform 0.1s;
    }
    .yt-series-next-btn:hover {
      background: #cc0000;
    }
    .yt-series-next-btn:active {
      transform: scale(0.98);
    }
    .yt-series-next-icon {
      font-size: 16px;
    }
  `
  document.head.appendChild(style)
}

function injectSidebarLink() {
  if (document.querySelector('#yt-series-sidebar-section')) return

  const sections = document.querySelectorAll('ytd-guide-section-renderer')
  if (sections.length < 2) return

  const section = document.createElement('div')
  section.id = 'yt-series-sidebar-section'

  const title = document.createElement('div')
  title.id = 'yt-series-section-title'
  title.textContent = 'YT Series'

  const entry = document.createElement('div')
  entry.id = 'yt-series-sidebar-link'

  const link = document.createElement('a')
  link.id = 'yt-series-link'
  link.href = '#'

  const icon = document.createElement('span')
  icon.className = 'yt-series-icon'
  const img = document.createElement('img')
  img.src = chrome.runtime.getURL('icons/icon16.png')
  img.alt = ''
  icon.appendChild(img)

  const label = document.createElement('span')
  label.className = 'yt-series-label'
  label.textContent = 'YT Series'

  link.appendChild(icon)
  link.appendChild(label)

  link.addEventListener('click', (e) => {
    e.preventDefault()
    safeSendMessage({ type: EVENTS.OPEN_SERIES_TAB })
  })

  entry.appendChild(link)
  section.appendChild(title)
  section.appendChild(entry)

  const lastSection = sections[sections.length - 1]
  lastSection.parentNode.insertBefore(section, lastSection)
}

function injectAddToSeriesButton() {
  if (addSeriesButtonInjected) return
  if (document.querySelector('#yt-series-add-btn')) {
    addSeriesButtonInjected = true
    return
  }

  const url = new URL(window.location.href)
  const playlistId = url.searchParams.get('list')
  if (!playlistId) return

  // Find the playlist action menu (where loop and shuffle buttons are)
  const actionBar = document.querySelector('#playlist-action-menu #top-level-buttons-computed')

  // Also try the page header
  const pageHeader = document.querySelector('#page-manager > ytd-browse > yt-page-header-renderer > yt-page-header-view-model > div.ytPageHeaderViewModelScrollContainer')

  const targetContainer = actionBar || pageHeader

  if (!targetContainer) {
    return
  }

  // Use browser language for simplicity
  const lang = (navigator.language || 'en').split('-')[0]
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en

  const button = document.createElement('button')
  button.id = 'yt-series-add-btn'
  button.style.cssText = `
    background: #f1f1f1;
    color: #0f0f0f;
    border: none;
    border-radius: 18px;
    padding: 0 16px;
    height: 36px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
    white-space: nowrap;
    flex-shrink: 0;
  `
  button.setAttribute('aria-label', 'Aggiungi a TvSeries')
  button.innerHTML = `
    <span>Aggiungi a TvSeries</span>
  `

  button.addEventListener('click', () => {
    const playlistUrl = window.location.href
    safeSendMessage({
      type: EVENTS.PLAYLIST_ADD,
      payload: { url: playlistUrl }
    }, (addResponse) => {
      if (addResponse && addResponse.success) {
        button.innerHTML = `
          <span>Vedi su YT Series</span>
        `
        button.disabled = true
        button.style.background = '#e8e8e8'
        setTimeout(() => {
          button.innerHTML = `
            <span>Aggiungi a TvSeries</span>
          `
          button.disabled = false
          button.style.background = '#f1f1f1'
        }, 3000)
      } else if (addResponse && addResponse.error === 'LIMIT_REACHED') {
        alert('Hai raggiunto il limite di serie gratuite. Passa a Pro per serie illimitate.')
      } else if (addResponse && addResponse.error) {
        console.error('[YT Series] Error adding playlist:', addResponse.error)
      }
    })
  })

  targetContainer.appendChild(button)
  addSeriesButtonInjected = true
}

let observer = null

function tryInject() {
  if (isOverlayActive()) {
    setTimeout(tryInject, 1000)
    return
  }

  const sections = document.querySelectorAll('ytd-guide-section-renderer')
  if (sections.length >= 2 && !document.querySelector('#yt-series-sidebar-section')) {
    injectSidebarLink()
  }

  injectAddToSeriesButton()
}

function startObserver() {
  ensureStyles()
  tryInject()
  observer = new MutationObserver(() => {
    if (!document.querySelector('#yt-series-sidebar-section')) {
      tryInject()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  document.addEventListener('yt-navigate-finish', handlePageNavigation)
  handlePageNavigation()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver)
} else {
  startObserver()
}
