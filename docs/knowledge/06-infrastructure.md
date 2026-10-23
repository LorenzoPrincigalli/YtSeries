# Infrastructure

## Overview

YT Series uses a **zero-cost architecture** on free tiers of all services.
Firebase (Cloud Sync) is entirely optional — the extension works without it.

## Service map

```
┌──────────────────────────────────────────────────────────────────┐
│                      CHROME BROWSER                              │
│                                                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────┐   │
│  │ content │  │  popup   │  │  tab (main   │  │ background │   │
│  │  script │  │          │  │  dashboard)  │  │  (SW)      │   │
│  └────┬────┘  └────┬─────┘  └──────┬───────┘  └─────┬──────┘   │
│       │            │               │                 │          │
│       └────────────┴───────────────┴─────────────────┘          │
│                           │ sendMessage                          │
│                           ▼                                      │
│                    ┌──────────────┐                              │
│                    │  background  │                              │
│                    │  (orchestrator)                             │
│                    └──────┬───────┘                              │
└───────────────────────────┼──────────────────────────────────────┘
                            │
        ┌───────────────────┼──────────────────────────┐
        ▼                   ▼                          ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐
│ chrome.storage│  │ chrome.storage│  │   CLOUD SYNC (optional)  │
│    .sync     │   │    .local    │   │                          │
│ (settings,   │   │  (series)    │   │  ┌────────────────┐      │
│  license)    │   │              │   │  │  Firebase Auth  │      │
│              │   │              │   │  │  (Google OAuth) │      │
│ ~4KB/item    │   │  ~local     │   │  └────────┬───────┘      │
│              │   │              │   │           │              │
│              │   │              │   │  ┌────────▼───────┐      │
│              │   │              │   │  │  Firestore     │      │
│              │   │              │   │  │  (REST API)    │      │
│              │   │              │   │  │  users/{uid}/  │      │
│              │   │              │   │  │  series/{id}   │      │
│              │   │              │   │  └────────────────┘      │
└──────────────┘   └──────────────┘   └──────────────────────────┘

                    ┌──────────────────┐
                    │  Cloudflare      │
                    │  Worker (proxy)  │
                    │  → YouTube API   │
                    └──────────────────┘

                    ┌──────────────────┐
                    │  GitHub Pages    │
                    │  privacy-policy  │
                    └──────────────────┘
```

## Services breakdown

| Service | Plan | Cost | Purpose | Quota/limits |
|---------|------|------|---------|-------------|
| **Chrome Storage sync** | Built-in | Free | Settings, license (~4KB/item) | 102KB total, 512 items |
| **Chrome Storage local** | Built-in | Free | Series data (unlimited per extension) | ~50% of disk |
| **Chrome Identity** | Built-in | Free | OAuth2 login for Cloud Sync | — |
| **Firebase Auth** | Spark | Free | Google sign-in for sync | 10,000 auth/month |
| **Firestore** | Spark | Free | Series sync between devices | 1 GiB storage, 10 GiB/mo download, 20K writes/day, 50K reads/day |
| **Cloudflare Worker** | Free | Free | YouTube API proxy + KV cache | 100K req/day, 10ms CPU; KV: 100K reads/day, 1K writes/day |
| **YouTube Data API v3** | Free tier | Free | Playlist/video metadata | 10,000 units/day (search=100u, playlists=1u, items=1u, videos=1u) |
| **GitHub Pages** | Free | Free | Host privacy policy | 100GB bandwidth, 1GB storage |
| **Chrome Web Store** | Developer account | **$5 one-time** | Publishing | Required to publish |

## Firebase architecture

### Why REST, not SDK

The extension uses **raw Firestore REST API** instead of the Firebase SDK because:
- SDK is a large bundle (~200KB+), problematic in MV3 service workers
- REST calls are smaller, simpler, and fully controllable
- No bundler needed (manifest V3 paths must be real files)

### Firestore data model

Single collection: `users/{uid}/series/{playlistId}`

Document shape:
```javascript
{
  deleted: false,
  metadata: {
    title, thumbnail, channelTitle, channelId, videoCount, collection, collectionCover
  },
  lastEpisodeIndex: number,
  completed: boolean,
  completedAt: timestamp,
  updatedAt: timestamp,
  progress: {
    videoId: { w: boolean, p: number, r: seconds, t: seconds, a: timestamp, x: excluded }
    // only videos with watched/progress/exclusion data
  },
  notes: {
    noteId: { v: videoId, t: seconds, x: text, a: timestamp, d?: true }   // ≤ 400 entries
  }
}
```

**Not stored on Firestore**: license, settings, video list (only progress).

### Sync flow

```
Mutation (tab/popup/content)
  → background handler
    → store mutation
      → chrome.storage.local save
        → [if logged in] durable queue entry in chrome.storage.local
          → MV3 alarm / manual sync flushes queue
            → read remote doc → merge per field → conditional Firestore PATCH
```

### Sync conflict resolution

Last-writer-wins per independently timestamped field, with a retry on Firestore's document-version precondition:
- `completedAt` resolves completion independently of progress
- `collectionAt` resolves assignment and selected cover together per series. Multi-series edits enqueue each member; they are not a multi-document Firestore transaction.
- Per-video progress compares `progressUpdatedAt` (`a` remotely), including an explicit unwatched state
- `updatedAt` is a logical mutation time, never a new timestamp merely because a manual sync ran
- Metadata always pulled from YouTube API (source of truth)
- Remote deletes use a tombstone (`deleted`, `deletedAt`) so an offline deletion cannot be resurrected by a pull
- A different Google account requires explicit confirmation before it is made the library owner

