// @ts-check
// Tiny DOM builder. The only way UI code creates elements: text always goes
// through text nodes, URLs are scheme-checked, and there is no HTML-string
// entry point at all (innerHTML is banned by lint).

/** Assigned as properties rather than attributes so live state is correct. */
const PROPERTIES = new Set(['value', 'checked', 'disabled', 'hidden', 'readOnly', 'required', 'maxLength', 'tabIndex', 'loading', 'decoding', 'selected', 'open'])
const URL_ATTRIBUTES = new Set(['href', 'src'])
// https, mailto, chrome-extension, blob (object URLs we create, e.g. exports)
// and scheme-less relative paths only — never javascript:, data: or http:.
const SAFE_URL = /^(?:https:|mailto:|chrome-extension:|blob:|(?![a-z][a-z0-9+.-]*:))/i

/** @param {unknown} value */
export function isSafeUrl(value) {
  return typeof value === 'string' && SAFE_URL.test(value.trim())
}

/**
 * @typedef {Node | string | number | null | undefined | false | any[]} Child
 * @typedef {Record<string, any>} Props
 */

/** @param {Element} el @param {Child[]} children */
function appendChildren(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    if (Array.isArray(child)) appendChildren(el, child)
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
}

/**
 * h('button', { class: 'btn', onClick: fn, 'aria-label': t('close') }, svg('close'))
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Props | null} [props]
 * @param {...Child} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value
    else if (key === 'text') el.textContent = String(value)
    else if (key === 'dataset') Object.assign(el.dataset, value)
    else if (key === 'style') for (const [name, v] of Object.entries(value)) el.style.setProperty(name, String(v))
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value)
    else if (URL_ATTRIBUTES.has(key)) { if (isSafeUrl(value)) el.setAttribute(key, value) }
    else if (PROPERTIES.has(key)) /** @type {any} */ (el)[key] = value
    else el.setAttribute(key, value === true ? '' : String(value))
  }
  appendChildren(el, children)
  return el
}

/** Replaces all children of `el`. @param {Element} el @param {...Child} children */
export function mount(el, ...children) {
  el.replaceChildren()
  appendChildren(el, children)
  return el
}

/** @param {string} id */
export function byId(id) {
  return document.getElementById(id)
}

/**
 * Sets a form control's value (or checked state for checkboxes) by id.
 * @param {string} id @param {string | boolean} value
 */
export function setField(id, value) {
  const el = document.getElementById(id)
  if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value)
  else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) el.value = String(value)
}

/**
 * Image with a graceful failure mode: a broken thumbnail is hidden instead of
 * showing the browser's broken-image glyph.
 * @param {Props} props
 */
export function img(props) {
  const el = h('img', { loading: 'lazy', decoding: 'async', alt: '', ...props })
  el.addEventListener('error', () => { el.removeAttribute('src'); el.classList.add('img-failed') }, { once: true })
  return el
}

/**
 * Makes a non-button element keyboard-operable as a button.
 * Prefer a real <button>; use this only where block layout inside a card needs a div.
 * @param {HTMLElement} el @param {() => void} onActivate @param {string} label
 */
export function asButton(el, onActivate, label) {
  el.tabIndex = 0
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', label)
  el.addEventListener('click', onActivate)
  el.addEventListener('keydown', event => {
    if (event.target === el && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onActivate()
    }
  })
  return el
}
