// @ts-check
import { t } from '../../shared/i18n.js'
import { h } from '../../shared/dom.js'
import { svg } from '../../shared/icons.js'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** @type {{ el: HTMLElement, opener: Element | null, returnFocus?: () => Element | null, onKeydown: (e: KeyboardEvent) => void }[]} */
const stack = []
/** @type {WeakMap<HTMLElement, (() => void) | undefined>} */
const closeHandlers = new WeakMap()

/** @param {HTMLElement} el */
function focusables(el) {
  return /** @type {HTMLElement[]} */ ([...el.querySelectorAll(FOCUSABLE)]).filter(node => !node.closest('.hidden') && node.offsetParent !== null)
}

/**
 * Opens a static overlay modal (`.modal-overlay` markup in index.html) as an
 * accessible dialog: role/aria-modal, initial focus, Tab trapped inside,
 * Escape and backdrop click close it, focus returns to the opener.
 * @param {string} id
 * @param {{ onClose?: () => void, returnFocus?: () => Element | null }} [options]
 *   returnFocus: where focus goes on close when the opener was re-rendered away
 */
export function openModal(id, { onClose, returnFocus } = {}) {
  const el = document.getElementById(id)
  if (!el || stack.some(entry => entry.el === el)) return
  const dialog = el.querySelector('.modal') || el
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  const title = dialog.querySelector('h2')
  if (title) {
    title.id ||= `${id}-title`
    dialog.setAttribute('aria-labelledby', title.id)
  }

  const onKeydown = event => {
    if (stack.at(-1)?.el !== el) return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeModal(id)
    } else if (event.key === 'Tab') {
      const items = focusables(el)
      if (!items.length) return
      const first = items[0]
      const last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }
  el.onclick = event => { if (event.target === el || /** @type {Element} */ (event.target).classList?.contains('modal-backdrop')) closeModal(id) }
  stack.push({ el, opener: document.activeElement, returnFocus, onKeydown })
  closeHandlers.set(el, onClose)
  document.addEventListener('keydown', onKeydown)
  el.classList.remove('hidden')
  document.body.classList.add('modal-open')
  const autofocus = /** @type {HTMLElement | null} */ (el.querySelector('[autofocus]')) || focusables(el).find(node => !node.classList.contains('modal-close')) || focusables(el)[0]
  autofocus?.focus()
}

/** @param {string} id */
export function closeModal(id) {
  const el = document.getElementById(id)
  const index = stack.findIndex(entry => entry.el === el)
  if (!el || index < 0) return
  const [entry] = stack.splice(index, 1)
  document.removeEventListener('keydown', entry.onKeydown)
  el.classList.add('hidden')
  for (const msg of el.querySelectorAll('.error-msg')) { msg.classList.add('hidden'); msg.textContent = '' }
  if (!stack.length) document.body.classList.remove('modal-open')
  closeHandlers.get(el)?.()
  const target = entry.opener instanceof HTMLElement && entry.opener.isConnected ? entry.opener : entry.returnFocus?.()
  if (target instanceof HTMLElement) target.focus()
}

/** Wires close buttons declared in markup as <button data-modal="modalId">. */
export function initModalTriggers() {
  for (const button of document.querySelectorAll('button[data-modal]')) {
    button.addEventListener('click', () => closeModal(/** @type {HTMLElement} */ (button).dataset.modal || ''))
  }
}

/**
 * Promise-based confirmation using a native <dialog> (built-in focus trap and
 * Escape handling).
 * @param {string} message
 * @param {{ confirmLabel?: string, danger?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, { confirmLabel = t('confirm'), danger = false } = {}) {
  return new Promise(resolve => {
    const opener = document.activeElement
    const messageId = `confirm-${Date.now()}`
    const dialog = h('dialog', { class: 'modal confirm-modal', 'aria-describedby': messageId })
    const finish = result => { dialog.close(); resolve(result) }
    dialog.append(
      h('div', { class: 'modal-body modal-confirm-body' },
        h('div', { class: 'modal-confirm-icon', 'aria-hidden': 'true' }, svg('warning')),
        h('p', { class: 'modal-confirm-msg', id: messageId }, message)),
      h('div', { class: 'modal-footer centered-footer' },
        h('button', { type: 'button', class: 'btn-secondary', onClick: () => finish(false) }, t('cancel')),
        h('button', { type: 'button', class: danger ? 'btn-primary danger-btn' : 'btn-primary', autofocus: true, onClick: () => finish(true) }, confirmLabel)))
    dialog.addEventListener('cancel', () => resolve(false))
    dialog.addEventListener('click', event => { if (event.target === dialog) finish(false) })
    dialog.addEventListener('close', () => {
      dialog.remove()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }, { once: true })
    document.body.append(dialog)
    dialog.showModal()
  })
}
