// @ts-check
import { EVENTS } from '../../shared/events.js'
import { t } from '../../shared/i18n.js'
import { request } from '../core/api.js'
import { getState, setUi } from '../core/store.js'
import { toast } from '../ui/feedback.js'
import { confirmDialog } from '../ui/modal.js'
import { applyResponse, command } from '../actions.js'
import { openCollectionEditor } from '../components/collectionEditor.js'
import { collectionNames } from '../seriesView.js'
import { clearSearch } from './header.js'

const MESSAGE_BY_MODE = { create: EVENTS.COLLECTION_CREATE, edit: EVENTS.COLLECTION_EDIT, add: EVENTS.COLLECTION_MOVE, move: EVENTS.COLLECTION_MOVE }

/** @param {any} response */
function offerUndo(response) {
  const message = t('collection_move_result', { moved: response.moved, skipped: response.skipped })
  if (!response.undoToken) { toast(message); return }
  toast(message, {
    action: {
      label: t('undo'),
      run: async () => {
        const result = await command(EVENTS.COLLECTION_UNDO, { token: response.undoToken }, 'collection_undo_expired')
        if (result) toast(t('collection_undo_result', { restored: result.restored, skipped: result.skipped }))
      }
    }
  })
}

/**
 * Create / edit / add-to / move-from / delete a collection.
 * @param {'create' | 'edit' | 'add' | 'move' | 'delete'} mode
 * @param {string} name currently selected collection ('' for create)
 */
export async function manageCollection(mode, name) {
  const state = getState()
  if (mode === 'delete') {
    if (!await confirmDialog(t('delete_collection_confirm', { name }), { confirmLabel: t('delete'), danger: true })) return
    if (await command(EVENTS.COLLECTION_DELETE, { name }, 'collection_save_error')) setUi({ collection: '' })
    return
  }

  openCollectionEditor({
    name,
    mode,
    series: Object.values(state.series).filter(s => mode === 'create' || mode === 'add' || s.collection === name),
    collections: collectionNames(state),
    // Throws on failure so the editor can show the error inline and stay open.
    onSave: async payload => {
      const response = applyResponse(await request(MESSAGE_BY_MODE[mode], payload))
      if (mode === 'create') {
        clearSearch()
        setUi({ collection: payload.name })
      } else if (mode === 'edit') {
        setUi({ collection: payload.nextName })
      }
      if (mode === 'move' || mode === 'add') offerUndo(response)
    }
  })
}
