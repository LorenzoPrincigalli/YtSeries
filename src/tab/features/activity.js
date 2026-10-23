// @ts-check
// Recent-activity bell: unread badge and dropdown panel.
import { t } from '../../shared/i18n.js'
import { h, byId, mount } from '../../shared/dom.js'
import { getState, setUi, subscribe } from '../core/store.js'
import * as actions from '../actions.js'
import { watchUrl } from '../seriesView.js'

const LABELS = {
  series_added: 'activity_series_added',
  series_deleted: 'activity_series_deleted',
  series_completed: 'activity_series_completed',
  series_reopened: 'activity_series_reopened',
  series_restored: 'activity_series_restored',
  collection_changed: 'activity_collection_changed',
  episode_watched: 'activity_episode_watched',
  episode_unwatched: 'activity_episode_unwatched',
  library_imported: 'activity_library_imported',
  backup_restored: 'activity_backup_restored',
  series_milestone: 'activity_series_milestone'
}

let open = false

function locale() {
  const language = getState()?.settings?.language || 'system'
  return language === 'system' ? navigator.language : language
}

/** @param {number} at */
function relativeTime(at) {
  const minutes = Math.round((at - Date.now()) / 60_000)
  const format = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute')
  if (Math.abs(minutes) < 1440) return format.format(Math.round(minutes / 60), 'hour')
  return format.format(Math.round(minutes / 1440), 'day')
}

/** @param {any} event */
function activityRow(event) {
  const state = getState()
  const series = event.playlistId ? state?.series?.[event.playlistId] : null
  const video = series?.videos?.find(v => v.id === event.videoId)
  const title = video?.title || series?.title || event.title || t('unknown_series')
  const content = [
    h('span', { class: 'activity-panel-marker', 'aria-hidden': 'true' }, event.type === 'episode_watched' ? '✓' : event.type === 'series_milestone' ? '★' : '•'),
    h('span', { class: 'activity-panel-body' }, t(LABELS[event.type] || 'recent_activity_item', { title })),
    h('time', { datetime: new Date(event.at).toISOString() }, relativeTime(event.at))
  ]
  if (video) {
    return h('a', {
      class: 'activity-panel-item activity-panel-link',
      href: watchUrl(video.id, series.playlistId, video.watched ? 0 : video.resumeTime),
      target: '_blank',
      rel: 'noopener noreferrer',
      onClick: () => toggle(false)
    }, content)
  }
  if (series) {
    return h('button', {
      type: 'button',
      class: 'activity-panel-item activity-panel-link',
      onClick: () => { toggle(false); setUi({ detailId: series.playlistId }) }
    }, content)
  }
  return h('div', { class: 'activity-panel-item' }, content)
}

function render() {
  const state = getState()
  const badge = byId('activityBadge')
  const list = byId('activityPanelList')
  const button = byId('activityBtn')
  if (!badge || !list || !button || !state) return
  const events = state.activity || []
  const unread = events.filter(event => event.at > (state.activityReadAt || 0)).length
  badge.textContent = unread > 99 ? '99+' : String(unread)
  badge.classList.toggle('hidden', unread === 0)
  button.setAttribute('aria-label', t('activity_unread', { n: unread }))
  if (open) {
    mount(list, events.length ? events.map(activityRow) : h('p', { class: 'activity-panel-empty' }, t('no_activity')))
  }
}

/** @param {boolean} [force] */
function toggle(force) {
  const panel = byId('activityPanel')
  const button = byId('activityBtn')
  if (!panel || !button) return
  open = force ?? !open
  panel.classList.toggle('hidden', !open)
  button.setAttribute('aria-expanded', String(open))
  if (open) {
    render()
    const latest = Math.max(0, ...(getState()?.activity || []).map(event => event.at))
    actions.markActivityRead(latest)
  }
}

export function initActivity() {
  byId('activityBtn')?.addEventListener('click', event => { event.stopPropagation(); toggle() })
  byId('activityPanelClose')?.addEventListener('click', () => { toggle(false); byId('activityBtn')?.focus() })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) {
      toggle(false)
      byId('activityBtn')?.focus()
    }
  })
  document.addEventListener('click', event => {
    const container = document.querySelector('.activity-menu-container')
    if (open && container && !container.contains(/** @type {Node} */ (event.target))) toggle(false)
  })
  subscribe(changed => { if (changed.has('server')) render() })
}
