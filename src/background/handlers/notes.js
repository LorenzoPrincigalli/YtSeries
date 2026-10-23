// @ts-check
import { EVENTS } from '../../shared/events.js'
import { AppError } from '../../shared/errors.js'
import { s } from '../../shared/schema.js'
import { commit } from '../context.js'

/** @typedef {import('../context.js').BackgroundContext} Ctx */

const NOTE_ID = /^[A-Za-z0-9_-]{1,64}$/
const text = s.string({ min: 1, max: 1000 })

/** @param {Ctx} ctx @param {{ videoId: string, playlistId?: string, time: number, text: string }} payload */
async function addNote(ctx, { videoId, playlistId, time, text }) {
  // On YouTube the list= parameter is only a hint, as for progress events.
  const target = ctx.store.resolvePlaylistForVideo(videoId, playlistId)
  if (!target) throw new AppError('VIDEO_NOT_FOUND', 'No series contains this video')
  const { noteId } = await commit(ctx, store => ({
    noteId: store.addNote(target.playlistId, videoId, time, text),
    changed: [target.playlistId]
  }))
  // Also called from YouTube pages: no library state in the response (the broadcast updates extension pages).
  return { success: true, noteId, playlistId: target.playlistId }
}

/** @param {Ctx} ctx @param {{ playlistId: string, noteId: string, text: string }} payload */
async function updateNote(ctx, { playlistId, noteId, text }) {
  await commit(ctx, store => {
    store.updateNote(playlistId, noteId, text)
    return { changed: [playlistId] }
  })
  return { success: true, state: ctx.store.getState() }
}

/** @param {Ctx} ctx @param {{ playlistId: string, noteId: string }} payload */
async function deleteNote(ctx, { playlistId, noteId }) {
  await commit(ctx, store => {
    store.deleteNote(playlistId, noteId)
    return { changed: [playlistId] }
  })
  return { success: true, state: ctx.store.getState() }
}

const noteRoutes = {
  [EVENTS.NOTE_ADD]: {
    contexts: ['extension', 'content'],
    schema: s.object({
      videoId: s.id(),
      playlistId: s.optional(s.string({ max: 200 })),
      time: s.number({ min: 0, max: 7 * 24 * 3600 }),
      text
    }),
    handler: addNote
  },
  [EVENTS.NOTE_UPDATE]: {
    schema: s.object({ playlistId: s.id(), noteId: s.string({ min: 1, max: 64, pattern: NOTE_ID }), text }),
    handler: updateNote
  },
  [EVENTS.NOTE_DELETE]: {
    schema: s.object({ playlistId: s.id(), noteId: s.string({ min: 1, max: 64, pattern: NOTE_ID }) }),
    handler: deleteNote
  }
}

export { noteRoutes }
