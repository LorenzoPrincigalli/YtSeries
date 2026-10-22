// @ts-check
import { EVENTS } from '../../shared/events.js'
import { AppError } from '../../shared/errors.js'
import { s } from '../../shared/schema.js'
import { commit } from '../context.js'

/** @typedef {import('../context.js').BackgroundContext} Ctx */

const UNDO_TTL_MS = 60_000
const collectionName = s.string({ min: 1, max: 40 })

/**
 * Short-lived undo tokens for bulk moves. In memory on purpose: an undo older
 * than the service worker's lifetime is past its TTL anyway.
 * @type {Map<string, { expires: number, entries: any[] }>}
 */
const undoTokens = new Map()

function pruneUndo(now = Date.now()) {
  for (const [token, value] of undoTokens) if (value.expires < now) undoTokens.delete(token)
}

/** @param {Ctx} ctx @param {{ name: string, nextName: string, cover: string }} payload */
async function editCollection(ctx, { name, nextName, cover }) {
  const { ids } = await commit(ctx, store => {
    const ids = store.editCollection(name, nextName, cover)
    return { ids, changed: ids }
  })
  return { success: true, state: ctx.store.getState(), moved: ids.length, skipped: 0, undoToken: null }
}

/** @param {Ctx} ctx @param {{ ids: string[], destination: string }} payload */
async function moveSeries(ctx, { ids, destination }) {
  const before = ctx.store.getSeries()
  const { moved } = await commit(ctx, store => {
    const moved = store.moveCollectionSeries(ids, destination)
    return { moved, changed: moved }
  })

  let undoToken = null
  if (moved.length) {
    pruneUndo()
    undoToken = crypto.randomUUID()
    undoTokens.set(undoToken, {
      expires: Date.now() + UNDO_TTL_MS,
      entries: moved.map(id => {
        const after = /** @type {any} */ (ctx.store.getSeriesById(id))
        return { id, collection: before[id].collection || '', cover: before[id].collectionCover || '', destination: after.collection || '', afterAt: after.collectionUpdatedAt }
      })
    })
  }
  return { success: true, state: ctx.store.getState(), moved: moved.length, skipped: new Set(ids).size - moved.length, undoToken }
}

/** @param {Ctx} ctx @param {{ token: string }} payload */
async function undoMove(ctx, { token }) {
  const operation = undoTokens.get(token)
  if (!operation || operation.expires < Date.now()) throw new AppError('UNDO_EXPIRED')
  const { restored } = await commit(ctx, store => {
    const restored = store.undoCollectionMove(operation.entries)
    return { restored, changed: restored }
  })
  undoTokens.delete(token)
  return { success: true, state: ctx.store.getState(), restored: restored.length, skipped: operation.entries.length - restored.length }
}

/** @param {Ctx} ctx @param {{ name: string, ids?: string[] }} payload */
async function createCollection(ctx, { name, ids = [] }) {
  await commit(ctx, store => {
    store.createCollection(name, ids)
    return { changed: ids }
  })
  return { success: true, state: ctx.store.getState() }
}

/** @param {Ctx} ctx @param {{ name: string }} payload */
async function deleteCollection(ctx, { name }) {
  await commit(ctx, store => ({ changed: store.deleteCollection(name) }))
  return { success: true, state: ctx.store.getState() }
}

/** @param {Ctx} ctx @param {{ through: number }} payload */
async function markActivityRead(ctx, { through }) {
  const { activityReadAt } = await commit(ctx, store => ({ activityReadAt: store.markActivityRead(through) }))
  return { success: true, activityReadAt }
}

const seriesIds = s.array(s.id(), { max: 2000 })

const collectionRoutes = {
  [EVENTS.COLLECTION_EDIT]: {
    schema: s.object({ name: collectionName, nextName: collectionName, cover: s.string({ max: 2048 }) }),
    handler: editCollection
  },
  [EVENTS.COLLECTION_MOVE]: {
    schema: s.object({ ids: s.array(s.id(), { min: 1, max: 2000 }), destination: s.string({ max: 40 }) }),
    handler: moveSeries
  },
  [EVENTS.COLLECTION_UNDO]: { schema: s.object({ token: s.string({ min: 1, max: 64 }) }), handler: undoMove },
  [EVENTS.COLLECTION_CREATE]: { schema: s.object({ name: collectionName, ids: s.optional(seriesIds) }), handler: createCollection },
  [EVENTS.COLLECTION_DELETE]: { schema: s.object({ name: collectionName }), handler: deleteCollection },
  [EVENTS.ACTIVITY_MARK_READ]: { schema: s.object({ through: s.number({ min: 0, integer: true }) }), handler: markActivityRead }
}

export { collectionRoutes }
