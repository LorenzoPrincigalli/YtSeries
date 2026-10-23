# YT Series — Chrome Web Store Listing

## Extension Name
YT Series

## Short Description (132 chars max)
Track YouTube playlists like a TV series. Cinematic dashboard with progress, resume, hover previews, and optional cloud sync.

## Full Description

YT Series turns any YouTube playlist into a Netflix-style TV series tracker. Add a playlist via URL or search, and the extension gives you a beautiful cinematic dashboard where you watch, track, and pick up right where you left off.

**Features:**
- Import any YouTube playlist via URL or YouTube search
- Cinematic dashboard with hero carousel, series cards, and hover previews
- Auto-detect progress: tracks watch time and saves precise resume points
- "Next Episode" overlay on YouTube 30s before a video ends
- "Add to Series" button directly on YouTube playlist pages
- Sidebar integration on YouTube for one-click dashboard access
- Hover a series to see its next episode at a glance
- Sort and filter episodes by publish date, watched status, and more
- Discover more series from the same channel
- Four themes: Classic Red, Ocean Blue, Forest Green and Light, all with accessible contrast
- Keyboard shortcut: Ctrl+Shift+Y opens the YT Series popup
- Full keyboard navigation and screen-reader labels throughout the dashboard
- Backup and restore your data as JSON
- Cloud sync across devices (optional, via Google sign-in with Firebase)
- English and Italian language support

**Support the project:**
YT Series is completely free with all features unlocked — no limits, no subscriptions. If you find it useful, consider supporting development on Buy Me a Coffee: https://buymeacoffee.com/ytseriessun

**Privacy:**
Your data stays in your browser by default. Optional cloud sync uses your Google account with Firebase and per-user security rules. We never sell or share your data.

## Category
Productivity

## Languages
English, Italian

## Screenshots

1280×800, 24-bit PNG (no alpha), in `src/assets/store/screenshots/`. Regenerate with `npm run build && npm run screenshots` (fictional library and original artwork, no third-party content).

1. `screenshot-01-home.png` — Home: featured series, "Continue Watching", New This Week with NEW badges (Classic Red)
2. `screenshot-02-detail.png` — Series detail: progress, resume where you left off, episode list with watched toggles (Classic Red)
3. `screenshot-03-collections.png` — Saved library organised in collections (Ocean Blue)
4. `screenshot-04-search.png` — YouTube search: playlists and channels, add with one click (Light)
5. `screenshot-05-activity.png` — Recent activity and progress across series (Forest)

## Promo Images
- Small promo tile (440x280)
- Marquee promo (1400x560)

## Website
https://github.com/LorenzoPrincigalli/YtSeries

## Permission justifications (Privacy practices tab)

| Permission | Justification |
|------------|---------------|
| storage | Saves the user's series, progress and settings locally. |
| alarms | Checks saved playlists for new episodes once a day (optional, user setting). |
| notifications | Tells the user when new episodes are found. |
| tabs | Opens or focuses the dashboard tab and the next-episode link. |
| identity | Optional Google sign-in for Cloud Sync. |
| scripting | Refreshes the YouTube integration in YouTube tabs that were already open when the extension is installed or updated. |
| Host: youtube.com | Sidebar shortcut, "Add to Series" button, next-episode overlay and watch-progress tracking on YouTube pages. |
| Host: googleapis.com, identitytoolkit, securetoken, firestore | YouTube Data API (dev fallback) and optional Cloud Sync. |
| Host: *.workers.dev proxy | Relays YouTube Data API requests so no API key ships in the extension. |

Remote code: **No** — all code is bundled in the package.
Data usage: no data sold or transferred to third parties; no use for unrelated purposes or creditworthiness.

## Privacy Policy URL
https://lorenzoprincigalli.github.io/YtSeries/privacy-policy.html

## Support Email
YTSeries.Support@gmail.com
