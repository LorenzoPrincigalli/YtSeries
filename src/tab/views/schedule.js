// @ts-check
// "Upcoming" view: the next episodes each series is expected to release (from
// its own rhythm, see releaseForecast), late ones, and what came out lately.
import { t } from '../../shared/i18n.js'
import { h, img } from '../../shared/dom.js'
import { releaseForecast, startOfDay } from '../../shared/seriesStats.js'
import { setUi } from '../core/store.js'
import { isComplete } from '../seriesView.js'

const DAY_MS = 86_400_000
const DAYS_AHEAD = 7

/** @param {any} series */
const openDetail = series => setUi({ detailId: series.playlistId })

/** @param {number} cadenceDays */
const rhythm = cadenceDays => (cadenceDays < 1.5 ? t('schedule_every_day') : t('schedule_every', { n: Math.round(cadenceDays) }))

/** @param {number} at */
const dayMonth = at => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** @param {number} dayStart @param {number} today */
function dayLabel(dayStart, today) {
  if (dayStart === today) return t('schedule_today')
  if (dayStart === startOfDay(today + DAY_MS + 3_600_000)) return t('schedule_tomorrow')
  return new Date(dayStart).toLocaleDateString(undefined, { weekday: 'long' })
}

/**
 * Series that are still going, with a forecast.
 * @param {any[]} seriesList @param {number} now
 * @returns {{ series: any, forecast: NonNullable<ReturnType<typeof releaseForecast>> }[]}
 */
export function upcoming(seriesList, now = Date.now()) {
  return seriesList
    .filter(series => !series.completed)
    .map(series => ({ series, forecast: releaseForecast(series, now) }))
    .filter(entry => entry.forecast !== null)
    .map(entry => /** @type {any} */ (entry))
    .sort((a, b) => a.forecast.nextAt - b.forecast.nextAt)
}

/** Episodes published in the last week, newest first. @param {any[]} seriesList @param {number} now */
export function recentReleases(seriesList, now = Date.now()) {
  const since = now - DAYS_AHEAD * DAY_MS
  return seriesList
    .filter(series => !isComplete(series))
    .flatMap(series => (series.videos || [])
      .filter(video => !video.excluded && Date.parse(video.publishedAt) >= since)
      .map(video => ({ series, video, at: Date.parse(video.publishedAt) })))
    .sort((a, b) => b.at - a.at)
}

/** @param {any} series @param {string} meta */
function seriesChip(series, meta) {
  return h('button', { type: 'button', class: 'schedule-item', onClick: () => openDetail(series) },
    img({ class: 'schedule-item-thumb', src: series.thumbnail, alt: '' }),
    h('span', { class: 'schedule-item-text' },
      h('span', { class: 'schedule-item-title' }, series.title),
      h('span', { class: 'schedule-item-meta' }, meta)))
}

/** @param {any[]} all @param {number} [now] */
export function renderSchedule(all, now = Date.now()) {
  const today = startOfDay(now)
  const entries = upcoming(all, now)
  const late = entries.filter(entry => entry.forecast.overdue)
  const recent = recentReleases(all, now)

  const days = []
  for (let i = 0, day = today; i < DAYS_AHEAD; i++, day = startOfDay(day + DAY_MS + 3_600_000)) days.push(day)
  const weekEnd = startOfDay(days[days.length - 1] + DAY_MS + 3_600_000)
  const later = entries.filter(entry => entry.forecast.nextAt >= weekEnd)
  const columns = days.map(day => {
    const next = startOfDay(day + DAY_MS + 3_600_000)
    const due = entries.filter(entry => !entry.forecast.overdue && entry.forecast.nextAt < next && (entry.forecast.nextAt >= day || day === today))
    return h('div', { class: ['schedule-day', day === today && 'is-today'] },
      h('h3', { class: 'schedule-day-title' }, dayLabel(day, today), h('span', { class: 'schedule-day-date' }, dayMonth(day))),
      due.length
        ? due.map(({ series, forecast }) => seriesChip(series, `${t('schedule_expected')} · ${rhythm(forecast.cadenceDays)}`))
        : h('p', { class: 'schedule-day-empty', 'aria-hidden': 'true' }, t('schedule_nothing')))
  })

  return h('div', { class: 'schedule-view' },
    h('header', { class: 'schedule-header' },
      h('h2', { class: 'section-title' }, t('schedule_title')),
      h('p', { class: 'schedule-desc' }, t('schedule_desc'))),
    !entries.length && !recent.length
      ? h('p', { class: 'empty-state-desc schedule-empty' }, t('schedule_empty'))
      : [
          late.length > 0 && h('section', { class: 'schedule-late', 'aria-labelledby': 'scheduleLateTitle' },
            h('h3', { class: 'schedule-subtitle', id: 'scheduleLateTitle' }, t('schedule_late')),
            h('div', { class: 'schedule-list' }, late.map(({ series, forecast }) =>
              seriesChip(series, `${t('schedule_late_since', { date: dayMonth(forecast.nextAt) })} · ${rhythm(forecast.cadenceDays)}`)))),
          h('div', { class: 'schedule-week' }, columns),
          later.length > 0 && h('section', { class: 'schedule-later', 'aria-labelledby': 'scheduleLaterTitle' },
            h('h3', { class: 'schedule-subtitle', id: 'scheduleLaterTitle' }, t('schedule_later')),
            h('div', { class: 'schedule-list' }, later.map(({ series, forecast }) =>
              seriesChip(series, `${t('schedule_expected')} ${dayMonth(forecast.nextAt)} · ${rhythm(forecast.cadenceDays)}`)))),
          recent.length > 0 && h('section', { class: 'schedule-recent', 'aria-labelledby': 'scheduleRecentTitle' },
            h('h3', { class: 'schedule-subtitle', id: 'scheduleRecentTitle' }, t('schedule_recent')),
            h('div', { class: 'schedule-list' }, recent.slice(0, 20).map(({ series, video, at }) =>
              seriesChip(series, `${video.title} · ${dayMonth(at)}`))))
        ])
}
