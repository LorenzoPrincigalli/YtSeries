import { AppError } from '../../shared/errors.js'
import { logger } from '../../shared/logger.js'

class StorageService {
  async get(keys) {
    try {
      return await chrome.storage.sync.get(keys)
    } catch (err) {
      logger.error('StorageService.get failed:', err)
      throw new AppError('STORAGE_GET_ERROR', 'Failed to read storage', { cause: err })
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
        throw new AppError('STORAGE_SET_ERROR', 'Failed to write storage', { cause: err })
      }

      logger.warn('StorageService.set quota exceeded, trying per-key fallback')
      for (const [key, value] of Object.entries(data)) {
        const size = new TextEncoder().encode(JSON.stringify(value)).length
        logger.warn(`StorageService.set: key="${key}" size=${size} bytes`)
        try {
          await chrome.storage.sync.set({ [key]: value })
        } catch (keyErr) {
          // Never delete the previous value: a quota failure must not cost the user their settings.
          logger.error(`StorageService.set: failed to save key "${key}" (${size} bytes):`, keyErr)
          throw new AppError('STORAGE_QUOTA_EXCEEDED', `Cannot save "${key}" (${size} bytes exceeds sync quota)`, { cause: keyErr })
        }
      }
    }
  }

  async remove(keys) {
    try {
      await chrome.storage.sync.remove(keys)
    } catch (err) {
      logger.error('StorageService.remove failed:', err)
      throw new AppError('STORAGE_REMOVE_ERROR', 'Failed to remove from storage', { cause: err })
    }
  }

  async getLocal(keys) {
    try {
      return await chrome.storage.local.get(keys)
    } catch (err) {
      logger.error('StorageService.getLocal failed:', err)
      throw new AppError('STORAGE_GET_ERROR', 'Failed to read local storage', { cause: err })
    }
  }

  async setLocal(data) {
    try {
      await chrome.storage.local.set(data)
    } catch (err) {
      logger.error('StorageService.setLocal failed:', err)
      throw new AppError('STORAGE_SET_ERROR', 'Failed to write local storage', { cause: err })
    }
  }

  async removeLocal(keys) {
    try {
      await chrome.storage.local.remove(keys)
    } catch (err) {
      logger.error('StorageService.removeLocal failed:', err)
      throw new AppError('STORAGE_REMOVE_ERROR', 'Failed to remove from local storage', { cause: err })
    }
  }
}

const storageService = new StorageService()
export { storageService }
