# YT Series

Transform YouTube playlists into a TV-series tracker with Netflix-style UI.

## Features

- **Import playlists** via URL or YouTube search
- **Track progress** — auto-detect video watching with debounced saves
- **Netflix-style carousels** — hero banner with crossfade, L/R arrows, drag-to-scroll
- **Next Episode overlay** — Netflix-style "Watch Next" popup at 30s from the end
- **Sort episodes** by date, watched status, or default order
- **Filter** by All / Watching / Completed / New Episodes
- **New This Week** — series with videos published in the current week
- **Recommended** — discover playlists from your saved channels
- **Sidebar integration** — YT Series link injected into YouTube's sidebar
- **"Add to Series" button** — injected directly into YouTube playlist pages
- **i18n** — English and Italiano (full coverage)
- **Themes** — Classic Red, Ocean Blue, Forest Green
- **Freemium** (Lemon Squeezy) — Pro unlocks auto-refresh, unlimited series
- **Cloud sync** (optional) — Firebase-backed cross-device progress sync

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory

## Setup

1. Run `npm install` to install dev dependencies
2. Run `npm run setup` — interactive wizard to create `config.js` and `firebase.config.js` from examples
3. Run `npm run icons` to generate extension icons from SVG source
4. Load the unpacked extension in Chrome

> In production, the extension uses a Cloudflare Worker proxy for YouTube API calls, so no API key is shipped to users. Local development can use a direct API key via `config.js`.

## Stack

| Layer | Technology |
|-------|-----------|
| Extension platform | Chrome Manifest V3 |
| Language | Vanilla JavaScript (ES modules) |
| UI | Vanilla DOM (no framework), CSS Custom Properties |
| YouTube API | Cloudflare Worker proxy + YouTube Data API v3 (3-layer caching: edge + KV) |
| Licensing | Lemon Squeezy |
| Sync (optional) | Firebase Auth + Firestore via REST |
| Test runner | Vitest (81 tests) |
| Icons | Sharp (SVG → PNG) |
| Dev automation | Playwright (screenshots, debug) |

## Code quality

A full [codebase analysis](docs/2026-05-29_1930/07-Final-Report.md) was conducted covering security, performance, architecture, and edge cases. Key results:

- **Security posture:** 1.7/10 → 6/10 after fixes (API key removed from bundle, Dev Pro Toggle stripped, CSP hardened)
- **81 tests passing** — store, YouTube service, Firestore wire format, sync logic, i18n
- **Content script reliability** — listener leaks fixed (visibility, MutationObserver, fullscreen)
- **i18n** — all content script strings now use TRANSLATIONS (EN/IT) instead of hardcoded Italian
- **YouTube API quota** — 100K→1K units/day via 3-layer Worker caching (edge + KV). Search merged from 2 calls (200u) to 1 call (100u)
- **Known gaps:** server-side license gating needed for production, content script ES module imports require a bundler, LemonSqueezy validate missing store_id

### Worker caching strategy

```
Request → caches.default (edge, 0ms) → KV (global, ~5ms) → YouTube API (~500ms)
```

| Endpoint | Edge TTL | KV TTL |
|---|---|---|
| search (100u) | 1h | 24h |
| playlists (1u) | 1h | 6h |
| playlistItems (1u) | 2min | — |
| videos (1u) | 7 days | — |

See [docs/caching-plan.md](docs/caching-plan.md) for full design.

## Developer experience

The project includes AI agent skills (`.agents/skills/`):

- `greploop` — iterative codebase exploration via grep
- `check-pr` — PR review with `gh` CLI
- `senior-engineer` — architecture and refactoring planning

`gh` CLI is required for PR-related skills. Install it from [cli.github.com](https://cli.github.com/) and authenticate with `gh auth login`.

## Testing

```bash
npm test
```

Unit tests cover: store mutations, YouTube URL parsing and duration parsing, Firestore REST encoder/decoder, sync merge logic, i18n translation lookups.

## Assets

| Directory | Contents |
|-----------|----------|
| `src/assets/icons/` | SVG source files for extension icons |
| `src/assets/store/` | Chrome Web Store materials (screenshots guide, privacy policy) |
| `src/assets/scripts/` | Build tools (`generate-icons.cjs`, mock data, Playwright scripts) |

## Publishing to Chrome Web Store

1. Run `npm run icons` to regenerate all PNG icons
2. Take screenshots following `src/assets/store/screenshots.md`
3. Set `EXTENSION_ID` in `src/shared/constants.js` to the assigned CWS ID
4. Host `src/assets/store/privacy-policy.html` on a public URL (GitHub Pages, etc.)
5. Submit via [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) ($5 registration fee)
6. Set up Lemon Squeezy product for Pro license keys

## Agent / contributor docs

Structured knowledge for AI agents and maintainers:

- **[docs/knowledge/README.md](docs/knowledge/README.md)** — index, reading order, task → file map

Covers architecture, message protocol, data model, Pro licensing, and common pitfalls.

## License

MIT
