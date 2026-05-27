# Codebase Mapping — YT Series

**Generated:** 2026-05-27_2044

## High-Level Architecture

MV3 Chrome extension with three runtime contexts communicating via message passing:

```
Background SW (src/background/index.js) ←→ Content Script (src/content/index.js)
     ↕                                            (youtube.com/*)
Tab SPA (src/tab/index.html + app.js)
```

**Entry points** (declared in manifest.json):
- Background SW: `src/background/index.js` — module, runs on install/startup
- Content script: `src/content/index.js` — classic JS, injected on `https://www.youtube.com/*`
- Tab SPA: `src/tab/index.html` + `app.js` — module, opened via toolbar icon

## Tech Stack

- **Vanilla JS ES modules** — no frameworks, no bundlers
- **CSS3** with CSS custom properties for theming
- **Build:** sharp (icon generation), playwright (screenshots)
- **Deps:** zero runtime, `sharp` dev only

## Source Files by Concern

### Background
| File | Lines | Purpose |
|------|-------|---------|
| `src/background/index.js` | 432 | Message router (18 event types), init with retry, API key loading, alarm mgmt, broadcast |

### Content Script
| File | Lines | Purpose |
|------|-------|---------|
| `src/content/index.js` | 217 | YouTube sidebar injection, video end detection, MutationObserver for DOM ready |

### Tab SPA
| File | Lines | Purpose |
|------|-------|---------|
| `src/tab/index.html` | 124 | Shell: header, filters, modals, loading |
| `src/tab/app.js` | 843 | Controller: state load, UI bind, search, filter, theme, i18n |
| `src/tab/main.css` | 1613 | Full stylesheet with Netflix carousels, responsive |
| `src/tab/components/home.js` | 512 | Hero carousel, scrollable rows, channel cards |
| `src/tab/components/detail.js` | 740 | Detail modal, episode list, multi-select, related playlists |
| `src/tab/components/modal.js` | 84 | Modal open/close, confirm dialog |

### Services
| File | Lines | Purpose |
|------|-------|---------|
| `src/services/youtube.js` | 252 | YouTube Data API v3: playlists, items, durations, search, channels |
| `src/services/license.js` | 62 | Lemon Squeezy license validation with 3-day cache |
| `src/services/chrome/storage.js` | 83 | Chrome storage sync+local with quota fallback |
| `src/services/chrome/tabs.js` | 36 | Chrome tabs wrapper |
| `src/services/chrome/alarms.js` | 28 | Chrome alarms wrapper |
| `src/services/chrome/notifications.js` | 28 | Chrome notifications wrapper |

### State
| File | Lines | Purpose |
|------|-------|---------|
| `src/state/store.js` | 237 | Central store: series, settings, license. Deep-copy reads, emit on change |

### Shared
| File | Lines | Purpose |
|------|-------|---------|
| `src/shared/events.js` | 30 | 14 event constant types |
| `src/shared/constants.js` | 57 | Storage keys, limits, theme colors, cache TTL |
| `src/shared/i18n.js` | 259 | EN + IT, ~120 keys each, param interpolation |
| `src/shared/logger.js` | 44 | Leveled logger (DEBUG/INFO/WARN/ERROR) |
| `src/shared/config.js` | 1 | Actual API key (gitignored) |
| `src/shared/config.example.js` | 1 | Placeholder API key |

## Key Patterns
- Event bus via EVENTS constants + chrome.runtime messaging
- Store + Service pattern (store is single source of truth)
- Singleton module pattern for all services
- Content script: MutationObserver + polling + YouTube SPA events

## External APIs
- YouTube Data API v3 (key sourced from config.js or settings)
- Lemon Squeezy API (license validation)
- Chrome Storage sync (settings, license) + local (series)

## Missing Pieces
- No test framework, no tests
- No linter configured
- No CI pipeline
- No bundler
- No TypeScript
- No offline fallback for YouTube API
- No storage migration/versioning

## Sizing
- ~40 source files (excluding node_modules, docs, .git)
- ~6,600 lines total source code
- Largest file: main.css (1,613 lines)
