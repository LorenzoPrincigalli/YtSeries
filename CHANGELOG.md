# Changelog

## [Unreleased]

### Added
- Ended series: "Mark as ended" in the detail (synced), "Ended" badge, no release forecast and no auto-refresh for them; the detail suggests it after 90 days without uploads
- On YouTube, finishing the last episode shows "All episodes watched" with "the series has ended" or "you're caught up" and a "Mark as ended" button; the playlist summary shows "Ended"

### Changed
- "Exclude" is now "Skip episode" ("Salta episodio")
- No emoji in the interface: SVG icons for notes, play, refresh, warnings and the watched badge
- Firestore rules: optional `ended`/`endedAt` (redeploy the rules)
- `npm run build:watch` re-copies changed HTML/CSS into `dist/`

### Fixed
- The next-episode card disappeared when the episode ended (the browser fires "pause" first) and could bind to YouTube's hover-preview player instead of the episode
- Note bar and "Add to Series" button on the watch page: explicit fonts, light/dark theme colours and enough specificity over YouTube's own rules

## [1.3.0] - 2026-10-23

### Added
- Progress on YouTube: playlist pages show "YT Series · watched/total · time left"; playlist items (page and watch-page panel) get watched badges, progress bars and dimmed excluded episodes
- Time left on cards, hero and detail; finish estimate from the series' recent pace
- Exclude episodes from progress (synced), with a one-click suggestion for trailers and teasers
- Follow channels as series: latest 100 long-form uploads (UULF playlist, UU fallback), from search, the channel dialog or a channel link in "Add via link"
- Upcoming view: expected releases for the next 7 days from each series' rhythm, late and later ones, and episodes out in the last week
- Achievements (trophy in the header): 12 badges with bronze/silver/gold levels and progress to the next, this week's goal, streak and time watched; new badges announced while the dashboard is open
- Weekly episode goal (Settings → Goals); 25/50/75/100 % milestones celebrated in the dashboard and on YouTube
- Timestamped episode notes taken on YouTube, synced with Cloud Sync, listed in the detail and exportable as Markdown
- Shareable lists: a series or a collection as a link (encoded in the URL, no server); share.html on GitHub Pages and an import preview in the dashboard

### Changed
- Worker: allowlisted channels endpoint (channel id or @handle)
- Firestore rules: optional notes map (≤ 400 entries)
- manifest: externally_connectable for the share page only; no web_accessible_resources (the YouTube sidebar mark is inline SVG, which also removes the "Unsafe attempt to load URL" error from orphaned scripts)
- New episodes are counted by new video ids (fixed-size channel windows)

## [1.2.0] - 2026-10-23

### Changed
- Architecture: service worker split into a validated message router and domain handlers; dashboard rebuilt on a store-driven view layer; content script modularised; esbuild bundling to `dist/`
- Resilience: typed errors, retry with backoff, circuit breaker for the YouTube API, transactional saves with rollback, UI error boundaries
- Design system: themes in CSS tokens, AA contrast in all themes, redesigned watched toggle, accessible dialogs and keyboard navigation

### Security
- Cloudflare Worker: endpoint/parameter allowlist, web-page origins rejected (the extension's own requests carry no Origin), atomic per-client rate limit with salted-hash keys, sanitized upstream errors
- Firestore rules validate document shape and size; content scripts restricted to the YouTube-integration messages
- Removed unused YouTube iframe permission from the extension CSP; added `scripting` to refresh already-open YouTube tabs after updates

### Fixed
- Episode progress was not persisted; overlay/language settings ignored on YouTube until the first update
- Duplicate or wrong "Add to Series" buttons on YouTube; unreadable sidebar link in YouTube's light theme
- "+ Add via Link" wrapped onto two lines in the dashboard header at laptop widths
- JSON export did nothing; recommendations stuck empty after a network error; settings dialog crash
- Cloud Sync Google sign-in: the OAuth client now targets the Chrome Web Store extension id, and development builds share that id via the manifest `key`

### Build
- `npm run package` produces the Web Store upload (manifest at the zip root, no source maps, no `key`)

### Quality
- Lint (JS + CSS), typecheck, 188 unit tests, Playwright smoke and a 69-step end-to-end suite with accessibility audits

## [1.1.1] - 2026-06-16

### Changed
- Donation-only model: switched from Lemon Squeezy to Buy Me a Coffee
- All features unlocked for everyone (no limits, no license)
- Removed upsell, license verification and Pro gating from the UI


## [1.1.0] - 2026-05-26

### Added
- Professional SVG source icons (TV+play+series list design) with dark/light variants
- PNG icon generation via `sharp` at 16/48/128 (`npm run icons`)
- Chrome Web Store assets: screenshots guide, privacy policy HTML
- `src/assets/` directory for all store materials
- README setup/publishing section

### Changed
- Card width increased to 500px with proportional font/space scaling
- Carousel gap reduced to 12px for tighter layout
- Scroll buttons moved to `.series-row` level for vertical centering in row
- Updated README with asset workflow and store publishing steps

### Fixed
- Remaining XSS vector in detail.js (episode title injected via innerHTML → safe DOM methods)

## [1.0.0] - 2026-05-25

### Added
- Project scaffold (Manifest V3, service worker, content script, tab UI)
- YouTube playlist import via URL or search
- Cinematic carousels with L/R arrows and drag-to-scroll
- Hero carousel with crossfade, auto-advance (10s), and preview overlay (20s)
- Series progress tracking with watched/unwatched episode state
- Filter chips (All / Watching / Completed / New Episodes)
- Episode sorting (default, newest/oldest first, watched/unwatched first)
- Series complete toggle (mark series as completed/incomplete)
- Detail modal with episode grid, publish dates, and related playlists
- Channel modal with expandable playlist grid
- "New This Week" carousel (videos published Mon–Sun)
- Recommended section from saved channels
- Search with 400ms debounce, returns playlists and channels
- Hover preview with YouTube iframe (`youtube-nocookie.com`), postMessage error detection, 3s fallback
- Custom confirm modal (replaces native `confirm()`)
- i18n support: English and Italiano, system language fallback
- Theme system: Classic Red, Ocean Blue, Forest Green
- Freemium licensing model (Lemon Squeezy integration)
- Auto-refresh alarm for Pro users (24h)
- Custom scrollbar styling
- YouTube sidebar injection (own `ytd-guide-section-renderer` with adaptive colors)

### Security
- Add sender.id validation to background message handler
- Add Content Security Policy to manifest.json
- Replace innerHTML with safe DOM methods on user-controlled data
- Add noopener to all window.open(_, '_blank') calls
- Validate message payload types in all handlers
- Validate YouTube URL scheme (HTTPS only)
- Clean postMessage listener on mouseleave
- Sanitize YouTube API error logging (truncate to 200 chars)
- Add input length limits (200 chars)

### Fixed
- `this` context in `renderEpisodes` (`_createEpisodeCard` undefined)
- Top padding when hero carousel is hidden (completed filter)
