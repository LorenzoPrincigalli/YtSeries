# Tab UI — Dashboard

The main UI lives in `src/tab/` and renders the full dashboard.

## File structure

| File | Purpose |
|------|---------|
| `index.html` | Shell: header, modals (settings, add playlist, FAQ, changelog, bug report), footer |
| `app.js` | App logic: state, rendering, events, theme, modals, search |
| `variables.css` | CSS custom properties (themes, spacing, z-index, shadows) |
| `base.css` | Body, empty states, loading skeleton, search header |
| `header.css` | Fixed header with logo, nav, search, Pro button |
| `hero.css` | Hero carousel with crossfade |
| `cards.css` | Series cards with hover effects, badges, progress |
| `carousel.css` | Carousel rows with L/R arrows |
| `episodes.css` | Episode list in detail view |
| `components.css` | Buttons, toggles, badges, license UI, upsell cards, free-tier banner |
| `modals.css` | All modals: settings, detail, confirm, FAQ, changelog |
| `footer.css` | Footer bar |
| `responsive.css` | Mobile/tablet breakpoints |

## Components

| Component | File |
|-----------|------|
| `HomePage` | `components/home.js` — hero carousel, series rows, search results |
| `DetailPage` | `components/detail.js` — series detail with episode list |
| `ModalManager` | `components/modal.js` — open/close/confirm modals |

## Themes

Four themes: Classic Red, Ocean Blue, Forest Green, Light ("Tema chiaro").

- `applyTheme()` in `app.js` sets all CSS custom properties including dark/light variants
- Toolbar icon follows selected theme (dark/light variant)
- Popup also supports all themes via `applyPopupTheme()`

## Search

- **Local filtering**: filters displayed series in real-time while typing (no API call)
- **YouTube search**: triggered on Enter key
- **Hint**: "Press Enter to search" appears below search title after 2s of typing
- **Rate limit**: 3s cooldown between YouTube API calls; previous results preserved during cooldown

## Settings panels

| Panel | i18n key | Notes |
|-------|----------|-------|
| Theme | `theme` | 4 options, translated |
| Language | `language` | System / EN / IT |
| Overlays | `settings_overlay` | Next Episode overlay toggle |
| License Key | `license_key` | Pro activation |
| Cloud Sync | `sync_title` | Firebase sign-in |
| Reset Data | `settings_reset` | Clear + backup/restore JSON |
| Dev Tools | `settings_dev` | Hidden when EXTENSION_ID is set |
| Notifications | `auto_refresh` | "New Episode Notifications" toggle (Pro only, hidden for free) |

## Free tier banner

- Appears on main dashboard (all filter, no search)
- Once per day, dismissible with X button
- Shows "Free plan (X/3)" or "Limit reached — Get Pro"
