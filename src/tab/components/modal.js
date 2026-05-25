import { t } from '../../shared/i18n.js'

class ModalManager {
  open(id) {
    const modal = document.getElementById(id)
    if (modal) {
      modal.classList.remove('hidden')
    }
  }

  close(id) {
    const modal = document.getElementById(id)
    if (modal) {
      modal.classList.add('hidden')
      this._clearErrors(id)
    }
  }

  _clearErrors(modalId) {
    const modal = document.getElementById(modalId)
    if (modal) {
      modal.querySelectorAll('.error-msg').forEach(el => {
        el.classList.add('hidden')
        el.textContent = ''
      })
    }
  }

  confirm(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.className = 'modal-overlay'

      const modal = document.createElement('div')
      modal.className = 'modal confirm-modal'

      const body = document.createElement('div')
      body.className = 'modal-body'
      body.style.textAlign = 'center'
      body.style.padding = '32px 24px'

      const icon = document.createElement('div')
      icon.style.cssText = 'font-size: 40px;margin-bottom: 16px'
      icon.textContent = '\u26A0\uFE0F'

      const msg = document.createElement('p')
      msg.style.cssText = 'color: var(--text);font-size: 15px;line-height: 1.5;margin-bottom: 24px'
      msg.textContent = message

      const footer = document.createElement('div')
      footer.className = 'modal-footer'
      footer.style.justifyContent = 'center'

      const cancelBtn = document.createElement('button')
      cancelBtn.className = 'btn-secondary'
      cancelBtn.textContent = t('cancel')
      cancelBtn.addEventListener('click', () => {
        overlay.remove()
        resolve(false)
      })

      const confirmBtn = document.createElement('button')
      confirmBtn.className = 'btn-primary'
      confirmBtn.textContent = t('confirm')
      confirmBtn.style.background = 'var(--primary)'
      confirmBtn.addEventListener('click', () => {
        overlay.remove()
        resolve(true)
      })

      footer.appendChild(cancelBtn)
      footer.appendChild(confirmBtn)

      body.appendChild(icon)
      body.appendChild(msg)
      modal.appendChild(body)
      modal.appendChild(footer)
      overlay.appendChild(modal)
      document.body.appendChild(overlay)
    })
  }
}

export { ModalManager }
