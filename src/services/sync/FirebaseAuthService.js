import { AppError } from '../../shared/errors.js'
import { getFirebaseConfig, isFirebaseConfigured } from './FirebaseConfig.js'
import { SYNC_STORAGE_KEYS } from '../../shared/constants.js'
import { logger } from '../../shared/logger.js'

class FirebaseAuthService {
  constructor() {
    this._session = null
    this._googleAccessToken = null
  }

  isConfigured() {
    return isFirebaseConfigured()
  }

  isLoggedIn() {
    return !!(this._session?.idToken && this._session?.uid)
  }

  getUid() {
    return this._session?.uid || null
  }

  getIdToken() {
    return this._session?.idToken || null
  }

  getEmail() {
    return this._session?.email || null
  }

  async tryRestoreSession({ refresh = true } = {}) {
    if (!this.isConfigured()) return null

    try {
      const data = await chrome.storage.local.get(SYNC_STORAGE_KEYS.AUTH)
      const session = data[SYNC_STORAGE_KEYS.AUTH]
      if (!session?.refreshToken) {
        this._session = null
        return null
      }

      this._session = session
      if (!refresh || (session.expiresAt && session.expiresAt > Date.now() + 60_000)) return session
      return this._refreshSession(session.refreshToken)
    } catch (err) {
      logger.warn('FirebaseAuth: restore failed:', err)
      this._session = null
      return null
    }
  }

  async login() {
    if (!this.isConfigured()) {
      throw new AppError('SYNC_NOT_CONFIGURED', 'Firebase is not configured')
    }

    const googleToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new AppError('OAUTH_FAILED', chrome.runtime.lastError.message))
          return
        }
        if (!token) {
          reject(new AppError('OAUTH_FAILED', 'No OAuth token returned'))
          return
        }
        resolve(token)
      })
    })

    const { apiKey } = getFirebaseConfig()
    const requestUri = `https://${chrome.runtime.id}.chromiumapp.org/`
    const postBody = `access_token=${encodeURIComponent(googleToken)}&providerId=google.com`

    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postBody,
          requestUri,
          returnSecureToken: true,
          returnIdpCredential: true
        }),
        signal: AbortSignal.timeout(15000)
      }
    )

    const data = await resp.json()
    if (!resp.ok) {
      throw new AppError('AUTH_FAILED', data.error?.message || 'Firebase sign-in failed')
    }

    const session = {
      uid: data.localId,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      email: data.email || null,
      expiresAt: Date.now() + (parseInt(data.expiresIn, 10) || 3600) * 1000
    }

    this._googleAccessToken = googleToken
    await this._persistSession(session)
    this._session = session
    return session
  }

  async logout() {
    try {
      if (chrome.identity.clearAllCachedAuthTokens) await chrome.identity.clearAllCachedAuthTokens()
      else if (this._googleAccessToken) await chrome.identity.removeCachedAuthToken({ token: this._googleAccessToken })
    } catch (err) {
      // Token revocation is best effort; local sign-out below must still happen.
      logger.warn('FirebaseAuth: could not clear cached Google token:', err)
    }

    this._googleAccessToken = null
    this._session = null
    await chrome.storage.local.remove(SYNC_STORAGE_KEYS.AUTH)
  }

  async getValidIdToken() {
    if (!this._session) {
      await this.tryRestoreSession()
    }
    if (!this._session?.idToken) return null

    if (this._session.expiresAt > Date.now() + 60_000) {
      return this._session.idToken
    }

    if (!this._session.refreshToken) return null
    const session = await this._refreshSession(this._session.refreshToken)
    return session?.idToken || null
  }

  async _refreshSession(refreshToken) {
    const previous = this._session
    const { apiKey } = getFirebaseConfig()
    const resp = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }),
        signal: AbortSignal.timeout(15000)
      }
    )

    const data = await resp.json()
    if (!resp.ok) {
      logger.warn('FirebaseAuth: token refresh failed:', data.error?.message)
      await this.logout()
      return null
    }

    const session = {
      uid: data.user_id,
      idToken: data.id_token,
      refreshToken: data.refresh_token || refreshToken,
      email: previous?.email || null,
      expiresAt: Date.now() + (parseInt(data.expires_in, 10) || 3600) * 1000
    }

    await this._persistSession(session)
    this._session = session
    return session
  }

  async _persistSession(session) {
    await chrome.storage.local.set({ [SYNC_STORAGE_KEYS.AUTH]: session })
  }
}

const firebaseAuthService = new FirebaseAuthService()
export { FirebaseAuthService, firebaseAuthService }
