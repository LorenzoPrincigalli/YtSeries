# STEP 6: Functional Gap Analysis

## Legend: ✅ Present | ⚠️ Partial/Buggy | ❌ Missing | 🔴 Broken

### Core Features

| Feature | Status | Notes |
|---------|--------|-------|
| Add playlist via URL | ✅ | Works via modal |
| Add playlist via YouTube search | ✅ | Search tab in modal |
| Dashboard with series overview | ✅ | Netflix-style carousels |
| Progress bar per series | ✅ | Shows percentage |
| Auto-detect video end on YouTube | ⚠️ | `setInterval` polling, memory leak (never cleared) |
| Mark episode as watched manually | ✅ | Via content script + detail page |
| "Continue Watching" section | ✅ | Shows next unwatched episode |
| Filter by status (All/Watching/Completed) | ✅ | Filter bar in home |
| Sort episodes (date, watched, default) | ✅ | Detail page |
| Series detail page | ✅ | Episode list + metadata |
| Theme system (3 themes) | ✅ | But NOT gated behind Pro (contradicts licensing copy) |
| i18n (EN/IT) | ⚠️ | ~10 hardcoded Italian strings bypass translation system |
| Auto-refresh (24h alarm) | ✅ | Pro feature |
| New episode notifications | ✅ | Chrome notifications via alarm |
| Settings modal | ✅ | Theme, language, license, auto-refresh |
| Lemon Squeezy license activation | ✅ | 30-day cache fallback |
| Channel recommendations | ⚠️ | Mislabeled "Recommended" — actually just "other playlists from same channel" |
| Search within series | ✅ | Debounced search |

### Missing Features (Gaps)

| # | Feature | Priority | Why Needed |
|---|---------|----------|------------|
| G1 | **Onboarding walkthrough** | High | Users are dropped into empty dashboard with no guidance |
| G2 | **Toolbar popup** | High | No `default_popup`; clicking icon opens full tab — jarring first experience |
| G3 | **Keyboard shortcuts** | Medium | `Ctrl+Shift+Y` to open dashboard, arrow nav for carousels |
| G4 | **Bulk operations (multi-select episodes)** | Medium | No way to mark multiple episodes watched at once |
| G5 | **Drag-to-reorder series** | Low | Carousels are fixed order (by add date) |
| G6 | **Export/import series data** | Medium | No backup mechanism for progress data |
| G7 | **Duration tracking** | Medium | Shows video count but NOT total/remaining watch time |
| G8 | **Playlist notes/tags** | Low | No way to annotate series with personal notes |
| G9 | **"Mark all watched" for series** | Low | Must mark episodes individually |
| G10 | **Series completion celebration** | Low | No visual reward when 100% done |
| G11 | **Watch progress per episode** | Medium | Only marks binary watched/unwatched, not partial progress |
| G12 | **Sync across browsers** | Medium | Series data stored in `chrome.storage.local` (not sync) |
| G13 | **Dark/light mode auto-detect** | Low | Theme is manually selected |

### Functional Pain Points

| # | Pain Point | Severity | Details |
|---|-----------|----------|---------|
| P1 | **`MAX_SERIES = 999`** makes free tier meaningless | 🔴 | i18n says "max 3" but code never enforces it |
| P2 | **Content script MutationObserver never disconnects** | 🟠 | Memory/CPU leak on every YouTube page |
| P3 | **`setInterval` in video detection leaks** | 🟠 | Interval ID never stored for cleanup |
| P4 | **Full DOM rebuild on every render** | 🟠 | `main.innerHTML = ''` causes jank with 50+ series |
| P5 | **Italian-only manifest description** | 🟠 | Hurts CWS discoverability globally |
| P6 | **Theme gating mismatch** | 🟡 | Settings says themes are Pro, but they work in free |
| P7 | **Hardcoded Italian strings bypass i18n** | 🟡 | ~10 strings in detail.js, home.js, app.js |
| P8 | **Storage reset on sync quota overflow** | 🟠 | Silently wipes settings without warning |
| P9 | **`handleStorageReset()` throws ReferenceError** | 🔴 | `STORAGE_KEYS` not imported |
| P10 | **API key hardcoded in config.js and committed** | 🔴 | 3 keys exposed in git history |
| P11 | **No error surfacing for content script failures** | 🟡 | User never knows if extension is broken |
| P12 | **Race: Promise.all couples sync+local storage reads** | 🟡 | Sync corruption prevents local data load |

