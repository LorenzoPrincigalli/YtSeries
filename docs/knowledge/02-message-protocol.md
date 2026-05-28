# Message protocol

All cross-context communication uses `chrome.runtime.sendMessage` with `{ type, payload }`.

Constants live in `src/shared/events.js`. **Content script and popup duplicate string literals** — they cannot import `events.js`.

## Listener contract (background)

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ...
  return true  // REQUIRED for async sendResponse
})
```

- `ensureInit()` runs before `handleMessage()`
- Errors return `{ success: false, error, message? }`

## Broadcast

After mutations, background calls:

```javascript
chrome.runtime.sendMessage({
  type: 'STATE_UPDATED',
  state: store.getState(),
  _broadcast: true
})
```

Tab listens in `app.js` → `listenBroadcasts()`. Do not handle `_broadcast` as an incoming command.

## Event reference

| Type | Direction | Payload | Response |
|------|-----------|---------|----------|
| `STATE_GET` | → BG | — | `{ success, state }` |
| `STATE_UPDATED` | BG → clients | — (includes `state`, `_broadcast`) | — |
| `PLAYLIST_ADD` | → BG | `{ url: string }` | `{ success, series? }` or `LIMIT_REACHED` |
| `SERIES_DELETE` | → BG | `{ playlistId }` | `{ success }` |
| `SERIES_REFRESH` | → BG | `{ playlistId }` | `{ success, series? }` |
| `SERIES_COMPLETE_TOGGLE` | → BG | `{ playlistId }` | `{ success, state? }` |
| `EPISODE_WATCH` | → BG | `{ videoId, playlistId? }` | `{ success, state? }` |
| `SETTINGS_UPDATE` | → BG | partial settings object | `{ success, settings }` |
| `LICENSE_VERIFY` | → BG | `{ key }` | `{ success, valid, reason? }` |
| `ACTIVATE_LICENSE` | external → BG | `{ key }` (top-level, not payload) | `{ success, valid? }` |
| `OPEN_SERIES_TAB` | → BG | — | `{ success }` |
| `PLAYLIST_SEARCH` | → BG | `{ query }` | `{ success, playlists, channels }` |
| `FETCH_CHANNEL_PLAYLISTS` | → BG | `{ channelId, excludePlaylistId? }` | `{ success, playlists }` |
| `SET_ICON_THEME` | → BG | `{ suffix: '' \| '_light' }` | `{ success }` |
| `STORAGE_RESET` | → BG | — | `{ success }` |

### `EPISODE_WATCH` notes

- `playlistId` optional: background resolves via `store.findPlaylistByVideoId(videoId)`
- Content script sends both when known from URL `list=` param

### Error codes (common)

| Code | Meaning |
|------|---------|
| `LIMIT_REACHED` | Free tier, 3 series max (`FREE_LIMITS.MAX_SERIES`) |
| `FORBIDDEN` | Message from non-extension sender |
| `RATE_LIMITED` | License verify backoff |
| `UNKNOWN_TYPE` | Unhandled `message.type` |

## External messages

`chrome.runtime.onMessageExternal` — only `ACTIVATE_LICENSE`:

- Sender must match `externally_connectable.matches` in manifest (`lorenzoprincigalli.github.io`)
- Same verify flow as `LICENSE_VERIFY` with rate limiter

## Non-message integrations

| Mechanism | Use |
|-----------|-----|
| `window` custom events | `yt-series-add`, `yt-series-delete` (detail → app.js) |
| `detail.js` | Sometimes calls `chrome.runtime.sendMessage` directly for channel playlists |

## Content script EVENTS duplicate

`src/content/index.js` defines:

```javascript
const EVENTS = {
  OPEN_SERIES_TAB: 'OPEN_SERIES_TAB',
  EPISODE_WATCH: 'EPISODE_WATCH'
}
```

**When adding a new event used from content:** update both `events.js` and this block.

## Popup literals

`popup.js` uses string `'OPEN_SERIES_TAB'` and `'STATE_GET'` (no import).

## Agent checklist

- [ ] Added constant to `src/shared/events.js`
- [ ] Handler in `handleMessage()` + `saveToStorage()` + `broadcastStateUpdate()` if mutating
- [ ] Duplicated strings in content/popup if they send the new type
- [ ] Tab handles `STATE_UPDATED` if UI should react without local optimistic update
- [ ] Async handler returns `true` from listener
- [ ] Payload validation matches existing handlers (typeof checks)

## Related

- [09-agent-playbook.md](09-agent-playbook.md) — step-by-step for new events
