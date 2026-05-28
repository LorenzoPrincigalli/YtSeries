# Content script and popup

These contexts **cannot use ES module imports** from the extension tree (manifest loads them as classic scripts).

## Content script (`src/content/index.js`)

Runs on all `https://www.youtube.com/*` pages.

### Responsibilities

1. **Sidebar link** — inject “YT Series” into YouTube guide; click → `OPEN_SERIES_TAB`
2. **Video end detection** — on `ended`, send `EPISODE_WATCH` with `videoId` + `playlistId` from URL `list=` param
3. **SPA navigation** — listen `yt-navigate-finish`, re-run injection and video setup
4. **Playlist button** — inject “Add to Series” button on playlist pages; checks `PLAYLIST_EXISTS` to show correct text
5. **Progress tracking** — send `EPISODE_PROGRESS` periodically (throttled to 10s with 3s debounce)
6. **Next Episode overlay** — show overlay 30s before video end with “Watch Next” button

### Duplicated EVENTS

Content script defines local EVENTS object (must stay in sync with `src/shared/events.js`):

- `OPEN_SERIES_TAB`
- `EPISODE_WATCH`
- `EPISODE_PROGRESS`
- `GET_NEXT_EPISODE`
- `PLAYLIST_ADD`
- `PLAYLIST_EXISTS`
- `STATE_GET`

### Fragile DOM selectors

YouTube changes UI often. Current selectors include:

- `.video-stream`, `.html5-main-video` (player)
- `ytd-guide-section-renderer` (sidebar)

Expect breakage after YouTube updates; test on watch and browse pages.

### Error handling

`chrome.runtime.sendMessage` failures are caught silently (extension reload, context invalidated).

### i18n

Sidebar label is hardcoded English (`YT Series`). Tab uses full i18n.

## Popup (`src/popup/popup.js`)

Non-module script bound in `popup.html`.

### Actions

| Button | Message / action |
|--------|------------------|
| Open Dashboard | `{ type: 'OPEN_SERIES_TAB' }` (string literal) |
| Settings | Opens tab URL with `?settings=1` (not handled in app.js) |
| Buy Pro | Opens Lemon Squeezy checkout URL |

### Stats

On load: `STATE_GET` → counts series, unwatched episodes, new episodes (Pro only for `newEpisodesCount`).

Uses `state.license?.isPro` for badge — same UI vs enforcement caveat as tab.

## Comparison table

| | Tab | Content | Popup |
|---|-----|---------|-------|
| ES modules | Yes | No | No |
| Imports `events.js` | Yes | No | No |
| Mutates store | No | No | No |
| Listens `STATE_UPDATED` | Yes | No | No |

## Agent checklist

- [ ] If new content message: add to `events.js` **and** content `EVENTS` object
- [ ] If new popup action: use exact string matching background handler
- [ ] Test on YouTube watch page with `?v=` and `&list=` for episode watch
- [ ] Test after extension reload (content script reinjection)
- [ ] Do not import from `src/shared/` in content/popup without manifest change (e.g. bundler)

## Related

- [02-message-protocol.md](02-message-protocol.md)
- [01-architecture.md](01-architecture.md)
