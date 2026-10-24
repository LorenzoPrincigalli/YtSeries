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
   npm run package          # → yt-series-<version>.zip (no source maps, no manifest "key")
   ```
   `src/shared/firebase.config.js` must exist locally at build time (Cloud Sync config, copied into `dist/`).
3. **Deploy the Worker** (needs `npx wrangler login` once):
   ```bash
   cd cloudflare-worker
   npx wrangler secret put RATE_LIMIT_SALT   # paste a long random string
   npx wrangler deploy
   ```
   If deploy reports the rate-limit `namespace_id` is taken, change `1001` in `wrangler.toml` to another unique integer.
   ✅ Done on 23 Oct 2026 (version `b18e231e`), `RATE_LIMIT_SALT` set, behaviour verified with live requests.
4. **Deploy Firestore rules** (needs `npx firebase-tools login` once):
   ```bash
   npx firebase-tools deploy --only firestore:rules
   ```
   ✅ Done on 23 Oct 2026 (project `stunning-agency-497419-u5`, rules compiled and released).
   ⚠️ **Redeploy needed**: the rules now also accept `ended`/`endedAt` (series marked as ended). Until redeployed, syncing a series the user marked as ended is rejected; other series are unaffected.
5. **Chrome Web Store item** — ✅ exists: id `aelaadhbkhpgkpcmlcohnhnliaggbndp`; its public key is in `manifest.json` (`"key"`) and `EXTENSION_ID` is set. For reference, how it was created: Developer Dashboard → New item → upload `yt-series-1.2.0.zip`. The **extension ID** is assigned now, before review.
   - Package tab: copy the **public key** into `manifest.json` as `"key"` (keeps the same ID for unpacked development builds).
   - Store listing / Privacy practices: paste from `STORE-CWS-LISTING.md` (description, permission justifications, privacy policy URL, "no remote code").
6. **OAuth (Cloud Sync sign-in):** Google Cloud Console → APIs & Services → Credentials → the OAuth client in `manifest.json` (`oauth2.client_id`) → set **Item ID / Application ID** to the new extension ID (or create a "Chrome Extension" client for it and update `client_id`). Firebase Auth → Google provider must stay enabled.
7. **Upload and submit:** `npm run package`, upload the zip to the item (Package → Upload new package), fill the listing from `STORE-CWS-LISTING.md`, then **Submit for review**. The Chrome Web Store dashboard cannot be automated by browser extensions (Chrome blocks scripting on it), so this step is manual.
8. **`ALLOWED_ORIGINS` — optional.** Verified with `wrangler tail`: the extension's service worker sends **no** `Origin` header, so those requests are always allowed. Web pages always send one and are rejected unless it is a `chrome-extension://` origin. Setting `ALLOWED_ORIGINS` to `chrome-extension://<ID>` only narrows which *extension pages* may call the Worker; it is not required.

## Post-publish

- [ ] Verify Cloud Sync sign-in with the store build on two Chrome profiles (`docs/knowledge/08-dev-workflow.md`, smoke steps)
- [ ] Verify the next-episode overlay on a real YouTube playlist (not covered by automated tests)
- [ ] Privacy policy is served from GitHub Pages: confirm the published page shows "Last updated: October 23, 2026"