---

# STEP 7: Competitive Analysis

## 7.1 Panorama Competitor (Mappatura Completa)

| Competitor | Tipo | Prezzo | Utenti (CWS) | ★ CWS | Piattaforma |
|------------|------|--------|-------------|:-----:|:-----------:|
| **YT Series** | Dashboard Netflix | Free + Pro (€ una tantum) | ? | ? | Chrome |
| **PlanYT** | In-YouTube planner | Gratuito | ? | 5.0 (54 rating) | Chrome |
| **TrackMyCourse** | In-YouTube progress | Gratuito | ~1k+ | 4.9 (30 rating) | Chrome + Firefox |
| **playlist.tools** | Side panel manager | Gratuito (cloud sync) | ? | 1.0 (1 rating) | Chrome |
| **YouTube Playlist Tools** | Toolbar utility | Gratuito | ? | 3.0 (52 rating) | Chrome |
| **Watchmarker** | Watched marker | Gratuito | ? | 4.7 | Chrome |
| **PushList** | Bulk add tool | Free + Pro ($18) | ? | ? | Chrome |
| **MDW Tube** | Recommendation hub | Gratuito | ? | ? | Chrome |
| **YouTube Duration Tracker** | Duration calc | Gratuito | ? | ? | Chrome |
| **YouTube Playlist Duration Bar** | Duration bar | Gratuito | 4★ | 4 | Chrome + Firefox |

## 7.2 Matrice Comparativa Dettagliata

### Categoria UX/Interfaccia

| Feature | **YT Series** | **PlanYT** | **TrackMyCourse** | **playlist.tools** | **YT Playlist Tools** |
|---------|:---:|:---:|:---:|:---:|:---:|
| Dashboard separato | ✅ Full-page Netflix | ❌ | ❌ | ❌ | ❌ |
| Iniezione in YouTube | ✅ Sidebar link | ✅ Icona nativa | ✅ Progress bar | ✅ Side panel | ✅ Toolbar |
| Caroselli/hero banner | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hover preview episodi | ✅ | ❌ | ❌ | ❌ | ❌ |
| Tema personalizzabile | ✅ 3 temi | ❌ | ❌ | ❌ | ❌ |
| Dark mode automatica | ❌ manuale | ✅ nativa YT | ✅ nativa YT | ✅ nativa YT | ✅ nativa YT |
| Popup toolbar | ❌ | ✅ | ✅ (popup dashboard) | ✅ | ❌ |

### Categoria Tracking

| Feature | **YT Series** | **PlanYT** | **TrackMyCourse** | **playlist.tools** | **YT Playlist Tools** |
|---------|:---:|:---:|:---:|:---:|:---:|
| Progress bar per playlist | ✅ | ✅ | ✅ | ✅ | ✅ (per video) |
| Auto-detect fine video | ✅ | ❌ | ❌ | ❌ | ❌ |
| Watch manuale (click) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Watch parziale (%) | ❌ | ❌ | ❌ | ❌ | ✅ progress bar |
| Duration totale/rimanente | ❌ | ✅ | ✅ | ❌ | ✅ |
| Daily planning | ❌ | ✅ killer | ❌ | ❌ | ❌ |
| Nuovi episodi notifiche | ✅ Pro | ❌ | ❌ | ❌ | ❌ |

### Categoria Organizzazione

| Feature | **YT Series** | **PlanYT** | **TrackMyCourse** | **playlist.tools** | **YT Playlist Tools** |
|---------|:---:|:---:|:---:|:---:|:---:|
| Sorting episodi | ✅ | ❌ | ❌ | ✅ | ✅ avanzato (7 modi) |
| Filtri (watching/completed/all) | ✅ | ❌ | ✅ (in-progress/ completed) | ❌ | ✅ |
| Cerca serie | ✅ | ❌ | ❌ | ❌ | ❌ |
| Raccomandazioni canale | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-playlist management | ✅ | ✅ | ❌ (una per volta) | ✅ | ✅ |
| Bulk operations | ❌ | ❌ | ❌ | ❌ | ✅ |

### Categoria Tecnica

