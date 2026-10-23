// YouTube page integration entry point (bundled as a classic script).
// Wires navigation, settings and DOM observation to the playback session
// and page injections; holds no business logic of its own.
//
// After an extension update the previous copy of this script stays on open
// pages, orphaned. The newest instance claims the page (data attribute on
// <html>); any other instance shuts down and removes its UI on its next tick.
import { EVENTS } from '../shared/events.js'
import { setLanguage } from '../shared/i18n.js'
import { createMessenger } from './messaging.js'
import { PlaybackSession } from './playbackSession.js'
import { PageInjections } from './pageInjections.js'
import { NoteButton } from './noteButton.js'
import { ProgressOverlay } from './progressOverlay.js'
import { currentPageIds, isBlockingDialogOpen } from './youtubeDom.js'

const INSTANCE = crypto.randomUUID()
const settings = { overlayEnabled: true }
let session = null
let currentPlaylistId = null
let observer = null
let scheduled = false
let stopped = false

const messenger = createMessenger({ onInvalidated: shutdown })
const injections = new PageInjections(messenger, INSTANCE)
const notes = new NoteButton(messenger, INSTANCE)
const progress = new ProgressOverlay(messenger, INSTANCE)

/** False once the extension was reloaded or a newer copy of this script took over. */
function isCurrentInstance() {
  return Boolean(chrome.runtime?.id) && document.documentElement.dataset.ytSeriesInstance === INSTANCE
}

function shutdown() {
  if (stopped) return
  stopped = true
  session?.dispose()
  session = null
  observer?.disconnect()
  document.removeEventListener('yt-navigate-finish', onNavigate)
  injections.removeOwnUi()
  progress.removeOwnUi()
}

/** @param {{ nextEpisodeOverlay?: boolean, language?: string } | undefined} next */
function applySettings(next) {
  if (!next) return
  settings.overlayEnabled = next.nextEpisodeOverlay !== false
  setLanguage(next.language && next.language !== 'system' ? next.language : null)
  if (!settings.overlayEnabled) session?.overlay.hide()
}

function onNavigate() {
  if (!isCurrentInstance()) { shutdown(); return }
  const { videoId, playlistId } = currentPageIds()
  if (playlistId !== currentPlaylistId) injections.resetButton()

  const changed = videoId !== session?.videoId || playlistId !== currentPlaylistId
  if (videoId !== notes.videoId || playlistId !== notes.playlistId) notes.setVideo(videoId, playlistId)
  progress.setPlaylist(playlistId)
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
  if (stopped) return
  if (!isCurrentInstance() || !messenger.valid) { shutdown(); return }
  if (isBlockingDialogOpen()) { setTimeout(inject, 1000); return }
  injections.injectSidebarLink()
  injections.injectAddButton()
  notes.inject()
  progress.inject()
}

/** YouTube mutates the DOM constantly; re-check injections at most once per frame. */
function scheduleInject() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => { scheduled = false; inject() })
}

function start() {
  document.documentElement.dataset.ytSeriesInstance = INSTANCE
  injections.removeForeignUi()

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (stopped || sender?.id !== chrome.runtime.id || message?.type !== EVENTS.STATE_UPDATED) return
    applySettings(message.state?.settings)
    const savedIds = message.state?.series
    if (!savedIds) return
    injections.syncSavedState(savedIds)
    notes.lookup()
    progress.refresh()
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
