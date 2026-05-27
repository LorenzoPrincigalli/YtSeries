I now have a complete picture. Here is the comprehensive red-team security analysis.

---

# YT Series Chrome Extension -- Red-Team Security Analysis

**Extension Version:** 1.1.0  |  **Manifest:** MV3  |  **Analysis Date:** 2026-05-27

---

## VULNERABILITY 1: YouTube API Key Exposed in Git History (Critical)

**Files:** `src/shared/constants.js` (historical commits), `src/shared/config.js` (current, local)

**Details:** Three distinct YouTube Data API v3 keys have been leaked across git history:

| Key | Location | Status |
|-----|----------|--------|
| `***REMOVED***` | Commit `6824b37` (reachable via `refs/stash`) | Still in local object DB |
| `***REMOVED***` | Commit `a4ccc17` (was on `origin/main`, now force-pushed past) | Existed on remote, recoverable by anyone who fetched before force-push |
| `***REMOVED***` | Local `src/shared/config.js` (not gitignored from the bundle) | Current active key |

**Exploitability:** High -- API keys are query-string parameters in all YouTube API calls. Anyone with the key can enumerate YouTube playlists, search, and fetch video metadata, exhausting the daily quota ($200+/day overage).

**Impact:** Critical -- Quota exhaustion DoS; the extension becomes non-functional. Key could be used for unauthorized YouTube Data API access.

**Likelihood:** Medium-High -- `git rev-list --all` still resolves the stash commit even after `git gc --prune=now`. The key was on `origin/main` briefly, so collaborators who cloned before the force-push still have it.

**Recommendation:** Rotate ALL three keys immediately in Google Cloud Console. Perform a `git filter-repo` scrub of the stash as well. Ensure `config.js` never enters git (already in `.gitignore` but verify with `git check-ignore`).

---

## VULNERABILITY 2: API Key Bundled in Extension Package (High)

**Files:** `src/shared/config.js`, `manifest.json`

**Details:** The background service worker fetches `config.js` at runtime via `chrome.runtime.getURL('src/shared/config.js')` (line 30 of `background/index.js`), extracts the key with a regex, and uses it. Since `config.js` is part of the extension's package, **anyone who installs the extension** can extract the key by:
1. Navigating to `chrome-extension://<EXT_ID>/src/shared/config.js`
2. Unpacking the CRX file
3. Reading the extension directory from the Chrome profile

**Exploitability:** Trivial. The API key is a static file bundled with every install.

**Impact:** High -- same as above (quota exhaustion, unauthorized API use).

**Likelihood:** Certain (100%) -- this is how the extension is designed to work. Every user who installs the extension gets the key.

**Recommendation:** For public extensions using the YouTube Data API, the API key should be sent from a proxy server (owned by the developer), not bundled. Alternatively, restrict the key in Google Cloud Console by HTTP referrer (only allow `chrome-extension://EXT_ID/*`), but this is still bypassable. A backend proxy that rate-limits per-user is the correct fix.

---

## VULNERABILITY 3: API Key Stored in `chrome.storage.sync` (High)

**Files:** `src/services/chrome/storage.js`, `src/state/store.js`, `src/background/index.js`

**Details:** When a user sets a custom API key via `EVENTS.SET_API_KEY`, it is stored in `chrome.storage.sync` as part of `settings.apiKey` (line 284-285 of `background/index.js`). `chrome.storage.sync` syncs to Google's servers and is accessible to any extension running on the same Chrome profile. Even though other extensions would need the extension ID to read it, an attacker who compromises another extension with `storage` permission can read all sync storage keys.

Furthermore, the API key is served to the tab page via `STATE_GET` as part of `state.settings`, so any code running in the extension page has access to the key.

**Exploitability:** Medium -- requires another malicious extension or compromised extension with `storage` permission.

**Impact:** High -- API key compromise.

**Likelihood:** Low-Medium -- requires a multi-extension attack chain.

