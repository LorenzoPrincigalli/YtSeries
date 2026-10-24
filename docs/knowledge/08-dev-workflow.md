# Development workflow

## First-time setup

1. `npm install`
2. `npm run setup` — interactive wizard for config.js and firebase.config.js
3. `npm run icons` — generate extension icons from SVG
4. `npm run build` — bundles into `dist/` (esbuild, same layout as `src/`)
5. Load unpacked in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select **`dist/`** (the repo root no longer loads: the content script imports shared modules)

## Daily development

- **Test**: `npm test` (Vitest; keep the current count in the final report rather than this page)
- **Build**: `npm run build` (or `npm run build:watch`: rebuilds bundles and re-copies changed HTML/CSS into `dist/`)
- **Lint**: `npm run lint` (ESLint flat config — forbids `innerHTML`, empty catch, thrown literals, external writes to `store._state` — plus `scripts/lint-css.mjs`)
- **Smoke**: `npm run smoke` (after build) loads `dist/` in Chromium via Playwright: message API, dashboard flows, content script on stubbed youtube.com, popup, axe audit. `SMOKE_SCREENSHOTS=<dir>` saves screenshots
- **E2E**: `npm run e2e` (after build) drives every dashboard feature, the popup and the content script with a stubbed YouTube Worker (no network): add/search/detail/collections/activity/settings/import-export/backups/reset/footer, error states (outage, quota, not found), keyboard paths, 375 px layout, axe in all four themes. `E2E_ARTIFACTS=<dir>` keeps screenshots; failures are screenshotted and the run continues
- **Store screenshots**: `npm run screenshots` (after build) captures the five 1280×800 Chrome Web Store screenshots into `src/assets/store/screenshots/`, adding the real playlists in `scripts/store-library.mjs` through the live Worker (needs network)
- **Store promo tiles**: `npm run promo` renders `src/assets/store/promo-small.png` (440×280) and `promo-marquee.png` (1400×560) from the store screenshots
- **Typecheck**: `npm run typecheck` (`tsc` on JSDoc; files opt in with `// @ts-check`)
- **All gates**: `npm run check`
- **Reload**: Click refresh on extension card in `chrome://extensions`
- **Debug**: Right-click icon → Inspect popup, or open tab and use DevTools

## Key architecture decisions

- **Search**: Enter triggers YouTube API search. Typing filters local series instantly.
- **Theme**: colours live in `variables.css` `[data-theme]` blocks; `theme.js` only sets the attribute. Toolbar icon follows theme.
- **Notifications**: "New Episode Notifications" toggle is available to every user.

## Manual Cloud Sync smoke test

Run this on two Chrome profiles after any change to sync:

1. Load the same unpacked build in both profiles and sign in to the same Google account.
2. Add a playlist in profile A; press **Sync now** and confirm it appears in profile B after Sync now.
3. Mark one episode watched in A, then mark a different episode unwatched in B; sync both and confirm neither change is lost.
4. Disconnect profile A, change progress or delete a series, reconnect, then use **Sync now**. Confirm the pending-change count returns to zero and the result reaches B.
5. Clear data only after a backup; verify a remote failure reports an error and does not falsely clear the local library.
6. Pause a partially watched episode, click Continue in the dashboard, and verify YouTube opens at the saved timestamp.
7. Delete a series and use Undo. Then import a backup, open the Backups list, restore the pre-import snapshot, and confirm the expected library returns.

## Build for publishing

See `PUBLISH-CHECKLIST.md`.

Store package:
```bash
npm run package   # yt-series-<version>.zip: no source maps, manifest "key" removed
```

The source `manifest.json` keeps the store item's public `"key"`, so unpacked builds from `dist/` get the store id `aelaadhbkhpgkpcmlcohnhnliaggbndp` (required by the OAuth client for Cloud Sync sign-in).

## Post-publish

1. Set `EXTENSION_ID` in `src/shared/constants.js` (disables dev tools / demo data)
2. Confirm with `wrangler tail` that Worker requests carry `Origin: chrome-extension://<id>`, then `wrangler secret put ALLOWED_ORIGINS`
3. Deploy `firestore.rules` (`firebase deploy --only firestore:rules`)
