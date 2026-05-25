import { logger } from '../../shared/logger.js'

class NotificationService {
  async create(id, options) {
    try {
      await chrome.notifications.create(id, options)
    } catch (err) {
      logger.error('NotificationService.create failed:', err)
      throw { code: 'NOTIFICATION_CREATE_ERROR', message: 'Failed to create notification', context: err }
    }
  }

  async clear(id) {
    try {
      await chrome.notifications.clear(id)
    } catch (err) {
      logger.error('NotificationService.clear failed:', err)
      throw { code: 'NOTIFICATION_CLEAR_ERROR', message: 'Failed to clear notification', context: err }
    }
  }

  onClick(callback) {
    chrome.notifications.onClicked.addListener(callback)
  }
}

const notificationService = new NotificationService()
export { notificationService, NotificationService }
