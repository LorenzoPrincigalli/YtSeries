// @ts-check
import { EVENTS } from '../../shared/events.js'
import { AUTO_REFRESH_INTERVAL_MINUTES, THEMES, LANGUAGES } from '../../shared/constants.js'
import { s } from '../../shared/schema.js'
import { logger } from '../../shared/logger.js'
import { commit } from '../context.js'

/** @typedef {import('../context.js').BackgroundContext} Ctx */

const log = logger.child('settings')

/** Keeps the auto-refresh alarm in line with the setting. @param {Ctx} ctx @param {boolean} enabled */
async function syncAutoRefreshAlarm(ctx, enabled) {
  if (enabled) {
    if (!await chrome.alarms.get('autoRefresh')) await ctx.alarms.create('autoRefresh', AUTO_REFRESH_INTERVAL_MINUTES)
  } else {
    await ctx.alarms.clear('autoRefresh')
  }
}

/** @param {Ctx} ctx @param {Record<string, unknown>} changes */
async function updateSettings(ctx, changes) {
  const before = ctx.store.getSettings()
  await commit(ctx, store => { store.updateSettings(changes) })
  if ('autoRefresh' in changes && changes.autoRefresh !== before.autoRefresh) {
    await syncAutoRefreshAlarm(ctx, Boolean(changes.autoRefresh))
  }
  return { success: true, settings: ctx.store.getSettings() }
}

/** @param {Ctx} _ctx @param {{ suffix: string }} payload */
async function setIconTheme(_ctx, { suffix }) {
  /** @type {Record<number, string>} */
  const path = {}
  for (const size of [16, 48, 128]) path[size] = chrome.runtime.getURL(`icons/icon${size}${suffix}.png`)
  try {
    await chrome.action.setIcon({ path })
    return { success: true }
  } catch (err) {
    log.warn('Failed to set toolbar icon', err)
    return { success: false, error: 'ICON_UPDATE_FAILED' }
  }
}

const settingsRoutes = {
  [EVENTS.SETTINGS_UPDATE]: {
    schema: s.object({
      theme: s.optional(s.oneOf(THEMES)),
      language: s.optional(s.oneOf(LANGUAGES)),
      autoRefresh: s.optional(s.boolean()),
      nextEpisodeOverlay: s.optional(s.boolean())
    }),
    handler: updateSettings
  },
  [EVENTS.SET_ICON_THEME]: { schema: s.object({ suffix: s.oneOf(['', '_light']) }), handler: setIconTheme }
}

export { settingsRoutes, syncAutoRefreshAlarm }