### Offline queue

Every mutation is queued in `chrome.storage.local` (`_syncQueue`) before network work. The background `syncRetry` alarm and manual Sync process the queue sequentially. Entries are coalesced per account and playlist, persisted atomically, and retried with bounded backoff. Firestore list pagination is followed, so large libraries are not truncated.

Reset is intentionally different: it first deletes remote documents and only then clears the local library and authentication. A remote failure leaves local data intact rather than falsely reporting a complete privacy reset.

## Current costs: $0/mo

All services are on free tiers. The only mandatory cost is the **$5 one-time** Chrome Web Store developer registration.

At scale (hundreds of users), potential cost drivers:
- **Firestore**: 20K writes/day free → ~300 users doing 1 write/hour would exceed. Mitigation: increase debounce, batch writes.
- **Cloudflare Worker**: 100K req/day → with edge cache (90%+ hit rate), actual origin calls are minimal. KV: 100K reads/day, 1K writes/day (Free plan).
- **YouTube API**: 10K units/day → **mitigated by Worker 3-layer caching** (edge + KV). Search: 100→1 unità effettiva dopo primo hit. Stima: ~1.000 unità/giorno totali con 100 utenti attivi.
- **Worker CPU**: KV read NON consuma CPU time. Operazioni I/O in `ctx.waitUntil` non bloccano la risposta.

## Security

| Layer | Mechanism |
|-------|-----------|
| Firestore access | `firestore.rules`: owner-only (`request.auth.uid == userId`) **and** document shape/type/size validation per collection |
| Worker endpoints | Allowlist: `search`, `playlists`, `playlistItems`, `videos`, `channels` (id or safe `@handle`, for following channels); per-endpoint parameter validators; anything else → 400/404 |
| Worker callers | Requests carrying an `Origin` (web pages; browsers cannot forge it) must be a `chrome-extension://` origin, or exactly `ALLOWED_ORIGINS` when set. The extension service worker sends **no** `Origin` (verified with `wrangler tail`) and is allowed. The `X-YT-Series-Client` token ships in the bundle and is only a scanner filter |
| Worker abuse | `RATE_LIMITER` binding (atomic, per `CF-Connecting-IP`), KV daily counter fallback; no client cache bypass |
| Worker errors | Upstream bodies reduced to `{ error: { code, errors: [{ reason }] } }`; no messages, stack or key |
| Extension messaging | Router authorises by sender context; youtube.com content scripts get 10 routes only. `externally_connectable` admits only `lorenzoprincigalli.github.io/YtSeries/*`, and `onMessageExternal` accepts only a validated `SHARE_OPEN` from `share.html` |
| Shared lists | Encoded in the link fragment (never sent to a server); `shareCodec.decodeShare` validates ids/lengths and caps size and decompression |
| Firebase Auth | Google OAuth via `chrome.identity.getAuthToken`, exchanged for Firebase token |
| API key (YouTube) | Stored as Cloudflare Worker secret, never in extension |
| API key (Firebase) | In `src/shared/firebase.config.js` — gitignored, loaded at runtime via `fetch()` |
| CSP | Strict `extension_pages` policy: no remote scripts, limited connect-src |

## CSP connect-src (extension pages)

```
default-src 'self'
script-src 'self'
connect-src 'self'
  https://shy-snowflake-0680.lollo-princigalli.workers.dev
  https://www.googleapis.com
  https://identitytoolkit.googleapis.com
  https://securetoken.googleapis.com
  https://firestore.googleapis.com
img-src 'self' https: data:
frame-src https://www.youtube.com https://www.youtube-nocookie.com
style-src 'self' 'unsafe-inline'
```

## Environment variables / Secrets

| Secret | Where stored | Gitignored? | Loaded how? |
|--------|-------------|-------------|-------------|
| YT API key | Cloudflare Worker secret (`YT_API_KEY`) | N/A | Server-side only |
| Allowed origins | Worker secret `ALLOWED_ORIGINS` (`chrome-extension://<EXTENSION_ID>`) | N/A | Unset = Origin check skipped (dev) |
| Client token override | Worker secret `YT_SERIES_CLIENT_TOKEN` (optional) | N/A | Must match `WORKER_CLIENT_TOKEN` |
| Direct-API dev key | `chrome.storage.local` key `youtubeApiKey` (never synced) | N/A | Only when `WORKER_BASE` is empty |
| Firebase apiKey | `src/shared/firebase.config.js` | Yes (.gitignore) | `fetch(chrome.runtime.getURL(...))` |
| Firebase projectId | `src/shared/firebase.config.js` | Yes | Same |
| Firebase authDomain | `src/shared/firebase.config.js` | Yes | Same |
| OAuth client_id | `manifest.json` | No (public by nature) | Static manifest |

## Related

- [04-services-and-apis.md](04-services-and-apis.md) — YouTube service, Worker, Chrome wrappers
- [05-firebase-sync-setup.md](05-firebase-sync-setup.md) — Firebase console setup guide
- [03-data-model.md](03-data-model.md) — Data shapes (including sync payloads)
