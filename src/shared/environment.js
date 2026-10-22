// @ts-check
import { EXTENSION_ID } from './constants.js'

/**
 * True when the extension was installed from the Chrome Web Store (the store
 * adds `update_url` to the manifest; unpacked development builds have none).
 * Development-only features (demo data, dev tools) are disabled there — this
 * does not depend on EXTENSION_ID being filled in before the first publish.
 * @param {{ update_url?: string }} [manifest]
 */
export function isStoreInstall(manifest = chrome.runtime.getManifest()) {
  return Boolean(manifest.update_url) || Boolean(EXTENSION_ID)
}
