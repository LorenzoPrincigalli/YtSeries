// @ts-check
// Episode notes in the series detail: list grouped by episode, inline edit,
// delete and Markdown export. Notes are taken on YouTube (content script).
import { t } from '../../shared/i18n.js'
import { h } from '../../shared/dom.js'
import { confirmDialog } from '../ui/modal.js'
import * as actions from '../actions.js'
import { watchUrl, formatDuration } from '../seriesView.js'

/**
 * Notes still active, in episode order then by timestamp.
 * @param {any} series @returns {{ id: string, v: string, t: number, x: string, index: number }[]}
 */
export function activeNotes(series) {
  const order = new Map((series.videos || []).map((video, i) => [video.id, i]))
  return Object.entries(series.notes || {})
    .filter(([, note]) => !note.d && order.has(note.v))
    .map(([id, note]) => ({ id, v: note.v, t: note.t, x: note.x, index: /** @type {number} */ (order.get(note.v)) }))
    .sort((a, b) => a.index - b.index || a.t - b.t)
}

/** @param {any} series @param {number} index */
const episodeHeading = (series, index) => `${t('episode')} ${index + 1} · ${series.videos[index].title}`

/** Markdown export: one section per episode, each note linking to its moment. @param {any} series */
export function notesMarkdown(series, notes = activeNotes(series)) {
  const playlist = new URL('https://www.youtube.com/playlist')
  playlist.searchParams.set('list', series.playlistId)
  const lines = [`# ${series.title}`, '', series.channelTitle ? `${series.channelTitle} — ${playlist.href}` : playlist.href]
  let current = -1
  for (const note of notes) {
    if (note.index !== current) {
      current = note.index
      lines.push('', `## ${episodeHeading(series, note.index)}`, '')
    }
    lines.push(`- [${formatDuration(note.t)}](${watchUrl(note.v, series.playlistId, note.t)}) ${note.x.replace(/\s*\n\s*/g, ' ')}`)
  }
  return `${lines.join('\n')}\n`
}

/** @param {any} series @param {ReturnType<typeof activeNotes>} notes */
function download(series, notes) {
  const url = URL.createObjectURL(new Blob([notesMarkdown(series, notes)], { type: 'text/markdown' }))
  const name = String(series.title || 'notes').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'notes'
  h('a', { href: url, download: `${name}-notes.md` }).click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** @param {any} series @param {ReturnType<typeof activeNotes>[number]} note @param {HTMLElement} row */
function editor(series, note, row) {
  const input = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'note-input', maxLength: 1000, rows: 3, 'aria-label': t('note_text') }))
  input.value = note.x
  const form = h('form', {
    class: 'note-row note-editing',
    onSubmit: event => {
      event.preventDefault()
      const text = input.value.trim()
      if (text && text !== note.x) actions.updateNote(series.playlistId, note.id, text)
      else form.replaceWith(row)
    }
  },
  h('span', { class: 'note-time' }, formatDuration(note.t)),
  input,
  h('div', { class: 'note-actions' },
    h('button', { type: 'submit', class: 'btn-primary' }, t('note_save')),
    h('button', { type: 'button', class: 'btn-secondary', onClick: () => form.replaceWith(row) }, t('cancel'))))
  queueMicrotask(() => input.focus())
  return form
}

/** @param {any} series @param {ReturnType<typeof activeNotes>[number]} note */
function noteRow(series, note) {
  const time = formatDuration(note.t)
  const row = h('div', { class: 'note-row', dataset: { noteId: note.id } },
    h('a', {
      class: 'note-time',
      href: watchUrl(note.v, series.playlistId, note.t),
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': t('note_open_at', { time })
    }, time),
    h('p', { class: 'note-text' }, note.x),
    h('div', { class: 'note-actions' },
      h('button', { type: 'button', class: 'note-action', 'aria-label': t('note_edit_at', { time }), onClick: () => row.replaceWith(editor(series, note, row)) }, t('note_edit')),
      h('button', {
        type: 'button',
        class: 'note-action note-action-danger',
        'aria-label': t('note_delete_at', { time }),
        onClick: async () => {
          if (await confirmDialog(t('note_delete_confirm'), { confirmLabel: t('delete'), danger: true })) actions.deleteNote(series.playlistId, note.id)
        }
      }, t('delete'))))
  return row
}

/** @param {any} series */
export function notesSection(series) {
  const notes = activeNotes(series)
  const list = h('div', { class: 'notes-list' })
  let current = -1
  for (const note of notes) {
    if (note.index !== current) {
      current = note.index
      list.append(h('h4', { class: 'notes-episode' }, episodeHeading(series, note.index)))
    }
    list.append(noteRow(series, note))
  }
  return h('section', { class: 'detail-notes', 'aria-labelledby': 'detailNotesTitle' },
    h('div', { class: 'episodes-header' },
      h('h3', { id: 'detailNotesTitle' }, notes.length ? t('notes_title_count', { n: notes.length }) : t('notes_title')),
      notes.length > 0 && h('div', { class: 'episodes-header-right' },
        h('button', { type: 'button', class: 'btn-secondary', onClick: () => download(series, notes) }, t('notes_export')))),
    notes.length ? list : h('p', { class: 'notes-empty' }, t('notes_empty')))
}
