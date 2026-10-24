# Data model

Storage keys are defined in `src/shared/constants.js` → `STORAGE_KEYS`.

## Storage split

| Key | Area | Content | Size concern |
|-----|------|---------|--------------|
| `settings` | `chrome.storage.sync` | Theme, language, autoRefresh, nextEpisodeOverlay, weeklyGoal, apiKey | 8 KB/item limit |
| `license` | `chrome.storage.sync` | Legacy compatibility value (all features are enabled) | 8 KB/item limit |
| `series` | `chrome.storage.local` | Map of all series (can be large) | Local quota |
| `activity` | `chrome.storage.local` | Last 100 local user actions | Local quota |
| `activityReadAt` | `chrome.storage.local` | Last acknowledged local activity cursor, default 0 | Scalar |
| `collections` | `chrome.storage.local` | Names explicitly created using the plus card; retained when empty | Small list |
| `backups` | `chrome.storage.local` | Five most recent automatic series snapshots | Local quota |

**Never move `series` to sync** — it will exceed quota.

`store.saveToStorage()` serializes writes and rejects an oversize settings value instead of silently losing it. Series remain local.

## In-memory state shape

```javascript
{
  series: { [playlistId]: Series },
  activity: Activity[],
  activityReadAt: number,
  collections: string[],
  settings: { theme, autoRefresh, lastRefreshCheck, language, nextEpisodeOverlay, apiKey? },
  license: { isPro: true }
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
| `latestNewVideoId` | string/null | First episode discovered in the latest refresh; target for the grouped notification |
| `completed` | boolean | User toggle |
| `ended` | boolean | The creator will publish no more episodes (not the same as `completed`). Skipped by auto-refresh, no release forecast, "Ended" badge; suggested in the detail after 90 days without uploads (`dormantMonths`) |
| `collection` | string | Optional user-defined collection, max 40 characters |
| `collectionCover` | string | Optional HTTPS thumbnail selected from collection content; empty uses automatic mosaic; shared across members |
| `addedAt`, `lastRefreshedAt` | number | Timestamps |
| `localUpdatedAt` | number | Monotonic timestamp of the latest local library mutation |
| `syncUpdatedAt`, `remoteUpdateTime` | number, string | Last merged logical timestamp and Firestore optimistic-concurrency version |
| `completedUpdatedAt` | number | Timestamp of the completion toggle, independent of episode progress |
| `endedUpdatedAt` | number | Timestamp of the ended toggle; synced as `ended`/`endedAt` (only once toggled), newer side wins |
| `collectionUpdatedAt` | number | Timestamp of the collection assignment for sync conflict resolution |
| `notes` | object | `{ [noteId]: { v: videoId, t: seconds, x: text ≤ 1000, a: updatedAt, d?: true } }`; deletions are tombstones (`d`, empty `x`) so they sync; ≤ 300 active, ≤ 400 entries (oldest tombstones pruned). Synced in the series document, merged per note (newer `a` wins, a same-time deletion wins) |

A followed **channel** is an ordinary series whose `playlistId` is the channel's uploads playlist: `UULF…` (long-form only) or `UU…` (fallback). `youtube.refreshPlaylist` recognises the `UU` prefix and keeps the latest 100 uploads, oldest first, titled with the channel name — so auto-refresh and sync hydration need no extra field. A channel keeps publishing, so it can never be marked as ended (`store.setSeriesEnded` throws `CHANNEL_CANNOT_END`; the detail, the "has it ended?" suggestion and the YouTube finale card offer nothing; `isChannelSeries` in `src/shared/seriesStats.js`). `newEpisodesCount` counts new video ids (the window size does not change).

`Activity` entries contain `{ type, playlistId?, videoId?, title?, at }`. They are intentionally local-only and are not sent to Firestore.

Collection editing updates member names/covers and `collectionUpdatedAt`; a move inherits the destination's most recently updated cover. Rename collisions are rejected, not silently merged. Bulk input is validated before mutation. Both operations persist once and enqueue every affected series through the existing sync coordinator. Covers are included in backup normalization and cloud metadata, resolved with the collection timestamp. Concurrent cross-device edits still resolve per series, not as a cloud-wide collection transaction.

Explicitly created collection names persist separately in `collections`, including with no series. UI lists the union of this registry and series assignments. Rename updates registry entries, and reset clears them. Empty names are local-only: the current Google sync and series-only backup format do not transfer standalone empty collections.

`at` is monotonic for newly recorded activities, even within one millisecond. The badge counts entries with `at > activityReadAt`. `markActivityRead(through)` advances but never rewinds the cursor, capped to existing events. Opening the panel acknowledges its current snapshot through the background; later events remain unread. The cursor is persisted locally and removed on reset, not synced to Google.

Automatic snapshots are made before deletion, import, full restore and reset. Restoring a snapshot replaces the library, retains a pre-restore snapshot, and reconciles its cloud mutations through the background.

## Video object

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | YouTube video ID |
| `title`, `thumbnail` | string | |
| `position` | number | Playlist order |
| `publishedAt` | string | ISO date |
| `duration` | number | Seconds; filled by `_getVideoDurations` in `youtube.js` |
| `watched` | boolean | Default false; set only via `ended` event or manual action |
| `progress` | number | Optional progress (0-100) |
| `watchedAt` | number | Timestamp when marked watched |
| `resumeTime` | number | Seconds; precise resume point |
| `totalWatchedTime` | number | Seconds; total time actually watched (calculated via delta) |
| `lastWatchedAt` | number | Timestamp of last watch session |
| `progressUpdatedAt` | number | Timestamp of watched/unwatched/progress/exclusion change; makes an unwatched state syncable |
| `excluded` | boolean | Left out of progress (trailers, filler): never counted, skipped as next episode; synced as `progress[id].x` |

Derived statistics (counted episodes, time left, pace, finish estimate, milestones, streak, week progress, release forecast) are pure functions in `src/shared/seriesStats.js`, shared by the service worker, dashboard and content script.

## Settings defaults

```javascript
{
  theme: 'classic-red',      // classic-red | ocean-blue | forest
  autoRefresh: true,
  lastRefreshCheck: 0,
  language: 'system',        // system | en | it
  nextEpisodeOverlay: true,
  weeklyGoal: 0,             // episodes per week, 0 = off (absent until set)
  apiKey: ''                 // optional if no worker
}
```

## License object (legacy stub)

The product is **donation-only — all features enabled**. In memory, `license.isPro` is always `true`. Values in `chrome.storage.sync` under `license` are **ignored on load**. See [07-freemium-license.md](07-freemium-license.md).

## Store API (common)

| Method | Effect |
|--------|--------|
| `getState()` / `getSeries()` / `getSeriesById()` | Deep-copy reads |
| `addSeries(data)` | Upsert series from YouTube fetch/refresh |
| `deleteSeries(playlistId)` | Remove |
| `markEpisodeWatched(playlistId, videoId)` | Set watched + watchedAt |
| `toggleSeriesComplete(playlistId)` | Flip completed |
| `setSeriesEnded(playlistId, ended)` | Set ended; returns false when nothing changed |
| `setSeriesCollection(playlistId, collection)` | Set or clear a user collection |
| `updateSettings(partial)` | Merge settings |
| `isPro()` / `canAddSeries()` | Always allow all features and unlimited library size |
| `findPlaylistByVideoId(videoId)` | For content script watch events |
| `loadFromStorage` / `saveToStorage` | Persistence |

## Agent notes

- `handleStorageReset()` assigns `store._state` directly — rare, avoid elsewhere
- UI tab keeps its own `state` variable synced via `STATE_GET` and `STATE_UPDATED`

## Related

- [07-freemium-license.md](07-freemium-license.md) — `isPro()` vs `license.isPro`
