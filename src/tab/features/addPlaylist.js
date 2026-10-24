// @ts-check
// "Add series via link" modal.
import { EVENTS } from '../../shared/events.js'
import { t } from '../../shared/i18n.js'
import { logger } from '../../shared/logger.js'
import { byId } from '../../shared/dom.js'
import { send } from '../core/api.js'
import { openModal, closeModal } from '../ui/modal.js'
import { errorMessage, toast } from '../ui/feedback.js'
import * as actions from '../actions.js'
import { shareDataFromUrl } from '../../shared/shareCodec.js'
import { openImport } from './share.js'

const log = logger.child('addPlaylist')
const MODAL_ID = 'addPlaylistModal'
const LIST_PARAM = /[?&]list=([A-Za-z0-9_-]{1,200})/

/** @param {string} message */
function showError(message) {
  const el = byId('playlistError')
  if (!el) return
  el.textContent = message
  el.classList.remove('hidden')
  byId('playlistUrlInput')?.setAttribute('aria-invalid', 'true')
}

async function submit() {
  const input = /** @type {HTMLInputElement} */ (byId('playlistUrlInput'))
  const button = /** @type {HTMLButtonElement} */ (byId('addPlaylistConfirm'))
  const url = input.value.trim()
  byId('playlistError')?.classList.add('hidden')
  input.removeAttribute('aria-invalid')
  if (!url) { showError(t('enter_url')); input.focus(); return }
  if (button.disabled) return
  // A shared list link opens the import preview instead.
  const shared = shareDataFromUrl(url)
  if (shared) {
    input.value = ''
    closeModal(MODAL_ID)
    openImport(shared)
    return
  }

  button.disabled = true
  button.textContent = t('adding')
  try {
    const listId = url.match(LIST_PARAM)?.[1]
    if (listId) {
      const existing = await send(EVENTS.PLAYLIST_EXISTS, { playlistId: listId })
      if (existing.exists) { showError(t('playlist_already_added')); return }
    }
    const response = await actions.addPlaylistByUrl(url)
    input.value = ''
    closeModal(MODAL_ID)
    toast(t('series_added_toast', { title: response.series?.title || '' }), { variant: 'success' })
  } catch (err) {
    log.warn('Add playlist failed', err)
    showError(errorMessage(err, 'add_failed'))
    input.focus()
  } finally {
    button.disabled = false
    button.textContent = t('add_series')
  }
}

export function initAddPlaylist() {
  byId('addPlaylistBtn')?.addEventListener('click', () => openModal(MODAL_ID))
  byId('addPlaylistConfirm')?.addEventListener('click', submit)
  byId('addPlaylistCancel')?.addEventListener('click', () => closeModal(MODAL_ID))
  byId('playlistUrlInput')?.addEventListener('keydown', event => { if (event.key === 'Enter') submit() })
}
