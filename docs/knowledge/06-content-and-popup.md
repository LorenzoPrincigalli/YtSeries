# Content script and popup

Both are bundled by esbuild as classic (IIFE) scripts, so they import `src/shared/*` like the rest of the extension.

## Content script (`src/content/`)

Runs on `https://www.youtube.com/*` with `content.css`.

| Module | Responsibility |
|--------|----------------|
| `index.js` | Bootstrap: settings (`CONTENT_SETTINGS_GET` at start, then broadcasts), SPA navigation (`yt-navigate-finish`), DOM observer throttled to one pass per frame |
| `messaging.js` | `send()` that never throws; detects "Extension context invalidated" and shuts the integration down |
| `playbackSession.js` | One object per (video, playlist): binds `<video>`, progress every 5 s (3 s debounce, ≥ 10 s between writes), `ended` → `EPISODE_WATCH`, triggers the overlay in the last 30 s; `dispose()` releases every timer/listener |
| `nextEpisodeOverlay.js` | "Watch next" card: lookup via `PLAYLIST_EXISTS` + `GET_NEXT_EPISODE`, stale-request tokens, Escape/close dismiss for the session, follows fullscreen/theater/mini modes |
| `pageInjections.js` | Sidebar link and "Add to Series" button (playlist pages) with navigation tokens against stale callbacks |
| `youtubeDom.js` | **All YouTube selectors** — update here after a YouTube redesign |
| `toast.js` | Small page notices |

The content script may call only the routes marked C in [02-message-protocol.md](02-message-protocol.md) and never receives library data.

## Popup (`src/popup/`)

Shows series / unwatched / new counts, sync indicator, and shortcuts (dashboard, settings via `?settings=1`, support). Uses `data-theme` and the dashboard's `variables.css`; strings come from `i18n.js`.

## Testing

`npm run smoke` serves stub YouTube markup through Playwright routing, so the real content script is exercised (sidebar link, add button state, `ended` → watched) without network access. After YouTube DOM changes also test manually on a real watch page with `&list=` and after an extension reload.
