import { EVENTS } from '../shared/events.js'
import { logger } from '../shared/logger.js'
import { THEME_COLORS } from '../shared/constants.js'
import { t, setLanguage } from '../shared/i18n.js'
import { HomePage } from './components/home.js'
import { DetailPage } from './components/detail.js'
import { ModalManager } from './components/modal.js'

let state = null
let currentFilter = 'all'
let currentSearch = ''
let currentSearchResults = null
let searchTimeout = null
let recommendedPlaylists = null

const homePage = new HomePage()
const detailPage = new DetailPage()
const modalManager = new ModalManager()

document.addEventListener('DOMContentLoaded', async () => {
  translateUI()
  bindUIEvents()
  await loadState()
  applyTheme()
  initIconTheme()
})

window.addEventListener('yt-series-add', async (e) => {
  const { playlistId } = e.detail
  if (!playlistId) return

  const url = `https://www.youtube.com/playlist?list=${playlistId}`
  const response = await sendMessage(EVENTS.PLAYLIST_ADD, { url })
  if (response.success && response.series && state) {
    state.series[response.series.playlistId] = response.series
    render()
  }
})

window.addEventListener('yt-series-delete', async (e) => {
  const { playlistId } = e.detail
  const response = await sendMessage(EVENTS.SERIES_DELETE, { playlistId })
  if (response.success && state) {
    delete state.series[playlistId]
    render()
  }
})

async function loadState() {
  showLoading(true)

  try {
    const response = await sendMessage(EVENTS.STATE_GET)
    if (response.success) {
      state = response.state
      if (state.settings.language && state.settings.language !== 'system') {
        setLanguage(state.settings.language)
      }
      render()
    }
  } catch (err) {
    logger.error('Failed to load state:', err)
    showError(t('load_failed_msg'))
  }

  showLoading(false)
}

function translateUI() {
  const map = [
    ['searchInput', 'placeholder', 'search_placeholder'],
    ['settingsBtn', 'title', 'settings'],
    ['addPlaylistBtn', 'textContent', 'add_via_link'],
    ['addPlaylistConfirm', 'textContent', 'add_series'],
    ['addPlaylistCancel', 'textContent', 'cancel'],
    ['verifyLicenseBtn', 'textContent', 'activate'],
    ['licenseKeyInput', 'placeholder', 'enter_license'],
    ['playlistUrlInput', 'placeholder', 'playlist_url_placeholder'],
    ['addPlaylistModalTitle', 'textContent', 'add_series_title'],
    ['addPlaylistDesc', 'textContent', 'add_series_desc'],
    ['settingsModalTitle', 'textContent', 'settings_title'],
    ['autoRefreshToggle', 'nextText', 'auto_refresh_desc'],
    ['licenseBadge', 'textContent', 'free'],
    ['playlistSearchInput', 'placeholder', 'search_playlist_placeholder'],
    ['playlistSearchBtn', 'textContent', 'search_btn'],
    ['addPlaylistSearchDesc', 'textContent', 'search_playlists'],
  ]

  for (const [id, prop, key] of map) {
    const el = document.getElementById(id)
    if (!el) continue
    if (prop === 'nextText') {
      const next = el.nextElementSibling?.nextElementSibling
      if (next) next.textContent = t(key)
    } else {
      el[prop] = t(key)
    }
  }

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n
    if (key) el.textContent = t(key)
  })

  document.querySelectorAll('#themeSelect option').forEach(opt => {
    const key = `theme_${opt.value.replace(/-/g, '_')}`
    opt.textContent = t(key)
  })

  document.querySelectorAll('#languageSelect option').forEach(opt => {
    const key = `language_${opt.value}`
    opt.textContent = t(key)
  })

  document.querySelectorAll('.filter-chip').forEach(chip => {
    const key = chip.dataset.filter
    if (key === 'all') chip.textContent = t('all')
    else if (key === 'watching') chip.textContent = t('watching')
    else if (key === 'completed') chip.textContent = t('completed')
    else if (key === 'new') chip.textContent = t('new_episodes')
  })

  const el = document.querySelector('.settings-desc')
  if (el) el.textContent = t('license_desc')

  const closeBtn = document.querySelector('#settingsModal .modal-footer .btn-secondary')
  if (closeBtn) closeBtn.textContent = t('close')

  document.querySelectorAll('.modal-tab').forEach(tab => {
    const key = tab.dataset.tab === 'url' ? 'search_tab' : 'search_tab_search'
    tab.textContent = t(key)
  })
}

function initIconTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  setToolbarIcon(mq.matches)
  mq.addEventListener('change', (e) => setToolbarIcon(e.matches))
}

function setToolbarIcon(isDark) {
  const suffix = isDark ? '' : '_light'
  sendMessage('SET_ICON_THEME', { suffix })
}

function sendMessage(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: 'RUNTIME_ERROR', message: chrome.runtime.lastError.message })
      } else {
        resolve(response)
      }
    })
  })
}

async function handleAutoRefreshChange(e) {
  if (!state) return
  const autoRefresh = e.target.checked
  state.settings.autoRefresh = autoRefresh
  await sendMessage(EVENTS.SETTINGS_UPDATE, { autoRefresh })
}

async function handleResetStorage() {
  const confirmed = await modalManager.confirm(t('reset_confirm'))
  if (!confirmed) return
  await sendMessage(EVENTS.STORAGE_RESET)
  state = null
  await loadState()
  populateSettingsForm()
  translateUI()
}

function bindUIEvents() {
  document.getElementById('addPlaylistBtn').addEventListener('click', () => {
    modalManager.open('addPlaylistModal')
  })

  document.getElementById('settingsBtn').addEventListener('click', () => {
    modalManager.open('settingsModal')
    populateSettingsForm()
  })

  document.getElementById('addPlaylistConfirm').addEventListener('click', handleAddPlaylist)
  document.getElementById('addPlaylistCancel').addEventListener('click', () => {
    modalManager.close('addPlaylistModal')
  })
  document.getElementById('playlistUrlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddPlaylist()
  })

  document.getElementById('verifyLicenseBtn').addEventListener('click', handleVerifyLicense)
  document.getElementById('licenseKeyInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleVerifyLicense()
  })

  document.getElementById('themeSelect').addEventListener('change', handleThemeChange)
  document.getElementById('languageSelect').addEventListener('change', handleLanguageChange)
  document.getElementById('autoRefreshToggle').addEventListener('change', handleAutoRefreshChange)
  document.getElementById('resetStorageBtn').addEventListener('click', handleResetStorage)

  document.getElementById('searchInput').addEventListener('input', (e) => {
    currentSearch = e.target.value.trim().toLowerCase().slice(0, 200)
    const clearBtn = document.getElementById('searchClear')
    clearBtn.classList.toggle('hidden', !!currentSearch)

    if (searchTimeout) clearTimeout(searchTimeout)

    const chips = document.querySelector('.filter-chips')
    const searchQ = document.getElementById('searchQuery')
    if (currentSearch) {
      chips.classList.add('hidden')
      searchQ.classList.remove('hidden')
      searchQ.textContent = `"${e.target.value}"`
    } else {
      chips.classList.remove('hidden')
      searchQ.classList.add('hidden')
      searchQ.textContent = ''
    }

    if (currentSearch) {
      searchTimeout = setTimeout(async () => {
        const response = await sendMessage(EVENTS.PLAYLIST_SEARCH, { query: currentSearch })
        currentSearchResults = response.success ? response : null
        renderHome()
      }, 400)
    } else {
      currentSearchResults = null
      renderHome()
    }
  })

  document.getElementById('searchClear').addEventListener('click', () => {
    document.getElementById('searchInput').value = ''
    currentSearch = ''
    currentSearchResults = null
    document.getElementById('searchClear').classList.add('hidden')
    document.querySelector('.filter-chips').classList.remove('hidden')
    document.getElementById('searchQuery').classList.add('hidden')
    document.getElementById('searchQuery').textContent = ''
    renderHome()
  })

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
      chip.classList.add('active')
      currentFilter = chip.dataset.filter
      renderHome()
    })
  })

  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.add('hidden'))
      document.getElementById(`addPlaylistTab${tab.dataset.tab === 'url' ? 'Url' : 'Search'}`).classList.remove('hidden')
    })
  })

  document.getElementById('playlistSearchBtn').addEventListener('click', handlePlaylistSearch)
  document.getElementById('playlistSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handlePlaylistSearch()
  })

  document.querySelectorAll('.modal-close, .btn-secondary[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal
      if (modalId) modalManager.close(modalId)
    })
  })

  document.querySelector('.nav-link[data-view="home"]').addEventListener('click', (e) => {
    e.preventDefault()
    currentFilter = 'all'
    currentSearch = ''
    currentSearchResults = null
    document.getElementById('searchInput').value = ''
    document.getElementById('searchClear').classList.add('hidden')
    document.querySelector('.filter-chips').classList.remove('hidden')
    document.getElementById('searchQuery').classList.add('hidden')
    document.getElementById('searchQuery').textContent = ''
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
    document.querySelector('.filter-chip[data-filter="all"]').classList.add('active')
    renderHome()
  })

  window.addEventListener('scroll', () => {
    const header = document.getElementById('header')
    header.classList.toggle('scrolled', window.scrollY > 0)
  })
}

