import { EVENTS } from '../shared/events.js'
import { logger } from '../shared/logger.js'

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKeyInput')
  const saveBtn = document.getElementById('saveBtn')
  const saveStatus = document.getElementById('saveStatus')

  const response = await chrome.runtime.sendMessage({ type: EVENTS.STATE_GET })
  if (response.success && response.state.settings) {
    apiKeyInput.value = response.state.settings.apiKey || ''
  }

  saveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim()

    if (!key) {
      saveStatus.textContent = 'Please enter an API key'
      saveStatus.className = 'status err'
      return
    }

    try {
      const result = await chrome.runtime.sendMessage({
        type: EVENTS.SET_API_KEY,
        payload: { key }
      })

      if (result.success) {
        saveStatus.textContent = 'API key saved successfully'
        saveStatus.className = 'status ok'
        logger.info('API key updated via options page')
      } else {
        saveStatus.textContent = result.message || 'Failed to save API key'
        saveStatus.className = 'status err'
      }
    } catch (err) {
      saveStatus.textContent = 'Failed to save API key'
      saveStatus.className = 'status err'
      logger.error('Failed to save API key:', err)
    }
  })
})
