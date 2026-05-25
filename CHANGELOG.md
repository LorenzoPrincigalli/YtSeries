# Changelog

## [1.0.0] - 2026-05-25

### Added
- Project scaffold (Manifest V3, service worker, content script, tab UI)
- YouTube playlist import via URL or search
- Netflix-style carousels with L/R arrows and drag-to-scroll
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
