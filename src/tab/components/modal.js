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
      body.className = 'modal-body modal-confirm-body'

      const icon = document.createElement('div')
      icon.className = 'modal-confirm-icon'
      icon.textContent = '\u26A0\uFE0F'

      const msg = document.createElement('p')
      msg.className = 'modal-confirm-msg'
      msg.textContent = message

      const footer = document.createElement('div')
      footer.className = 'modal-footer centered-footer'

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
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove()
          resolve(false)
        }
      })
      document.body.appendChild(overlay)
    })
  }
}

export { ModalManager }
