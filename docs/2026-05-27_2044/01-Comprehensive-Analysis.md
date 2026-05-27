# PASS 1 — Comprehensive Code Analysis: YT Series

**Generated:** 2026-05-27_2044

(Full analysis from subagent — 747 lines covering 26 source files)

## Top 5 Most Critical Issues

1. **[P0] API Key Hard-Coded and Committed** — `src/shared/config.js:1`, `***REMOVED***`
2. **[P0] Lemon Squeezy API Incorrect Endpoint** — `src/services/license.js:16-22`, missing `store_id` parameter
3. **[P1] Store.saveToStorage Logic Bug** — `src/state/store.js:105-106`, broken error handling
4. **[P1] Unhandled API Error Propagation** — `src/services/youtube.js:138-141`, `search()` throws, caller crashes
5. **[P1] API Key Unreachable at Runtime** — `src/background/index.js:44-55`, config.js not web-accessible

## Scores
- **Consistency:** 6/10
- **Health:** 4/10

## Summary Stats
| Category | Count |
|----------|-------|
| P0 (crash/security) | 4 |
| P1 (major logic) | 15 |
| P2 (minor/quality) | 48 |
| Architecture smells | 7 |
| Dead code instances | 3 |
