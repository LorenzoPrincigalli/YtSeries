// @ts-check
// "This week" strip on the home page: weekly goal, streak and time watched.
import { t } from '../../shared/i18n.js'
import { h } from '../../shared/dom.js'
import { streak, weekProgress } from '../../shared/seriesStats.js'
import { formatLength } from '../seriesView.js'

/**
 * @param {any[]} seriesList @param {number} goal episodes per week, 0 = no goal
 * @param {() => void} onEditGoal @param {number} [now]
 */
export function weekStrip(seriesList, goal, onEditGoal, now = Date.now()) {
  const { episodes, seconds } = weekProgress(seriesList, now)
  const days = streak(seriesList, now)
  const percent = goal ? Math.min(100, (episodes / goal) * 100) : 0
  return h('section', { class: 'week-strip', 'aria-labelledby': 'weekStripTitle' },
    h('div', { class: 'week-strip-main' },
      h('h2', { class: 'week-strip-title', id: 'weekStripTitle' }, t('week_title')),
      h('p', { class: 'week-strip-count' },
        goal ? t('week_goal_progress', { done: episodes, goal }) : t('week_episodes', { n: episodes }),
        goal > 0 && episodes >= goal && h('span', { class: 'week-strip-reached' }, t('goal_reached'))),
      goal > 0 && h('div', {
        class: 'week-strip-bar',
        role: 'progressbar',
        'aria-label': t('weekly_goal'),
        'aria-valuemin': '0',
        'aria-valuemax': String(goal),
        'aria-valuenow': String(Math.min(episodes, goal))
      }, h('div', { class: 'week-strip-fill', style: { '--progress': `${percent}%` } }))),
    (days > 0 || seconds > 0) && h('ul', { class: 'week-strip-stats' },
      days > 0 && h('li', null, t('streak_days', { n: days })),
      seconds > 0 && h('li', null, t('week_time', { time: formatLength(seconds) }))),
    h('button', { type: 'button', class: 'btn-secondary week-strip-goal', onClick: onEditGoal }, goal ? t('edit_goal') : t('set_goal')))
}
