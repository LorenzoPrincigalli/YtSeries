import { logger } from '../../shared/logger.js'

class StorageService {
  async get(keys) {
    try {
      return await chrome.storage.sync.get(keys)
    } catch (err) {
      logger.error('StorageService.get failed:', err)
      throw { code: 'STORAGE_GET_ERROR', message: 'Failed to read storage', context: err }
    }
  }

  async set(data) {
    try {
      await chrome.storage.sync.set(data)
    } catch (err) {
      const isQuota = err.message && (
        err.message.includes('QUOTA_BYTES_PER_ITEM') ||
        err.message.includes('kQuotaBytesPerItem') ||
        err.message.includes('quota exceeded')
      )
      if (!isQuota) {
        logger.error('StorageService.set failed:', err)
        throw { code: 'STORAGE_SET_ERROR', message: 'Failed to write storage', context: err }
      }

      logger.warn('StorageService.set quota exceeded, trying per-key fallback')
      for (const [key, value] of Object.entries(data)) {
        const size = new TextEncoder().encode(JSON.stringify(value)).length
        logger.warn(`StorageService.set: key="${key}" size=${size} bytes`)
        try {
          await chrome.storage.sync.set({ [key]: value })
        } catch (keyErr) {
          logger.error(`StorageService.set: failed to save key "${key}" (${size} bytes):`, keyErr)
          try {
            await chrome.storage.sync.remove(key)
            logger.warn(`StorageService.set: removed corrupted key "${key}"`)
          } catch (_) {}
          throw { code: 'STORAGE_SET_ERROR', message: `Cannot save "${key}" (${size} bytes exceeds sync quota)`, context: err }
        }
      }
    }
  }

  async remove(keys) {
    try {
      await chrome.storage.sync.remove(keys)
    } catch (err) {
      logger.error('StorageService.remove failed:', err)
      throw { code: 'STORAGE_REMOVE_ERROR', message: 'Failed to remove from storage', context: err }
    }
  }

  async getLocal(keys) {
    try {
      return await chrome.storage.local.get(keys)
    } catch (err) {
      logger.error('StorageService.getLocal failed:', err)
      throw { code: 'STORAGE_GET_ERROR', message: 'Failed to read local storage', context: err }
    }
  }

  async setLocal(data) {
    try {
      await chrome.storage.local.set(data)
    } catch (err) {
      logger.error('StorageService.setLocal failed:', err)
      throw { code: 'STORAGE_SET_ERROR', message: 'Failed to write local storage', context: err }
    }
  }

  async removeLocal(keys) {
    try {
      await chrome.storage.local.remove(keys)
    } catch (err) {
      logger.error('StorageService.removeLocal failed:', err)
      throw { code: 'STORAGE_REMOVE_ERROR', message: 'Failed to remove from local storage', context: err }
    }
  }
}

const storageService = new StorageService()
export { storageService, StorageService }
