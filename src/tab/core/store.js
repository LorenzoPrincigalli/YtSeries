// @ts-check
// Client-side view store. Server state is read-only here: it only ever comes
// from STATE_GET / STATE_UPDATED or a command response that carries `state`.
// UI state (current section, filters, search) lives next to it so views
// render from one place instead of a dozen module-level variables.

/**
 * @typedef {{
 *   section: 'home' | 'saved' | 'schedule',
 *   filter: 'all' | 'watching' | 'completed' | 'new',
 *   collection: string,
 *   search: string,
 *   searchResults: { playlists: any[], channels: any[] } | null,
 *   searchStatus: 'idle' | 'hint' | 'loading' | 'error',
 *   searchError: string | null,
 *   recommended: any[] | null,
 *   detailId: string | null
 * }} UiState
 */

/** @type {UiState} */
const INITIAL_UI = {
  section: 'home',
  filter: 'all',
  collection: '',
  search: '',
  searchResults: null,
  searchStatus: 'idle',
  searchError: null,
  recommended: null,
  detailId: null
}

/** @type {{ state: any, syncStatus: any, ui: UiState }} */
const current = { state: null, syncStatus: null, ui: { ...INITIAL_UI } }
/** @type {Set<(changed: Set<string>) => void>} */
const listeners = new Set()
/** @type {Set<string>} */
let pending = new Set()
let scheduled = false

const schedule = globalThis.requestAnimationFrame
  ? fn => globalThis.requestAnimationFrame(() => fn())
  : fn => setTimeout(fn, 0)

function notify(kind) {
  pending.add(kind)
  if (scheduled) return
  scheduled = true
  // Coalesces bursts (e.g. a command response followed by its broadcast)
  // into one render per frame.
  schedule(flush)
}

/** Runs pending renders synchronously (e.g. before moving focus). */
export function flush() {
  if (!pending.size) { scheduled = false; return }
  const changed = pending
  pending = new Set()
  scheduled = false
  for (const listener of listeners) listener(changed)
}

export const getState = () => current.state
export const getSyncStatus = () => current.syncStatus
export const getUi = () => current.ui

/** @param {{ state?: any, syncStatus?: any }} update */
export function setServer({ state, syncStatus }) {
  if (state) current.state = state
  if (syncStatus) current.syncStatus = syncStatus
  notify('server')
}

/** @param {Partial<UiState>} patch */
export function setUi(patch) {
  current.ui = { ...current.ui, ...patch }
  notify('ui')
}

/** @param {(changed: Set<string>) => void} listener */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test helper. */
export function resetStore() {
  current.state = null
  current.syncStatus = null
  current.ui = { ...INITIAL_UI }
  pending = new Set()
  scheduled = false
  listeners.clear()
}
