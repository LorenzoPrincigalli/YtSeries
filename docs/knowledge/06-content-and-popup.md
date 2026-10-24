# Content script and popup

Both are bundled by esbuild as classic (IIFE) scripts, so they import `src/shared/*` like the rest of the extension.

## Content script (`src/content/`)

Runs on `https://www.youtube.com/*` with `content.css`.

| Module | Responsibility |
|--------|----------------|
| `index.js` | Bootstrap: settings (`CONTENT_SETTINGS_GET` at start, then broadcasts), SPA navigation (`yt-navigate-finish`), DOM observer throttled to one pass per frame |
| `messaging.js` | `send()` that never throws; detects "Extension context invalidated" and shuts the integration down |
| `playbackSession.js` | One object per (video, playlist): binds `<video>`, progress every 5 s (3 s debounce, ≥ 10 s between writes), `ended` → `EPISODE_WATCH`, triggers the overlay in the last 30 s and again on `ended`; the card survives `pause` (the browser fires it right before `ended`) and is hidden only when seeking back out of the last 30 s; stops sending progress after `VIDEO_NOT_FOUND` (video in no saved series) until the library changes; `dispose()` releases every timer/listener |
| `nextEpisodeOverlay.js` | "Watch next" card: lookup via `PLAYLIST_EXISTS` + `GET_NEXT_EPISODE`, stale-request tokens, Escape/close dismiss for the session, follows fullscreen/theater/mini modes. When the last episode ends: "All episodes watched" with "the series has ended" or "you're caught up" + "Mark as ended" (`SERIES_ENDED_SET`) |
| `progressOverlay.js` | Series progress on YouTube: summary on the playlist page (with an "Ended" chip), "Watched" badge (SVG check) / progress bar / dimmed excluded episode on each playlist item (playlist page and watch-page panel). Data from `CONTENT_SERIES_PROGRESS` for the current playlist only, reloaded (debounced) on `STATE_UPDATED`; recycled list items are re-decorated by video id |
| `noteButton.js` | "Note at 12:34" (SVG pencil icon) under the title of an episode of a saved series (`CONTENT_VIDEO_SERIES`), inline field → `NOTE_ADD`; keydown never reaches YouTube's shortcuts; Ctrl+Enter saves, Esc cancels |
| `pageInjections.js` | Sidebar link and "Add to Series" button. YouTube keeps several playlist headers in the DOM (hidden/cached), so the button is placed only in the **visible** one (`findVisible`) and stray copies are removed on every pass; its label follows `STATE_UPDATED` live |
| `youtubeDom.js` | **All YouTube selectors** — update here after a YouTube redesign. `findVideo()` prefers `#movie_player video`: YouTube keeps a thumbnail hover-preview player with the same classes in the DOM |
| `toast.js` | Small page notices |

### Styles (`content.css`)

Injected sheets lose ties against YouTube's own CSS, and container rules like `#top-level-buttons-computed > *` outrank a lone class. Controls placed inside YouTube's layout are therefore styled through their id (`#yt-series-add-btn`, `#yt-series-notebar`), set `font-family` explicitly (buttons do not inherit fonts) and use namespaced `--yt-series-*` tokens switched by YouTube's `html[dark]` attribute.

The content script may call only the routes marked C in [02-message-protocol.md](02-message-protocol.md). It never receives the library: the broadcast carries only saved ids, and `CONTENT_SERIES_PROGRESS` returns per-episode flags for the one playlist on screen. `EPISODE_WATCH` responses carry the milestone, shown as a page toast.

### Extension updates and open tabs

Chrome leaves the previous copy of a content script orphaned in tabs that were open when the extension is installed, updated or reloaded, and does not inject the new one. Therefore:

- `background/index.js` → `injectIntoOpenYouTubeTabs()` on `onInstalled` injects the manifest's content script + CSS into open YouTube tabs (`scripting` permission; no new warning, host access already granted).
- Each instance claims the page with `<html data-yt-series-instance>`; an instance that is no longer the claimant (or whose `chrome.runtime.id` is gone) shuts down and removes its own UI. Injected elements carry `data-owner`, and the new instance removes foreign ones.
- A failed `PLAYLIST_EXISTS` lookup never renders a button (a wrong "Add to Series" for a saved playlist); it is retried after 2 s.

## Popup (`src/popup/`)

Shows series / unwatched / new counts, sync indicator, and shortcuts (dashboard, settings via `?settings=1`, support). Uses `data-theme` and the dashboard's `variables.css`; strings come from `i18n.js`.

## Testing

`npm run smoke` serves stub YouTube markup through Playwright routing, so the real content script is exercised (sidebar link, add button state, `ended` → watched) without network access. After YouTube DOM changes also test manually on a real watch page with `&list=` and after an extension reload.
