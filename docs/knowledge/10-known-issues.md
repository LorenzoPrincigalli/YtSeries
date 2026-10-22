# Known issues and backlog

> Last updated: 22 October 2026 (enterprise refactor, branch `refactor/enterprise`)

## Fixed in the refactor

| Item | Fix |
|------|-----|
| Episode progress kept only in memory (lost on SW suspend) | `EPISODE_PROGRESS` persisted via `commit()` |
| Overlay/language setting ignored on YouTube until first broadcast | `CONTENT_SETTINGS_GET` at content-script start |
| Any youtube.com renderer could call every route (reset, import, state dump) | Router sender-context authorisation |
| Worker proxied any YouTube endpoint/parameter; `refresh`/`key` passthrough; CORS `*`; upstream messages leaked | Allowlist, Origin check, atomic rate limit, sanitized errors |
| Firestore accepted arbitrary documents | Shape/size validation in `firestore.rules` |
| Token refresh signed users out on transient 5xx | Sign-out only on 400 |
| Storage quota fallback deleted the previous value | Throws `STORAGE_QUOTA_EXCEEDED`, keeps data |
| Search/channel errors shown as "no results" | Errors propagate; explicit loading/error states |
| Settings `populate()` relied on ASI and threw | Rewritten with `setField()` |
| Orphan CSS declarations made the browser drop a rule | Removed; `scripts/lint-css.mjs` |
| AA contrast failures (badges, chips, light-theme hero, muted text) | Tokens fixed; axe audit in smoke |
| Notification click passed an object as tab URL | Fixed |

## Open

| Priority | Issue |
|----------|-------|
| 🔴 | `EXTENSION_ID` empty — set after CWS publish (also enables Worker `ALLOWED_ORIGINS`) |
| 🟠 | Deploy Worker + `firestore.rules`; verify in `wrangler tail` that requests carry `Origin: chrome-extension://<id>` **before** setting `ALLOWED_ORIGINS` |
| 🟡 | Circuit-breaker state is per service-worker lifetime (not persisted across suspension) |
| 🟡 | Content-script overlay path is covered by manual testing only (needs a playable stub video) |
| 🟢 | `components/collections.js` and `collectionEditor.js` still use raw `createElement` (safe, but not yet on `h()`) |

## Pre-publish

See `PUBLISH-CHECKLIST.md` in the project root.
