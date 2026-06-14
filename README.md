# YT Series

Transform YouTube playlists into a TV-series tracker with a cinematic dashboard.

## Features

- **Import playlists** via URL or search YouTube (press Enter to search)
- **Track progress** — auto-detect video watching with debounced saves
- **Cinematic carousels** — hero banner with crossfade, L/R arrows, drag-to-scroll
- **Next Episode overlay** — "Watch Next" popup when a video is about to end
- **Sort episodes** by date, watched status, or default playlist order
- **Filter** by All / In Progress / Completed / New Episodes
- **"New This Week"** — Pro-only section showing series with fresh content
- **Hover preview** — peek at any video without leaving the page
- **Sidebar integration** — YT Series link injected into YouTube's sidebar
- **"Add to Series" button** — injected directly into YouTube playlist pages
- **4 themes** — Classic Red, Ocean Blue, Forest Green, Light
- **i18n** — English and Italiano (full coverage)
- **Cloud sync** (optional) — Firebase-backed cross-device progress sync
- **Keyboard shortcut** — Ctrl+Shift+Y
- **Popup dashboard** — series count, unwatched, and new episode stats

## Pricing

| Plan | Price | Features |
|------|-------|----------|
| **Free** | €0 | Up to 3 series, auto-refresh on open, 4 themes, cloud sync |
| **Pro** | €4.99 one-time | Unlimited series, new episode notifications (24h), "New This Week" section |

Purchase via Lemon Squeezy. One-time payment — no subscription.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory

## Setup

1. Run `npm install`
2. Run `npm run setup` — creates `config.js` and `firebase.config.js`
3. Run `npm run icons` — generates extension icons from SVG
4. Load the unpacked extension in Chrome

> In production, the extension uses a Cloudflare Worker proxy for YouTube API calls. No API key is shipped to users.

## Stack

| Layer | Technology |
|-------|-----------|
| Extension platform | Chrome Manifest V3 |
| Language | Vanilla JavaScript (ES modules) |
| UI | Vanilla DOM, CSS Custom Properties |
| YouTube API | Cloudflare Worker proxy + YouTube Data API v3 |
| Licensing | Lemon Squeezy |
| Sync (optional) | Firebase Auth + Firestore via REST |
| Test runner | Vitest (86 tests) |
| Icons | Sharp (SVG → PNG) |

## Tests

```bash
npm test
```

86 tests across 5 test files: store, YouTube service, Firestore wire format, sync logic, i18n.

## Pre-publish

See `PUBLISH-CHECKLIST.md` for blockers and required steps before Chrome Web Store submission.

## Dev Tools

Dev tools (Pro toggle, demo data loader) are available when `EXTENSION_ID` is empty. They auto-disable in production builds.

## License

MIT
