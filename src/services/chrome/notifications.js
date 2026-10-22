import { AppError } from '../../shared/errors.js'
import { logger } from '../../shared/logger.js'

class NotificationService {
  async create(id, options) {
    try {
      await chrome.notifications.create(id, options)
    } catch (err) {
      logger.error('NotificationService.create failed:', err)
      throw new AppError('NOTIFICATION_CREATE_ERROR', 'Failed to create notification', { cause: err })
    }
  }

  onClick(callback) {
    chrome.notifications.onClicked.addListener(callback)
  }
}

const notificationService = new NotificationService()
export { notificationService }
