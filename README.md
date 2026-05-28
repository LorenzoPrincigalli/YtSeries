# YT Series

Transform YouTube playlists into a TV-series tracker with Netflix-style UI.

## Features

- **Import playlists** via URL or YouTube search
- **Track progress** — mark episodes as watched, see completion %
- **Netflix-style carousels** with hero banner, L/R arrows, and drag-to-scroll
- **Sort episodes** by date, watched status, or default order
- **Filter** by All / Watching / Completed / New Episodes
- **New This Week** — series with videos published in the current week
- **Recommended** — discover playlists from your saved channels
- **Hover preview** — YouTube embed preview on card hover
- **Sidebar integration** — YT Series link injected into YouTube's sidebar
- **i18n** — English and Italiano
- **Themes** — Classic Red, Ocean Blue, Forest Green
- **Freemium** (Lemon Squeezy) — Pro unlocks auto-refresh, unlimited series

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory

## Setup

1. Copy `src/shared/config.example.js` to `src/shared/config.js` and add your YouTube Data API v3 key
2. Run `npm install` to install dev dependencies
3. Run `npm run icons` to generate extension icons from SVG source
4. Load the unpacked extension in Chrome

## Stack

- Manifest V3
- Vanilla JS (ES modules)
- YouTube Data API v3
- Chrome Storage API (sync + local)
- Lemon Squeezy (licensing)

## Assets

| Directory | Contents |
|-----------|----------|
| `src/assets/icons/` | SVG source files for extension icons |
| `src/assets/store/` | Chrome Web Store materials (screenshots guide, privacy policy) |
| `src/assets/scripts/` | Build tools (`generate-icons.cjs`) |

Icons are designed as SVGs in `src/assets/icons/` and rendered to PNG via `npm run icons` (uses `sharp`).

## Publishing to Chrome Web Store

1. Run `npm run icons` to regenerate all PNG icons
2. Take screenshots following `src/assets/store/screenshots.md`
3. Host `src/assets/store/privacy-policy.html` on a public URL (GitHub Pages, etc.)
4. Submit via [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) ($5 registration fee)
5. (Optional) Set up Lemon Squeezy product for Pro license keys

## Agent / contributor docs

Structured knowledge for Cursor agents and maintainers:

- **[docs/knowledge/README.md](docs/knowledge/README.md)** — index, reading order, task → file map

Covers architecture, message protocol, data model, Pro licensing, and common pitfalls.

## License

MIT
