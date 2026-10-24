// @ts-check
// Achievements dialog (trophy button in the header): this week's goal and
// streak, then the badge collection. Also announces badges earned while the
// dashboard is open (toast + dot on the trophy until the dialog is opened).
import { t } from '../../shared/i18n.js'
import { h, byId } from '../../shared/dom.js'
import { svg } from '../../shared/icons.js'
import { computeBadges, earnedLevels } from '../../shared/achievements.js'
import { streak, weekProgress, formatLength } from '../../shared/seriesStats.js'
import { getState, subscribe } from '../core/store.js'
import { openModal, closeModal } from '../ui/modal.js'
import { celebrate } from '../ui/celebration.js'
import { openSettings } from '../features/settings.js'

const MODAL_ID = 'achievementsModal'
const TIERS = ['locked', 'bronze', 'silver', 'gold']

/** @param {import('../../shared/achievements.js').Badge} badge */
function badgeCard(badge) {
  const name = t(`badge_${badge.id}`)
  const noGoal = badge.id === 'goal' && !getState()?.settings?.weeklyGoal
  const desc = noGoal ? t('badge_goal_hint')
    : badge.next === null ? t('badge_completed')
      : badge.next === 1 ? t(`badge_${badge.id}_desc_one`) : t(`badge_${badge.id}_desc`, { n: badge.next })
  const previous = badge.level ? badge.levels[badge.level - 1] : 0
  const percent = badge.next === null ? 100 : Math.min(100, ((badge.value - previous) / (badge.next - previous)) * 100)
  return h('li', { class: ['badge-card', `tier-${TIERS[badge.level]}`], 'aria-label': t('badge_aria', { name, level: badge.level, desc }) },
    h('span', { class: 'badge-medal', 'aria-hidden': 'true' }, svg(/** @type {any} */ (badge.icon))),
    h('span', { class: 'badge-pips', 'aria-hidden': 'true' }, [1, 2, 3].map(n => h('span', { class: ['badge-pip', n <= badge.level && 'is-on'] }))),
    h('span', { class: 'badge-name' }, name),
    h('span', { class: 'badge-desc' }, desc),
    badge.next !== null && !noGoal && h('span', { class: 'badge-progress', 'aria-hidden': 'true' },
      h('span', { class: 'badge-progress-bar' }, h('span', { style: { '--progress': `${Math.max(0, percent)}%` } })),
      h('span', { class: 'badge-progress-text' }, t('badge_progress', { value: badge.value, target: badge.next }))))
}

/** This week: goal progress, streak and time watched. @param {any[]} seriesList @param {number} goal */
function weekSection(seriesList, goal) {
  const { episodes, seconds } = weekProgress(seriesList)
  const days = streak(seriesList)
  const percent = goal ? Math.min(100, (episodes / goal) * 100) : 0
  return h('section', { class: 'week-panel', 'aria-labelledby': 'weekPanelTitle' },
    h('div', { class: 'week-panel-head' },
      h('h3', { id: 'weekPanelTitle' }, t('week_title')),
      h('button', { type: 'button', class: 'btn-secondary', onClick: () => { closeModal(MODAL_ID); openSettings('goals') } }, goal ? t('edit_goal') : t('set_goal'))),
    h('p', { class: 'week-panel-count' },
      goal ? t('week_goal_progress', { done: episodes, goal }) : t('week_episodes', { n: episodes }),
      goal > 0 && episodes >= goal && h('span', { class: 'week-panel-reached' }, t('goal_reached'))),
    goal > 0 && h('div', { class: 'week-panel-bar', role: 'progressbar', 'aria-label': t('weekly_goal'), 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(Math.min(episodes, goal)) },
      h('span', { style: { '--progress': `${percent}%` } })),
    (days > 0 || seconds > 0) && h('p', { class: 'week-panel-stats' },
      [days > 0 && t('streak_days', { n: days }), seconds > 0 && t('week_time', { time: formatLength(seconds) })].filter(Boolean).join(' · ')))
}

export function openAchievements() {
  byId('achievementsBtn')?.classList.remove('has-new')
  document.getElementById(MODAL_ID)?.remove()
  const state = getState()
  const seriesList = Object.values(state?.series || {})
  const badges = computeBadges(state)
  const earned = badges.reduce((sum, badge) => sum + badge.level, 0)
  const overlay = h('div', { class: 'modal-overlay hidden', id: MODAL_ID },
    h('div', { class: 'modal-backdrop' }),
    h('div', { class: 'modal modal-achievements', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'achievementsTitle' },
      h('div', { class: 'modal-header' },
        h('button', { type: 'button', class: 'modal-close', 'aria-label': t('close'), onClick: () => closeModal(MODAL_ID) }, svg('close')),
        h('h2', { id: 'achievementsTitle' }, t('achievements'))),
      h('div', { class: 'modal-body' },
        weekSection(seriesList, Number(state?.settings?.weeklyGoal) || 0),
        h('p', { class: 'achievements-summary' }, t('achievements_summary', { n: earned, total: badges.length * 3 })),
        h('ul', { class: 'badge-grid' }, badges.map(badgeCard)))))
  document.body.append(overlay)
  openModal(MODAL_ID, { onClose: () => overlay.remove(), returnFocus: () => byId('achievementsBtn') })
}

/** Toast for levels earned while the dashboard is open; the first state is the baseline. */
export function initAchievements() {
  byId('achievementsBtn')?.addEventListener('click', openAchievements)
  /** @type {Set<string> | null} */
  let known = null
  subscribe(changed => {
    if (!changed.has('server')) return
    const state = getState()
    if (!state) return
    const badges = computeBadges(state)
    const now = earnedLevels(badges)
    if (known) {
      const fresh = [...now].filter(key => !known?.has(key))
      for (const key of fresh.slice(0, 2)) {
        const [id, levelText] = key.split(':')
        const badge = badges.find(entry => entry.id === id)
        if (!badge) continue
        const level = Number(levelText)
        const target = badge.levels[level - 1]
        celebrate({
          icon: badge.icon,
          tier: /** @type {'bronze' | 'silver' | 'gold'} */ (TIERS[level]),
          label: t('celebration_badge'),
          title: t('celebration_badge_level', { name: t(`badge_${id}`), level }),
          detail: target === 1 ? t(`badge_${id}_desc_one`) : t(`badge_${id}_desc`, { n: target }),
          onOpen: openAchievements
        })
      }
      if (fresh.length) byId('achievementsBtn')?.classList.add('has-new')
    }
    known = now
  })
}
