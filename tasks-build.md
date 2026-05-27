# Build tasks — 2026-05-27

## Priority

### 🔴 1. Dead code in `_renderNewEpisodeHighlight()` (detail.js:140-147)
- 5 righe morte dopo `return section` — rimuovere

### 🔴 2. Multi-select "Segna come visto" — dati persi (detail.js:371-382)
- Scrive su `watched_${playlistId}` (chiave mai letta da store)
- Refactor: per ogni video selezionato, chiamare `callbacks.onWatch()`
- Così passa da `EPISODE_WATCH` → store → saveToStorage → persistenza reale

### 🟠 3. Real-time state push — tab non vede aggiornamenti esterni
- **background**: `broadcastStateUpdate()` dopo ogni `saveToStorage()` in tutti gli handler mutanti
- **background**: filtro `_broadcast: true` per evitare loop
- **tab**: listener `chrome.runtime.onMessage` per `STATE_UPDATED` → update state + render

### 🔵 4. `_getVideoDurations()` mai chiamata (youtube.js)
- `video.duration` sempre undefined
- Chiamare dopo `_getPlaylistItems()` in `fetchPlaylist()` e `refreshPlaylist()`

### ✅ Già fixati nella sessione
- `ensureInit()` retry su fallimento (initPromise = null)
- API key: dynamic import → fetch() in service worker
- Card gap 6px → 4px → 2px
- Scroll amount 310+6 → 312
- Card padding 12px → 8px
- Filter chip stile nav-link
- Hero aspect-ratio 16/9 + full vw
- Hero overlap prima row (-100px)
- Video end detection in content script
- `findPlaylistByVideoId()` in store
- Episode thumb 140px → 200px
- Hover title non più rosso
