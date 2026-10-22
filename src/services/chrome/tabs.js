import { AppError } from '../../shared/errors.js'
import { logger } from '../../shared/logger.js'

class TabService {
  async create(url) {
    try {
      const tab = await chrome.tabs.create({ url })
      return tab
    } catch (err) {
      logger.error('TabService.create failed:', err)
      throw new AppError('TAB_CREATE_ERROR', 'Failed to create tab', { cause: err })
    }
  }

  async update(tabId, updateProperties) {
    try {
      const tab = await chrome.tabs.update(tabId, updateProperties)
      return tab
    } catch (err) {
      logger.error('TabService.update failed:', err)
      throw new AppError('TAB_UPDATE_ERROR', 'Failed to update tab', { cause: err })
    }
  }

  async query(queryInfo) {
    try {
      const tabs = await chrome.tabs.query(queryInfo)
      return tabs
    } catch (err) {
      logger.error('TabService.query failed:', err)
      throw new AppError('TAB_QUERY_ERROR', 'Failed to query tabs', { cause: err })
    }
  }
}

const tabService = new TabService()
export { tabService }
