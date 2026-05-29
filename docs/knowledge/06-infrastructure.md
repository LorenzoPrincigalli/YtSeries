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
                    │  Lemon Squeezy   │
                    │  (license verify)│
                    └──────────────────┘

                    ┌──────────────────┐
                    │  GitHub Pages    │
                    │  activate.html   │
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
| **Lemon Squeezy** | Free | Free | License validation | 0% fees up to $100/mo |
| **GitHub Pages** | Free | Free | Host activate.html, privacy policy | 100GB bandwidth, 1GB storage |
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
  metadata: {
    title, thumbnail, channelTitle, channelId, videoCount
  },
  lastEpisodeIndex: number,
  completed: boolean,
  updatedAt: timestamp,
  progress: {
    videoId: { w: boolean, p: number, a: timestamp }
    // only videos with watched/progress data
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
        → [if logged in] afterSeriesMutation()
          → enqueuePush(playlistId)  // 3s debounce
            → pushSeries() → Firestore PATCH
```

### Sync conflict resolution

Last-writer-wins per field, with timestamp comparison:
- `updatedAt` on each document determines which version is newer
- Per-video progress: compares `watchedAt` timestamps
- Metadata always pulled from YouTube API (source of truth)
- Missing series on remote (user never synced) → uploaded during login

### Offline queue

Failed pushes are queued in `chrome.storage.local` (`_syncQueue`) and retried:
- On next `pullAndMerge` (init, manual sync)
- Items are processed sequentially

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
| Firestore access | Security rules: only authenticated owner `request.auth.uid == userId` |
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
  https://api.lemonsqueezy.com
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
| YT API key | Cloudflare Worker env (`YT_API_KEY`) | N/A | Server-side only |
| Firebase apiKey | `src/shared/firebase.config.js` | Yes (.gitignore) | `fetch(chrome.runtime.getURL(...))` |
| Firebase projectId | `src/shared/firebase.config.js` | Yes | Same |
| Firebase authDomain | `src/shared/firebase.config.js` | Yes | Same |
| OAuth client_id | `manifest.json` | No (public by nature) | Static manifest |
| Lemon Squeezy key | N/A | N/A | Not stored; uses checkout URL from constants |

## Related

- [04-services-and-apis.md](04-services-and-apis.md) — YouTube, Lemon Squeezy, Chrome wrappers
- [05-firebase-sync-setup.md](05-firebase-sync-setup.md) — Firebase console setup guide
- [03-data-model.md](03-data-model.md) — Data shapes (including sync payloads)
