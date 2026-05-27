# STEP 4-5: Publish Readiness + Product/Marketing Analysis

> Nota: STEP 1-3, 6-10 sono già stati completati e salvati in `docs/`.

---

## PARTE A: PUBLISH READINESS

### 1. Chrome Web Store Listing Audit

#### Stato Attuale

| Elemento | Stato | Criticità |
|----------|-------|-----------|
| **Nome** | "YT Series" | Ambiguo — sembra riferirsi a "YouTube Series" (contenuti originali)而非 a un tool tracker |
| **Descrizione** | Solo italiano (`manifest.json:5`) | Bloccante: utenti EN vedono testo italiano, ranking CWS penalizzato |
| **Categoria** | Non impostata nel manifest | Va scelta in CWS dashboard (Produttività o Accessori) |
| **Icone** | ✅ 16/48/128px presenti | OK |
| **Screenshot** | ✅ 5 screenshot in `src/assets/store/` | Non verificata qualità/localizzazione |
| **Video promo** | ❌ Non presente | Opzionale ma consigliato |
| **Privacy Policy** | ✅ Presente (`privacy-policy.html`) | OK, ma va hostata online (non funziona come file locale) |
| **Sito web/supporto** | ❌ Non definito | CWS richiede URL di supporto |
| **Tag di ricerca** | ❌ Non ottimizzati | Descrizione IT-only = nessun tag EN indicizzato |

#### Azioni Richieste

**Bloccante (prima della submission):**
1. **Descrizione bilingue** obbligatoria: `"Transform YouTube playlists into a TV-series tracker with Netflix-style UI / Trasforma le playlist YouTube in serie TV con interfaccia Netflix"`
2. **Ospitare privacy-policy.html** su un URL pubblico (GitHub Pages, Vercel, o il tuo sito)
3. **Definire URL di supporto** (GitHub issues, email, o landing page)
4. **Scegliere categoria CWS**: "Productivity" è la più azzeccata

**Raccomandato:**
5. **Screenshot localizzati** — almeno gli screenshot con testo (settings, modals) in EN
6. **Aggiungere "YT Series Tracker"** come nome breve (`short_name` nel manifest)
7. **Tag CWS**: `youtube playlist tracker, series tracker, watch progress, binge watch, playlist organizer, tutorial tracker, learning tool, netflix for youtube`

### 2. Conformità Legale

| Area | Stato | Azione |
|------|-------|--------|
| **GDPR (utenti EU)** | ✅ Compliance built-in (no analytics, no tracking, dati locali) | Assicurati che la privacy policy menzioni esplicitamente che i dati NON vengono trasmessi a server terzi (eccetto YouTube API e LS) |
| **YouTube ToS** | ⚠️ L'uso di MutationObserver + DOM injection è pratica comune ma tecnicamente borderline | Documentare che l'estensione non modifica il comportamento di YouTube, solo lo UI |
| **Google API ToS** | ✅ L'utente porta la propria API key (o la usa bundled). TOS richiede display della Google Privacy Policy | Aggiungere link alla Google Privacy Policy nella UI o nella privacy policy dell'estensione |
| **Lemon Squeezy ToS** | ✅ LS gestisce compliance fiscale (IVA, VAT, ricevute) | Nessuna azione |

### 3. Technical Readiness Checklist

| Requisito | Stato | Note |
|-----------|-------|------|
| **MV3 compliance** | ✅ | Già Manifest V3 |
| **Service worker idempotent** | ⚠️ | `ensureInit()` può loopare all'infinito su storage corrotto |
| **CSP sicura** | ⚠️ | `unsafe-inline` per stili — accettabile ma non ideale |
| **API key rotation** | ❌ **BLOCKING** | 3 chiavi esposte in git, 1 bundled nell'estensione |
| **Error handling utente** | ❌ | Crash silenziosi: utente non sa se l'estensione funziona |
| **Onboarding** | ❌ | Nessun flusso guidato al primo avvio |
| **Limiti free tier** | ❌ | `MAX_SERIES = 999` rende il tier Pro inutile |

