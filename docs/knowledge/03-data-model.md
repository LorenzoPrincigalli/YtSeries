# Data model

Storage keys are defined in `src/shared/constants.js` → `STORAGE_KEYS`.

## Storage split

| Key | Area | Content | Size concern |
|-----|------|---------|--------------|
| `settings` | `chrome.storage.sync` | Theme, language, autoRefresh, apiKey | ~4 KB/item limit |
| `license` | `chrome.storage.sync` | Pro key, flags, checksum | ~4 KB/item limit |
| `series` | `chrome.storage.local` | Map of all series (can be large) | Local quota |

**Never move `series` to sync** — it will exceed quota.

`store.saveToStorage()` skips sync write for a key if JSON size > 4096 bytes.

## In-memory state shape

```javascript
{
  series: { [playlistId]: Series },
  settings: { theme, autoRefresh, lastRefreshCheck, language?, apiKey? },
  license: { key, isPro, verifiedAt }
}
```

## Series object

| Field | Type | Notes |
|-------|------|-------|
| `playlistId` | string | Primary key |
| `title`, `description`, `thumbnail` | string | From YouTube |
| `channelTitle`, `channelId` | string | |
| `videoCount` | number | |
| `videos` | Video[] | Ordered by playlist position |
| `lastEpisodeIndex` | number | Resume pointer |
| `newEpisodesCount` | number | Set on refresh when new items appear |
| `completed` | boolean | User toggle |
| `addedAt`, `lastRefreshedAt` | number | Timestamps |

## Video object

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | YouTube video ID |
| `title`, `thumbnail` | string | |
| `position` | number | Playlist order |
| `publishedAt` | string | ISO date |
| `duration` | number | Seconds; filled by `_getVideoDurations` in `youtube.js` |
| `watched` | boolean | Default false |
| `progress` | number | Optional progress |
| `watchedAt` | number | Timestamp when marked watched |

## Settings defaults

```javascript
{
  theme: 'classic-red',      // classic-red | ocean-blue | forest
  autoRefresh: false,        // Pro + user enabled
  lastRefreshCheck: 0,
  language: 'system',        // system | en | it
  apiKey: ''                 // optional if no worker
}
```

## License object

| Field | Notes |
|-------|-------|
| `key` | Lemon Squeezy license key or null |
| `isPro` | Persisted flag after successful verify |
| `verifiedAt` | Timestamp of last successful verify |
| `_checksum` | Written on save; tamper detection on load |

### Tamper detection

On load, checksum is recomputed from `{ key, isPro }`. Mismatch → reset to free, log `_tamperCount` in local storage.

## Internal local keys (not in STORAGE_KEYS)

| Key | Purpose |
|-----|---------|
| `_rateLimiter` | License verify backoff state |
| `_tamperCount`, `_lastTamper` | Tamper audit |

## Store API (common)

| Method | Effect |
|--------|--------|
| `getState()` / `getSeries()` / `getSeriesById()` | Shallow copy reads |
| `addSeries(data)` | Upsert series from YouTube fetch/refresh |
| `deleteSeries(playlistId)` | Remove |
| `markEpisodeWatched(playlistId, videoId)` | Set watched + watchedAt |
| `toggleSeriesComplete(playlistId)` | Flip completed |
| `updateSettings(partial)` | Merge settings |
| `setLicense(partial)` | Merge license |
| `isPro()` | **Runtime gate** — see [07-freemium-license.md](07-freemium-license.md) |
| `canAddSeries()` | Pro or count < `FREE_LIMITS.MAX_SERIES` (3) |
| `findPlaylistByVideoId(videoId)` | For content script watch events |
| `loadFromStorage` / `saveToStorage` | Persistence |

## Agent notes

- `handleStorageReset()` assigns `store._state` directly — rare, avoid elsewhere
- UI tab keeps its own `state` variable synced via `STATE_GET` and `STATE_UPDATED`

## Related

- [07-freemium-license.md](07-freemium-license.md) — `isPro()` vs `license.isPro`
