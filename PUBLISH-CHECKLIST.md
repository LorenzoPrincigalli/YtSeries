# YT Series — Pre-Publish Checklist

> Last updated: 14 June 2026

## Completed

- [x] Manifest description in English
- [x] Icons generated (16, 48, 128 + light variants)
- [x] DEV_TOGGLE_PRO auto-disables when EXTENSION_ID is set
- [x] CSP hardened: script-src 'self'
- [x] config.js and firebase.config.js gitignored — no API keys in repo
- [x] Light theme fully working (all CSS variables, toolbar icon, all screens)
- [x] Pro upsell improved (actionable toasts, teaser blurred, free-tier banner, post-completion)
- [x] Toast LIMIT_REACHED now has clickable CTA (both dashboard and content script)
- [x] innerHTML replaced with createElement + textContent in teaser (XSS prevention)
- [x] Firestore rules: per-user isolation
- [x] Privacy policy written and comprehensive
- [x] 86 tests passing (5 test files)
- [x] Debug image removed from icons/

## Blocker — Must do before publishing

- [ ] **Set LICENSE_STORE_ID** in src/shared/constants.js — get numeric ID from Lemon Squeezy dashboard
- [ ] **Deploy Cloudflare Worker** — verify shy-snowflake-0680.lollo-princigalli.workers.dev is live
- [ ] **OAuth consent screen to Production** — Google Cloud Console, verify scopes: openid email profile
- [ ] **Host privacy policy** — upload privacy-policy.html to a public URL (e.g. GitHub Pages)

## Post-publish

- [ ] Set EXTENSION_ID in src/shared/constants.js (available after first CWS publish)
- [ ] Set externally_connectable URL in manifest.json for license activation
- [ ] Update activate.html with hosted URL
- [ ] Server-side license gating (Cloudflare Worker endpoint)
- [ ] Consider bundler for content script ES modules (currently duplicated code)
