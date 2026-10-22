// NOTE: Content scripts in MV3 cannot use ES module imports.
// Keep EVENTS in sync with src/shared/events.js (enforced by contentEventsSync.test.js).
// Keep TRANSLATIONS in sync with src/shared/i18n.js.

const EVENTS = {
  STATE_UPDATED: 'STATE_UPDATED',
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
    close: 'Close',
    added: 'Added',
    addToSeries: 'Add to Series',
    viewOnYtSeries: 'View on YT Series',
    adding: 'Adding...',
    extensionUnavailable: 'Extension not available. Reload the page.',
    unknownError: 'Unknown error',
    couldNotAdd: 'Could not add series'
  },
  it: {
    nextEpisode: 'Prossimo Episodio',
    watchNext: 'Guarda Prossimo',
    close: 'Chiudi',
    added: 'Aggiunto',
    addToSeries: 'Aggiungi a Serie',
    viewOnYtSeries: 'Vedi su YT Series',
    adding: 'Aggiunta in corso...',
    extensionUnavailable: 'Estensione non disponibile. Ricarica la pagina.',
    unknownError: 'Errore sconosciuto',
    couldNotAdd: 'Impossibile aggiungere la serie'
  }
}

function showToast(message, durationMs = 4000, actionLabel, actionUrl) {
  const existing = document.querySelector('.yt-series-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = 'yt-series-toast'
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    zIndex: '999999',
    fontFamily: 'Roboto, Arial, sans-serif',
    pointerEvents: 'auto',
    opacity: '0',
    transition: 'opacity 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    maxWidth: '520px',
  })

  const msgSpan = document.createElement('span')
  msgSpan.textContent = message
  msgSpan.style.flex = '1'
  toast.appendChild(msgSpan)

  if (actionLabel && actionUrl) {
    const btn = document.createElement('a')
    btn.textContent = actionLabel
    btn.href = actionUrl
    btn.target = '_blank'
    btn.rel = 'noopener'
    Object.assign(btn.style, {
      padding: '6px 14px',
      background: '#fff',
      color: '#000',
      borderRadius: '16px',
      fontSize: '12px',
      fontWeight: '700',
      textDecoration: 'none',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
    })
    toast.appendChild(btn)
  }

  document.body.appendChild(toast)

  requestAnimationFrame(() => { toast.style.opacity = '1' })

  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, durationMs)
}

let currentVideoId = null
let currentPlaylistId = null
let videoEndListener = null
let videoDetectionInterval = null
let progressInterval = null
let progressSaveTimeout = null
let lastProgressSent = null
let nextEpisodeOverlay = null
let nextEpisodeRequestPending = false
let overlayRequestGeneration = 0
let playbackGeneration = 0
let overlaySessionKey = null
let overlayDismissedForSession = false
let overlayEnabled = true
let contentLanguage = 'system'
let isContextValid = true
let playerMode = 'normal'
let addSeriesButtonInjected = false
let addSeriesButtonPending = false
let addSeriesRequestGeneration = 0
let visibilityHandler = null
let modeObserver = null
let fullscreenHandler = null
let overlayKeydownHandler = null

function getSessionKey(videoId, playlistId) {
  return `${videoId || ''}::${playlistId || ''}`
}

function getContentTranslation() {
  const lang = contentLanguage === 'system'
    ? (navigator.language || 'en').split('-')[0]
    : contentLanguage
  return TRANSLATIONS[lang] || TRANSLATIONS.en
}

function invalidateOverlayRequest() {
  overlayRequestGeneration++
  nextEpisodeRequestPending = false
}

function removeNextEpisodeOverlay({ dismiss = false } = {}) {
  if (dismiss && overlaySessionKey === getSessionKey(currentVideoId, currentPlaylistId)) {
    overlayDismissedForSession = true
  }

  if (nextEpisodeOverlay) {
    nextEpisodeOverlay.remove()
    nextEpisodeOverlay = null
  }
  if (modeObserver) {
    modeObserver.disconnect()
    modeObserver = null
  }
  if (fullscreenHandler) {
    document.removeEventListener('fullscreenchange', fullscreenHandler)
    fullscreenHandler = null
  }
  if (overlayKeydownHandler) {
    document.removeEventListener('keydown', overlayKeydownHandler)
    overlayKeydownHandler = null
  }
}

