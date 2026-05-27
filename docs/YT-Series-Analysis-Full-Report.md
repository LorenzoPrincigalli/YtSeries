# YT Series — Full Analysis Report (STEP 1–10)

**Extension:** YT Series v1.1.0 · Manifest V3  
**Analysis Date:** 2026-05-27  
**Files Analyzed:** 22 source files, git history (15+ commits, 3 branches, stash)

---

## EXECUTIVE SUMMARY

| Dimensione | Voto | Verdetto |
|------------|:---:|----------|
| Product-Market Fit | 7/10 | Problema reale, positioning sfumato |
| Technical Quality | 5/10 | Architettura solida ma piena di bug |
| Security | 4/10 | 3 API key esposte, rischio quota abuse |
| UX/Design | 7/10 | UI Netflix bellissima, ma manca onboarding |
| Publish Readiness | 3/10 | **NON pubblicabile nello stato attuale** |
| Competitive Position | 6/10 | Differenziatori reali, ma tutti gratis |
| Monetization Viability | 5/10 | Free tier non enforce, Pro model rischioso |
| Maintainability | 4/10 | Zero dipendenze (bene!), codice duplicato |
| Performance | 5/10 | Memory leak, full DOM rebuild, ok per piccoli carichi |
| **Overall** | **5.1/10** | **Concetto forte, esecuzione bloccata da criticità** |

### Raccomandazione: NO-GO per pubblicazione. ~24-33 ore di fix necessari.

---

## STEP 1: Product Understanding

### Problema Risolto
YouTube non ha un concetto di "guardare una serie in playlist". Utenti che seguono tutorial, lecture o content seriali non hanno:
- Progress tracking
- Binge-watching UX (caroselli, hero banner)
- Rilevamento nuovi episodi
- Dashboard unificato per più playlist
- "Continue Watching" automatico
- Filtri (in corso/completate/nuovi episodi)

### Target Utenti
| Segmento | Profilo |
|----------|---------|
| **Online learners** | Tutorial coding, design, lingue — playlist 20-100+ video |
| **Heavy YouTube consumers** | Canali con contenuti episodici in playlist |
| **Binge-watchers** | Trattano playlist come serie TV |
| **Content curators** | Curano playlist tematiche |
| **Italian-speaking users** | Estensione bilingue EN/IT |

### Casi d'Uso Reali
1. Seguire un corso di 60 video "Python for Beginners" con progress tracking
2. Seguire lecture universitarie (es. CS50) filtrabili per "In corso"
3. Scoprire nuovi episodi aggiunti a playlist seguite (notifiche Pro)
4. Gestire 10+ playlist tutorial contemporaneamente
5. Scoprire altre playlist dello stesso canale
6. Accesso rapido dalla sidebar di YouTube

---

## STEP 2: Deep Technical Analysis

### Architettura
- **Service Worker** (`background/index.js`) — MV3 background con Store singleton
- **Content Script** (`content/index.js`) — Iniettato in YouTube per sidebar + video detection
- **Tab Page** (`tab/`) — SPA standalone in tab separato
- **Store** in-memory backed by `chrome.storage`
- **Zero npm dependencies** ✅

### 🔴 Critici (ship-blocking)

| # | Issue | File | Line |
|---|-------|------|------|
| C1 | `STORAGE_KEYS` non importato → `handleStorageReset()` lancia ReferenceError | `background/index.js` | 393-398 |
| C2 | API key hardcoded in `config.js` e committata (3 key esposte in git history) | `shared/config.js` | 1 |
| C3 | Placeholder API key in `constants.js` (ridondante ma espone il pattern) | `shared/constants.js` | 9 |

### 🟠 High Priority

| # | Issue | File |
|---|-------|------|
| H1 | MutationObserver mai disconnesso — leak CPU | `content/index.js` |
| H2 | `setInterval` in video detection — memory leak | `content/index.js` |
| H3 | ~10 stringhe hardcoded in italiano (bypassano i18n) | `detail.js`, `app.js`, `home.js` |
| H4 | `MAX_SERIES = 999` → free tier inefficace | `constants.js` |
| H5 | Sync quota overflow resetta dati silenziosamente | `store.js` |
| H6 | `renderHome()` ricostruisce tutto il DOM | `app.js` |

