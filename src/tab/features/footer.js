// @ts-check
// Footer dialogs: FAQ, bug report, changelog.
import { CHANGELOG } from '../../shared/changelog.js'
import { GITHUB_URL } from '../../shared/constants.js'
import { t } from '../../shared/i18n.js'
import { logger } from '../../shared/logger.js'
import { h, byId, mount } from '../core/dom.js'
import { getState } from '../core/store.js'
import { openModal, closeModal } from '../ui/modal.js'

const BUG_EMAIL = 'lollo.princigalli@gmail.com'
const DIAGNOSTIC_ENTRIES = 15

function renderChangelog() {
  const body = byId('changelogBody')
  if (!body) return
  if (!CHANGELOG.length) { mount(body, h('div', { class: 'changelog-empty' }, t('changelog_empty'))); return }
  const itemsKey = getState()?.settings?.language === 'it' ? 'items_it' : 'items'
  mount(body, CHANGELOG.map(entry => {
    const items = entry[itemsKey] || entry.items || []
    return h('div', { class: 'changelog-entry' },
      h('div', { class: 'changelog-version' }, `v${entry.version}`),
      entry.date && h('div', { class: 'changelog-date' }, entry.date),
      items.length > 0 && h('ul', { class: 'changelog-items' }, items.map(item => h('li', null, item))))
  }))
}

/** Recent warnings/errors from this page, so reports arrive with context. */
function diagnostics() {
  const lines = logger.recent()
    .filter(entry => entry.level === 'WARN' || entry.level === 'ERROR')
    .slice(-DIAGNOSTIC_ENTRIES)
    .map(entry => `${new Date(entry.at).toISOString()} ${entry.level} [${entry.scope}] ${entry.msg}`)
  return [`Version: ${chrome.runtime.getManifest().version}`, `Browser: ${navigator.userAgent}`, ...lines].join('\n')
}

function sendBugReport() {
  const text = /** @type {HTMLTextAreaElement} */ (byId('bugReportText')).value.trim()
  const error = byId('bugReportError')
  if (!text) {
    if (error) { error.textContent = t('bug_empty'); error.classList.remove('hidden') }
    return
  }
  error?.classList.add('hidden')
  const url = new URL(`mailto:${BUG_EMAIL}`)
  url.searchParams.set('subject', 'Bug Report - YT Series')
  url.searchParams.set('body', `${text}\n\n---\n${diagnostics()}`)
  window.open(url.href.replace(/\+/g, '%20'), '_blank')
  closeModal('bugReportModal')
}

export function initFooter() {
  byId('footerFaqLink')?.addEventListener('click', event => { event.preventDefault(); openModal('faqModal') })
  byId('footerChangelogLink')?.addEventListener('click', event => { event.preventDefault(); renderChangelog(); openModal('changelogModal') })
  byId('footerBugLink')?.addEventListener('click', event => {
    event.preventDefault()
    const textarea = /** @type {HTMLTextAreaElement} */ (byId('bugReportText'))
    textarea.value = ''
    byId('bugReportError')?.classList.add('hidden')
    openModal('bugReportModal')
  })
  byId('bugReportSend')?.addEventListener('click', sendBugReport)
  byId('bugReportText')?.addEventListener('keydown', event => { if (event.key === 'Enter' && event.ctrlKey) sendBugReport() })
  byId('bugReportGithubLink')?.addEventListener('click', event => { event.preventDefault(); window.open(`${GITHUB_URL}/issues/new`, '_blank', 'noopener') })

  for (const question of document.querySelectorAll('.faq-question')) {
    const answer = question.nextElementSibling
    if (answer) {
      answer.id ||= `faq-answer-${Math.random().toString(36).slice(2, 8)}`
      question.setAttribute('aria-controls', answer.id)
    }
    question.setAttribute('aria-expanded', 'false')
    question.addEventListener('click', () => {
      const expanded = question.parentElement?.classList.toggle('open') ?? false
      question.setAttribute('aria-expanded', String(expanded))
    })
  }
}
