# Services and external APIs

## YouTube API (`src/services/youtube.js`)

Singleton `youTubeApiService`.

### URL routing

```javascript
_buildUrl(path) {
  const base = API.WORKER_BASE || API.YOUTUBE_BASE
  const keySuffix = API.WORKER_BASE ? '' : `&key=${this.apiKey}`
  return `${base}${path}${keySuffix}`
}
```

| Mode | Base | Key |
|------|------|-----|
| **Default (repo)** | `API.WORKER_BASE` in constants | On worker only |
| Direct API | `https://www.googleapis.com/youtube/v3` | `config.js` or `settings.apiKey` |

### Methods

| Method | YouTube endpoints | Used by |
|--------|-------------------|---------|
| `fetchPlaylist(url)` | playlists, playlistItems (paginated), videos (durations) | `PLAYLIST_ADD` |
| `refreshPlaylist(playlistId)` | Same items flow | `SERIES_REFRESH`, auto-refresh alarm |
| `search(query)` | search (playlist + channel) | Tab search |
| `fetchChannelPlaylists(channelId, exclude?)` | playlists | Detail “more from channel” |

### Durations

`_getPlaylistItems()` calls `_getVideoDurations()` in 50-id chunks and sets `video.duration` in seconds.

### Errors

Throws objects like `{ code: 'INVALID_URL', message: '...' }` — background should catch and map to user-facing errors.

## Cloudflare Worker (`cloudflare-worker/index.js`)

- **GET-only** proxy: `{WORKER}/{youtubePath}?query` → Google API + `env.YT_API_KEY`
- CORS `Access-Control-Allow-Origin: *`
- 60s cache on responses
- Deploy: `wrangler.toml`; secret `YT_API_KEY` in Worker environment (never in extension)

To change worker URL: update `API.WORKER_BASE` in `src/shared/constants.js` and manifest `host_permissions` + CSP `connect-src`.

## License API (`src/services/license.js`)

- `POST https://api.lemonsqueezy.com/v1/licenses/validate` with `{ license_key }`
- 15s timeout
- On network failure: in-memory cache up to `LICENSE_CACHE_DAYS` (1 day)
- Checkout URL: `PRO_CHECKOUT.URL` in constants

## Chrome service wrappers

| File | Role |
|------|------|
| `services/chrome/storage.js` | sync/local get/set/remove |
| `services/chrome/tabs.js` | create, update, query |
| `services/chrome/alarms.js` | `autoRefresh`, `licenseHeartbeat` |
| `services/chrome/notifications.js` | New episode notifications |

### Alarms

| Name | Interval | Handler |
|------|----------|---------|
| `autoRefresh` | 1440 min | `autoRefresh()` — Pro only, refreshes all series |
| `licenseHeartbeat` | 1440 min | `reverifyLicense()` |

## Background API key loading

When `API.WORKER_BASE` is empty:

1. `fetch(chrome.runtime.getURL('src/shared/config.js'))` + regex for `YT_API_KEY`
2. Fallback: `store.getSettings().apiKey`

Cannot use `import()` for config in service worker (packaging/CSP).

## CSP connect-src

Extension pages may connect to: `'self'`, worker URL, `googleapis.com`, `api.lemonsqueezy.com`.

## Host permissions (manifest)

- `https://www.youtube.com/*`
- `https://www.googleapis.com/*`
- `https://api.lemonsqueezy.com/*`
- Worker URL

## Related

- Dev setup: [08-dev-workflow.md](08-dev-workflow.md)
- License flow: [07-freemium-license.md](07-freemium-license.md)