### 🟡 Medium Priority

| # | Issue |
|---|-------|
| M1 | Content script ridefinisce EVENTS invece di importare |
| M2 | `fetchPlaylist` e `refreshPlaylist` duplicati |
| M3 | Risoluzione thumbnail duplicata 6 volte |
| M4 | `Promise.all` accoppia sync+local storage |
| M5 | `bindUIEvents()` è 105 righe |
| M6 | Errori content script mai mostrati all'utente |
| M7 | Shadow DOM Polymer può nascondere video element |
| M8 | Tab broadcast listener senza sender validation |
| M9 | `ensureInit()` retry infinito senza backoff |
| M10 | Detail loop chiama async senza await |

### 🟢 Low Priority
- 9 dead event types
- `THEMES` constant mai usata
- Caroselli SVG duplicati
- Scroll listener senza throttle
- DOM probing per CSS values (getYouTubeTextColor)

### Funzioni Overly Complex
| Funzione | Righe | Problema |
|----------|-------|----------|
| `bindUIEvents()` | 105 | Troppe responsabilità |
| `renderHome()` | 98 | Dovrebbe essere 3-4 funzioni |
| `_getPlaylistItems()` | 38 | Mescola paginazione + mapping + duration |

---

## STEP 3: Security (Red-Team Analysis)

### 🔴 Vulnerability 1: API Key Leaked in Git (Critical)
**3 chiavi** esposte in git history:

| Key | Commit | Stato |
|-----|--------|-------|
| `***REMOVED***` | `6824b37` (stash) | In object DB locale |
| `***REMOVED***` | `a4ccc17` (era su origin/main) | Recuperabile da chi ha clonato |
| `***REMOVED***` | `config.js` locale | Chiave attiva, bundled nell'estensione |

**Impatto:** Quota exhaustion ($200+/day), DoS dell'estensione

### 🔴 Vulnerability 2: API Key Bundled in Extension (High)
`config.js` è un file statico nell'estensione → **ogni utente** può estrarlo navigando a `chrome-extension://<ID>/src/shared/config.js`

### 🟠 Vulnerability 3: API Key in `chrome.storage.sync` (High)
La chiave viene sincronizzata su Google servers e leggibile da altre estensioni con permesso `storage`.

### 🟡 Vulnerability 4: License Key in `chrome.storage.sync` (Medium)
Stesso problema — la license key è esposta a tutte le estensioni sullo stesso profilo.

### 🟡 Vulnerability 5: 30-Day License Cache (Medium)
Licenza revocata ma utente offline: mantiene Pro per 30 giorni.

### Altri Findings
- **No XSS trovato** — `textContent` usato correttamente ✅
- **Sender validation** corretta ✅
- **`web_accessible_resources`** minimale (solo icone) ✅
- **Privacy** molto buona — dati locali, no analytics, no tracking ✅
- **Race conditions** — nessuna trovata ✅

---

## STEP 4: Publish Readiness

### Chrome Web Store Audit

| Elemento | Stato | Azione Richiesta |
|----------|-------|------------------|
| **Nome** "YT Series" | Ambiguo | Considerare "YT Series Tracker" |
| **Descrizione** | Solo ITALIANO | 🔴 **Bilingue obbligatorio** |
| **Categoria** | Non impostata | Scegliere "Productivity" |
| **Icone** 16/48/128 | ✅ OK | — |
| **Screenshot** (5) | ✅ Presenti | Verificare qualità/localizzazione |
| **Video promo** | ❌ | Opzionale ma consigliato |
| **Privacy Policy** | ✅ Presente | Va hostata su URL pubblico |
| **Sito web/supporto** | ❌ | CWS richiede URL |
| **Tag ricerca** | ❌ | Descr. IT-only = nessun tag EN |

### Conformità Legale
- **GDPR**: ✅ Built-in (no analytics, dati locali)
- **YouTube ToS**: ⚠️ DOM injection borderline ma pratica comune
- **Google API ToS**: ✅ Richiede display Google Privacy Policy

### Technical Readiness

