# YT Series — Pre-Publish Checklist

> Last updated: 23 October 2026 — release **1.2.0** (first Chrome Web Store publish)

## Model

**Donation-only (fully free)** — no license keys, no feature gating.
Voluntary support via [Buy Me a Coffee](https://buymeacoffee.com/ytseriessun).

## Done in the repository

- [x] Manifest description in English, version 1.2.0, in-app changelog (EN/IT) and `CHANGELOG.md`
- [x] Icons generated (16, 48, 128 + light variants)
- [x] CSP hardened: `script-src 'self'`, no remote code, unused YouTube `frame-src` removed
- [x] `config.js` and `firebase.config.js` gitignored — no secrets in the repo
- [x] Dev Tools / demo data disabled automatically in store installs (`isStoreInstall()`, `update_url`)
- [x] Content script bundled (esbuild); `activate.html` removed
- [x] Privacy policy updated: `scripting` permission, Worker rate limiting with salted IP hashes
- [x] Store listing (`STORE-CWS-LISTING.md`): accurate feature list and permission justifications
- [x] Worker hardened (allowlist, Origin check, atomic rate limit, hashed client keys)
- [x] Firestore rules validate document shape and size (`firestore.rules`, `firebase.json`)
- [x] Quality gates: `npm run check` (lint, CSS lint, typecheck, unit tests, build, smoke, E2E with axe)

## Release steps (in order)

1. **Merge** `refactor/enterprise` into `main` and pull.
2. **Package:**
   ```bash
   npm ci && npm run check
   cd dist && zip -r ../yt-series-1.2.0.zip . -x "*.map"
   ```
   `src/shared/firebase.config.js` must exist locally at build time (Cloud Sync config, copied into `dist/`).
3. **Deploy the Worker** (needs `npx wrangler login` once):
   ```bash
   cd cloudflare-worker
   npx wrangler secret put RATE_LIMIT_SALT   # paste a long random string
   npx wrangler deploy
   ```
   If deploy reports the rate-limit `namespace_id` is taken, change `1001` in `wrangler.toml` to another unique integer.
   Leave `ALLOWED_ORIGINS` **unset** for now (see step 7).
4. **Deploy Firestore rules** (needs `npx firebase-tools login` once):
   ```bash
   npx firebase-tools deploy --only firestore:rules
   ```
5. **Chrome Web Store — create the item as a draft:** Developer Dashboard → New item → upload `yt-series-1.2.0.zip`. The **extension ID** is assigned now, before review.
   - Package tab: copy the **public key** into `manifest.json` as `"key"` (keeps the same ID for unpacked development builds).
   - Store listing / Privacy practices: paste from `STORE-CWS-LISTING.md` (description, permission justifications, privacy policy URL, "no remote code").
6. **OAuth (Cloud Sync sign-in):** Google Cloud Console → APIs & Services → Credentials → the OAuth client in `manifest.json` (`oauth2.client_id`) → set **Item ID / Application ID** to the new extension ID (or create a "Chrome Extension" client for it and update `client_id`). Firebase Auth → Google provider must stay enabled.
7. **Set the IDs and rebuild:** put the extension ID in `EXTENSION_ID` (`src/shared/constants.js`), keep the `"key"` from step 5, run `npm run check`, re-zip and upload the new package to the same draft. Then **Submit for review**.
8. **After approval — lock the Worker to the extension:**
   ```bash
   cd cloudflare-worker && npx wrangler tail
   ```
   Use the store build once and confirm requests show `Origin: chrome-extension://<ID>`; only then:
   ```bash
   npx wrangler secret put ALLOWED_ORIGINS   # chrome-extension://<ID>
   ```
   If no `Origin` header arrives, do **not** set it (every request would be rejected).

## Post-publish

- [ ] Verify Cloud Sync sign-in with the store build on two Chrome profiles (`docs/knowledge/08-dev-workflow.md`, smoke steps)
- [ ] Verify the next-episode overlay on a real YouTube playlist (not covered by automated tests)
- [ ] Privacy policy is served from GitHub Pages: confirm the published page shows "Last updated: October 23, 2026"
