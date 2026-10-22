// @ts-check
import { EVENTS } from '../shared/events.js'
import { logger } from '../shared/logger.js'

const log = logger.child('broadcast')

/** "Receiving end does not exist" just means no extension page is open. */
const isNoReceiver = err => /Receiving end does not exist|message port closed/i.test(String(err?.message))

/**
 * Pushes state to open extension pages (full state) and YouTube tabs (only
 * settings and the set of saved playlist ids — content scripts run in the
 * page's renderer and never need progress data).
 * @param {{ store: any, getSyncStatus: () => any }} deps
 */
function createBroadcaster({ store, getSyncStatus }) {
  return async function broadcastStateUpdate() {
    if (!chrome.runtime?.sendMessage) return
    const state = store.getState()

    try {
      await chrome.runtime.sendMessage({ type: EVENTS.STATE_UPDATED, state, syncStatus: getSyncStatus(), _broadcast: true })
    } catch (err) {
      if (!isNoReceiver(err)) log.warn('Extension page broadcast failed', err)
    }

    const contentState = {
      settings: state.settings,
      series: Object.fromEntries(Object.keys(state.series).map(id => [id, true]))
    }
    try {
      const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' })
      const results = await Promise.allSettled(tabs.map(tab =>
        chrome.tabs.sendMessage(/** @type {number} */ (tab.id), { type: EVENTS.STATE_UPDATED, state: contentState, _broadcast: true })))
      const failures = results.filter(r => r.status === 'rejected' && !isNoReceiver(r.reason))
      if (failures.length) log.warn(`Content broadcast failed for ${failures.length} tab(s)`)
    } catch (err) {
      log.warn('Could not query YouTube tabs for broadcast', err)
    }
  }
}

export { createBroadcaster }