function render() {
  renderHome()
}

function renderHome() {
  const main = document.getElementById('mainContent')
  main.innerHTML = ''

  const seriesArray = Object.values(state?.series || {})

  if (seriesArray.length === 0) {
    if (currentSearchResults) {
      const hasResults = (currentSearchResults.playlists && currentSearchResults.playlists.length > 0) ||
        (currentSearchResults.channels && currentSearchResults.channels.length > 0)
      if (!hasResults) {
        const empty = document.createElement('div')
        empty.className = 'empty-state'
        const p = document.createElement('p')
        p.className = 'empty-state-desc'
        p.textContent = `Nessun risultato trovato per "${currentSearch}"`
        empty.appendChild(p)
        main.appendChild(empty)
        return
      }
    } else {
      const empty = document.createElement('div')
      empty.className = 'empty-state'

      const icon = document.createElement('div')
      icon.className = 'empty-state-icon'
      icon.textContent = '\uD83D\uDCFA'

      const h2 = document.createElement('h2')
      h2.className = 'empty-state-title'
      h2.textContent = t('welcome_title')

      const p = document.createElement('p')
      p.className = 'empty-state-desc'
      p.textContent = t('welcome_desc')

      empty.appendChild(icon)
      empty.appendChild(h2)
      empty.appendChild(p)
      main.appendChild(empty)
      return
    }
  }

  const filtered = filterSeries(seriesArray)
  const continueSeries = filtered.filter(s => {
    if (s.completed) return false
    const watched = s.videos.filter(v => v.watched).length
    return watched > 0 && watched < s.videos.length
  })
  const newSeries = filtered.filter(s => s.newEpisodesCount > 0)

  if (!currentSearch && currentFilter !== 'completed') {
    const heroSeries = buildHeroSeries(seriesArray)
    if (heroSeries.length > 0) {
      main.appendChild(homePage.renderHeroCarousel(heroSeries, onContinueWatching, onSeriesClick))
    }
    if (currentFilter === 'all' && !currentSearch) {
      const thisWeekSeries = getThisWeekSeries(seriesArray)
      if (thisWeekSeries.length > 0) {
        main.appendChild(homePage.renderRow(t('this_week'), thisWeekSeries.slice(0, 10), onSeriesClick))
      }
    }
  }

  if (currentFilter === 'all' || currentFilter === 'watching') {
    const watching = continueSeries.slice(0, 10)
    if (watching.length > 0) {
      main.appendChild(homePage.renderRow(t('continue_watching'), watching, onSeriesClick))
    }
  }

  if (newSeries.length > 0 && (currentFilter === 'all' || currentFilter === 'new')) {
    main.appendChild(homePage.renderRow(t('new_episodes'), newSeries.slice(0, 10), onSeriesClick))
  }

  if (currentFilter === 'all' || currentFilter === 'watching' || currentFilter === 'completed') {
    const allShown = filtered.slice(0, 20)
    if (allShown.length > 0) {
      main.appendChild(homePage.renderRow(t('my_series'), allShown, onSeriesClick))
    }
  }

  if (currentSearchResults && currentSearchResults.playlists && currentSearchResults.playlists.length > 0) {
    main.appendChild(homePage.renderSearchPlaylists(currentSearchResults.playlists, onSearchAddPlaylist, 'YouTube'))
  }

  if (currentSearchResults && currentSearchResults.channels && currentSearchResults.channels.length > 0) {
    for (const ch of currentSearchResults.channels) {
      main.appendChild(homePage.renderChannelCard(ch, onSearchAddPlaylist, onFetchChannelPlaylists))
    }
  }

  if (!currentSearch && currentFilter !== 'completed' && seriesArray.length > 0) {
    const recSection = document.createElement('div')
    recSection.id = 'recommendedSection'
    main.appendChild(recSection)
    if (recommendedPlaylists) {
      const el = homePage.renderSearchPlaylists(recommendedPlaylists, onSearchAddPlaylist, t('recommended'))
      if (el) recSection.appendChild(el)
    } else {
      fetchRecommended()
    }
  }
}