---

## PARTE B: PRODUCT/MARKETING ANALYSIS

### 1. Pricing Strategy Analysis

#### Modello Attuale
- **Free**: 3 serie, refresh manuale, tema base
- **Pro** (€ una tantum via Lemon Squeezy): serie illimitate, auto-refresh 24h, notifiche, più temi

#### Problemi Identificati

| # | Problema | Impatto |
|---|----------|---------|
| P1 | **Free limit non enforced** (MAX_SERIES=999) | Nessuna conversione — utenti hanno tutto gratis |
| P2 | **Temi non gated** — disponibili in free ma il copy li cita come Pro | Falsa promessa, erode fiducia |
| P3 | **API key a carico dell'utente** — devono portarsi la propria chiave Google E pagare per Pro | Doppio friction: pagare + config manuale |
| P4 | **Nessun trial Pro** — utente non può provare auto-refresh/notifiche prima di pagare | Barriera alla conversione |
| P5 | **Prezzo non definito** nel codice — sarà su LS dashboard | Assicurati che il prezzo sia commisurato al valore percepito (€5-10 una tantum è il range giusto per extension niche) |

#### Raccomandazioni Pricing

1. **Fix P1 immediatamente**: `MAX_SERIES = 3`
2. **Gate i temi dietro Pro** — o aggiorna il copy se restano free
3. **Valuta un proxy backend** per l'API key (Cloudflare Worker) — così l'utente non deve configurare nulla
4. **Aggiungi trial Pro** (7 giorni di auto-refresh gratuiti) per far provare il valore
5. **Prezzo suggerito**: €6.99 una tantum (allineato con estensioni Chrome comparabili) o €9.99 con 30-day trial

### 2. Go-to-Market Strategy

#### Canali di Acquisizione

| Canale | Potenziale | Sforzo | Strategia |
|--------|-----------|--------|-----------|
| **Chrome Web Store search** | Alto (ricerca organica) | Basso | Ottimizzare descrizione + tag + screenshot |
| **Reddit (r/YouTube, r/chrome_extensions, r/productivity)** | Medio-Alto | Medio | Post show-and-tell con screenshot del UI Netflix |
| **Product Hunt** | Medio (picco iniziale) | Medio | Launch con demo video + offerta launch discount |
| **YouTube (canali dev/tutorial)** | Basso-Medio | Basso | Review/tutorial su canali di dev Italiani |
| **Twitter/X (dev community)** | Basso | Basso | Screenshot + thread sul "Netflix per playlist YouTube" |
| **GitHub** | Basso (open source) | Basso | README ben scritto + issues template |
| **Indie Hackers / Hacker News** | Medio (se storia interessante) | Basso | Post sullo sviluppo: "Ho costruito un Netflix per playlist YouTube" |

#### Value Proposition per Canale

```
Chrome Web Store:   "Turn any YouTube playlist into a binge-worthy TV series"
Reddit:             "I got tired of losing my place in 60-video tutorials, so I made Netflix for YouTube playlists"
Product Hunt:       "YT Series — YouTube playlists finally get the Netflix treatment"
GitHub:             "Open-source Chrome extension that transforms YouTube playlists into trackable TV series"
```

### 3. Conversion Funnel

#### Current Funnel (teorico)

```
Install → Empty Dashboard → Add Series → Watch Video → Auto-track → Return to Dashboard
  100%         60%             40%          35%          35%           25%
```

#### Problemi nel Funnel

| Step | Drop-off | Causa Probabile | Fix |
|------|----------|-----------------|-----|
| **Install → Add Series** | ~40% | Nessun onboarding, utente non sa come ottenere URL playlist | Aggiungere overlay guidato al primo avvio |
| **Add Series → Series Added** | ~25% | API key assente/config errata, errore silenzioso | Validazione + messaggi di errore chiari |
| **Free → Pro** | ~99.9% | Free limit non enforce, nessun trial Pro | Fix MAX_SERIES + trial 7gg |
| **Return visit** | ~60% | Nessuna notifica push/reminder in free | Badge con conteggio nuovi episodi sull'icona |

