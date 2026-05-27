# Combined Analysis Report — YT Series

**Generated:** 2026-05-27_2044
**Source:** PASS 1 (Comprehensive) + PASS 2 (Deep Technical) + PASS 3 (Red-Team Security) + 3 Critique Iterations

---

## Scores Summary

| Domain | Score | Assessment |
|--------|-------|-----------|
| **Consistency** (PASS 1) | 6/10 | Pattern violations, event enum gaps |
| **Health** (PASS 1) | 4/10 | Needs critical fixes before ship |
| **Architecture** (PASS 2) | 6/10 | Clean MV3 pattern, content script drift risk |
| **Performance** (PASS 2) | 5/10 | 2 HIGH leaks, 6 MEDIUM/LOW inefficiencies |
| **Technical Debt** (PASS 2) | 6/10 | Medium — ship with critical fixes |
| **Security Posture** (PASS 3) | 4/10 | NOT PRODUCTION-READY |
| **Error Handling** (PASS 2) | Basic | Chrome API wrapped, API errors silent |

**Overall: ~5/10**

---

## Iterative Self-Critique

### Iteration 1 — What was missed?

1. **`_broadcast` bypasses sender validation** — `background/index.js:89` checks `if (message._broadcast) return` BEFORE `sender.id !== chrome.runtime.id`. Any extension/content script with `_broadcast: true` can skip sender validation (minor DoS vector).
2. **`lastRefreshCheck` is dead property** — written every auto-refresh, never read anywhere.
3. **Modal closing has 2 patterns** — `translateUI()` maps `addPlaylistCancel` via explicit ID, while `[data-modal]` delegation handles generic `btn-secondary[data-modal]`. These overlap.
4. **License.json validation assumptions not verified** — PASS 1 claims Lemon Squeezy requires `store_id`, but Lemon Squeezy's `/v1/licenses/validate` actually accepts `{ license_key }` with no product-level param for basic instances. The P0 rating may be incorrect.
5. **No analysis of `keydown` Enter on settings/license input** — `app.js:191` adds `keydown` listener on `licenseKeyInput`, but the `settingsModal` might close or inputs be disabled while verifying. The Enter handler could fire during transition.

### Iteration 2 — Refinements

1. The `innerHTML` on detail.js:108 is low risk — `t('new_episode')` returns a controlled i18n string, not user data. Downgrade from P1 to P2.
2. The `fetchChannelPlaylists` empty-array-on-error pattern is intentional — `youtube.js:80-83` swallows errors but callers handle it gracefully by showing "no playlists" state.
3. PASS 1's `API.API_KEY` reference (P0) is actually handled — `setApiKey()` is called from `init()` before any API call, so the constructor's undefined key is replaced. The P0 remains only if init fails entirely.
4. The MutationObserver disconnect was already fixed in a previous session — the analysis was looking at stale code. The combined report should note this.
5. The `getYouTubeTextColor()` fragility claim (P1) is partially mitigated by CSS variable fallbacks. The function reads from guide entries; if YouTube removes those selectors, the error is silent but the extension still works with hardcoded colors. Downgrade to P2.

### Iteration 3 — Final gaps

1. **No storage schema versioning** — if data shape changes between versions, stored data from v1.0 may be interpreted incorrectly by future versions. Noted as architecture gap.
2. **`node_modules/` is not in `.gitignore`** — `node_modules` IS ignored but `icons/` (generated PNGs) are NOT explicitly gitignored, they're caught by the `dist/` ignore pattern.
3. **`tasks-build.md` contains the real bug list** — the developer's own notes confirm known bugs (dead code, missing duration fetch call). The analyses independently confirmed these.
4. **All analyses assumed `chrome-extension://` URL for config.js fetch** — MV3 `web_accessible_resources` with `"matches": ["<all_urls>"]` or the extension's own origin would allow the fetch. The extension's own context CAN fetch its own files via `chrome.runtime.getURL()` even without WAR for manifest.json-defined resources. This needs verification.
5. **The Lemon Squeezy validation endpoint** — Lemon Squeezy's `/v1/licenses/validate` uses the `store_id` from the Lemon Squeezy Store settings, not from the request body. The `{ license_key }` payload is correct for the standard API. PASS 1's P0 on license.js is likely a false positive.

