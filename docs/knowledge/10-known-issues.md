# Known issues and backlog

> Last updated: 14 June 2026

## Fixed (verified)

| Item | Status |
|------|--------|
| Light theme incomplete | Fixed — all CSS variables, toolbar icon, all screens |
| Pro upsell static/basic | Fixed — actionable toasts, teaser, banner, post-completion |
| innerHTML XSS risk | Fixed — replaced with createElement + textContent |
| "Limit reached" toast everywhere | Fixed — only in dashboard banner (once/day, dismissible) |
| Search triggered on every keystroke | Fixed — Enter to search, local filter while typing |
| Search rate-limit cleared results | Fixed — previous results preserved during cooldown |
| "auto-refresh" naming confusing | Fixed — renamed to "New Episode Notifications" |
| Free tier got auto-refresh alarm | Fixed — reverted to Pro-only |
| Settings hardcoded English | Fixed — all sections use data-i18n |
| DEBUG artifacts in repo | Fixed — removed IMG_2469.JPG, old audio, old docs |
| Duplicate "new episode alerts" in popup | Fixed — 3 distinct features now |

## Open

| Priority | Issue |
|----------|-------|
| 🔴 | `LICENSE_STORE_ID = 0` — set from Lemon Squeezy |
| 🔴 | `EXTENSION_ID` empty — set after CWS publish |
| 🟡 | Server-side license gating — Worker endpoint needed |
| 🟡 | Content script ES modules — needs bundler (currently duplicated code) |
| 🟢 | Dev Pro Toggle — auto-disables, but could be stripped entirely in build |

## Pre-publish

See `PUBLISH-CHECKLIST.md` in project root.
