# Known issues and backlog

> Last updated: 19 October 2026

## Fixed (verified)

| Item | Status |
|------|--------|
| Light theme incomplete | Fixed — all CSS variables, toolbar icon, all screens |
| innerHTML XSS risk | Fixed — createElement + textContent in dynamic UI |
| Search triggered on every keystroke | Fixed — Enter to search, local filter while typing |
| Search rate-limit cleared results | Fixed — previous results preserved during cooldown |
| Settings hardcoded English | Fixed — all sections use data-i18n |
| Duplicate "new episode alerts" in popup | Fixed — 3 distinct features |
| Lemon Squeezy / Pro gating removed | Fixed — donation-only model |
| Worker open proxy abuse | Fixed — client token header + daily KV rate limit |
| Import success shown as error toast | Fixed — success toast styling |
| Stale playlistId on episode progress | Fixed — `resolvePlaylistForVideo` fallback |
| Dead license / activate.html | Fixed — removed; manifest `externally_connectable` removed |

## Open

| Priority | Issue |
|----------|-------|
| 🔴 | `EXTENSION_ID` empty — set after CWS publish (blocks demo data in production builds) |
| 🟡 | Content script ES modules — needs bundler (EVENTS subset guarded by `contentEventsSync.test.js`) |
| 🟢 | Deploy Worker after pull — requires `X-YT-Series-Client` header (extension 1.1.1+) |

## Pre-publish

See `PUBLISH-CHECKLIST.md` in project root.