---

## Consolidated Top Issues

### Critical (Fix Immediately)

| # | Issue | Location | Source |
|---|-------|----------|--------|
| 1 | API key leaked in git history + extension bundle | config.js:1, commits | PASS 1, PASS 3 |
| 2 | MutationObserver never disconnects — CPU tax | content/index.js:199-207 | PASS 2 |
| 3 | setInterval leak — intervals stack on navigation | content/index.js:25-45 | PASS 2 |
| 4 | License offline: "invalid key" instead of "check connection" | license.js:37-40 | PASS 2 |
| 5 | 9 hardcoded untranslated strings | detail.js, home.js, content/index.js | PASS 2 |

### High (Ship-blocking)

| # | Issue | Location | Source |
|---|-------|----------|--------|
| 6 | Empty playlist (0 videos) → NaN progress | app.js, detail.js, home.js | PASS 2 |
| 7 | No timeout on YouTube API / license fetch | youtube.js:144-158, license.js:16-22 | PASS 3 |
| 8 | API key in sync storage + broadcast to tabs | store.js:213, background/index.js:306 | PASS 3 |
| 9 | License gating client-only (bypass via devtools) | store.js:56-59 | PASS 3 |
| 10 | `saveToStorage` error handling logic broken | store.js:105-106 | PASS 1 |
| 11 | `search()` error propagation crashes tab | youtube.js:138-141 | PASS 1 |
| 12 | Config.js not web-accessible → key never loaded | background/index.js:44-55 | PASS 1 |
| 13 | `_broadcast` bypasses sender validation | background/index.js:89 | Iteration 1 |

### Medium

| # | Issue | Location | Source |
|---|-------|----------|--------|
| 14 | Full DOM rebuild on every render | app.js:311-409 | PASS 2 |
| 15 | Deep copy all state on each render | store.js:22-28 | PASS 2 |
| 16 | License revocation cache gap (3 days) | license.js:37-53 | PASS 3 |
| 17 | License key in sync storage (cross-extension theft) | store.js:14-16 | PASS 3 |
| 18 | `'SET_ICON_THEME'` not in EVENTS enum | background/index.js:166, app.js:140 | PASS 1 |
| 19 | Content script duplicates EVENTS | content/index.js:1-4 | PASS 1 |
| 20 | No `aria-label` on icon buttons | index.html | PASS 1 |
| 21 | Detail modal `innerHTML` on controlled string | detail.js:108 | Iteration 2 |
| 22 | Rapid double-click on Add Series | app.js:186 | PASS 2 |
| 23 | Series deleted while detail modal open | detail.js | PASS 2 |

---

## Files Modified in Previous Session (Already Fixed)

Based on git diff, the following were already addressed in a prior fix loop:
- STORAGE_KEYS import added to background/index.js
- MAX_SERIES → 3, API_KEY placeholder removed, THEMES removed from constants.js
- Manifest bilingual description
- Content script: observer disconnects after first inject, setInterval stored in variable
- i18n: 12 new keys added, license_desc fixed
- Hardcoded Italian → t() calls in detail.js, home.js, app.js
- Events: 9 dead types removed
- Store: Promise.all split, silent reset removed
- License_desc copy fixed in index.html
- Background: exponential backoff, onSuspend, alarm on license expiry
- Scroll throttle with rAF + passive
- Tab broadcast listener sender validation added

---

## Path to Production (8/10)

Estimated effort: **2-3 days** single developer

**Day 1 (Critical):** API key rotation + git filter-repo + backend proxy or config.js WAR fix. License cache → 1 day. Observer/interval cleanup.

**Day 2 (High):** Fetch timeouts, error propagation fix, NaN guard on empty playlists, sync storage hardening (move API key to local), rate limiter.

**Day 3 (Medium):** DOM render optimization (virtual scroller or diff), i18n final gaps, a11y pass, `_broadcast` validation fix.