function filterSeries(seriesArray) {
  let filtered = seriesArray

  if (currentSearch) {
    const search = currentSearch
    filtered = filtered.filter(s =>
      s.title.toLowerCase().includes(search) ||
      (s.channelTitle && s.channelTitle.toLowerCase().includes(search))
    )
  }

  switch (currentFilter) {
    case 'watching':
      filtered = filtered.filter(s => {
        if (s.completed) return false
        const watched = s.videos.filter(v => v.watched).length
        return watched > 0 && watched < s.videos.length
      })
      break
    case 'completed':
      filtered = filtered.filter(s =>
        s.completed || (s.videos.length > 0 && s.videos.every(v => v.watched))
      )
      break
    case 'new':
      filtered = filtered.filter(s => s.newEpisodesCount > 0)
      break
  }

  filtered.sort((a, b) => {
    if (a.completed && !b.completed) return 1
    if (!a.completed && b.completed) return -1

    const aWatched = a.videos.filter(v => v.watched).length
    const bWatched = b.videos.filter(v => v.watched).length
    const aProgress = a.videos.length > 0 ? aWatched / a.videos.length : 0
    const bProgress = b.videos.length > 0 ? bWatched / b.videos.length : 0

    if (aProgress > 0 && aProgress < 1 && !(bProgress > 0 && bProgress < 1)) return -1
    if (bProgress > 0 && bProgress < 1 && !(aProgress > 0 && aProgress < 1)) return 1
    return (b.addedAt || 0) - (a.addedAt || 0)
  })

  return filtered
}

function getThisWeekSeries(allSeries) {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  return Object.values(allSeries).filter(s => {
    if (s.completed) return false
    return s.videos.some(v => {
      if (!v.publishedAt) return false
      const d = new Date(v.publishedAt)
      return d >= monday && d <= sunday
    })
  })
}

function buildHeroSeries(allSeries) {
  const inProgress = []
  const notStarted = []
  const completed = []

  for (const s of Object.values(allSeries)) {
    const watched = s.videos.filter(v => v.watched).length
    if (s.completed || (s.videos.length > 0 && watched === s.videos.length)) {
      completed.push(s)
    } else if (watched > 0) {
      inProgress.push(s)
    } else {
      notStarted.push(s)
    }
  }

  inProgress.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
  notStarted.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))

  return [...inProgress, ...notStarted, ...completed].slice(0, 8)
}

function onSeriesClick(series) {
  detailPage.render(series, {
    onWatch: handleWatchEpisode,
    onBack: () => {},
    onRefresh: handleRefreshSeries,
    onCompleteToggle: handleSeriesCompleteToggle
  })
}

function closeDetail() {
  detailPage.close()
}

function onContinueWatching(series) {
  const nextEpisode = series.videos.find(v => !v.watched)
  if (nextEpisode) {
    window.open(`https://www.youtube.com/watch?v=${nextEpisode.id}&list=${series.playlistId}`, '_blank', 'noopener')
  }
}

