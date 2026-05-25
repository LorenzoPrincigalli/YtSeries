import { LICENSE_CACHE_DAYS } from '../shared/constants.js'
import { logger } from '../shared/logger.js'

class LicenseService {
  constructor() {
    this.cachedResult = null
    this.cachedAt = null
  }

  async verify(key) {
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      return { valid: false, reason: 'EMPTY_KEY' }
    }

    try {
      const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: key.trim()
        })
      })

      if (!response.ok) {
        return { valid: false, reason: 'API_ERROR' }
      }

      const data = await response.json()

      if (data.valid) {
        this.cachedResult = { valid: true, key: key.trim() }
        this.cachedAt = Date.now()
        return { valid: true }
      }

      return { valid: false, reason: 'INVALID_KEY' }
    } catch (err) {
      logger.warn('LicenseService.verify network error, using cache:', err)
      return this._checkCache(key)
    }
  }

  _checkCache(key) {
    if (
      this.cachedResult &&
      this.cachedResult.key === key.trim() &&
      this.cachedAt &&
      (Date.now() - this.cachedAt) < LICENSE_CACHE_DAYS * 24 * 60 * 60 * 1000
    ) {
      return { valid: true, cached: true }
    }
    return { valid: false, reason: 'NETWORK_ERROR' }
  }

  invalidateCache() {
    this.cachedResult = null
    this.cachedAt = null
  }
}

const licenseService = new LicenseService()
export { licenseService, LicenseService }
