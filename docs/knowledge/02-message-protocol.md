# Message protocol

All cross-context communication uses `chrome.runtime.sendMessage({ type, payload })`. Constants live in `src/shared/events.js` and are imported everywhere (content script and popup are bundled, so there are no duplicated literals).

## Route definition

Routes are declared in `src/background/handlers/*.js` and merged in `background/index.js`:

```javascript
[EVENTS.SERIES_DELETE]: {
  schema: s.object({ playlistId: s.id() }),   // src/shared/schema.js
  handler: deleteSeries,                       // (ctx, parsedPayload) => response
  mode: 'command',                             // default; 'read' skips the command queue
  contexts: ['extension']                      // default; add 'content' only if youtube.com needs it
}
```

`router.dispatch()` order: route lookup (`UNKNOWN_TYPE`) → sender context (`FORBIDDEN`) → schema parse (`INVALID_PAYLOAD`) → handler. Any thrown error becomes `{ success: false, error, message }`.

## Broadcast

After every committed mutation:

- Extension pages: `{ type: STATE_UPDATED, state, syncStatus, _broadcast: true }`
- YouTube tabs: `{ type: STATE_UPDATED, state: { settings, series: { [id]: true } }, _broadcast: true }`

The listener ignores `_broadcast` messages as commands.

## Event reference

C = callable from the content script.

| Type | C | Payload | Response |
|------|---|---------|----------|
| `STATE_GET` | | — | `{ success, state, syncStatus }` |
| `CONTENT_SETTINGS_GET` | only | — | `{ success, settings: { nextEpisodeOverlay, language } }` |
| `PLAYLIST_ADD` | ✓ | `{ url ≤ 2048 }` | `{ success, series }` |
| `PLAYLIST_EXISTS` | ✓ | `{ playlistId }` | `{ success, exists }` |
| `SERIES_REFRESH` | | `{ playlistId }` | `{ success, series }` |
| `SERIES_DELETE` | | `{ playlistId }` | `{ success, deletedSeries }` (backup taken first) |
| `SERIES_RESTORE` | | `{ series }` (validated by `normalizeSeriesBackup`) | `{ success, state }` |
| `SERIES_COMPLETE_TOGGLE` | | `{ playlistId }` | `{ success, state }` |
| `SERIES_COLLECTION_SET` | | `{ playlistId, collection ≤ 40 }` | `{ success, state, skipped? }` |
| `COLLECTION_CREATE` | | `{ name 1–40, ids? }` | `{ success, state }` |
| `COLLECTION_EDIT` | | `{ name, nextName, cover }` | `{ success, state, moved, skipped: 0, undoToken: null }` |
| `COLLECTION_MOVE` | | `{ ids (1–2000), destination ≤ 40 }` | `{ success, state, moved, skipped, undoToken }` |
| `COLLECTION_UNDO` | | `{ token }` | `{ success, state, restored, skipped }` or `UNDO_EXPIRED` |
| `COLLECTION_DELETE` | | `{ name }` | `{ success, state }` |
| `ACTIVITY_MARK_READ` | | `{ through: int ≥ 0 }` | `{ success, activityReadAt }` |
| `EPISODE_WATCH` / `EPISODE_UNWATCH` | ✓ / | `{ videoId, playlistId? (hint) }` | `{ success, state }` |
| `EPISODE_PROGRESS` | ✓ | `{ videoId, playlistId?, progress 0–100, currentTime, duration }` | `{ success }` (persisted) |
| `GET_NEXT_EPISODE` | ✓ | `{ videoId, playlistId }` | `{ success, nextEpisode }` |
| `SETTINGS_UPDATE` | | `{ theme?, language?, autoRefresh?, nextEpisodeOverlay? }` | `{ success, settings }` |
| `SET_ICON_THEME` | | `{ suffix: '' \| '_light' }` | `{ success }` |
| `OPEN_SERIES_TAB` | ✓ | — | `{ success }` |
| `PLAYLIST_SEARCH` | | `{ query 1–200 }` | `{ success, playlists, channels }`; `RATE_LIMITED` within 3 s |
| `FETCH_CHANNEL_PLAYLISTS` | | `{ channelId, excludePlaylistId? }` | `{ success, playlists }` |
| `SYNC_LOGIN` | | `{ allowAccountChange? }` | `{ success, syncStatus }` (errors also carry `syncStatus`) |
| `SYNC_LOGOUT` / `SYNC_NOW` / `SYNC_STATUS` | | — | `{ success, syncStatus }` |
| `IMPORT_SERIES` | | `{ series }` | `{ success, imported }` |
| `BACKUP_LIST` / `BACKUP_RESTORE` | | — / `{ id }` | `{ success, backups }` / `{ success, state }` |
| `STORAGE_RESET` | | — | `{ success, syncStatus }` (remote wipe first) |
| `LOAD_DEMO_DATA` | | — | `{ success, count }`; `NOT_IN_DEV_MODE` once `EXTENSION_ID` is set |
| `RELOAD_STATE` | | — | `{ success, state }` |

`EPISODE_*` accept a stale or foreign `playlistId`: `store.resolvePlaylistForVideo` falls back to the playlist that actually contains the video.

## Error codes

| Code | Meaning |
|------|---------|
| `INVALID_PAYLOAD` | Schema rejected the payload |
| `FORBIDDEN` | Unknown sender, or route not allowed from this context |
| `UNKNOWN_TYPE` | No such route |
| `INIT_FAILED` / `STATE_UNAVAILABLE` | Service worker could not initialise |
| `NETWORK_ERROR`, `NETWORK_TIMEOUT`, `API_UNAVAILABLE`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `CIRCUIT_OPEN` | YouTube/Worker failures (`retryable` where transient) |
| `PLAYLIST_NOT_FOUND`, `INVALID_URL`, `SERIES_NOT_FOUND`, `VIDEO_NOT_FOUND` | Domain lookups |
| `COLLECTION_EXISTS`, `INVALID_COLLECTION*`, `INVALID_COVER`, `UNDO_EXPIRED` | Collections |
| `INVALID_BACKUP`, `BACKUP_NOT_FOUND`, `STORAGE_*` | Library/storage |
| `ACCOUNT_CHANGED`, `SYNC_*`, `FIRESTORE_*`, `AUTH_*` | Cloud Sync |

UI code maps codes to `error_<code>` i18n keys (`src/tab/ui/feedback.js`); raw `message` strings are for logs only.

## Related

- [09-agent-playbook.md](09-agent-playbook.md) — recipe for adding a route