| Requisito | Stato | Note |
|-----------|-------|------|
| MV3 compliance | ✅ | OK |
| Service worker idempotent | ⚠️ | Loop infinito su storage corrotto |
| CSP | ⚠️ | `unsafe-inline` per stili |
| API key rotation | ❌ **BLOCKING** | 3 chiavi esposte |
| Error handling utente | ❌ | Crash silenziosi |
| Onboarding | ❌ | Nessun flusso guidato |
| Free tier limits | ❌ | `MAX_SERIES = 999` |

---

## STEP 5: Product & Marketing Analysis

### Pricing Model Issues
1. **Free limit non enforce** (`MAX_SERIES=999`) → nessuna conversione
2. **Temi non gated** → copy Pro li cita ma sono gratis
3. **API key a carico utente** → paga per Pro + deve configurare API key
4. **Nessun trial Pro** → non può provare prima di pagare
5. **Prezzo non definito** → range suggerito: €6.99-9.99 una tantum

### Conversion Funnel (Stimato)
```
Install → Empty Dashboard → Add Series → Watch → Auto-track → Return
  100%         60%             40%       35%       35%         25%
```

**Problemi:**
- Install → Add Series: -40% (nessun onboarding)
- Add Series → Success: -25% (API key assente/errori silenziosi)
- Free → Pro: -99.9% (limite non enforce, no trial)
- Return visit: -60% (nessuna notifica push in free)

### Go-to-Market Strategy

| Canale | Potenziale | Sforzo |
|--------|-----------|--------|
| Chrome Web Store (ricerca organica) | Alto | Basso |
| Reddit (r/YouTube, r/productivity) | Medio-Alto | Medio |
| Product Hunt | Medio | Medio |
| YouTube (canali dev italiani) | Basso-Medio | Basso |
| Indie Hackers / HN | Medio | Basso |
| GitHub | Basso | Basso |

### Retention Strategy
1. Celebration animation su completamento serie
2. Weekly recap in-app ("questa settimana: 12 episodi, 3 serie")
3. Badge icona con nuovi episodi
4. Migliorare sezione "Discover"

---

## STEP 6: Functional Gap Analysis

### Presenti
| Feature | Stato |
|---------|-------|
| Add playlist via URL | ✅ |
| Add via YouTube search | ✅ |
| Dashboard Netflix-style | ✅ |
| Progress bar per serie | ✅ |
| Auto-detect fine video | ⚠️ (memory leak) |
| Mark episodio manuale | ✅ |
| "Continue Watching" | ✅ |
| Filtri (All/Watching/Completed) | ✅ |
| Sort episodi (4 modalità) | ✅ |
| Serie detail page | ✅ |
| Tema (3 varianti) | ✅ (ma non gated) |
| i18n EN/IT | ⚠️ (~10 stringhe hardcoded) |
| Auto-refresh 24h | ✅ (Pro) |
| Notifiche nuovi episodi | ✅ (Pro) |
| Lemon Squeezy licensing | ✅ |
| Channel recommendations | ⚠️ (mal etichettato) |
| Search within series | ✅ |

### Mancanti (Gaps)

| # | Feature | Priorità |
|---|---------|----------|
| G1 | **Onboarding walkthrough** | Alta |
| G2 | **Toolbar popup** (`default_popup`) | Alta |
| G3 | **Keyboard shortcuts** | Media |
| G4 | **Bulk operations (multi-select episodi)** | Media |
| G5 | **Drag-to-reorder series** | Bassa |
| G6 | **Export/import JSON** | Media |
| G7 | **Duration tracking** (totale/rimanente) | **Alta** |
| G8 | **Playlist notes/tags** | Bassa |
| G9 | **"Mark all watched"** | Bassa |
| G10 | **Completion celebration** | Bassa |
| G11 | **Partial watch progress (%)** | Media |
| G12 | **Cloud sync** | Media |
| G13 | **Dark/light auto-detect** | Bassa |

### Functional Pain Points

