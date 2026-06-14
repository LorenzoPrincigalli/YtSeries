/**
 * Firebase project config. Replace placeholders or use firebase.config.js (gitignored).
 */
const PLACEHOLDER_API_KEY = 'YOUR_FIREBASE_API_KEY'
const PLACEHOLDER_PROJECT_ID = 'YOUR_PROJECT_ID'

let _config = {
  apiKey: PLACEHOLDER_API_KEY,
  projectId: PLACEHOLDER_PROJECT_ID,
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com'
}

async function loadFirebaseConfig() {
  try {
    const url = chrome.runtime.getURL('src/shared/firebase.config.js')
    const resp = await fetch(url)
    if (!resp.ok) return
    const text = await resp.text()
    const apiKey = text.match(/apiKey:\s*['"]([^'"]+)['"]/)?.[1]
    const projectId = text.match(/projectId:\s*['"]([^'"]+)['"]/)?.[1]
    const authDomain = text.match(/authDomain:\s*['"]([^'"]+)['"]/)?.[1]
    if (apiKey && projectId) {
      _config = {
        apiKey,
        projectId,
        authDomain: authDomain || `${projectId}.firebaseapp.com`
      }
    } else {
      console.warn('[YT Series] FirebaseConfig: could not parse firebase.config.js — check format')
    }
  } catch (_) {
    // optional firebase.config.js not present
  }
}

function getFirebaseConfig() {
  return { ..._config }
}

function isFirebaseConfigured() {
  const c = _config
  return !!(
    c.apiKey &&
    c.projectId &&
    c.apiKey !== PLACEHOLDER_API_KEY &&
    c.projectId !== PLACEHOLDER_PROJECT_ID
  )
}

export { loadFirebaseConfig, getFirebaseConfig, isFirebaseConfigured }