| Feature | **YT Series** | **PlanYT** | **TrackMyCourse** | **playlist.tools** | **YT Playlist Tools** |
|---------|:---:|:---:|:---:|:---:|:---:|
| Cloud sync | ❌ | ❌ | ❌ | ✅ account | ❌ |
| Open source | ✅ | ✅ | ✅ (49★, 4 contributors) | ❌ | ❌ |
| i18n | ✅ EN/IT | ❌ | ❌ | ❌ | ❌ |
| API key necessaria | ✅ (user-provided) | ✅ (backend proxy) | ❌ (DOM only) | ❌ | ❌ |
| Multi-browser | ❌ Chrome | ❌ Chrome | ✅ Chrome+Firefox | ❌ Chrome | ❌ Chrome |
| Accessibilità (screen reader) | ❌ | ❌ | ❌ | ❌ | ✅ (eccellente) |
| Version committed | 1.1.0 | 1.2.1 | 1.2.6 | 1.0 | 2.51 |

---

## 7.3 Iterazione 1 — Analisi per Categorie di Differenziazione

### Dove YT Series VINCE (Vantaggi Difendibili)

1. **Netflix UI**: caroselli, hero banner, hover preview — nessun competitor ha questo livello di cura visuale. È un vero moat se mantenuto.
2. **Auto-detect fine video**: `video.ended` listener è unico. Nessun competitor traccia automaticamente.
3. **Notifiche nuovi episodi**: feature Pro. Questo è un vero differenziatore per utenti che seguono serie in corso.
4. **Dashboard immersivo**: tab a schermo intero vs side panel/popup. Dà senso di "app" vera invece di "accessorio".
5. **i18n EN/IT**: apre il mercato italiano, nessun competitor bilingue.
6. **Cerca serie + raccomandazioni canale**: unico ad avere search e discovery integrati.

### Dove YT Series PERDE (Gap Rispetto ai Competitor)

| Gap | Dettaglio | Competitor di Riferimento | Gravità |
|-----|-----------|--------------------------|:-------:|
| **No duration tracking** | YT Series mostra solo conteggio video. Tutti i competitor mostrano durata totale/rimanente | TrackMyCourse, PlanYT, YT Playlist Tools | Alta |
| **No daily planning** | La killer feature di PlanYT (dividere playlist in obiettivi giornalieri) manca completamente | PlanYT | Alta |
| **Nessuna integrazione nativa YT** | YT Series richiede di aprire un tab separato. PlanYT e TrackMyCourse vivono DENTRO YouTube | PlanYT, TrackMyCourse | Media |
| **No cloud sync** | playlist.tools ha sync via account. YT Series perde dati se cambi PC | playlist.tools | Media |
| **No popup** | Click sull'icona → tab pieno. Tutti gli altri hanno almeno un popup veloce | Tutti | Media |
| **Accessibilità zero** | YT Playlist Tools ha supporto screen reader eccellente. YT Series non ha ARIA labels | YT Playlist Tools | Bassa (nicchia) |

### Matrice Prezzo/Valore

```
                    Alto prezzo
                        │
                        │
           YT Series ───┤─── Pro
                        │
                        │
   PushList ────────────┤─── Pro $18
                        │
   PlanYT ──────────────┤
   TrackMyCourse ───────┤─── Gratis
   playlist.tools ──────┤
   YT Playlist Tools ───┤
   Watchmarker ─────────┤
                        │
                    Basso prezzo
              Basso valore       Alto valore
```

**Insight**: YT Series è l'unico competitor a POSIZIONARSI SOPRA la fascia gratis. Questo è rischioso perché deve giustificare il prezzo con feature che i competitor danno via. I differenziatori attuali (Netflix UI, auto-detect, notifiche) sono reali ma forse non abbastanza per convertire utenti che usano TrackMyCourse gratis.

---

## 7.4 Iterazione 2 — Verifica Ipotesi sul Campo

### Ipotesi 1: "I competitor gratuiti cannibalizzano il mercato di YT Series"
**Verifica**: Parzialmente vera. TrackMyCourse ha 4.9★ e ~1k+ utenti. PlanYT ha 5.0★. Entrambi gratis. MA:
- Nessuno ha auto-detect video end
- Nessuno ha Netflix UI
- Nessuno ha notifiche nuovi episodi
- **Conclusione**: YT Series compete su un piano diverso (esperienza vs utility). I competitor gratuiti non sono sostituti perfetti.

