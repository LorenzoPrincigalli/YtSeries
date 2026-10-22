# Development workflow

## First-time setup

1. `npm install`
2. `npm run setup` — interactive wizard for config.js and firebase.config.js
3. `npm run icons` — generate extension icons from SVG
4. `npm run build` — bundles into `dist/` (esbuild, same layout as `src/`)
5. Load unpacked in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select **`dist/`** (the repo root no longer loads: the content script imports shared modules)

## Daily development

- **Test**: `npm test` (Vitest; keep the current count in the final report rather than this page)
- **Build**: `npm run build` (or `npm run build:watch` for JS; rerun build after HTML/CSS changes)
- **Lint**: `npm run lint` (ESLint flat config; forbids `innerHTML`, empty catch, thrown literals, external writes to `store._state`)
- **Typecheck**: `npm run typecheck` (`tsc` on JSDoc; files opt in with `// @ts-check`)
- **All gates**: `npm run check`
- **Reload**: Click refresh on extension card in `chrome://extensions`
- **Debug**: Right-click icon → Inspect popup, or open tab and use DevTools

## Key architecture decisions

- **Search**: Enter triggers YouTube API search. Typing filters local series instantly.
- **Theme**: `applyTheme()` sets all CSS variables for dark/light. Toolbar icon follows theme.
- **Upsell**: Banner once/day, dismissible. No toast spam.
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

Quick zip:
```bash
zip -r yt-series.zip . -x "node_modules/*" ".git/*" ".agents/*" "scripts/*" "pw-profile/*" "docs/*" "*.zip" "AGENTS.md" "vitest.config.js" "package-lock.json"
```

## Post-publish

1. Set `EXTENSION_ID` in `src/shared/constants.js`
2. Update `activate.html` with hosted URL
3. Set `externally_connectable` in `manifest.json`