| # | Pain Point | Severità |
|---|-----------|:--------:|
| P1 | `MAX_SERIES = 999` → free tier inefficace | 🔴 |
| P2 | MutationObserver mai disconnesso | 🟠 |
| P3 | `setInterval` leak | 🟠 |
| P4 | Full DOM rebuild su ogni render | 🟠 |
| P5 | Descrizione manifest solo italiano | 🟠 |
| P6 | Theme gating mismatch (copy vs realtà) | 🟡 |
| P7 | Stringhe hardcoded italiane | 🟡 |
| P8 | Storage reset silenzioso su quota overflow | 🟠 |
| P9 | `handleStorageReset()` → ReferenceError | 🔴 |
| P10 | API key hardcoded e committata | 🔴 |
| P11 | Nessun errore visibile all'utente | 🟡 |
| P12 | Promise.all sync+local storage coupled | 🟡 |

---

## STEP 7: Competitive Analysis

### Panorama Competitor

| Competitor | Tipo | Prezzo | ★ CWS | Multi-browser |
|------------|------|--------|:-----:|:-------------:|
| **YT Series** | Dashboard Netflix | Free + Pro € | ? | ❌ |
| **PlanYT** | In-YouTube planner | Gratuito | 5.0 (54) | ❌ |
| **TrackMyCourse** | In-YouTube progress | Gratuito | 4.9 (30) | ✅ Chrome+FF |
| **playlist.tools** | Side panel manager | Gratuito (cloud sync) | 1.0 (1) | ❌ |
| **YT Playlist Tools** | Toolbar utility | Gratuito | 3.0 (52) | ❌ |
| **Watchmarker** | Watched marker | Gratuito | 4.7 | ❌ |
| **PushList** | Bulk add tool | Free + $18 | ? | ❌ |
| **YT Duration Bar** | Duration bar | Gratuito | 4★ | ✅ Chrome+FF |

### Matrice Comparativa

#### UX/Interfaccia
| Feature | YT Series | PlanYT | TrackMyCourse | playlist.tools | YT PT |
|---------|:---------:|:------:|:-------------:|:--------------:|:-----:|
| Dashboard separato | ✅ | ❌ | ❌ | ❌ | ❌ |
| Iniezione in YouTube | ✅ sidebar | ✅ icona | ✅ progress | ✅ side panel | ✅ toolbar |
| Caroselli/hero | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hover preview | ✅ | ❌ | ❌ | ❌ | ❌ |
| Tema personalizzabile | ✅ 3 temi | ❌ | ❌ | ❌ | ❌ |
| Dark mode auto | ❌ manuale | ✅ nativa | ✅ nativa | ✅ nativa | ✅ nativa |
| Popup toolbar | ❌ | ✅ | ✅ | ✅ | ❌ |

#### Tracking
| Feature | YT Series | PlanYT | TrackMyCourse | playlist.tools | YT PT |
|---------|:---------:|:------:|:-------------:|:--------------:|:-----:|
| Progress bar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auto-detect fine video | ✅ | ❌ | ❌ | ❌ | ❌ |
| Watch manuale | ✅ | ✅ | ✅ | ✅ | ✅ |
| Watch parziale (%) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Duration tracking | ❌ | ✅ | ✅ | ❌ | ✅ |
| Daily planning | ❌ | ✅ killer | ❌ | ❌ | ❌ |
| Notifiche nuovi episodi | ✅ Pro | ❌ | ❌ | ❌ | ❌ |

#### Organizzazione
| Feature | YT Series | PlanYT | TrackMyCourse | playlist.tools | YT PT |
|---------|:---------:|:------:|:-------------:|:--------------:|:-----:|
| Sorting | ✅ | ❌ | ❌ | ✅ | ✅ 7 modi |
| Filtri | ✅ | ❌ | ✅ | ❌ | ✅ |
| Cerca serie | ✅ | ❌ | ❌ | ❌ | ❌ |
| Raccomandazioni | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-playlist | ✅ | ✅ | ❌ | ✅ | ✅ |
| Bulk operations | ❌ | ❌ | ❌ | ❌ | ✅ |

### Dove YT Series VINCE
1. **Netflix UI** — caroselli, hero, hover preview (nessun competitor)
2. **Auto-detect fine video** — unico tracking zero-friction
3. **Notifiche nuovi episodi** — unico
4. **Dashboard immersivo** — app vs accessorio
5. **i18n EN/IT** — unico bilingue
6. **Cerca + raccomandazioni** — unico

