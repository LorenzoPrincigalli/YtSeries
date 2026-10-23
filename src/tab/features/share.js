// @ts-check
// Shareable lists: copy a link for a series or a collection, and import a list
// received as a link (pasted in "Add via link" or opened from share.html).
import { EVENTS } from '../../shared/events.js'
import { t } from '../../shared/i18n.js'
import { logger } from '../../shared/logger.js'
import { h } from '../../shared/dom.js'
import { mapLimit } from '../../shared/resilience.js'
import { shareUrl, decodeShare, shareListFromSeries } from '../../shared/shareCodec.js'
import { request } from '../core/api.js'
import { getState } from '../core/store.js'
import { openModal, closeModal } from '../ui/modal.js'
import { toast, toastError } from '../ui/feedback.js'

const log = logger.child('share')
const MODAL_ID = 'shareImportModal'

/** Copies a share link for these series. @param {string} name @param {any[]} seriesList */
export async function shareSeries(name, seriesList) {
  try {
    const url = await shareUrl(shareListFromSeries(name, seriesList))
    await navigator.clipboard.writeText(url)
    toast(t('share_copied'), { variant: 'success', action: { label: t('share_open'), run: () => window.open(url, '_blank', 'noopener') } })
  } catch (err) {
    log.warn('Share failed', err)
    toastError(err, 'share_failed')
  }
}

/** @param {string} encoded the #d= value of a share link */
export async function openImport(encoded) {
  let list
  try {
    list = await decodeShare(encoded)
  } catch (err) {
    log.warn('Invalid share link', err)
    toast(t('share_invalid'), { variant: 'error' })
    return
  }
  showImport(list)
}

/** @param {import('../../shared/shareCodec.js').ShareList} list */
function showImport(list) {
  document.getElementById(MODAL_ID)?.remove()
  const saved = getState()?.series || {}
  const rows = list.items.map(item => {
    const already = Object.hasOwn(saved, item.playlistId)
    const box = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: !already, disabled: already, dataset: { playlistId: item.playlistId } }))
    return {
      item, box,
      row: h('label', { class: ['share-row', already && 'is-saved'] },
        box,
        item.coverVideoId
          ? h('img', { class: 'share-row-thumb', src: `https://i.ytimg.com/vi/${item.coverVideoId}/mqdefault.jpg`, alt: '', loading: 'lazy' })
          : h('span', { class: 'share-row-thumb', 'aria-hidden': 'true' }),
        h('span', { class: 'share-row-text' },
          h('span', { class: 'share-row-title' }, item.title),
          h('span', { class: 'share-row-meta' }, [item.channelTitle, item.videoCount ? `${item.videoCount} ${t('episodes')}` : '', already ? t('share_already_saved') : ''].filter(Boolean).join(' · '))))
    }
  })
  const intoCollection = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: Boolean(list.name) }))
  const confirm = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: 'btn-primary' }))
  const updateConfirm = () => {
    const n = rows.filter(r => r.box.checked).length
    confirm.textContent = t('share_add_n', { n })
    confirm.disabled = n === 0
  }
  for (const { box } of rows) box.addEventListener('change', updateConfirm)
  updateConfirm()

  confirm.addEventListener('click', async () => {
    const chosen = rows.filter(r => r.box.checked).map(r => r.item)
    confirm.disabled = true
    let done = 0
    const results = await mapLimit(chosen, 2, async item => {
      const url = new URL('https://www.youtube.com/playlist')
      url.searchParams.set('list', item.playlistId)
      try {
        return (await request(EVENTS.PLAYLIST_ADD, { url: url.href })).series?.playlistId
      } finally {
        confirm.textContent = t('share_adding', { done: ++done, total: chosen.length })
      }
    })
    const added = results.flatMap(r => (r.status === 'fulfilled' && r.value ? [r.value] : []))
    if (added.length && intoCollection.checked && list.name) {
      await request(EVENTS.COLLECTION_MOVE, { ids: added, destination: list.name.slice(0, 40) }).catch(err => log.warn('Could not file the imported series', err))
    }
    closeModal(MODAL_ID)
    const failed = chosen.length - added.length
    toast(failed ? t('share_added_partial', { n: added.length, failed }) : t('share_added', { n: added.length }), { variant: failed ? 'error' : 'success' })
  })

  const overlay = h('div', { class: 'modal-overlay hidden', id: MODAL_ID },
    h('div', { class: 'modal-backdrop' }),
    h('div', { class: 'modal modal-share', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'shareImportTitle' },
      h('div', { class: 'modal-header' },
        h('h2', { id: 'shareImportTitle' }, list.name ? t('share_import_named', { name: list.name }) : t('share_import'))),
      h('div', { class: 'modal-body' },
        h('p', { class: 'modal-desc' }, t('share_import_desc')),
        h('div', { class: 'share-list' }, rows.map(r => r.row)),
        list.name && h('label', { class: 'share-collection' }, intoCollection, t('share_into_collection', { name: list.name.slice(0, 40) }))),
      h('div', { class: 'modal-footer' },
        h('button', { type: 'button', class: 'btn-secondary', onClick: () => closeModal(MODAL_ID) }, t('cancel')),
        confirm)))
  document.body.append(overlay)
  openModal(MODAL_ID, { onClose: () => overlay.remove() })
}