async function handleWatchEpisode(playlistId, videoId) {
  try {
    const response = await sendMessage(EVENTS.EPISODE_WATCH, { playlistId, videoId })
    if (response.success && response.state) {
      state = response.state
      render()
    }
  } catch (err) {
    logger.error('Failed to mark episode watched:', err)
  }
}

async function handleSeriesCompleteToggle(playlistId) {
  const response = await sendMessage(EVENTS.SERIES_COMPLETE_TOGGLE, { playlistId })
  if (response.success && response.state) {
    state = response.state
    const series = state.series[playlistId]
    if (series) {
      detailPage.render(series, {
        onWatch: handleWatchEpisode,
        onBack: () => {},
        onRefresh: handleRefreshSeries,
        onCompleteToggle: handleSeriesCompleteToggle
      })
    }
    render()
  }
}

async function handleRefreshSeries(playlistId) {
  const refreshBtn = document.getElementById('refreshBtn')
  if (refreshBtn) {
    refreshBtn.disabled = true
    refreshBtn.textContent = t('refreshing')
  }

  try {
    const response = await sendMessage(EVENTS.SERIES_REFRESH, { playlistId })

    if (response.success && state && response.series) {
      state.series[playlistId] = response.series
      const series = state.series[playlistId]
      detailPage.render(series, {
        onWatch: handleWatchEpisode,
        onBack: () => {},
        onRefresh: handleRefreshSeries,
        onCompleteToggle: handleSeriesCompleteToggle
      })
    } else {
      logger.error('Refresh failed:', response)
      showErrorToast(response?.message || t('refresh_failed'))
    }
  } catch (err) {
    logger.error('Refresh error:', err)
    showErrorToast(t('refresh_network_error'))
  }
}

async function handlePlaylistSearch() {
  const input = document.getElementById('playlistSearchInput')
  const resultsEl = document.getElementById('playlistSearchResults')
  const errorEl = document.getElementById('playlistSearchError')
  const query = input.value.trim()

  errorEl.classList.add('hidden')
  resultsEl.innerHTML = ''
  document.getElementById('playlistSearchBtn').disabled = true

  try {
    if (!query) return

    const response = await sendMessage(EVENTS.PLAYLIST_SEARCH, { query })

    if (!response.success || !response.playlists || response.playlists.length === 0) {
      resultsEl.innerHTML = `<p class="search-empty">${t('search_no_results')}</p>`
      return
    }

    for (const pl of response.playlists) {
      const card = document.createElement('div')
      card.className = 'search-result-card'

      const thumb = document.createElement('img')
      thumb.className = 'search-result-thumb'
      thumb.src = pl.thumbnail || ''
      thumb.alt = pl.title

      const info = document.createElement('div')
      info.className = 'search-result-info'

      const title = document.createElement('div')
      title.className = 'search-result-title'
      title.textContent = pl.title

      const channel = document.createElement('div')
      channel.className = 'search-result-channel'
      channel.textContent = pl.channelTitle

      info.appendChild(title)
      info.appendChild(channel)

      const addBtn = document.createElement('button')
      addBtn.className = 'btn-primary search-result-add'
      addBtn.textContent = t('search_add')
      addBtn.addEventListener('click', async () => {
        addBtn.disabled = true
        addBtn.textContent = t('adding')
        const url = `https://www.youtube.com/playlist?list=${pl.playlistId}`
        const response = await sendMessage(EVENTS.PLAYLIST_ADD, { url })
        if (response.success && response.series && state) {
          state.series[response.series.playlistId] = response.series
          render()
          modalManager.close('addPlaylistModal')
        } else {
          addBtn.disabled = false
          addBtn.textContent = t('search_add')
          errorEl.textContent = response?.message || t('add_failed')
          errorEl.classList.remove('hidden')
        }
      })

      card.appendChild(thumb)
      card.appendChild(info)
      card.appendChild(addBtn)
      resultsEl.appendChild(card)
    }
  } catch (err) {
    logger.error('Search error:', err)
    errorEl.textContent = t('search_failed')
    errorEl.classList.remove('hidden')
  } finally {
    document.getElementById('playlistSearchBtn').disabled = false
  }
}