### Dove YT Series PERDE
| Gap | Competitore | Gravità |
|-----|-------------|:-------:|
| No duration tracking | **Tutti** | Alta |
| No daily planning | PlanYT | Alta |
| Nessuna integrazione nativa YT | PlanYT, TrackMyCourse | Media |
| No cloud sync | playlist.tools | Media |
| No popup | **Tutti** | Media |

### Positioning Risk
YT Series è **posizionato per intrattenimento** (Netflix UI) ma risolve un **problema di produttività** (tracking tutorial). Questo crea un mismatch: binge-watcher non usano playlist, learner vogliono produttività.

### Raccomandazioni Strategiche
1. **Duration tracking** — prima feature da aggiungere (2-3 hr)
2. **Popup stats veloci** — riduce friction (4-6 hr)
3. **Firefox porting** — raddoppia reach (4-6 hr)
4. **Non inseguire PlanYT su daily planning** — differenziarsi su UI + auto-track
5. **Rinforzare "Netflix per YouTube"** — non competere su produttività pura

---

## STEP 8: Self-Critical Loop

### Iterazione 1 — Cosa ci siamo persi?
- **Permission model**: `tabs` è troppo largo → meglio `activeTab`
- **YouTube API quota**: 10.000 unità/giorno. 50 serie + auto-refresh + search = rischio quota
- **Error recovery UX**: storage corrotto → dashboard bianco, nessun messaggio
- **Upgrade/downgrade UX**: nessuna celebrazione Pro, alarm persiste dopo downgrade

### Iterazione 2 — Technical blind spots
- **API pagination**: playlist da 1000 video = 20 chiamate API = 100+ unità
- **Chrome update handling**: content script può rompersi dopo update fino a refresh YT
- **Lemon Squeezy downtime**: cache scaduta E API down → utente perde Pro ingiustamente
- **Search quota cost**: ~100 unità per ricerca. 5 ricerche = 500 unità

### Iterazione 3 — Product/market blind spots
- **CWS listing**: screenshot non verificati, URL supporto assente
- **Retention**: nessuna gamification, stats, o "discover" dopo completamento serie
- **Mobile gap**: 60%+ consumo YT su mobile, zero presenza
- **YouTube ToS compliance**: DOM injection + MutationObserver borderline

---

## STEP 9: Final Executive Synthesis

### Overall Scores (1-10)

| Dimensione | Voto |
|------------|:----:|
| Product-Market Fit | 7/10 |
| Technical Quality | 5/10 |
| Security | 4/10 |
| UX/Design | 7/10 |
| Publish Readiness | 3/10 |
| Competitive Position | 6/10 |
| Monetization Viability | 5/10 |
| Maintainability | 4/10 |
| Performance | 5/10 |
| **Overall** | **5.1/10** |

### Go/No-Go: NO-GO

#### Must-fix before CWS:
1. Rotare 3 API key + scrub git history
2. Fix `STORAGE_KEYS` import (ReferenceError)
3. Set `MAX_SERIES = 3`
4. Descrizione manifest bilingue
5. Disconnect MutationObserver
6. Fix `setInterval` leak

#### Should-fix before CWS:
7. Onboarding overlay
8. Toolbar popup
9. Gate temi (o fix copy)
10. Internazionalizzare stringhe italiane
11. Rimuovere config.js da bundle + .gitignore

---

## STEP 10: Prioritized Action Plan

### Phase 0: Emergency (~50 min)
| Azione | Tempo |
|--------|:-----:|
| Rotare 3 YouTube API key in Google Cloud Console | 15 min |
| `git filter-repo` scrub stash commit `6824b37` | 30 min |
| Verificare .gitignore per config.js | 5 min |

### Phase 1: Ship-blocking (~30 min)
| # | Azione | Tempo |
|---|--------|:-----:|
| 1.1 | Aggiungere `STORAGE_KEYS` import in background/index.js | 5 min |
| 1.2 | `MAX_SERIES = 3` | 2 min |
| 1.3 | Disconnect MutationObserver dopo prima injection | 10 min |
| 1.4 | Salvare interval ID e pulire su cleanup | 10 min |
| 1.5 | Descrizione manifest bilingue | 2 min |
| 1.6 | Rimuovere placeholder API key da constants.js | 2 min |

