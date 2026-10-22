// @ts-check
import { t } from '../../shared/i18n.js'
import { logger } from '../../shared/logger.js'
import { h, mount } from '../../shared/dom.js'
import { toast } from '../ui/feedback.js'

const log = logger.child('ui')

/**
 * Renders a section; if rendering throws, the section shows a fallback with
 * a retry button instead of leaving the page blank or half-drawn.
 * @param {HTMLElement} container
 * @param {string} name
 * @param {() => void} render
 */
export function safeRender(container, name, render) {
  try {
    render()
  } catch (err) {
    log.error(`Render of "${name}" failed`, err)
    mount(container, h('div', { class: 'empty-state section-error', role: 'alert' },
      h('h2', { class: 'empty-state-title' }, t('something_wrong')),
      h('p', { class: 'empty-state-desc' }, t('section_render_error')),
      h('button', { type: 'button', class: 'btn-secondary', onClick: () => safeRender(container, name, render) }, t('retry'))))
  }
}

/**
 * Wraps an async UI event handler: failures are logged and surfaced as a
 * toast instead of becoming unhandled rejections.
 * @template {any[]} A
 * @param {(...args: A) => Promise<unknown> | unknown} handler
 * @param {(err: unknown) => void} [onError]
 * @returns {(...args: A) => Promise<void>}
 */
export function guarded(handler, onError) {
  return async (...args) => {
    try {
      await handler(...args)
    } catch (err) {
      log.error('UI action failed', err)
      if (onError) onError(err)
      else toast(t('something_wrong'), { variant: 'error' })
    }
  }
}

/** Last line of defence for errors that escape every handler. */
export function installGlobalErrorHandlers() {
  window.addEventListener('error', event => {
    log.error('Uncaught error', event.error || event.message)
  })
  window.addEventListener('unhandledrejection', event => {
    log.error('Unhandled rejection', event.reason)
    toast(t('something_wrong'), { variant: 'error' })
  })
}
