// @ts-check

/**
 * True when the extension was installed from the Chrome Web Store (the store
 * adds `update_url` to the manifest; unpacked development builds have none).
 * Development-only features (demo data, dev tools) are disabled there. The
 * extension id cannot tell them apart: the manifest "key" gives unpacked builds
 * the store id too.
 * @param {{ update_url?: string }} [manifest]
 */
export function isStoreInstall(manifest = chrome.runtime.getManifest()) {
  return Boolean(manifest.update_url)
}