**Recommendation:** Store the API key in `chrome.storage.local` instead of `chrome.storage.sync`. Remove `apiKey` from the state returned to the tab page; use a dedicated message handler that proxies API calls through the background script without exposing the key.

---

## VULNERABILITY 4: License Key Stored in `chrome.storage.sync` (Medium)

**Files:** `src/state/store.js` (lines 14-16, 74-76, 219-222), `src/services/chrome/storage.js`

**Details:** The Lemon Squeezy license key is stored in `chrome.storage.sync` (same as settings). This means:
- The license key syncs across all of the user's Chrome devices via Google's servers
- Any other extension on the same profile with `storage` permission can read it
- The tab page receives the license key in `state.license.key` via `STATE_GET`

**Exploitability:** Medium -- another malicious extension on the same profile can exfiltrate the license key.

**Impact:** Medium -- license key theft could allow unauthorized Pro usage, though Lemon Squeezy's API would still validate against the original purchaser.

**Likelihood:** Low-Medium

**Recommendation:** Move license data to `chrome.storage.local`. Strip `license.key` from state responses to the tab page (only send `isPro` and `verifiedAt`).

---

## VULNERABILITY 5: License Revocation Detection Gap (Medium)

**Files:** `src/services/license.js`

**Details:** The `verify()` method caches successful verifications in memory for 30 days (`LICENSE_CACHE_DAYS`). If an internet connection fails, it falls back to cache (line 38-40). This means:
- If a license is revoked by the developer, the extension won't lose Pro status for up to 30 days (if the user stays offline)
- The code only checks `data.valid` (a boolean) from Lemon Squeezy's response. Lemon Squeezy returns `{"valid": true}` for active licenses and `{"valid": false}` for expired/cancelled. The boolean check is correct, but instance/status fields are ignored.

**Exploitability:** Low -- requires the user to have a revoked license and stay offline for 30 days.

**Impact:** Low-Medium -- users with revoked licenses retain Pro access for up to 30 days offline.

**Likelihood:** Low

**Recommendation:** Reduce `LICENSE_CACHE_DAYS` to 1-3 days. Implement a periodic license re-verification alarm. Check Lemon Squeezy's `license_key.status` field (`active`, `expired`, `cancelled`) for more granular detection.

---

## VULNERABILITY 6: `unsafe-inline` in Style CSP (Medium)

**Files:** `manifest.json` (line 18)

**Details:** The CSP allows `style-src 'self' 'unsafe-inline'`. While `unsafe-inline` for styles is common and often necessary in Chrome extensions, it means that if an XSS vulnerability were discovered, the attacker could use inline styles for data exfiltration (e.g., via CSS injection attacks).

**Exploitability:** Low -- requires an existing XSS to exploit.

**Impact:** Medium -- CSS injection can exfiltrate CSRF tokens, usernames, etc.

**Likelihood:** Low (no current XSS found, but defense-in-depth)

**Recommendation:** Remove `'unsafe-inline'` and move all styles to the external `main.css` file. Use CSS custom properties (already done via `root.style.setProperty`) and avoid inline `style` properties in JavaScript.

---

## VULNERABILITY 7: No Frame-Src for Extension Pages (Low)

**Files:** `manifest.json` (line 18)

**Details:** `default-src 'self'` is set, but the extension's own tab page (`src/tab/index.html`) does not explicitly set a `frame-src` via a `<meta>` CSP tag. The manifest CSP applies to extension pages, but the tab page uses `window.open()` instead of iframes, so no practical vector exists. However, if any extension page were to embed an iframe without explicit restrictions, it would inherit the manifest's `frame-src` which allows YouTube and YouTube-nocookie.

**Exploitability:** None currently.

**Impact:** Low -- clickjacking risk if iframes are added in the future.

**Likelihood:** Very Low

**Recommendation:** Add `<meta http-equiv="Content-Security-Policy" content="frame-src 'none'">` to `src/tab/index.html` since no iframes are used.

---

## VULNERABILITY 8: Message Sender Validation -- Looks Secure, No Bypass Found (Info)

**Files:** `src/background/index.js` (lines 70-86)

