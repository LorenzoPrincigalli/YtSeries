const CHECKOUT_URL = 'https://ytseries.lemonsqueezy.com/checkout/buy/e9fee22a-1883-4076-b0db-22e34323b961'

const THEME_COLORS = {
  'classic-red': {
    bg: '#0f0f0f', surface: '#212121', primary: '#ff0000', primaryRgb: '255, 0, 0', primaryHover: '#cc0000',
    text: '#f1f1f1', textMuted: '#aaaaaa', cardBg: '#1a1a1a', cardHover: '#2a2a2a',
    border: '#333', modalBg: '#212121', danger: '#E50914', success: '#2ecc71',
    warning: '#f97316', borderLight: 'rgba(255,255,255,0.08)'
  },
  'ocean-blue': {
    bg: '#0a1628', surface: '#0f1f3d', primary: '#1e90ff', primaryRgb: '30, 144, 255', primaryHover: '#187bda',
    text: '#e0e8f0', textMuted: '#607080', cardBg: '#152540', cardHover: '#1a2f50',
    border: '#1a3050', modalBg: '#0f1f3d', danger: '#E50914', success: '#2ecc71',
    warning: '#f97316', borderLight: 'rgba(200,220,255,0.08)'
  },
  'forest': {
    bg: '#0f1a0f', surface: '#1a2a1a', primary: '#2ecc71', primaryRgb: '46, 204, 113', primaryHover: '#27ae60',
    text: '#e0f0e0', textMuted: '#608060', cardBg: '#1f301f', cardHover: '#2a402a',
    border: '#2a3a2a', modalBg: '#1a2a1a', danger: '#E50914', success: '#2ecc71',
    warning: '#f97316', borderLight: 'rgba(180,220,180,0.08)'
  }
}

function applyPopupTheme(themeName) {
  const colors = THEME_COLORS[themeName] || THEME_COLORS['classic-red']
  const root = document.documentElement
  root.style.setProperty('--bg', colors.bg)
  root.style.setProperty('--surface', colors.surface)
  root.style.setProperty('--primary', colors.primary)
  root.style.setProperty('--primary-rgb', colors.primaryRgb)
  root.style.setProperty('--primary-hover', colors.primaryHover)
  root.style.setProperty('--text', colors.text)
  root.style.setProperty('--text-muted', colors.textMuted)
  root.style.setProperty('--card-bg', colors.cardBg)
  root.style.setProperty('--card-hover', colors.cardHover)
  root.style.setProperty('--border', colors.border)
  root.style.setProperty('--modal-bg', colors.modalBg)
  root.style.setProperty('--danger', colors.danger)
  root.style.setProperty('--success', colors.success)
  root.style.setProperty('--warning', colors.warning)
  root.style.setProperty('--border-light', colors.borderLight)
}

const SYNC_HINTS = {
  not_configured: '',
  logged_out: 'Cloud sync available — sign in from Settings',
  connected: 'Cloud sync on',
  offline: 'Offline — sync pending',
  error: 'Sync error — open Settings',
  syncing: 'Syncing…'
}

document.getElementById('openDashboard').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_SERIES_TAB' })
  window.close()
})

document.getElementById('openSettings').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/tab/index.html') + '?settings=1' })
  window.close()
})

document.getElementById('buyProBtn').addEventListener('click', () => {
  if (CHECKOUT_URL) {
    chrome.tabs.create({ url: CHECKOUT_URL })
    window.close()
  }
})

function updateSyncIndicator(syncStatus) {
  const dot = document.getElementById('syncDot')
  const hint = document.getElementById('syncHint')
  if (!dot) return

  const s = syncStatus || {}
  dot.className = 'sync-dot'

  if (!s.configured) {
    dot.style.display = 'none'
    if (hint) hint.classList.add('hidden')
    return
  }

  dot.style.display = 'block'
  let mode = 'logged_out'
  if (s.loggedIn) {
    if (s.syncing) mode = 'syncing'
    else if (s.lastError) mode = 'error'
    else if (!navigator.onLine) mode = 'offline'
    else mode = 'connected'
  }

  dot.classList.add(mode === 'connected' ? 'connected' : mode === 'error' ? 'error' : mode === 'syncing' ? 'syncing' : '')
  dot.title = SYNC_HINTS[mode] || 'Cloud sync'

  if (hint && SYNC_HINTS[mode]) {
    hint.textContent = SYNC_HINTS[mode]
    hint.classList.remove('hidden')
  } else if (hint) {
    hint.classList.add('hidden')
  }
}

try {
  chrome.runtime.sendMessage({ type: 'STATE_GET' }, (response) => {
    if (!response?.success || !response.state) return

    const state = response.state
    applyPopupTheme(state.settings?.theme || 'classic-red')
    updateSyncIndicator(response.syncStatus)

    const seriesList = Object.values(state.series || {})
    let unwatched = 0
    let newEpisodes = 0

    for (const s of seriesList) {
      const videos = s.videos || []
      for (const v of videos) {
        if (!v.watched) unwatched++
      }
      if (state.license?.isPro && s.newEpisodesCount) newEpisodes += s.newEpisodesCount
    }

    document.getElementById('seriesCount').textContent = seriesList.length
    document.getElementById('unwatchedCount').textContent = unwatched
    document.getElementById('newCount').textContent = newEpisodes || 0

    if (state.license?.isPro) {
      document.getElementById('proBadge').textContent = 'Pro'
    } else if (CHECKOUT_URL) {
      document.getElementById('buyProBtn').style.display = 'block'
    }
  })
} catch (_) {}
