import { LICENSE_CACHE_DAYS, LICENSE_STORE_ID } from '../shared/constants.js'
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
        }),
        signal: AbortSignal.timeout(15000)
      })

      if (!response.ok) {
        return { valid: false, reason: 'API_ERROR' }
      }

      const data = await response.json()

      if (data.valid) {
        if (!data.meta || typeof data.meta.store_id !== 'number' || data.meta.store_id !== LICENSE_STORE_ID) {
          return { valid: false, reason: 'STORE_MISMATCH' }
        }
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
}

const licenseService = new LicenseService()
export { licenseService }
