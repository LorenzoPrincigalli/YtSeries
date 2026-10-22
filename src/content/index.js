// YouTube page integration entry point (bundled as a classic script).
// Wires navigation, settings and DOM observation to the playback session
// and page injections; holds no business logic of its own.
import { EVENTS } from '../shared/events.js'
import { setLanguage } from '../shared/i18n.js'
import { createMessenger } from './messaging.js'
import { PlaybackSession } from './playbackSession.js'
import { PageInjections } from './pageInjections.js'
import { currentPageIds, isBlockingDialogOpen } from './youtubeDom.js'

const settings = { overlayEnabled: true }
let session = null
let currentPlaylistId = null
let observer = null
let scheduled = false

const messenger = createMessenger({ onInvalidated: shutdown })
const injections = new PageInjections(messenger)

function shutdown() {
  session?.dispose()
  session = null
  observer?.disconnect()
  document.removeEventListener('yt-navigate-finish', onNavigate)
}

/** @param {{ nextEpisodeOverlay?: boolean, language?: string } | undefined} next */
function applySettings(next) {
  if (!next) return
  settings.overlayEnabled = next.nextEpisodeOverlay !== false
  setLanguage(next.language && next.language !== 'system' ? next.language : null)
  if (!settings.overlayEnabled) session?.overlay.hide()
}

function onNavigate() {
  const { videoId, playlistId } = currentPageIds()
  if (playlistId !== currentPlaylistId) injections.resetButton()

  const changed = videoId !== session?.videoId || playlistId !== currentPlaylistId
  currentPlaylistId = playlistId
  if (!videoId) {
    session?.dispose()
    session = null
  } else if (changed) {
    session?.dispose()
    session = new PlaybackSession({ videoId, playlistId, messenger, overlayEnabled: () => settings.overlayEnabled })
    session.start()
  }
  inject()
}

function inject() {
  if (!messenger.valid) return
  if (isBlockingDialogOpen()) { setTimeout(inject, 1000); return }
  injections.injectSidebarLink()
  injections.injectAddButton()
}

/** YouTube mutates the DOM constantly; re-check injections at most once per frame. */
function scheduleInject() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => { scheduled = false; inject() })
}

function start() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender?.id !== chrome.runtime.id || message?.type !== EVENTS.STATE_UPDATED) return
    applySettings(message.state?.settings)
    const savedIds = message.state?.series
    if (!savedIds) return
    injections.syncSavedState(savedIds)
    if (session) session.untracked = false // the video may belong to a series just added
    // The series was deleted elsewhere: stop offering its next episode.
    if (currentPlaylistId && !savedIds[currentPlaylistId]) session?.overlay.hide()
  })

  // Settings at startup (previously only picked up on the first broadcast).
  messenger.send(EVENTS.CONTENT_SETTINGS_GET).then(response => { if (response.success) applySettings(response.settings) })

  observer = new MutationObserver(scheduleInject)
  observer.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('yt-navigate-finish', onNavigate)
  onNavigate()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
else start()
