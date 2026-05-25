# YT Series — Piano di sviluppo

## Overview

Estensione Chrome Manifest V3 che aggiunge una sezione "YT Series" nella sidebar di YouTube. Cliccando si apre una nuova scheda con interfaccia stile Netflix per gestire playlist YouTube come serie TV, con progress tracking e sincronizzazione cloud.

## Stack

- Manifest V3, vanilla JS (nessun framework)
- YouTube Data API v3 (API key embeddata, offuscata base64)
- `chrome.storage.sync` per dati
- `chrome.alarms` + `chrome.notifications` per auto-refresh (Pro)
- Comunicazione via message passing
- Monetizzazione: Freemium via Lemon Squeezy

## Struttura directory

```
YT-Series/
├── manifest.json
├── src/
│   ├── background/
│   │   └── index.js              # Service worker: message handlers, alarms, notifiche
│   ├── content/
│   │   └── index.js              # Inject link "YT Series" nella sidebar YouTube
│   ├── tab/                      # Interfaccia principale (Netflix-style)
│   │   ├── index.html
│   │   ├── main.css              # Tema scuro Netflix, card, rows, hero
│   │   ├── app.js                # Entry: message bridge, state binding, routing
│   │   └── components/
│   │       ├── home.js           # Home view: hero, rows, search/filter
│   │       ├── detail.js         # Detail view: episodi griglia
│   │       └── modal.js          # Modali: aggiungi playlist, impostazioni, licenza
│   ├── options/                  # Pagina impostazioni
│   │   ├── index.html
│   │   └── app.js
│   ├── shared/
│   │   ├── constants.js          # API key, limiti, URL, event names
│   │   ├── events.js             # Costanti eventi (UPPER_SNAKE)
│   │   └── logger.js             # Logger centralizzato (info/warn/error/debug)
│   ├── services/
│   │   ├── youtube.js            # YouTubeApiService: fetch playlist + video
│   │   ├── license.js            # LicenseService: verifica licenza Pro
│   │   └── chrome/               # Chrome API wrappers
│   │       ├── storage.js        # StorageService: CRUD chrome.storage.sync
│   │       ├── tabs.js           # TabService: apri URL/navigate
│   │       ├── alarms.js         # AlarmService: auto-refresh scheduling
│   │       └── notifications.js  # NotificationService: nuovi episodi
│   └── state/
│       └── store.js              # Stato centralizzato immutabile
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── plan.md
└── chrome_extension_opencode_rules.md
```

## Architettura & Data Flow

```
[YouTube] ← content script → [Background SW] ← message → [Tab (UI)]
                                   ↕
                             [Services Layer]
                     (Storage, YouTube API, License)
                                   ↕
                            [Chrome Storage]
```

**Flusso tipico:**
```
Utente clicca "Aggiungi playlist"
  → tab/app.js invia { type: PLAYLIST_ADD, payload: { url } } a background
  → background/index.js chiama YouTubeApiService.fetchPlaylist(url)
  → YouTubeApiService → fetch YouTube Data API → playlist + videos
  → background/index.js chiama StorageService.saveSeries(data)
  → StorageService → chrome.storage.sync.set()
  → background/index.js risponde { type: STATE_UPDATED, payload: state }
  → tab/app.js aggiorna UI
```

## Schema dati (chrome.storage.sync)

```json
{
  "series": {
    "PL_ABC123": {
      "playlistId": "PL_ABC123",
      "title": "Titolo Serie",
      "description": "...",
      "thumbnail": "https://i.ytimg.com/vi/.../mqdefault.jpg",
      "channelTitle": "Canale",
      "channelId": "UC...",
      "videoCount": 20,
      "videos": [
        {
          "id": "video1",
          "title": "Ep 1",
          "thumbnail": "...",
          "duration": 630,
          "position": 0,
          "watched": false,
          "progress": 0,
          "watchedAt": null
        }
      ],
      "lastEpisodeIndex": 0,
      "newEpisodesCount": 0,
      "addedAt": 1716614400000,
      "lastRefreshedAt": 1716614400000
    }
  },
  "settings": {
    "theme": "netflix-dark",
    "autoRefresh": true,
    "lastRefreshCheck": 1716614400000
  },
  "license": {
    "key": null,
    "isPro": false,
    "verifiedAt": null
  }
}
```

## Free vs Pro

| Feature | Free | Pro (€2.99) |
|---|---|---|
| Serie salvabili | Max 3 | Illimitate |
| Refresh playlist | Manuale | Auto (24h) + notifiche |
| Temi colore | 1 (default) | 3 temi |
| Esporta/Importa | ✗ | ✓ |
| Ricerca/filtri | Base | Base |

## Messaggi (tab ↔ background)

| Evento | Payload | Risposta |
|---|---|---|
| `STATE_GET` | — | Stato completo |
| `PLAYLIST_ADD` | `{ url }` | `{ success, series }` |
| `SERIES_DELETE` | `{ playlistId }` | `{ success }` |
| `SERIES_REFRESH` | `{ playlistId }` | `{ success, series }` |
| `EPISODE_WATCH` | `{ playlistId, videoId }` | `{ success }` |
| `EPISODE_PROGRESS` | `{ playlistId, videoId, progress }` | `{ success }` |
| `SETTINGS_UPDATE` | `{ theme, autoRefresh }` | `{ success }` |
| `LICENSE_VERIFY` | `{ key }` | `{ success, isPro }` |
| `STATE_UPDATED` | Stato completo | *(broadcast)* |

## Regole architetturali

- Nessuna business logic nella UI
- UI non chiama mai `chrome.*` direttamente
- Comunicazione solo via message passing
- Stato centralizzato immutabile (nessuna duplicazione)
- Event-driven: azioni significative = eventi
- Services gestiscono errori internamente; UI non riceve errori raw
- Logger centralizzato, niente console.log sparsi
- File >300 righe vanno splittati
- camelCase per funzioni/variabili, PascalCase per classi/service, UPPER_SNAKE per eventi/costanti

## Ordine implementazione

1. `manifest.json` + icone
2. `src/shared/*` (constants, events, logger)
3. `src/services/chrome/*` (storage, tabs, alarms, notifications)
4. `src/services/youtube.js` + `src/services/license.js`
5. `src/state/store.js`
6. `src/background/index.js`
7. `src/tab/*` (HTML, CSS, components)
8. `src/content/index.js`
9. `src/options/*`
10. Code review finale
