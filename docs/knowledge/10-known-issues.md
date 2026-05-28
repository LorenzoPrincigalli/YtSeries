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

### Open / verify

| Priority | Issue | Notes |
|----------|-------|-------|
| Low | Dead code in `_renderNewEpisodeHighlight()` | tasks-build cited lines after `return` — verify current `detail.js`; may already be clean |
| — | Stale `tasks-build.md` | Update root file when closing items |

## Documentation / product gaps

| Gap | Impact |
|-----|--------|
| Deep links not implemented | `?series=` and `?settings=1` opened by popup/notification but **`app.js` ignores query params** |
| `EXTENSION_ID` empty | External `activate.html` flow disabled until CWS publish |
| `store.isPro()` vs `license.isPro` | UI may show Pro while background enforces 24h re-verify window |
| In-app changelog empty | `src/shared/changelog.js` has empty array; `CHANGELOG.md` has content |
| README emphasizes `config.js` | Repo defaults to worker — misleading for new contributors |
| Content script i18n | Sidebar English only |
| Version mismatch | `manifest.json` vs `package.json` versions may differ |
| No linter/tests | `npm run lint` is placeholder; manual QA only |

## Agent traps

| Trap | Avoid |
|------|-------|
| Editing store from tab | Use messages only |
| New EVENTS without content duplicate | Sync `content/index.js` constants |
| YouTube selector breakage | Test on real youtube.com after DOM changes |
| Large series in sync storage | Keep `series` in local only |
| `handleStorageReset` | Does not broadcast — tab may need reload |

## Where to track new work

- Engineering backlog: [`tasks-build.md`](../../tasks-build.md) (repo root)
- Agent docs: update this file + relevant knowledge chapter when behavior changes

## Related

- [09-agent-playbook.md](09-agent-playbook.md)
- [05-tab-ui.md](05-tab-ui.md) — deep link gap
