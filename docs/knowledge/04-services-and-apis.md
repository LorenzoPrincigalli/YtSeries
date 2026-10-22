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
| Direct API (dev only) | `https://www.googleapis.com/youtube/v3` | `chrome.storage.local.youtubeApiKey` |

### Methods

| Method | YouTube endpoints | Used by |
|--------|-------------------|---------|
| `fetchPlaylist(url)` | playlists, playlistItems (paginated), videos (durations) | `PLAYLIST_ADD` |
| `refreshPlaylist(playlistId)` | Same items flow | `SERIES_REFRESH`, auto-refresh alarm |
| `search(query)` | search (playlist,channel — single call) | Tab search |
| `fetchChannelPlaylists(channelId, exclude?)` | playlists | Detail “more from channel” |

### Durations

`_getPlaylistItems()` calls `_getVideoDurations()` in 50-id chunks and sets `video.duration` in seconds.

### Resilience and errors

Every call goes through `_fetch()`: **circuit breaker** (5 infrastructure failures → fail fast with `CIRCUIT_OPEN` for 5 min) → **retry** (2 retries, exponential backoff + jitter, only for 429/5xx/network/timeout) → 15 s timeout.

It throws `AppError` with codes `QUOTA_EXCEEDED` (403 quota reason), `PLAYLIST_NOT_FOUND`, `RATE_LIMITED`, `API_UNAVAILABLE`, `API_ERROR`, `API_BAD_RESPONSE`, `NETWORK_ERROR`, `NETWORK_TIMEOUT`, `INVALID_URL`, `INVALID_PAYLOAD`. `search()` and `fetchChannelPlaylists()` **propagate** errors so the UI can tell "failed" from "no results". Parsing is defensive: non-HTTPS thumbnails, duplicate and private/deleted videos are skipped; pagination is capped at 100 pages. The constructor accepts `{ fetchImpl, sleep }` for tests.

## Cloudflare Worker (`cloudflare-worker/index.js`)

- **GET-only, allowlisted** proxy: `search`, `playlists`, `playlistItems`, `videos` with per-endpoint parameter validation (`cloudflare-worker/security.js` `ROUTES`); unknown endpoints → 404, unknown/duplicate/invalid parameters → 400
- Order of checks: Origin (`ALLOWED_ORIGINS`) → method → client token → allowlist → rate limit → cache → upstream
- CORS echoes the allowed origin (`*` only when `ALLOWED_ORIGINS` is unset in dev)
- Upstream errors are sanitized to the reason code; network failures → `502 UPSTREAM_UNAVAILABLE`

### 3-layer caching (quota saver)

| Layer | Tecnologia | Latenza | TTL search | Globale? |
|---|---|---|---|---|
| 1 | Edge cache (`caches.default`) | 0ms | 1h (search/playlists), 2min (items), 7gg (videos) | No (per-datacenter) |
| 2 | KV (`CACHE_KV`) | ~5ms | 24h (search), 6h (playlists) | Sì (globale) |
| 3 | YouTube Data API v3 | ~500ms | — | — |

KV usato solo per **search** (100 unità/quota) e **playlists** (dettaglio). Items e durate video restano su edge cache.

### Cache keys

Query parameters are validated, normalized (`q` lower-cased, whitespace collapsed) and **sorted**, so equivalent requests share one cache entry. There is no client-controlled cache bypass (it allowed quota amplification).

### Headers debug

| Header | Valori |
|---|---|
| `X-Cache` | `HIT-EDGE`, `HIT-KV`, `MISS` |

### Deploy

```bash
cd cloudflare-worker
npx wrangler kv namespace create "YT_SERIES_CACHE"   # primo setup
npx wrangler deploy
```
- `wrangler.toml`: `CACHE_KV` (KV) and `RATE_LIMITER` (Workers Rate Limiting, 120 req/min/IP) bindings
- Secrets: `YT_API_KEY` (required), `ALLOWED_ORIGINS` (set after publish to `chrome-extension://<EXTENSION_ID>`), `YT_SERIES_CLIENT_TOKEN` (optional)
- Tests: `cloudflare-worker/__tests__/` (`handleRequest` is exported with injectable `fetch`/`cache`)
- KV read non consuma CPU time (gratuito su Free plan)

To change worker URL: update `API.WORKER_BASE` in `src/shared/constants.js` and manifest `host_permissions` + CSP `connect-src`.

## Chrome service wrappers

| File | Role |
|------|------|
| `services/chrome/storage.js` | sync/local get/set/remove |
| `services/chrome/tabs.js` | create, update, query |
| `services/chrome/alarms.js` | `autoRefresh`, `syncRetry` |
| `services/chrome/notifications.js` | New episode notifications |

### Alarms

| Name | Interval | Handler |
|------|----------|---------|
| `autoRefresh` | 1440 min | `background/autoRefresh.js` — refreshes all series (concurrency 2, failures isolated and logged), one atomic commit, at most one grouped notification |
| `syncRetry` | 1 min | Flushes the durable Cloud Sync queue |

The grouped notification (`new_episodes_summary`) opens the first newly discovered episode directly on YouTube. If that target is no longer available, it opens the dashboard instead.

## Background API key loading

When `API.WORKER_BASE` is empty:

1. The key is read from `chrome.storage.local` (`STORAGE_KEYS.API_KEY`). Legacy builds stored it in synced settings; `init()` migrates it to local storage and removes it from `settings`.

In production the key lives **only** on the Cloudflare Worker; `SETTINGS_UPDATE` no longer accepts `apiKey`.

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
