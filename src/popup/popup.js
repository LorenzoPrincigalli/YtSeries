const CHECKOUT_URL = 'https://ytseries.lemonsqueezy.com/checkout/buy/e9fee22a-1883-4076-b0db-22e34323b961'

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
