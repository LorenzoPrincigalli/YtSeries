# YT Series — Pre-Publish Checklist

> Last updated: 16 June 2026

## Model

**Donation-only (fully free)** — no license keys, no feature gating.
Voluntary support via [Buy Me a Coffee](https://buymeacoffee.com/ytseriessun).

## Completed

- [x] Manifest description in English
- [x] Icons generated (16, 48, 128 + light variants)
- [x] CSP hardened: script-src 'self'
- [x] config.js and firebase.config.js gitignored — no API keys in repo
- [x] Light theme fully working (all CSS variables, toolbar icon, all screens)
- [x] Firestore rules: per-user isolation
- [x] Privacy policy written and comprehensive
- [x] All features free for everyone — no Pro gating, no license verification (legacy infra stubbed)
- [x] Buy Me a Coffee profile published: https://buymeacoffee.com/ytseriessun

## Blocker — Must do before publishing

- [x] **OAuth consent screen to Production** — Google Cloud Console, verified scopes: openid email profile
- [x] **Host privacy policy** — [published on GitHub Pages](https://lorenzoprincigalli.github.io/YtSeries/privacy-policy.html)

## Post-publish

- [ ] Set EXTENSION_ID in src/shared/constants.js (available after first CWS publish)
- [ ] Remove dead code: activate.html (license activation page, no longer needed)
- [ ] Consider bundler for content script ES modules (currently duplicated code)
