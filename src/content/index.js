const EVENTS = {
  OPEN_SERIES_TAB: 'OPEN_SERIES_TAB',
  EPISODE_WATCH: 'EPISODE_WATCH'
}

let currentVideoId = null
let videoEndListener = null
let videoDetectionInterval = null

function cleanupVideoListener() {
  if (videoDetectionInterval) {
    clearInterval(videoDetectionInterval)
    videoDetectionInterval = null
  }
  if (videoEndListener) {
    videoEndListener.video.removeEventListener('ended', videoEndListener.handler)
    videoEndListener = null
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

        const onEnded = () => {
          chrome.runtime.sendMessage({
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
    chrome.runtime.sendMessage({ type: EVENTS.OPEN_SERIES_TAB })
  })

  entry.appendChild(link)
  section.appendChild(title)
  section.appendChild(entry)

  const lastSection = sections[sections.length - 1]
  lastSection.parentNode.insertBefore(section, lastSection)

  console.log('[YT Series] injected custom section before', lastSection)
}

let observer = null

function tryInject() {
  if (document.querySelector('#yt-series-sidebar-section')) return

  if (isOverlayActive()) {
    setTimeout(tryInject, 1000)
    return
  }

  const sections = document.querySelectorAll('ytd-guide-section-renderer')
  if (sections.length >= 2) {
    injectSidebarLink()
  } else {
    setTimeout(tryInject, 1000)
  }
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