### Ipotesi 2: "Il mercato preferisce estensioni in-YouTube vs dashboard separato"
**Verifica**: L'80% dei competitor sceglie iniezione in YouTube (PlanYT, TrackMyCourse, playlist.tools, YT Playlist Tools). Solo YT Series ha dashboard separato. Questo suggerisce che:
- La UX in-YouTube è preferita dal mercato (minor friction, resti su YouTube)
- Il dashboard separato di YT Series è un rischio di adozione
- **Conclusione**: YT Series dovrebbe considerare un'integrazione ibrida — piccolo popup + dashboard full per chi vuole approfondire

### Ipotesi 3: "Il modello Pro funziona in questo mercato"
**Verifica**: Solo PushList ($18) e YT Series (€?) hanno modelli a pagamento. PushList ha un use case diverso (bulk add). Nessun playlist tracker free ha un modello Pro di successo documentato. 
- **Rischio**: Il mercato si aspetta che queste utility siano gratis
- **Conclusione**: Il Pro model è rischioso. Deve essere giustificato con feature chiaramente superiori (notifiche, auto-detect, UI premium) che i competitor gratis non hanno.

### Ipotesi 4: "L'accessibilità è un differenziatore"
**Verifica**: YT Playlist Tools ha 4.7★ e menziona screen reader. Nessun altro competitor lo fa. Ma è un mercato piccolo.
- **Conclusione**: Non prioritario ora, ma potrebbe essere un differenziatore per CWS.

---

## 7.5 Iterazione 3 — Gap Strategici e Opportunity Map

### Opportunity Matrix

| Opportunità | Competitor che la coprono | Gap YT Series | Effort | Impatto |
|-------------|:------------------------:|:-------------:|:-----:|:-------:|
| **Duration tracking** | PlanYT ✅, TrackMyCourse ✅, YT PT ✅ | ❌ | 2-3 hr | Alto |
| **Integrazione nativa YT (popup leggero)** | PlanYT ✅, TrackMyCourse ✅, playlist.tools ✅ | ⚠️ solo tab pieno | 4-6 hr | Molto Alto |
| **Cloud sync** | playlist.tools ✅ | ❌ | 8-12 hr + backend | Alto |
| **Daily planning** | PlanYT ✅ | ❌ | 6-8 hr | Alto |
| **Watch progress parziale** | YT PT ✅ (progress bar) | ❌ | 4-6 hr | Medio |
| **Bulk operations ep** | YT PT ✅ | ❌ | 3-4 hr | Medio |
| **Accessibilità** | YT PT ✅ | ❌ | 2-3 hr | Basso (nicchia) |
| **Multi-browser (Firefox)** | TrackMyCourse ✅ | ❌ | 4-6 hr | Alto (nuovo mercato) |

### Positioning Map: Intrattenimento vs Produttività

```
                  Intrattenimento (binge-watching)
                          │
                          │
           YT Series ─────┤─── Netflix UI, caroselli
                          │
                          │
                          │
   Watchmarker ───────────┤
                          │
   playlist.tools ────────┤
                          │
   YT Playlist Tools ─────┤
                          │
   TrackMyCourse ─────────┤
   PlanYT ────────────────┤─── Daily planning, scheduling
                          │
                  Produttività (learning)
```

**Insight CRITICO**: YT Series è POSIZIONATO per intrattenimento (Netflix UI) ma risolve un problema di produttività (tracking tutorial). Questo crea un mismatch:
- Un binge-watcher non usa playlist lunghe (usa raccomandazioni YT)
- Un learner vuole produttività, non caroselli estetici
- **Soluzione**: Ribilanciare la UX per servire ENTRAMBI i casi d'uso — mantenere caroselli per discovery ma aggiungere planner/scheduler per produttività

### Feature Priority vs Competitor

```
Alta priorità ▌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  Duration tracking (tutti lo hanno)
              ▌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  Integrazione nativa YT (popup)
              ▌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  Daily planning (PlanYT)
              ▌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  Cloud sync (playlist.tools)
              ▌▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  Multi-browser Firefox
              ▌▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░  Bulk operations
              ▌▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░  Watch progress parziale
Bassa priorità ▌▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░  Accessibilità
```

