# PASS 3 — Red-Team Security Analysis: YT Series

**Generated:** 2026-05-27_2044

(Full analysis from subagent — 16 vulnerabilities assessed)

## Top Vulnerabilities

| # | Vulnerability | Severity | Location |
|---|--------------|----------|----------|
| 1 | API key hardcoded in extension bundle | CRITICAL | config.js:1 |
| 2 | API keys leaked in git history | CRITICAL | commits a4ccc17, 24176c3 |
| 3 | No rate limiting / timeout on YouTube API | HIGH | youtube.js:144-158 |
| 4 | No timeout on license verification | HIGH | license.js:16-22 |
| 5 | License gating entirely client-side | HIGH | store.js:56-59 |
| 6 | API key in sync storage + state broadcast | HIGH | store.js:213, background/index.js:306 |
| 7 | License key in chrome.storage.sync | MEDIUM | store.js:14-16 |
| 8 | unsafe-inline in style CSP | MEDIUM | manifest.json:18 |
| 9 | License revocation offline cache gap (3 days) | MEDIUM | license.js:37-53 |
| 10 | Content script polling no lifecycle | LOW | content/index.js:21-46 |

## Security Posture Score: **4/10 — NOT PRODUCTION-READY**

## Passed Checks
- window.open with noopener ✅
- Message sender validation ✅
- DOM-based XSS ✅ (no vectors found)
- Permissions well-scoped ✅

## Top 5 Immediate Actions
1. Rotate ALL YouTube API keys in Google Cloud Console
2. Run `git filter-repo` to purge API keys from history
3. Add AbortController timeouts to all fetch() calls
4. Remove API key from state broadcasts, move to chrome.storage.local
5. Harden license gating: reduce cache to 1 day, add periodic re-verification
