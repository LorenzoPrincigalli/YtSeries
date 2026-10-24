// @ts-check
// Tracks one (video, playlist) viewing session: binds to YouTube's <video>,
// saves progress (throttled), marks the episode watched on "ended" and
// triggers the next-episode card near the end (kept through pause and the
// end of the video, where it also covers "all episodes watched"). Disposing
// the session releases every timer, listener and pending request it created.
import { EVENTS } from '../shared/events.js'
import { t } from '../shared/i18n.js'
import { logger } from '../shared/logger.js'
import { NextEpisodeOverlay } from './nextEpisodeOverlay.js'
import { findVideo, isAdPlaying } from './youtubeDom.js'
import { showToast } from './toast.js'

const log = logger.child('playback')

const VIDEO_POLL_MS = 1000
const PROGRESS_TICK_MS = 5000
const PROGRESS_DEBOUNCE_MS = 3000
const PROGRESS_MIN_INTERVAL_MS = 10_000
const OVERLAY_WINDOW_S = 30

export class PlaybackSession {
  /**
   * @param {{ videoId: string, playlistId: string | null, messenger: { send: (type: string, payload?: any) => Promise<any> }, overlayEnabled: () => boolean }} options
   */
  constructor({ videoId, playlistId, messenger, overlayEnabled }) {
    this.videoId = videoId
    this.playlistId = playlistId
    this.messenger = messenger
    this.overlay = new NextEpisodeOverlay(messenger, overlayEnabled)
    this.disposed = false
    this.video = null
    this.videoListeners = []
    this.pollTimer = null
    this.tickTimer = null
    this.saveTimer = null
    this.lastSavedAt = 0
    this.untracked = false // true once the background says this video is in no saved series
    this.onVisibility = () => (document.hidden ? this.pause() : this.poll())
  }

  start() {
    document.addEventListener('visibilitychange', this.onVisibility)
    this.poll()
    this.pollTimer = setInterval(() => this.poll(), VIDEO_POLL_MS)
  }

  dispose() {
    this.disposed = true
    clearInterval(this.pollTimer)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.unbindVideo()
    this.overlay.hide()
  }

  /** YouTube swaps <video> elements on navigation; follow whichever is current. */
  poll() {
    if (this.disposed || document.hidden) return
    const video = findVideo()
    if (!video) { this.unbindVideo(); return }
    if (video === this.video) {
      if (!this.tickTimer && !video.paused && !video.ended) this.startTicking()
      return
    }
    this.unbindVideo()
    this.bindVideo(video)
  }

  /** @param {HTMLVideoElement} video */
  bindVideo(video) {
    this.video = video
    const on = (event, handler) => {
      video.addEventListener(event, handler)
      this.videoListeners.push(() => video.removeEventListener(event, handler))
    }
    on('ended', () => this.onEnded())
    on('seeking', () => this.cancelSave())
    on('seeked', () => this.hideOverlayIfEarly())
    on('pause', () => this.pause())
    on('playing', () => { if (!this.disposed) this.startTicking() })
    this.startTicking()
  }

  unbindVideo() {
    for (const off of this.videoListeners.splice(0)) off()
    this.video = null
    this.stopTicking()
  }

  /** Pausing keeps the card: the browser fires "pause" right before "ended". */
  pause() {
    this.stopTicking()
  }

  cancelSave() {
    clearTimeout(this.saveTimer)
    this.saveTimer = null
  }

  clearTransient() {
    this.overlay.hide()
    this.cancelSave()
  }

  /** Seeked back out of the last seconds: the card is no longer relevant. */
  hideOverlayIfEarly() {
    const video = this.video
    if (!video || !(video.duration > 0) || !Number.isFinite(video.duration)) return
    if (video.duration - video.currentTime > OVERLAY_WINDOW_S && this.overlay.active) this.overlay.hide()
  }

  startTicking() {
    this.stopTicking()
    const video = this.video
    if (!video || document.hidden || video.paused || video.ended) return
    this.tickTimer = setInterval(() => this.tick(), PROGRESS_TICK_MS)
    this.tick()
  }

  stopTicking() {
    clearInterval(this.tickTimer)
    this.tickTimer = null
    this.cancelSave()
  }

  tick() {
    const video = this.video
    if (this.disposed || !video || document.hidden || video.paused || video.ended || video.seeking) return
    if (isAdPlaying()) { this.clearTransient(); return }
    if (!(video.currentTime > 0) || !(video.duration > 0) || !Number.isFinite(video.duration)) return

    const currentTime = Math.round(video.currentTime)
    const duration = Math.round(video.duration)
    const remaining = duration - currentTime

    if (remaining > OVERLAY_WINDOW_S) {
      if (this.overlay.active) this.overlay.hide()
    } else {
      this.showOverlay(false)
    }

    // Debounced and rate-limited: at most one write every 10 s of playback.
    clearTimeout(this.saveTimer)
    const progress = Math.min(99, Math.max(0, Math.round((video.currentTime / video.duration) * 100)))
    this.saveTimer = setTimeout(() => this.saveProgress(progress, currentTime, duration), PROGRESS_DEBOUNCE_MS)
  }

  /** @param {number} progress @param {number} currentTime @param {number} duration */
  saveProgress(progress, currentTime, duration) {
    const video = this.video
    if (this.untracked || this.disposed || !video || document.hidden || video.paused || video.ended || video.seeking || isAdPlaying()) return
    const now = Date.now()
    if (now - this.lastSavedAt < PROGRESS_MIN_INTERVAL_MS) return
    this.lastSavedAt = now
    this.messenger.send(EVENTS.EPISODE_PROGRESS, { videoId: this.videoId, playlistId: this.playlistId || '', progress, currentTime, duration })
      .then(response => {
        // Most videos people watch are not in a saved series: stop asking for this session.
        if (response.error === 'VIDEO_NOT_FOUND') this.untracked = true
      })
  }

  /** @param {boolean} atEnd the video finished: also offer the "all episodes watched" card */
  showOverlay(atEnd) {
    if (!this.playlistId || this.disposed) return
    this.overlay.maybeShow(this.videoId, this.playlistId, () => !this.disposed, { atEnd })
      .catch(err => log.warn('Next-episode lookup failed', err))
  }

  onEnded() {
    this.stopTicking()
    if (this.disposed) return
    this.messenger.send(EVENTS.EPISODE_WATCH, { videoId: this.videoId, playlistId: this.playlistId || '' }).then(response => {
      const milestone = response?.milestone
      if (milestone) showToast(t(milestone.percent === 100 ? 'milestone_done' : 'milestone_toast', milestone))
    })
    // Skipped to the end, or a short episode: the card may not be up yet.
    this.showOverlay(true)
  }
}