#### Azioni per Ottimizzare il Funnel

1. **First Run Experience**: overlay guidato di 3 passi (1: un playlist URL, 2: incollalo, 3: guarda il progresso)
2. **Toolbar badge**: mostra conteggio serie con nuovi episodi non visti (anche in free)
3. **Email/waitlist**: opzionale, per avvisare quando nuove feature arrivano (solo se l'utente vuole)
4. **Pro upsert timing**: mostra il modal Pro dopo che l'utente ha aggiunto la 3ª serie ("Hai raggiunto il limite gratuito!")

### 4. Retention & Engagement

#### Attuale

| Metrica | Stima |
|---------|-------|
| DAU (utente singolo) | 1-3 visite al giorno |
| Session duration | ~30 secondi (dashboard), ~1-2 min (dettaglio) |
| Series completate/utente | ? (non tracciato) |
| Churn (disinstallazione) | ? (non tracciato — e non può essere tracciato senza analytics) |

#### Strategie di Retention (senza analytics invasivi)

1. **"Series Completed" celebration** — confetti/animazione quando si completa una serie al 100%. Effetto screenshot-shareable virale.
2. **Weekly recap** (in-app): "Questa settimana hai guardato 12 episodi di 3 serie" — visibile all'apertura del dashboard
3. **"Continue Watching" sempre in evidenza** — già presente, ma assicurati che sia sempre il primo carosello
4. **Badge sull'icona** — mostra il numero di serie con nuovi episodi (anche free, ogni 24h via alarm)
5. **"Discover" section** — playlist suggerite basate su canali seguiti (già presente ma etichettata male)

### 5. Key Metrics to Track (Privacy-safe)

Poiché l'estensione non ha analytics server-side, usa eventi in-app per tracciare engagement:

| Metrica | Come misurarla | Perché |
|---------|---------------|--------|
| **Series added** | Conta nello store locale | Tasso di attivazione |
| **Episodes watched/auto-tracked** | Store locale | Engagement core |
| **Pro license activated** | Store locale | Revenue |
| **Auto-refresh enabled** | Store locale | Pro feature adoption |
| **Theme changes** | Store locale | Engagement indiretto |
| **Dashboard opens** | Studio manuale con utenti reali | Solo qualitativo |

> 📌 **Raccomandazione futura**: Aggiungere un endpoint anonimo opzionale, opt-in esplicito (GDPR compliant), per raccogliere metriche aggregate che guidino decisioni product. Senza dati, stai guidando al buio.

---

## RIEPILOGO AZIONI STEP 4-5

### Da fare immediatamente (prima della pubblicazione CWS)

| # | Azione | Priorità |
|---|--------|----------|
| 1 | Manifest description bilingue | 🔴 |
| 2 | Hostare privacy policy online | 🔴 |
| 3 | Scegliere URL supporto | 🔴 |
| 4 | Fix `MAX_SERIES = 3` | 🔴 |
| 5 | Gate temi dietro Pro (o fix copy) | 🔴 |
| 6 | Aggiungere onboarding al primo avvio | 🟠 |
| 7 | Aggiungere `default_popup` | 🟠 |

### Da fare post-lancio

| # | Azione | Priorità |
|---|--------|----------|
| 8 | Proxy backend per API key | 🟡 |
| 9 | Trial Pro (7gg) | 🟡 |
| 10 | Screenshot localizzati | 🟢 |
| 11 | Celebration animation su completamento | 🟢 |
| 12 | Badge icona con nuovi episodi | 🟢 |
| 13 | Video promo per CWS + PH | 🟢 |
| 14 | Post Reddit/HN/Indie Hackers | 🟢 |

---

**Questa analysis completa il STEP 4-5. Tutti gli step (1-10) sono ora coperti.**