async function fetchRecommended() {
  if (!state) return
  const savedIds = new Set(Object.keys(state.series))

  const channelCount = {}
  for (const s of Object.values(state.series)) {
    if (s.channelId) {
      channelCount[s.channelId] = (channelCount[s.channelId] || 0) + 1
    }
  }

  const entries = Object.entries(channelCount)
  if (entries.length === 0) return

  const totalSaved = entries.reduce((sum, [, c]) => sum + c, 0)
  const TARGET = 10

  const allPlaylists = []
  const seenIds = new Set()

  for (const [chId, count] of entries) {
    const pls = await onFetchChannelPlaylists(chId)
    const proportion = count / totalSaved
    const slots = Math.max(1, Math.round(TARGET * proportion))

    let added = 0
    for (const pl of pls) {
      if (added >= slots) break
      if (savedIds.has(pl.playlistId) || seenIds.has(pl.playlistId)) continue
      seenIds.add(pl.playlistId)
      allPlaylists.push(pl)
      added++
    }
  }

  for (let i = allPlaylists.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[allPlaylists[i], allPlaylists[j]] = [allPlaylists[j], allPlaylists[i]]
  }

  recommendedPlaylists = allPlaylists.slice(0, TARGET)

  const recSection = document.getElementById('recommendedSection')
  if (recSection) {
    recSection.innerHTML = ''
    const el = homePage.renderSearchPlaylists(recommendedPlaylists, onSearchAddPlaylist, t('recommended'))
    if (el) recSection.appendChild(el)
  }
}

async function onFetchChannelPlaylists(channelId) {
  const response = await sendMessage(EVENTS.FETCH_CHANNEL_PLAYLISTS, { channelId })
  if (response.success) return response.playlists
  return []
}

async function onSearchAddPlaylist(playlist) {
  const url = `https://www.youtube.com/playlist?list=${playlist.playlistId}`
  const response = await sendMessage(EVENTS.PLAYLIST_ADD, { url })
  if (response.success && response.series && state) {
    state.series[response.series.playlistId] = response.series
    currentSearchResults = null
    document.getElementById('searchInput').value = ''
    currentSearch = ''
    document.getElementById('searchClear').classList.add('hidden')
    render()
  } else {
    showErrorToast(response?.message || t('add_failed'))
  }
}

async function handleAddPlaylist() {
  const input = document.getElementById('playlistUrlInput')
  const errorEl = document.getElementById('playlistError')
  const url = input.value.trim()

  errorEl.classList.add('hidden')
  document.getElementById('addPlaylistConfirm').disabled = true
  document.getElementById('addPlaylistConfirm').textContent = t('adding')

  try {
    if (!url) {
      throw new Error(t('enter_url'))
    }

    const response = await sendMessage(EVENTS.PLAYLIST_ADD, { url })

    if (!response.success) {
      if (response.error === 'LIMIT_REACHED') {
        errorEl.textContent = t('limit_reached')
        errorEl.classList.remove('hidden')
        return
      }
      throw new Error(response.message || t('add_failed'))
    }

    state.series[response.series.playlistId] = response.series
    modalManager.close('addPlaylistModal')
    input.value = ''
    render()
  } catch (err) {
    errorEl.textContent = err.message || t('add_failed')
    errorEl.classList.remove('hidden')
    logger.error('Add playlist error:', err)
  } finally {
    document.getElementById('addPlaylistConfirm').disabled = false
    document.getElementById('addPlaylistConfirm').textContent = t('add_series')
  }
}

