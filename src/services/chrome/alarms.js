import { logger } from '../../shared/logger.js'

class AlarmService {
  async create(name, periodInMinutes) {
    try {
      await chrome.alarms.create(name, { periodInMinutes })
    } catch (err) {
      logger.error('AlarmService.create failed:', err)
      throw { code: 'ALARM_CREATE_ERROR', message: 'Failed to create alarm', context: err }
    }
  }

  async clear(name) {
    try {
      await chrome.alarms.clear(name)
    } catch (err) {
      logger.error('AlarmService.clear failed:', err)
      throw { code: 'ALARM_CLEAR_ERROR', message: 'Failed to clear alarm', context: err }
    }
  }

  onAlarm(callback) {
    chrome.alarms.onAlarm.addListener(callback)
  }
}

const alarmService = new AlarmService()
export { alarmService }