function cancelPendingProgressSave() {
  if (progressSaveTimeout) {
    clearTimeout(progressSaveTimeout)
    progressSaveTimeout = null
  }
}

function stopProgressTracking() {
  if (progressInterval) {
    clearInterval(progressInterval)
    progressInterval = null
  }
  cancelPendingProgressSave()
}

function cleanupVideoListener() {
  playbackGeneration++
  invalidateOverlayRequest()
  if (videoDetectionInterval) {
    clearInterval(videoDetectionInterval)
    videoDetectionInterval = null
  }
  stopProgressTracking()
  if (videoEndListener) {
    const { video, onEnded, onSeeking, onPause, onPlaying } = videoEndListener
    video.removeEventListener('ended', onEnded)
    video.removeEventListener('seeking', onSeeking)
    video.removeEventListener('pause', onPause)
    video.removeEventListener('playing', onPlaying)
    videoEndListener = null
  }
  removeNextEpisodeOverlay()
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
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

  const fullscreenElement = document.fullscreenElement
  if (fullscreenElement?.tagName === 'VIDEO') {
    invalidateOverlayRequest()
    removeNextEpisodeOverlay()
    return
  }

  const host = fullscreenElement || document.body
  if (host && nextEpisodeOverlay.parentElement !== host) {
    host.appendChild(nextEpisodeOverlay)
  }

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
        const error = String(chrome.runtime.lastError.message || '')
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

function safeSendMessageAsync(message) {
  return new Promise(resolve => safeSendMessage(message, response => {
    resolve(response || { success: false, error: 'NO_RESPONSE' })
  }))
}

function applyContentSettings(settings) {
  if (!settings || typeof settings !== 'object') return
  const wasEnabled = overlayEnabled
  overlayEnabled = settings.nextEpisodeOverlay !== false
  contentLanguage = settings.language || 'system'

  if (wasEnabled && !overlayEnabled) {
    invalidateOverlayRequest()
    removeNextEpisodeOverlay()
  }
}

function refreshContentSettings() {
  safeSendMessage({ type: EVENTS.STATE_GET }, response => {
    if (response?.success) applyContentSettings(response.state?.settings)
  })
}

if (chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!sender || sender.id !== chrome.runtime.id) return
    if (message?.type !== EVENTS.STATE_UPDATED) return
    applyContentSettings(message.state?.settings || message.settings)
    if (
      currentPlaylistId
      && message.state?.series
      && !message.state.series[currentPlaylistId]
    ) {
      invalidateOverlayRequest()
      removeNextEpisodeOverlay()
    }
  })
}

function isAdPlaying() {
  const player = document.querySelector('#movie_player, .html5-video-player')
  return !!player?.classList?.contains('ad-showing')
}

function isPlaybackSessionCurrent(videoId, playlistId, generation) {
  return generation === playbackGeneration
    && currentVideoId === videoId
    && currentPlaylistId === playlistId
}