async function handleVerifyLicense() {
  const input = document.getElementById('licenseKeyInput')
  const msgEl = document.getElementById('licenseMessage')
  const key = input.value.trim()

  msgEl.classList.add('hidden')
  document.getElementById('verifyLicenseBtn').disabled = true

  try {
    const response = await sendMessage(EVENTS.LICENSE_VERIFY, { key })

    if (response.valid) {
      state.license.isPro = true
      state.license.key = key
      msgEl.textContent = t('license_activated')
      msgEl.style.color = '#2ecc71'
      msgEl.classList.remove('hidden')
      populateSettingsForm()
      render()
    } else {
      msgEl.textContent = t('license_invalid')
      msgEl.style.color = 'var(--primary)'
      msgEl.classList.remove('hidden')
    }
  } catch (err) {
    msgEl.textContent = t('license_failed')
    msgEl.style.color = 'var(--primary)'
    msgEl.classList.remove('hidden')
  } finally {
    document.getElementById('verifyLicenseBtn').disabled = false
  }
}

function populateSettingsForm() {
  if (!state) return

  const isPro = state.license.isPro

  document.getElementById('licenseBadge').textContent = isPro ? t('pro') : t('free')
  document.getElementById('licenseBadge').className = `pro-badge ${isPro ? 'pro-badge-pro' : 'pro-badge-free'}`
  document.getElementById('licenseKeyInput').value = state.license.key || ''

  if (state.settings) {
    document.getElementById('themeSelect').value = state.settings.theme || 'classic-red'
    document.getElementById('languageSelect').value = state.settings.language || 'system'
    document.getElementById('autoRefreshToggle').checked = state.settings.autoRefresh || false
  }

  const proSettings = document.getElementById('proSettings')
  proSettings.style.display = isPro ? 'block' : 'none'
  document.getElementById('licenseKeyInput').disabled = false
  document.getElementById('verifyLicenseBtn').disabled = false
}

async function handleThemeChange(e) {
  if (!state) return
  const theme = e.target.value
  state.settings.theme = theme
  applyTheme()
  await sendMessage(EVENTS.SETTINGS_UPDATE, { theme })
}

async function handleLanguageChange(e) {
  if (!state) return
  const lang = e.target.value
  state.settings.language = lang
  if (lang && lang !== 'system') {
    setLanguage(lang)
  } else {
    setLanguage(null)
  }
  await sendMessage(EVENTS.SETTINGS_UPDATE, { language: lang })
  render()
  translateUI()
}

function applyTheme() {
  const themeName = state?.settings?.theme || 'classic-red'
  const colors = THEME_COLORS[themeName] || THEME_COLORS['classic-red']
  const root = document.documentElement

  root.style.setProperty('--bg', colors.bg)
  root.style.setProperty('--surface', colors.surface)
  root.style.setProperty('--primary', colors.primary)
  root.style.setProperty('--text', colors.text)
  root.style.setProperty('--text-muted', colors.textMuted)
  root.style.setProperty('--card-bg', colors.cardBg)
  root.style.setProperty('--card-hover', colors.hover)

  const metaTheme = document.querySelector('meta[name="theme-color"]')
  if (metaTheme) metaTheme.content = colors.bg
}

function showLoading(visible) {
  const loading = document.getElementById('loadingScreen')
  if (loading) loading.classList.toggle('hidden', !visible)
}

function showError(message) {
  const main = document.getElementById('mainContent')
  main.innerHTML = ''
  const empty = document.createElement('div')
  empty.className = 'empty-state'

  const icon = document.createElement('div')
  icon.className = 'empty-state-icon'
  icon.textContent = '\u26A0\uFE0F'

  const h2 = document.createElement('h2')
  h2.className = 'empty-state-title'
  h2.textContent = t('something_wrong')

  const p = document.createElement('p')
  p.className = 'empty-state-desc'
  p.textContent = message

  empty.appendChild(icon)
  empty.appendChild(h2)
  empty.appendChild(p)
  main.appendChild(empty)
}

function showErrorToast(message) {
  const existing = document.querySelector('.toast-error')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = 'toast-error'
  toast.textContent = message
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    padding: '12px 20px',
    background: 'var(--primary)',
    color: '#fff',
    borderRadius: '8px',
    fontSize: '14px',
    zIndex: '300',
    animation: 'fadeIn 0.2s ease'
  })
  document.body.appendChild(toast)

  setTimeout(() => toast.remove(), 3000)
}
