import { AppError } from '../../shared/errors.js'
import { logger } from '../../shared/logger.js'

class AlarmService {
  async create(name, periodInMinutes) {
    try {
      await chrome.alarms.create(name, { periodInMinutes })
    } catch (err) {
      logger.error('AlarmService.create failed:', err)
      throw new AppError('ALARM_CREATE_ERROR', 'Failed to create alarm', { cause: err })
    }
  }

  async clear(name) {
    try {
      await chrome.alarms.clear(name)
    } catch (err) {
      logger.error('AlarmService.clear failed:', err)
      throw new AppError('ALARM_CLEAR_ERROR', 'Failed to clear alarm', { cause: err })
    }
  }

  onAlarm(callback) {
    chrome.alarms.onAlarm.addListener(callback)
  }
}

const alarmService = new AlarmService()
export { alarmService }
