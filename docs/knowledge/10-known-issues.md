# Known issues and backlog

Synced from `tasks-build.md` and codebase review. Update this file when items are fixed.

## Status legend

- **Open** — still applies
- **Fixed** — resolved in codebase (kept for agent context until removed)

## Backlog (`tasks-build.md`)

### Fixed (verify before re-opening)

| Item | Was | Status |
|------|-----|--------|
| Multi-select mark watched | Wrote to `watched_${playlistId}` instead of store | **Fixed** — calls `callbacks.onWatch()` per video in `detail.js` |
| Real-time state push | Tab missed external updates | **Fixed** — `broadcastStateUpdate()` + tab `listenBroadcasts()` |
| `_getVideoDurations()` unused | Durations always undefined | **Fixed** — called from `_getPlaylistItems()` in `youtube.js` |
| `ensureInit()` retry | Single failure stuck init | **Fixed** |
| API key via dynamic import | SW CSP issue | **Fixed** — fetch `config.js` |
| API key shipped in bundle | `config.js` had live key | **Fixed** — placeholder only, key on Worker |
| Dev Pro Toggle in production | One-click Pro bypass | **Fixed** — removed from HTML + JS |
| Content script hardcoded Italian | Toast/button strings only Italian | **Fixed** — uses TRANSLATIONS object (EN+IT) |
| Content script listener leaks | visibility, MutationObserver, fullscreen never cleaned | **Fixed** — cleanup in `cleanupVideoListener()` |
| Hero carousel interval leak | setInterval never cleared on re-render | **Fixed** — `this._heroTimer` on HomePage |
| CSP missing script-src | No explicit script-src directive | **Fixed** — added `script-src 'self'` |
| `_tamperCount` unused | Orphaned tamper detection counter | **Fixed** — removed |
| `Vedi playlist` hardcoded | Channel card button was Italian-only | **Fixed** — uses `t('see_playlists')` |
| Search: 2 API calls per query | playlist (100u) + channel (100u) = 200u | **Fixed** — merged into `type=playlist,channel` (100u) |
| Search: no rate limit | Rapid searches drained quota | **Fixed** — 3 second cooldown in background |
| Worker: no edge cache | Every call hit YouTube API | **Fixed** — 3-layer caching (edge + KV + YouTube) |

### Open / verify

| Priority | Issue | Notes |
|----------|-------|-------|
| Low | Dead code in `_renderNewEpisodeHighlight()` | tasks-build cited lines after `return` — verify current `detail.js` |
| — | Stale `tasks-build.md` | Update root file when closing items |

## Documentation / product gaps

| Gap | Impact |
|-----|--------|
| Deep links not implemented | `?series=` and `?settings=1` opened by popup/notification but **`app.js` ignores query params** |
| `EXTENSION_ID` empty | External `activate.html` flow disabled until CWS publish |
| `store.isPro()` vs `license.isPro` | UI may show Pro while background enforces 24h re-verify window |
| In-app changelog empty | `src/shared/changelog.js` has empty array; `CHANGELOG.md` has content |
| Version mismatch | `manifest.json` vs `package.json` versions may differ |
| LemonSqueezy validate missing store_id | License validation likely always fails (needs store_id param) |

## Agent traps

| Trap | Avoid |
|------|-------|
| Editing store from tab | Use messages only |
| New EVENTS without content duplicate | Content script can't import ES modules — keep `EVENTS` in `content/index.js` in sync manually |
| YouTube selector breakage | Test on real youtube.com after DOM changes |
| Large series in sync storage | Keep `series` in local only |
| `handleStorageReset` | Does not broadcast — tab may need reload |
| Worker KV writes | Always use `ctx.waitUntil` — never `await` in response path |

## Where to track new work

- Engineering backlog: [`tasks-build.md`](../../tasks-build.md) (repo root)
- Agent docs: update this file + relevant knowledge chapter when behavior changes

## Related

- [09-agent-playbook.md](09-agent-playbook.md)
- [05-tab-ui.md](05-tab-ui.md) — deep link gap