### Phase 2: High-priority (~5-8 hr)
| # | Azione | Tempo |
|---|--------|:-----:|
| 2.1 | `default_popup` (stats + "Open Dashboard") | 1-2 hr |
| 2.2 | Onboarding overlay primo avvio | 2-3 hr |
| 2.3 | Internazionalizzare stringhe hardcoded | 30 min |
| 2.4 | Fix theme gating o licensing copy | 15 min |
| 2.5 | Sender validation tab broadcast | 5 min |
| 2.6 | Backoff per `ensureInit()` | 15 min |
| 2.7 | Fix Promise.all sync+local storage | 15 min |
| 2.8 | User confirmation prima di reset sync | 15 min |

### Phase 3: Security hardening (~6-10 hr)
| # | Azione | Tempo |
|---|--------|:-----:|
| 3.1 | Backend proxy API key (Cloudflare Worker) | 4-8 hr |
| 3.2 | API key + license key in local storage | 1 hr |
| 3.3 | Strippare apiKey e license.key dallo state | 30 min |
| 3.4 | `LICENSE_CACHE_DAYS` 30 → 3 | 5 min |
| 3.5 | Periodic license re-verification alarm | 30 min |

### Phase 4: Product improvements (~9-11 hr)
| # | Azione | Tempo | Impatto |
|---|--------|:-----:|:-------:|
| 4.1 | Duration tracking (totale/rimanente) | 2-3 hr | Alto |
| 4.2 | Keyboard shortcuts (Ctrl+Shift+Y) | 1 hr | Medio |
| 4.3 | Export/import JSON | 2-3 hr | Alto |
| 4.4 | "Mark all watched" | 30 min | Basso |
| 4.5 | Relabel "Recommended" | 10 min | Medio |
| 4.6 | Bulk episode selection + batch mark | 3-4 hr | Medio |

### Phase 5: Technical debt (~3.5 hr)
| # | Azione | Tempo |
|---|--------|:-----:|
| 5.1 | `_fetchPlaylistData()` + `_pickThumbnail()` | 1 hr |
| 5.2 | Optimize `renderHome()` con DocumentFragment | 2 hr |
| 5.3 | Rimuovere 9 dead event types | 15 min |
| 5.4 | Passive scroll + throttle header toggle | 15 min |
| 5.5 | Rimuovere dead `THEMES` constant | 2 min |

### Totale Effort: ~24-33 ore

| Fase | Effort | Priorità |
|------|:------:|:--------:|
| 🔴 Phase 0: Emergency | ~50 min | IMMEDIATE |
| 🔴 Phase 1: Ship-blocking | ~30 min | Before CWS |
| 🟠 Phase 2: High-priority | ~5-8 hr | Before public launch |
| 🟡 Phase 3: Security hardening | ~6-10 hr | Before scaling users |
| 🟢 Phase 4: Product improvements | ~9-11 hr | Post-launch |
| 🟢 Phase 5: Technical debt | ~3.5 hr | When time permits |

---

## Files Analizzati (22 file, ~3.500+ righe)

| File | Righe |
|------|:-----:|
| `manifest.json` | 44 |
| `src/background/index.js` | 409 |
| `src/content/index.js` | 206 |
| `src/services/license.js` | 62 |
| `src/services/youtube.js` | 252 |
| `src/services/chrome/storage.js` | 83 |
| `src/services/chrome/tabs.js` | 36 |
| `src/services/chrome/alarms.js` | 28 |
| `src/services/chrome/notifications.js` | 28 |
| `src/tab/app.js` | 835 |
| `src/tab/components/detail.js` | 740 |
| `src/tab/components/home.js` | 512 |
| `src/tab/components/modal.js` | 84 |
| `src/tab/index.html` | 124 |
| `src/shared/config.js` | 1 |
| `src/shared/config.example.js` | 1 |
| `src/shared/constants.js` | 65 |
| `src/shared/events.js` | 40 |
| `src/shared/logger.js` | 44 |
| `src/shared/i18n.js` | 239 |
| `src/state/store.js` | 249 |
| `src/assets/store/privacy-policy.html` | 92 |
| `.gitignore` | 28 |
| Git history | 15+ commits, 3 branches, stash |

---

*Report generato il 27 Maggio 2026 — YT Series v1.1.0*