---

## 7.6 Sintesi Competitiva

### Vantaggi Assoluti di YT Series (Nessun competitor li ha)
1. **Auto-detect video end** (tracking zero-friction)
2. **Notifiche nuovi episodi** (Chrome notifications)
3. **Netflix UI** (caroselli, hero, hover preview)
4. **Cerca serie + raccomandazioni canale**
5. **i18n EN/IT** (unico bilingue)

### Pericoli Immediati
1. **Nessuno competitor mostra duration tracking** — feature base che tutti hanno tranne YT Series
2. **PlanYT cresce** con daily planning + nativo YT + open source + gratis
3. **TrackMyCourse ha 4.9★** su CWS e ~1k utenti + Firefox
4. **Tutti gratis tranne PushList** — YT Series deve giustificare ogni centesimo

### Raccomandazioni Strategiche
1. **Prima di tutto: aggiungere duration tracking** (2-3 hr, impatto altissimo) — è la feature mancante più grave
2. **Aggiungere popup con stats veloci** (4-6 hr) — riduce friction all'accesso
3. **Valutare porting su Firefox** (4-6 hr) — TrackMyCourse lo ha fatto e ha raddoppiato reach
4. **Non inseguire PlanYT sul daily planning** — è il loro moat, meglio differenziarsi su UI + auto-track + notifiche
5. **Rinforzare il posizionamento "Netflix per YouTube"** — non competere su produttività pura, ma su esperienza

---

# STEP 8: Self-Critical Loop

## Iteration 1: What did we miss?

**Blind spot: Permission model.**
- We didn't analyze whether the extension requests minimal permissions. It needs `tabs`, `storage`, `alarms`, `notifications` + host permissions for youtube.com, googleapis.com, lemonsqueezy.com. These are justified but `tabs` permission is broad — could be more specific (activeTab would suffice).
- No analysis of YouTube Data API quota limits in real-world scenarios. At 10,000 units/day, each playlist fetch costs ~3-5 units + search costs ~100 units. Power users with 50 series + daily auto-refresh + searches could hit quota.

**Blind spot: Error recovery paths.**
- We identified the infinite retry but didn't model the UX impact: if storage is corrupted, user gets a blank dashboard with no error message. No "repair" or "reset to defaults" CTA.

**Blind spot: Upgrade/downgrade UX.**
- When user upgrades to Pro, there's no celebration/confirmation beyond the license toast. When Pro expires, the auto-refresh alarm may continue (as noted in #12) but we didn't analyze the grace period UX or what happens mid-refresh when Pro status changes.

## Iteration 2: Deeper technical blind spots

**Blind spot: YouTube's API pagination.**
- `_getPlaylistItems()` in `youtube.js` handles pagination (nextPageToken), but what about playlists with 500+ videos? The max is 50 per page, so 10 API calls. Each call costs quota. For a 1000-video playlist, that's 20 calls just to fetch all items. With auto-refresh on 50 series, this could use 1000+ quota units per cycle.

**Blind spot: Chrome extension update handling.**
- When the extension updates (new version), the service worker restarts. `ensureInit()` handles this, but the content script may still reference old code until the YouTube tab is refreshed. The sidebar injection could break after an update until the user refreshes YouTube.

**Blind spot: Lemon Squeezy API reliability.**
- What happens if `api.lemonsqueezy.com` is down? The license verification fails, falls back to cache. But what if the cache is expired AND the API is down? The user loses Pro access despite valid license. No retry mechanism or degraded-mode UX.

**Blind spot: Search feature quota cost.**
- The search tab in the "Add Series" modal calls YouTube Data API search endpoint (~100 units each). A user searching 5 times uses 500 of the 10,000 daily quota. Combined with auto-refresh and playlist fetches, power users could exhaust quota within hours.

## Iteration 3: Product/market blind spots

**Blind spot: Chrome Web Store listing readiness.**
- We noted the Italian-only manifest description, but didn't check: screenshots (are they current?), promo video, category selection, support URL, website link. The extension has screenshots but we didn't audit their quality or localization.

