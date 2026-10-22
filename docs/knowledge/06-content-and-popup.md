# Content script and popup

Both are bundled by esbuild as classic (IIFE) scripts, so they import `src/shared/*` like the rest of the extension.

## Content script (`src/content/`)

Runs on `https://www.youtube.com/*` with `content.css`.

| Module | Responsibility |
|--------|----------------|
| `index.js` | Bootstrap: settings (`CONTENT_SETTINGS_GET` at start, then broadcasts), SPA navigation (`yt-navigate-finish`), DOM observer throttled to one pass per frame |
| `messaging.js` | `send()` that never throws; detects "Extension context invalidated" and shuts the integration down |
| `playbackSession.js` | One object per (video, playlist): binds `<video>`, progress every 5 s (3 s debounce, ≥ 10 s between writes), `ended` → `EPISODE_WATCH`, triggers the overlay in the last 30 s; stops sending progress after `VIDEO_NOT_FOUND` (video in no saved series) until the library changes; `dispose()` releases every timer/listener |
| `nextEpisodeOverlay.js` | "Watch next" card: lookup via `PLAYLIST_EXISTS` + `GET_NEXT_EPISODE`, stale-request tokens, Escape/close dismiss for the session, follows fullscreen/theater/mini modes |
| `pageInjections.js` | Sidebar link and "Add to Series" button. YouTube keeps several playlist headers in the DOM (hidden/cached), so the button is placed only in the **visible** one (`findVisible`) and stray copies are removed on every pass; its label follows `STATE_UPDATED` live |
| `youtubeDom.js` | **All YouTube selectors** — update here after a YouTube redesign |
| `toast.js` | Small page notices |

The content script may call only the routes marked C in [02-message-protocol.md](02-message-protocol.md) and never receives library data.

### Extension updates and open tabs

Chrome leaves the previous copy of a content script orphaned in tabs that were open when the extension is installed, updated or reloaded, and does not inject the new one. Therefore:

- `background/index.js` → `injectIntoOpenYouTubeTabs()` on `onInstalled` injects the manifest's content script + CSS into open YouTube tabs (`scripting` permission; no new warning, host access already granted).
- Each instance claims the page with `<html data-yt-series-instance>`; an instance that is no longer the claimant (or whose `chrome.runtime.id` is gone) shuts down and removes its own UI. Injected elements carry `data-owner`, and the new instance removes foreign ones.
- A failed `PLAYLIST_EXISTS` lookup never renders a button (a wrong "Add to Series" for a saved playlist); it is retried after 2 s.

## Popup (`src/popup/`)

Shows series / unwatched / new counts, sync indicator, and shortcuts (dashboard, settings via `?settings=1`, support). Uses `data-theme` and the dashboard's `variables.css`; strings come from `i18n.js`.

## Testing

`npm run smoke` serves stub YouTube markup through Playwright routing, so the real content script is exercised (sidebar link, add button state, `ended` → watched) without network access. After YouTube DOM changes also test manually on a real watch page with `&list=` and after an extension reload.