**Analysis:** The background script correctly checks `sender.id !== chrome.runtime.id` and rejects messages from unknown senders. The `_broadcast` flag prevents echo loops. The `handleMessage` function returns `true` to keep the channel open for async responses. The content script only sends messages (doesn't listen for arbitrary ones). The tab page listens for broadcasts but not external messages.

**Verdict:** No bypass found. This is correctly implemented.

---

## VULNERABILITY 9: No DOM-Based XSS Found -- Low Risk But Notable Patterns (Info)

**Files:** `src/tab/components/detail.js`, `src/tab/app.js`, `src/tab/components/home.js`

**Analysis:** The codebase consistently uses `textContent` for user-supplied data (series titles, video titles, descriptions, channel names). I found only four uses of `innerHTML`:

1. `detail.js:108` -- hardcoded static string with no interpolation: `` `<span style="color:var(--primary);font-weight:bold;">🆕 Nuovo episodio</span>` `` -- **Safe**
2. `detail.js:634` -- `closeBtn.innerHTML = '&times;'` -- **Safe**
3. `home.js:141,145` -- inline SVG strings with no user data -- **Safe**
4. `detail.js:686` -- `body.innerHTML = `<div class="more-loading">${t('no_related_found')}</div>`" -- uses `t()` which returns hardcoded translation strings (no user interpolation into params that get inserted into HTML) -- **Safe**

All YouTube API data flows through `textContent`. The `onerror` handlers for images set `this.src = ''` or `this.style.display = 'none'` -- no JS injection.

**Verdict:** No XSS vectors found. The codebase handles DOM creation safely.

---

## VULNERABILITY 10: Content Script `setInterval` Without Tab Lifecycle Management (Low)

**Files:** `src/content/index.js` (lines 20-38)

**Details:** The `setupVideoEndDetection` function polls every 500ms (up to 20 attempts = 10 seconds) for a video element on YouTube pages. If the YouTube page is backgrounded or the user navigates away, the interval continues until 20 attempts or cleanup. Each successful detection attaches an `ended` event listener.

**Exploitability:** Low -- performance impact only; no security breach.

**Impact:** Low -- unnecessary CPU usage on background tabs.

**Likelihood:** Medium -- occurs on every YouTube video page load.

**Recommendation:** Use `requestAnimationFrame` or a MutationObserver instead. Cancel the interval when the tab becomes hidden (use `document.visibilitychange`).

---

## VULNERABILITY 11: `web_accessible_resources` Minimal Exposure -- Secure (Info)

**Files:** `manifest.json` (lines 38-43)

**Analysis:** Only `icons/*.png` is exposed to `https://www.youtube.com/*`. This is the minimum required for the content script to display the icon in the sidebar. No JS/HTML/CSS files are exposed to web pages.

**Verdict:** Correctly scoped. No attacker abuse surface.

---

## VULNERABILITY 12: Privacy -- Data Collection is Local, Minimal External Transmission (Info)

**Files:** All source files, `src/assets/store/privacy-policy.html`

**Analysis:**
- All user data (series, progress, settings, license) is stored locally in `chrome.storage`
- External requests go only to:
  - `www.googleapis.com/youtube/v3/*` -- YouTube Data API (playlist metadata, search)
  - `api.lemonsqueezy.com/v1/licenses/validate` -- license verification
- No analytics, no tracking, no third-party scripts
- The content script reads CSS computed values from YouTube's DOM for styling adaptation -- no page content exfiltration
- The content script does NOT intercept video data, comments, or user interactions

**Privacy Risk:** Very Low. The extension's behavior matches its privacy policy.

**Recommendation:** None.

---

## VULNERABILITY 13: No Race Conditions Found in Background Message Handling (Info)

**Files:** `src/background/index.js`

**Analysis:** The background service worker uses a promise-based init lock (`initPromise`), preventing concurrent initialization. Async message handlers are processed one at a time per the runtime message API contract. `broadcastStateUpdate` fires after `store.saveToStorage()` completes. The store is synchronous, so no concurrent state corruption.

**Verdict:** No exploitable race conditions found.

---

## SUMMARY TABLE

| # | Vulnerability | Severity | Impact | Exploitability | Likelihood |
|---|---------------|----------|--------|----------------|------------|
| 1 | YouTube API key leaked in git history (3 keys, stash + pushed) | **CRITICAL** | Quota exhaustion, unauthorized API usage | High | Medium-High |
| 2 | API key bundled in extension package (static file) | **HIGH** | Every user can extract the key | Trivial | Certain |
| 3 | API key stored in `chrome.storage.sync` | **HIGH** | Cross-extension key theft | Medium | Low-Medium |
| 4 | License key stored in `chrome.storage.sync` | **MEDIUM** | License key theft | Medium | Low-Medium |
| 5 | License revocation detection gap (30-day cache) | **MEDIUM** | Revoked users keep Pro access offline | Low | Low |
| 6 | `unsafe-inline` in style CSP | **MEDIUM** | CSS injection exfiltration (requires XSS) | Low | Low |
| 7 | No `frame-src` restriction on extension pages | **LOW** | Clickjacking (theoretical) | None now | Very Low |
| 8 | Sender validation (`sender.id`) | **PASS** | No bypass found | N/A | N/A |
| 9 | DOM-based XSS | **PASS** | No vectors found (safe `textContent` usage) | N/A | N/A |
| 10 | Content script polling with no tab lifecycle | **LOW** | CPU waste on background tabs | Low | Medium |
| 11 | web_accessible_resources | **PASS** | Minimal exposure (icons only) | N/A | N/A |
| 12 | Privacy data collection | **PASS** | Matches privacy policy, local-only | N/A | N/A |
| 13 | Race conditions | **PASS** | No exploitable races found | N/A | N/A |

---

## TOP PRIORITY ACTIONS

1. **CRITICAL -- Rotate all three API keys** (`***REMOVED***`, `***REMOVED***`, `***REMOVED***`) in Google Cloud Console **immediately**. The stash commit `6824b37` must be `git filter-repo` scrubbed.

2. **HIGH -- Remove the static API key from the extension bundle.** Deploy a simple backend proxy (e.g., Cloudflare Worker) that the background script calls, which in turn calls the YouTube API. This prevents key extraction from the CRX.

3. **HIGH -- Move API key and license key from `chrome.storage.sync` to `chrome.storage.local`.** Strip `apiKey` from state responses sent to the tab page.

4. **MEDIUM -- Reduce license cache TTL from 30 days to 1-3 days.** Add periodic re-verification. Check Lemon Squeezy's `license_key.status` field.

5. **MEDIUM -- Remove `'unsafe-inline'` from style-src** by moving all inline styles to `main.css`.

---

## FILES ANALYZED

All files at `C:\Progetti\YTSeries\`:
- `manifest.json` (44 lines)
- `src/background/index.js` (409 lines)
- `src/content/index.js` (206 lines)
- `src/services/license.js` (62 lines)
- `src/services/youtube.js` (252 lines)
- `src/services/chrome/storage.js` (83 lines)
- `src/services/chrome/tabs.js` (36 lines)
- `src/services/chrome/alarms.js` (28 lines)
- `src/services/chrome/notifications.js` (28 lines)
- `src/tab/app.js` (835 lines)
- `src/tab/components/detail.js` (740 lines)
- `src/tab/components/home.js` (512 lines)
- `src/tab/components/modal.js` (84 lines)
- `src/tab/index.html` (124 lines)
- `src/shared/config.js` (1 line, actual key)
- `src/shared/config.example.js` (1 line, placeholder)
- `src/shared/constants.js` (65 lines)
- `src/shared/events.js` (40 lines)
- `src/shared/logger.js` (44 lines)
- `src/shared/i18n.js` (239 lines)
- `src/state/store.js` (249 lines)
- `src/assets/store/privacy-policy.html` (92 lines)
- `.gitignore` (28 lines)
- Git history (15+ commits, 3 branches, stash)