**Blind spot: Retention mechanics beyond progress bars.**
- After a user completes a series, what brings them back? There's no "discover new series" feed, no stats (total hours watched, series completed), no gamification. PlanYT has daily planning which drives daily return visits. YT Series relies entirely on the user finding new content on their own.

**Blind spot: Mobile/tablet gap.**
- The extension is Chrome-only (desktop). YouTube is heavily consumed on mobile (60%+). Users who track progress on mobile can't access it. Playlist.tools mitigates this with cloud sync (desktop only, but at least data persists). YT Series has no mobile story at all.

**Blind spot: YouTube ToS compliance risk.**
- The content script auto-detects video end and marks episodes watched. While this is benign, YouTube's ToS prohibit interfering with the "normal operation" of the service. The MutationObserver + DOM probing could be interpreted as scraping/mining. The sidebar injection modifies YouTube's DOM. These are standard extension patterns, but worth monitoring as YouTube's enforcement evolves.

---

# STEP 9: Final Executive Synthesis with Scores

## Overall Scores (1-10)

| Dimension | Score | Rationale |
|-----------|:-----:|-----------|
| **Product-Market Fit** | 7/10 | Solves a real problem (playlist tracking) but positioning is fuzzy (entertainment vs productivity). Strong for learners, binge-watchers. |
| **Technical Quality** | 5/10 | Architecture is sound (MV3, Store pattern, clean separation) but riddled with bugs: infinite retry, memory leaks, broken import, hardcoded strings, unenforced free limit. |
| **Security** | 4/10 | 3 leaked API keys in git history. Static API key bundled in every install. Keys stored in sync storage. License key exposed to tab page. Safety-critical issues. |
| **UX/Design** | 7/10 | Netflix UI is beautiful and differentiated. But: no onboarding, no popup, no keyboard shortcuts, Italian-only strings leak through, carousel drag-scroll is undiscoverable. |
| **Publish Readiness** | 3/10 | Cannot ship as-is. Blocking issues: API key exposure (legal/financial risk), `handleStorageReset` throws (broken feature), unenforced free limit (broken business model), Italian-only CWS description. |
| **Competitive Position** | 6/10 | Unique Netflix UI + auto-detect video end + notifications are differentiators. But all competitors are free. The Pro model needs stronger justification for paying vs PlanYT/TrackMyCourse. |
| **Monetization Viability** | 5/10 | Lemon Squeezy integration works. But: free limit isn't enforced (can't convert users), API key friction (user brings own key AND pays for Pro), themes promised in Pro but available free. |
| **Maintainability** | 4/10 | Zero dependencies (good!), but: duplicated logic (thumbnail resolution 6x, fetchPlaylist/refreshPlaylist), dead code (9 unused events, THEMES constant), renamed/refactored inconsistently. |
| **Performance** | 5/10 | Full DOM rebuilds, MutationObserver never disconnects, setInterval leaks, no scroll throttling, sequential fetches. Fine for small libraries but degrades at scale. |
| **Overall** | **5.1/10** | **Strong concept with differentiated UX, but held back by critical security issues, unenforced monetization, missing features (onboarding, popup, duration tracking), and technical debt that makes it unshippable in current state.** |

## Go/No-Go Recommendation

**NO-GO for public launch in current state.**

### Must-fix before CWS submission:
1. Rotate all 3 exposed API keys + scrub git history
2. Fix `STORAGE_KEYS` import (ReferenceError on storage reset)
3. Set `MAX_SERIES = 3` to enforce free tier
4. Translate manifest description to English (or bilingual)
5. Disconnect MutationObserver after first successful injection
6. Fix `setInterval` leak in content script

### Should-fix before CWS:
7. Add basic onboarding overlay
8. Add toolbar popup (`default_popup`)
9. Gate themes behind Pro (or fix licensing copy)
10. Internationalize hardcoded Italian strings
11. Add `config.js` to `.gitignore` and remove from bundle (use runtime config only)

---

# STEP 10: Prioritized Action Plan

## Phase 0: Emergency (Do immediately, before any other work)

| # | Action | Risk if not done | Est. Effort |
|---|--------|-----------------|-------------|
| 0.1 | **Rotate ALL 3 YouTube API keys** in Google Cloud Console | Financial: quota abuse, $200+/day overage | 15 min |
| 0.2 | **`git filter-repo` scrub** of stash commit `6824b37` + any commit containing keys | Legal: keys still in git object DB | 30 min |
| 0.3 | **Verify `config.js` is in `.gitignore`** and not in git tracking | Repeated exposure on next commit | 5 min |

