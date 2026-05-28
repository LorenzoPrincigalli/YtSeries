# Tab UI (dashboard)

Main UI: `src/tab/index.html` + `src/tab/app.js` + `src/tab/main.css`.

## Bootstrap (`app.js`)

On `DOMContentLoaded`:

1. `translateUI()` — `data-i18n` attributes via `t()`
2. `bindUIEvents()`
3. `listenBroadcasts()` — `STATE_UPDATED`
4. `loadState()` — `STATE_GET`
5. `applyTheme()`, `initIconTheme()`

Global module-level `state` mirrors background store (not the `store` singleton).

## Components

| File | Class | Role |
|------|-------|------|
| `components/home.js` | `HomePage` | Hero, carousels, search results, hover previews |
| `components/detail.js` | `DetailPage` | Series modal: episodes, sort, bulk watch, related playlists |
| `components/modal.js` | `ModalManager` | Generic modals + `confirm()` |

`app.js` orchestrates: filters, search debounce, settings panel, license UI, routing between home and detail.

## Messaging from tab

```javascript
async function sendMessage(type, payload) {
  return chrome.runtime.sendMessage({ type, payload })
}
```

Most actions use this helper. **Exception:** `detail.js` may call `chrome.runtime.sendMessage` directly for `FETCH_CHANNEL_PLAYLISTS`.

## Custom DOM events

| Event | Detail | Handler |
|-------|--------|---------|
| `yt-series-add` | `{ playlistId }` | `app.js` → `PLAYLIST_ADD` |
| `yt-series-delete` | `{ playlistId }` | `app.js` → `SERIES_DELETE` |

Dispatched from detail UI when adding related playlists.

## Filters and views

- `currentFilter`: `all` | `watching` | `completed` | `new`
- “New This Week” / `newEpisodesCount` badges: gated on `state.license.isPro` in UI (see license doc for enforcement mismatch)
- Recommended row: channel-based discovery (Pro-related logic in `app.js`)

## Detail modal

`detailPage.render(series, callbacks)`:

- `onWatch(playlistId, videoId)` → `handleWatchEpisode` → `EPISODE_WATCH`
- `onRefresh`, `onCompleteToggle`, `onAddSeries`, `onBack`
- `isPro` passed for new-episode highlight (7-day window)

Multi-select “mark watched” should call `onWatch` per video (not localStorage hacks).

## i18n

- `src/shared/i18n.js` — `en` / `it` tables, `t(key, { param })`
- HTML: `data-i18n="key"` attributes
- `setLanguage()` when settings.language ≠ `system`
- After language change: call `translateUI()` again

## Theming

- `THEME_COLORS` in constants — CSS variables applied in `applyTheme()`
- Toolbar icon: `SET_ICON_THEME` with `{ suffix: '_light' | '' }` based on page theme detection

## Security (UI)

- Prefer `document.createElement` + `textContent` for user/API strings
- `innerHTML` acceptable for **static** SVG arrows and trusted templates
- Search/empty states using `t()` inside `innerHTML` are lower risk but DOM APIs are preferred for new code

## Hover previews (`home.js`)

Embeds YouTube iframe on card hover — requires CSP `frame-src` for youtube domains.

## Deep links (gap)

Background/popup open URLs like:

- `index.html?series={playlistId}`
- `index.html?settings=1`

**`app.js` does not read query params** — notification and popup deep links do not auto-open detail/settings. See [10-known-issues.md](10-known-issues.md).

## Related

- Messages: [02-message-protocol.md](02-message-protocol.md)
- Pro UI: [07-freemium-license.md](07-freemium-license.md)
