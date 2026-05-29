import { logger } from '../../shared/logger.js'

class TabService {
  async create(url) {
    try {
      const tab = await chrome.tabs.create({ url })
      return tab
    } catch (err) {
      logger.error('TabService.create failed:', err)
      throw { code: 'TAB_CREATE_ERROR', message: 'Failed to create tab', context: err }
    }
  }

  async update(tabId, updateProperties) {
    try {
      const tab = await chrome.tabs.update(tabId, updateProperties)
      return tab
    } catch (err) {
      logger.error('TabService.update failed:', err)
      throw { code: 'TAB_UPDATE_ERROR', message: 'Failed to update tab', context: err }
    }
  }

  async query(queryInfo) {
    try {
      const tabs = await chrome.tabs.query(queryInfo)
      return tabs
    } catch (err) {
      logger.error('TabService.query failed:', err)
      throw { code: 'TAB_QUERY_ERROR', message: 'Failed to query tabs', context: err }
    }
  }
}

const tabService = new TabService()
export { tabService }
