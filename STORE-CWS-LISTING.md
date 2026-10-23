# YT Series — Chrome Web Store Listing

## Extension Name
YT Series

## Short Description (132 chars max)
Track YouTube playlists and channels like TV series: progress on YouTube, time left, notes, goals, release forecasts, shareable lists.

## Full Description

YT Series turns any YouTube playlist into a Netflix-style TV series tracker. Add a playlist via URL or search, and the extension gives you a beautiful cinematic dashboard where you watch, track, and pick up right where you left off.

**Features:**
- Import any YouTube playlist via URL or YouTube search, or follow a channel as a series of its latest videos (no Shorts)
- Cinematic dashboard with hero carousel, series cards, and hover previews
- Auto-detect progress: tracks watch time and saves precise resume points
- Your progress right on YouTube: watched badges and progress bars on playlist pages, "12/40 watched · 4 h left"
- Time left and a finish estimate for every series, based on your pace
- Leave trailers and filler out of your progress (suggested automatically)
- Upcoming view: when each series and channel is expected to release its next episode
- Weekly episode goal, day streak and milestones
- Timestamped notes while you watch, exportable as Markdown
- Share a series or a whole collection with a link
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

1280×800, 24-bit PNG (no alpha), in `src/assets/store/screenshots/`. Regenerate with `npm run build && npm run screenshots`: it loads real YouTube playlists from their official channels (BBC Earth, WWF UK, LEMMiNO, Kurzgesagt, Veritasium, CrashCourse, Mark Rober, Gordon Ramsay, Mark Wiens, Kara and Nate) and follows two channels (Veritasium, Kurzgesagt) through the live Worker, exactly like the extension does; `scripts/store-library.mjs` lists them and stages only the viewing state, notes and goal. Needs network; results follow whatever the channels publish.

1. `screenshot-01-home.png` — Home: featured series with time left and "Continue Watching", "This week" goal and streak, New This Week with followed channels (Classic Red)
2. `screenshot-02-detail.png` — Series detail: time left and finish estimate, trailers excluded, timestamped notes, share (Classic Red)
3. `screenshot-03-collections.png` — Saved library organised in collections (Ocean Blue)
4. `screenshot-04-search.png` — YouTube search: playlists, and channels you can follow as a series (Light)
5. `screenshot-05-upcoming.png` — Upcoming: expected releases of ongoing series and followed channels (Forest)

## Promo Images
24-bit PNG (no alpha), in `src/assets/store/`. Regenerate with `npm run promo` (after `npm run screenshots`: the tiles reuse the dashboard and detail screenshots).

- Small promo tile (440×280): `promo-small.png`
- Marquee promo tile (1400×560): `promo-marquee.png`

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
