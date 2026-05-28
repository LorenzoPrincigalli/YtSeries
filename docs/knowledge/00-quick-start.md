# Quick start (agents)

## What this is

**YT Series** — Chrome **Manifest V3** extension that turns YouTube playlists into a Netflix-style series tracker.

## Stack

| Item | Choice |
|------|--------|
| Language | Vanilla JavaScript |
| Modules | ES modules in background + tab; **no bundler** |
| UI | HTML + CSS + DOM APIs (`src/tab/`) |
| State | In-memory `store` + `chrome.storage` |
| APIs | YouTube Data API v3 (via Cloudflare Worker by default), Lemon Squeezy |

## Entry points

| Context | Path | Module? |
|---------|------|---------|
| Service worker | `src/background/index.js` | Yes |
| Dashboard (main UI) | `src/tab/index.html` + `app.js` | Yes |
| Toolbar popup | `src/popup/popup.html` + `popup.js` | No |
| Content script | `src/content/index.js` (on `youtube.com`) | No |
| License page | `activate.html` (hosted externally) | N/A |

## Golden rule

```
UI / content / popup  --sendMessage-->  background  --mutates-->  store  --save-->  chrome.storage
                                              |
                                              +-- broadcast STATE_UPDATED --> tab listeners
```

Never mutate `store` or `chrome.storage` from tab, popup, or content script.

## Key files (ownership)

| Concern | File |
|---------|------|
| Message routing | `src/background/index.js` |
| State + persistence | `src/state/store.js` |
| Message constants | `src/shared/events.js` |
| URLs, limits, themes | `src/shared/constants.js` |
| YouTube HTTP | `src/services/youtube.js` |
| License HTTP | `src/services/license.js` |
| Main UX | `src/tab/app.js` + `components/` |

## Default API path

Production uses **Cloudflare Worker** (`API.WORKER_BASE` in `constants.js`). Extension does not ship an API key.

Dev fallback: copy `src/shared/config.example.js` → `config.js` (gitignored) and clear `WORKER_BASE` if testing direct API.

## Reload after edits

1. `chrome://extensions` → reload extension
2. Refresh dashboard tab and YouTube tab (content script)

## Next

Read [01-architecture.md](01-architecture.md) before touching more than one context.