## Phase 1: Ship-blocking (Before CWS submission)

| # | Action | Ref | Est. Effort |
|---|--------|:---:|:-----------:|
| 1.1 | Add `STORAGE_KEYS` import in `background/index.js` | C1 | 5 min |
| 1.2 | Set `FREE_LIMITS.MAX_SERIES = 3` | H4 | 2 min |
| 1.3 | Disconnect MutationObserver after first injection | H1 | 10 min |
| 1.4 | Store `setInterval` ID and clear on cleanup | H2 | 10 min |
| 1.5 | Make manifest description bilingual | #2 | 2 min |
| 1.6 | Remove API key placeholder from `constants.js` | C3 | 2 min |

## Phase 2: High-priority fixes (Before public launch)

| # | Action | Ref | Est. Effort |
|---|--------|:---:|:-----------:|
| 2.1 | Add `default_popup` (lightweight popup with stats + "Open Dashboard") | #4 | 1-2 hr |
| 2.2 | Add first-launch onboarding overlay | #8 | 2-3 hr |
| 2.3 | Internationalize 10+ hardcoded Italian strings | H3 | 30 min |
| 2.4 | Fix theme gating or licensing copy | #10 | 15 min |
| 2.5 | Add sender validation to tab broadcast listener | M8 | 5 min |
| 2.6 | Add backoff to `ensureInit()` retry loop | M9 | 15 min |
| 2.7 | Fix Promise.all coupling of sync+local storage | M4 | 15 min |
| 2.8 | Add user confirmation before sync data reset | H5 | 15 min |

## Phase 3: Security hardening

| # | Action | Ref | Est. Effort |
|---|--------|:---:|:-----------:|
| 3.1 | Move API key to backend proxy (Cloudflare Worker) | V2 | 4-8 hr |
| 3.2 | Move API key + license key from sync to local storage | V3, V4 | 1 hr |
| 3.3 | Strip `apiKey` and `license.key` from state sent to tab page | V3, V4 | 30 min |
| 3.4 | Reduce `LICENSE_CACHE_DAYS` from 30 to 3 | V5 | 5 min |
| 3.5 | Add periodic license re-verification alarm | V5 | 30 min |

## Phase 4: Product improvements

| # | Action | Est. Effort | Impact |
|---|--------|:-----------:|:------:|
| 4.1 | Add total/remaining duration display | 2-3 hr | High |
| 4.2 | Add keyboard shortcuts (Ctrl+Shift+Y) | 1 hr | Medium |
| 4.3 | Add export/import series data (JSON) | 2-3 hr | High |
| 4.4 | Add "Mark all watched" for series | 30 min | Low |
| 4.5 | Relabel "Recommended" → "More from {channel}" | 10 min | Medium |
| 4.6 | Add bulk episode selection + batch mark | 3-4 hr | Medium |

## Phase 5: Technical debt

| # | Action | Ref | Est. Effort |
|---|--------|:---:|:-----------:|
| 5.1 | Extract shared `_fetchPlaylistData()` + `_pickThumbnail()` | M2, M3 | 1 hr |
| 5.2 | Optimize `renderHome()` with DocumentFragment | H6 | 2 hr |
| 5.3 | Remove 9 unused event types | L1 | 15 min |
| 5.4 | Add passive scroll listeners + throttle header toggle | L5 | 15 min |
| 5.5 | Remove dead `THEMES` constant | L2 | 2 min |

## Effort Summary

| Phase | Total Est. Effort | Priority |
|-------|:-----------------:|:--------:|
| Phase 0: Emergency | ~50 min | 🔴 IMMEDIATE |
| Phase 1: Ship-blocking | ~30 min | 🔴 Before CWS |
| Phase 2: High-priority | ~5-8 hr | 🟠 Before public launch |
| Phase 3: Security hardening | ~6-10 hr | 🟡 Before scaling users |
| Phase 4: Product improvements | ~9-11 hr | 🟢 Post-launch |
| Phase 5: Technical debt | ~3.5 hr | 🟢 When time permits |

**Total: ~24-33 hours to production-ready state**
