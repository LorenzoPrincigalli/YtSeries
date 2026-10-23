# Known issues and backlog

> Last updated: 23 October 2026 (1.3.0 features)

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
| ✅ | Worker deployed 23 Oct 2026; `wrangler tail` showed the extension sends no `Origin`, so the Origin policy now allows header-less requests and rejects web pages |
| 🟡 | Circuit-breaker state is per service-worker lifetime (not persisted across suspension) |
| 🟡 | Content-script overlay path is covered by manual testing only (needs a playable stub video) |
| 🟢 | `components/collections.js` and `collectionEditor.js` still use raw `createElement` (safe, but not yet on `h()`) |
| 🟡 | Followed channels rely on YouTube's undocumented `UULF…` (long-form uploads) playlist; `UU…` (with Shorts) is the fallback if it disappears |
| 🟡 | A 1.2 client rewriting a series document drops its `notes` field (PATCH replaces the document) until it auto-updates to 1.3 |
| 🟡 | Progress overlay and notes bar depend on YouTube selectors (`youtubeDom.js`); covered by stubbed-page E2E only, verify on real YouTube after redesigns |
| 🟢 | Release forecasts use the date a video entered the playlist (`snippet.publishedAt`); playlists curated long after upload forecast poorly and are hidden (bulk additions < 12 h apart are ignored) |

## Pre-publish

See `PUBLISH-CHECKLIST.md` in the project root.
