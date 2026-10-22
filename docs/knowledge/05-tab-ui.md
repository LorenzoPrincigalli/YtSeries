# Tab UI — Dashboard

The main UI lives in `src/tab/` and renders the full dashboard.

## File structure

| File | Purpose |
|------|---------|
| `index.html` | Shell: header, modals (settings, add playlist, FAQ, changelog, bug report), footer |
| `app.js` | App logic: state, rendering, events, theme, modals, search |
| `variables.css` | CSS custom properties (themes, spacing, z-index, shadows) |
| `base.css` | Body, empty states, loading skeleton, search header |
| `header.css` | Fixed header with logo, nav, search, Pro button |
| `hero.css` | Hero carousel with crossfade |
| `cards.css` | Series cards with hover effects, badges, progress |
| `carousel.css` | Carousel rows with L/R arrows |
| `episodes.css` | Episode list in detail view |
| `components.css` | Buttons, toggles, badges, license UI, upsell cards, free-tier banner |
| `modals.css` | All modals: settings, detail, confirm, FAQ, changelog |
| `footer.css` | Footer bar |
| `responsive.css` | Mobile/tablet breakpoints |

## Components

| Component | File |
|-----------|------|
| `HomePage` | `components/home.js` — hero carousel, series rows, search results |
| `DetailPage` | `components/detail.js` — series detail with episode list |
| `ModalManager` | `components/modal.js` — open/close/confirm modals |

## Collections

The create dialog includes a thumbnail grid of **all saved series**, independent of current folder/search, with native checkboxes and a live selected count. Creation submits name and selected playlist IDs in one background command. Selecting zero keeps the collection empty; selected series move from their previous collection (explained in the dialog). These are whole-series assignments, not individual episode bookmarks.

Collection assignments remain stored with each series and participate in Cloud Sync. Existing folder assignments require no migration. The square plus card in Saved creates a collection with only a name, even with an empty library. Explicitly created names persist locally independently of series and appear in the detail picker and bulk-move destinations; empty collections can be renamed. The plus has the same dimensions as collection covers, only a centered plus visible, and a localized accessible label. Standalone empty names are not yet transferred by Google sync or series-only backups.

The **Saved / Salvati** navigation section is separate from Home. `components/collections.js` shows collection covers (up to four series thumbnails), names and counts only in Saved. “All saved” displays a grid of the entire saved library, including unassigned series; it never renders the Home hero, recommendation rows or YouTube search results. Named collections restrict that grid. Search in Saved is local-only; switching to Home/status navigation clears the collection scope. Empty libraries and empty collections have dedicated messages. The shelf combines explicit locally persisted collection names with names derived from series assignments. Each series belongs to at most one collection.

## Recent activity and resume

Selected collections expose **Edit collection** (rename, choose a thumbnail cover or restore automatic mosaic) and **Move series** (checkbox selection, existing/new destination or remove assignment). `collectionEditor.js` uses a native modal dialog with focus containment, Escape/cancel and inline validation. It lists all collection members independently of dashboard search/status filters. Covers use existing HTTPS thumbnails, not uploaded files.

Activity entries with an existing series open its details; entries with an existing episode are ordinary new-tab YouTube links with a resume timestamp for unfinished episodes. Deleted/unavailable targets and library-level events remain non-clickable history entries.

The header bell opens the retained local activity history (up to 100 actions) in a scrollable panel. Its badge counts only unread entries. Opening it sends `ACTIVITY_MARK_READ` with the newest displayed timestamp; background persistence keeps it read across reloads, without deleting history or acknowledging later arrivals. Failed acknowledgement displays an error. Relative times use the language chosen in the extension settings. The “Continue” controls add YouTube's `t=` parameter when the next unwatched episode has a saved resume time.

New-episode notifications are grouped by each automatic refresh. Clicking the notification opens the first newly discovered episode instead of only the dashboard.

The Reset section exposes the five automatic snapshots. A series deletion shows a short-lived Undo action; the full backup list is available for larger recovery. The My Series row no longer truncates the library at 20 cards.

## Themes

Four themes: Classic Red, Ocean Blue, Forest Green, Light ("Tema chiaro").

- `applyTheme()` in `app.js` sets all CSS custom properties including dark/light variants
- Toolbar icon follows selected theme (dark/light variant)
- Popup also supports all themes via `applyPopupTheme()`

## Search

- **Local filtering**: filters displayed series in real-time while typing (no API call)
- **YouTube search**: triggered on Enter key
- **Hint**: "Press Enter to search" appears below search title after 2s of typing
- **Rate limit**: 3s cooldown between YouTube API calls; previous results preserved during cooldown

## Settings panels

| Panel | i18n key | Notes |
|-------|----------|-------|
| Theme | `theme` | 4 options, translated |
| Language | `language` | System / EN / IT |
| Overlays | `settings_overlay` | Next Episode overlay toggle |
| License Key | `license_key` | Pro activation |
| Cloud Sync | `sync_title` | Firebase sign-in |
| Reset Data | `settings_reset` | Clear + backup/restore JSON |
| Dev Tools | `settings_dev` | Hidden when EXTENSION_ID is set |
| Notifications | `auto_refresh` | "New Episode Notifications" toggle (Pro only, hidden for free) |

## Free tier banner

- Appears on main dashboard (all filter, no search)
- Once per day, dismissible with X button
- Shows "Free plan (X/3)" or "Limit reached — Get Pro"
# Frontend: responsive e filtri (2026-09-06)

- Sotto 1200 px la testata diventa sticky con navigazione su una riga dedicata; sotto 600 px la ricerca occupa tutta la larghezza. Il contenuto segue l'altezza reale della testata.
- `src/tab/seriesView.js` centralizza la classificazione “In visione”: include anche il primo episodio parzialmente iniziato, esclude serie completate o interamente viste. Il pulsante hero usa lo stesso criterio.
- Il filtro “In visione” mostra una sola lista; “Nuove uscite” non tronca più a dieci serie. Le raccomandazioni sono limitate alla Home senza filtro cartella. Una cartella scomparsa viene deselezionata e i filtri senza risultati mostrano un messaggio localizzato.
- Il picker cartelle rimuove i listener alla chiusura, si chiude con clic esterno/Escape e alla chiusura o ricostruzione del dettaglio. Escape restituisce il focus all'icona; il pannello è contenuto nel viewport e scorre con molte cartelle.
- La campanella supporta Escape con ritorno del focus. Il timer hero viene fermato prima di ricostruire la Home.