function setupVideoEndDetection(videoId, playlistId) {
  cleanupVideoListener()

  const generation = playbackGeneration
  overlaySessionKey = getSessionKey(videoId, playlistId)
  overlayDismissedForSession = false

  const clearTransientOverlay = () => {
    invalidateOverlayRequest()
    removeNextEpisodeOverlay()
    cancelPendingProgressSave()
  }

  const startProgressTracking = (video) => {
    stopProgressTracking()
    if (document.hidden || video.paused || video.ended) return

    const tick = () => {
      try {
        if (!isPlaybackSessionCurrent(videoId, playlistId, generation)) return
        if (document.hidden || video.paused || video.ended || video.seeking) return
        if (videoEndListener?.video !== video) return

        if (isAdPlaying()) {
          clearTransientOverlay()
          return
        }

        if (!(video.currentTime > 0) || !(video.duration > 0)) return

        const progress = Math.min(99, Math.max(0, Math.round((video.currentTime / video.duration) * 100)))
        const currentTime = Math.round(video.currentTime)
        const duration = Math.round(video.duration)
        const timeRemaining = duration - currentTime

        if (timeRemaining > 30 || timeRemaining <= 0) {
          if (nextEpisodeOverlay || nextEpisodeRequestPending) clearTransientOverlay()
        } else if (
          playlistId
          && overlayEnabled
          && !overlayDismissedForSession
          && !nextEpisodeOverlay
          && !nextEpisodeRequestPending
        ) {
          showNextEpisodeOverlay(videoId, playlistId, generation)
        }

        cancelPendingProgressSave()
        progressSaveTimeout = setTimeout(() => {
          if (!isPlaybackSessionCurrent(videoId, playlistId, generation)) return
          if (document.hidden || video.paused || video.ended || video.seeking || isAdPlaying()) return
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
        }, 3000)
      } catch (err) {
        console.warn('[YT Series] progress error:', err.message)
      }
    }

    progressInterval = setInterval(tick, 5000)
    tick()
  }

  const detachBoundVideo = () => {
    if (!videoEndListener) return
    const { video, onEnded, onSeeking, onPause, onPlaying } = videoEndListener
    video.removeEventListener('ended', onEnded)
    video.removeEventListener('seeking', onSeeking)
    video.removeEventListener('pause', onPause)
    video.removeEventListener('playing', onPlaying)
    videoEndListener = null
    stopProgressTracking()
  }

  const bindVideo = (video) => {
    if (videoEndListener?.video === video) {
      if (!progressInterval && !document.hidden && !video.paused && !video.ended) {
        startProgressTracking(video)
      }
      return
    }

    detachBoundVideo()

    const onEnded = () => {
      clearTransientOverlay()
      stopProgressTracking()
      if (!isPlaybackSessionCurrent(videoId, playlistId, generation)) return
      safeSendMessage({
        type: EVENTS.EPISODE_WATCH,
        payload: { videoId, playlistId: playlistId || '' }
      })
    }
    const onSeeking = clearTransientOverlay
    const onPause = () => {
      clearTransientOverlay()
      stopProgressTracking()
    }
    const onPlaying = () => {
      if (isPlaybackSessionCurrent(videoId, playlistId, generation)) {
        startProgressTracking(video)
      }
    }

    video.addEventListener('ended', onEnded)
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('pause', onPause)
    video.addEventListener('playing', onPlaying)
    videoEndListener = { video, onEnded, onSeeking, onPause, onPlaying }

    startProgressTracking(video)
  }

  const pollForVideo = () => {
    if (!isPlaybackSessionCurrent(videoId, playlistId, generation) || document.hidden) return
    const video = document.querySelector('.video-stream, .html5-main-video')
    if (video) bindVideo(video)
    else detachBoundVideo()
  }

  visibilityHandler = () => {
    if (document.hidden) {
      clearTransientOverlay()
      stopProgressTracking()
    } else {
      pollForVideo()
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)

  pollForVideo()
  videoDetectionInterval = setInterval(pollForVideo, 1000)
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

async function showNextEpisodeOverlay(videoId, playlistId, generation) {
  const sessionKey = getSessionKey(videoId, playlistId)
  if (
    nextEpisodeOverlay
    || nextEpisodeRequestPending
    || !overlayEnabled
    || overlayDismissedForSession
    || overlaySessionKey !== sessionKey
    || !isPlaybackSessionCurrent(videoId, playlistId, generation)
    || isMusicVideo()
    || isAdPlaying()
  ) return

  const requestGeneration = ++overlayRequestGeneration
  nextEpisodeRequestPending = true
  const isCurrent = () => requestGeneration === overlayRequestGeneration
    && overlaySessionKey === sessionKey
    && overlayEnabled
    && !overlayDismissedForSession
    && !nextEpisodeOverlay
    && !isAdPlaying()
    && isPlaybackSessionCurrent(videoId, playlistId, generation)

  try {
    const existsResponse = await safeSendMessageAsync({
      type: EVENTS.PLAYLIST_EXISTS,
      payload: { playlistId }
    })
    if (!isCurrent() || !existsResponse.success || !existsResponse.exists) return

    const nextResponse = await safeSendMessageAsync({
      type: EVENTS.GET_NEXT_EPISODE,
      payload: { videoId, playlistId }
    })
    if (!isCurrent() || !nextResponse.success || !nextResponse.nextEpisode) return

    createNextEpisodeOverlay(nextResponse.nextEpisode, playlistId, videoId, requestGeneration, generation)
  } finally {
    if (requestGeneration === overlayRequestGeneration) nextEpisodeRequestPending = false
  }
}

function createNextEpisodeOverlay(nextEpisode, playlistId, sourceVideoId, requestGeneration, generation) {
  if (
    requestGeneration !== overlayRequestGeneration
    || nextEpisodeOverlay
    || !overlayEnabled
    || overlayDismissedForSession
    || !isPlaybackSessionCurrent(sourceVideoId, playlistId, generation)
  ) return

    const t = getContentTranslation()

    nextEpisodeOverlay = document.createElement('div')
    nextEpisodeOverlay.className = 'yt-series-next-overlay'
    nextEpisodeOverlay.setAttribute('role', 'dialog')
    nextEpisodeOverlay.setAttribute('aria-label', t.nextEpisode)
    nextEpisodeOverlay.setAttribute('aria-live', 'polite')

    const contentDiv = document.createElement('div')
    contentDiv.className = 'yt-series-next-content'

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'yt-series-next-close'
    closeBtn.setAttribute('aria-label', t.close)
    closeBtn.textContent = '\u00D7'
    closeBtn.addEventListener('click', () => removeNextEpisodeOverlay({ dismiss: true }))
    contentDiv.appendChild(closeBtn)

    const infoDiv = document.createElement('div')
    infoDiv.className = 'yt-series-next-info'

    const labelDiv = document.createElement('div')
    labelDiv.className = 'yt-series-next-label'
    labelDiv.textContent = t.nextEpisode

    const titleDiv = document.createElement('div')
    titleDiv.className = 'yt-series-next-title'
    titleDiv.textContent = nextEpisode.title

    infoDiv.appendChild(labelDiv)
    infoDiv.appendChild(titleDiv)

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'yt-series-next-btn'

    const iconSpan = document.createElement('span')
    iconSpan.className = 'yt-series-next-icon'
    iconSpan.textContent = '\u25B6'

    const textSpan = document.createElement('span')
    textSpan.textContent = t.watchNext

    btn.appendChild(iconSpan)
    btn.appendChild(textSpan)

    contentDiv.appendChild(infoDiv)
    contentDiv.appendChild(btn)
    nextEpisodeOverlay.appendChild(contentDiv)

    document.body.appendChild(nextEpisodeOverlay)

    // Set initial position based on current mode
    updateOverlayPosition()

    // Listen for player mode changes
    modeObserver = new MutationObserver(() => {
      updateOverlayPosition()
    })

    const playerContainer = document.querySelector('ytd-watch-flexy')
    if (playerContainer) {
      modeObserver.observe(playerContainer, { attributes: true, attributeFilter: ['theater-mode'] })
    }

    // Listen for fullscreen changes
    fullscreenHandler = updateOverlayPosition
    document.addEventListener('fullscreenchange', fullscreenHandler)

    overlayKeydownHandler = (event) => {
      if (event.key === 'Escape' && nextEpisodeOverlay) {
        event.stopPropagation()
        removeNextEpisodeOverlay({ dismiss: true })
      }
    }
    document.addEventListener('keydown', overlayKeydownHandler)

    btn.addEventListener('click', () => {
      safeSendMessage({
        type: EVENTS.EPISODE_WATCH,
        payload: { videoId: sourceVideoId, playlistId }
      })

      removeNextEpisodeOverlay({ dismiss: true })
      window.location.href = `https://www.youtube.com/watch?v=${nextEpisode.id}&list=${playlistId}`
    })
}

function handlePageNavigation() {
  const url = new URL(window.location.href)
  const videoId = url.searchParams.get('v')
  const listId = url.searchParams.get('list')
  const videoSessionChanged = videoId !== currentVideoId || listId !== currentPlaylistId

  if (listId !== currentPlaylistId) {
    addSeriesButtonInjected = false
    addSeriesButtonPending = false
    addSeriesRequestGeneration++
    document.querySelectorAll('#yt-series-add-btn').forEach(btn => btn.remove())
  }

  currentPlaylistId = listId

  if (videoId && videoSessionChanged) {
    currentVideoId = videoId
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
      position: relative;
      background: rgba(0, 0, 0, 0.9);
      border-radius: 12px;
      padding: 16px;
      min-width: 280px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .yt-series-next-close {
      position: absolute;
      top: 6px;
      right: 8px;
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: rgba(255, 255, 255, 0.75);
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
    }
    .yt-series-next-close:hover,
    .yt-series-next-close:focus-visible {
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
      outline: none;
    }
    .yt-series-next-info {
      margin-bottom: 12px;
      padding-right: 24px;
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
    .yt-series-next-btn:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    .yt-series-next-icon {
      font-size: 16px;
    }
    @media (prefers-reduced-motion: reduce) {
      .yt-series-next-overlay { animation: none; }
      .yt-series-next-btn { transition: none; }
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

  document.querySelectorAll('#yt-series-add-btn').forEach(btn => btn.remove())
  addSeriesButtonInjected = true

  const url = new URL(window.location.href)
  const playlistId = url.searchParams.get('list')
  if (!playlistId) {
    addSeriesButtonInjected = false
    return
  }

  const actionBar = document.querySelector('#playlist-action-menu #top-level-buttons-computed')
  const pageHeader = document.querySelector('#page-manager > ytd-browse > yt-page-header-renderer > yt-page-header-view-model > div.ytPageHeaderViewModelScrollContainer')
  const targetContainer = actionBar || pageHeader

  if (!targetContainer) {
    addSeriesButtonInjected = false
    return
  }

  const requestGeneration = ++addSeriesRequestGeneration
  addSeriesButtonPending = true

  const lang = (navigator.language || 'en').split('-')[0]
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en

  safeSendMessage({
    type: EVENTS.PLAYLIST_EXISTS,
    payload: { playlistId }
  }, (existsResponse) => {
    if (requestGeneration !== addSeriesRequestGeneration) return
    addSeriesButtonPending = false
    if (new URL(window.location.href).searchParams.get('list') !== playlistId) return
    if (!targetContainer.isConnected) {
      addSeriesButtonInjected = false
      queueMicrotask(tryInject)
      return
    }
    if (document.querySelector('#yt-series-add-btn')) return
    const isAdded = existsResponse && existsResponse.success && existsResponse.exists

    const button = document.createElement('button')
    button.id = 'yt-series-add-btn'
    button.dataset.playlistId = playlistId
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
    const buttonLabel = isAdded ? t.viewOnYtSeries : t.addToSeries
    button.setAttribute('aria-label', buttonLabel)
    button.textContent = buttonLabel

    button.addEventListener('click', () => {
      if (isAdded) {
        safeSendMessage({ type: EVENTS.OPEN_SERIES_TAB })
      } else {
        const playlistUrl = window.location.href
        button.disabled = true
        button.textContent = t.adding
        safeSendMessage({
          type: EVENTS.PLAYLIST_ADD,
          payload: { url: playlistUrl }
        }, (addResponse) => {
          if (addResponse && addResponse.success) {
            button.textContent = t.viewOnYtSeries
            button.style.background = '#e8e8e8'
          } else if (addResponse && addResponse.error === 'CONTEXT_INVALIDATED') {
            showToast(t.extensionUnavailable)
            button.textContent = t.addToSeries
            button.disabled = false
          } else {
            const msg = (addResponse && addResponse.message) ? addResponse.message : t.unknownError
            showToast(t.couldNotAdd + ': ' + msg)
            button.textContent = t.addToSeries
            button.disabled = false
          }
        })
      }
    })

    targetContainer.appendChild(button)
  })
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
  observer = new MutationObserver(() => {
    if (!document.querySelector('#yt-series-sidebar-section')) {
      tryInject()
    }
    if (new URL(window.location.href).searchParams.has('list') &&
      !addSeriesButtonPending && !document.querySelector('#yt-series-add-btn')) {
      addSeriesButtonInjected = false
      injectAddToSeriesButton()
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
