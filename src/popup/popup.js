const CHECKOUT_URL = '' // Set your Lemon Squeezy checkout URL

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

chrome.runtime.sendMessage({ type: 'STATE_GET' }, (response) => {
  if (!response?.success || !response.state) return

  const state = response.state
  const seriesList = Object.values(state.series || {})
  let unwatched = 0
  let newEpisodes = 0

  for (const s of seriesList) {
    const videos = s.videos || []
    for (const v of videos) {
      if (!v.watched) unwatched++
    }
    if (s.newEpisodesCount) newEpisodes += s.newEpisodesCount
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
