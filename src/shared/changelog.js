const CHANGELOG = [
  {
    version: '1.2.0',
    date: '2026-10-23',
    items: [
      'Faster, more reliable dashboard: rebuilt from the ground up with automatic retries when YouTube is slow or unavailable',
      'Clear error messages instead of silent failures (no connection, YouTube daily limit, playlist not found)',
      'Episode progress is now always saved, even when the browser suspends the extension',
      'Redesigned watched toggle, better contrast in every theme and full keyboard support',
      'YouTube integration: one "Add to Series" button that updates live, readable sidebar link, settings respected immediately',
      'Recommendations refresh when you add series from new channels; JSON export fixed',
      'Stronger privacy and security: stricter validation everywhere, hardened API proxy and cloud rules'
    ],
    items_it: [
      'Dashboard più veloce e affidabile: riscritta da zero, con nuovi tentativi automatici quando YouTube è lento o non disponibile',
      'Messaggi di errore chiari invece di errori silenziosi (nessuna connessione, limite giornaliero di YouTube, playlist non trovata)',
      'Il progresso degli episodi viene sempre salvato, anche quando il browser sospende l\'estensione',
      'Pulsante visto/non visto ridisegnato, contrasto migliore in ogni tema e uso completo da tastiera',
      'Integrazione con YouTube: un solo pulsante "Aggiungi a Serie" che si aggiorna in tempo reale, link laterale leggibile, impostazioni applicate subito',
      'I consigli si aggiornano quando aggiungi serie di nuovi canali; corretta l\'esportazione JSON',
      'Privacy e sicurezza rafforzate: validazione più rigorosa, proxy API e regole cloud blindati'
    ]
  },
  {
    version: '1.1.1',
    date: '2026-06-16',
    items: [
      'Donation-only model: switched from Lemon Squeezy to Buy Me a Coffee',
      'All features unlocked for everyone (no limits, no license)',
      'Removed upsell, license verification and Pro gating from the UI'
    ],
    items_it: [
      'Modello solo donazioni: passati da Lemon Squeezy a Buy Me a Coffee',
      'Tutte le funzionalità sbloccate per tutti (nessun limite, nessuna licenza)',
      'Rimosso upsell, verifica licenze e gating Pro dall\'interfaccia'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-05-26',
    items: [
      'Professional SVG icons with dark/light variants (auto-switch)',
      'PNG icon generation via sharp at 16/48/128',
      'Chrome Web Store assets: screenshots guide, privacy policy',
      'Card width increased to 500px with proportional scaling',
      'Carousel gap reduced to 12px for tighter layout',
      'Fixed XSS vector in episode detail (safe DOM methods)'
    ],
    items_it: [
      'Icone SVG professionali con varianti chiaro/scuro (switch automatico)',
      'Generazione icone PNG via sharp a 16/48/128',
      'Asset Chrome Web Store: guida screenshot, privacy policy',
      'Larghezza card aumentata a 500px con ridimensionamento proporzionale',
      'Spazio carousel ridotto a 12px per layout più compatto',
      'Risolto vettore XSS nei dettagli episodio (metodi DOM sicuri)'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-05-25',
    items: [
      'Cinematic carousels with hero banner and crossfade',
      'Series progress tracking with watched/unwatched, filters and sorting',
      'Episode detail with publish dates and related playlists',
      'Hover preview with YouTube iframe',
      'i18n: English and Italiano',
      'Theme system: Classic Red, Ocean Blue, Forest Green',
      'YouTube sidebar integration and "Add to Series" button',
      'Freemium licensing (Lemon Squeezy) with Pro notifications'
    ],
    items_it: [
      'Carousel cinematografici con banner hero e crossfade',
      'Tracciamento progressi serie con visti/non visti, filtri e ordinamento',
      'Dettaglio episodi con date di pubblicazione e playlist correlate',
      'Anteprima hover con iframe YouTube',
      'i18n: Inglese e Italiano',
      'Sistema temi: Classic Red, Ocean Blue, Forest Green',
      'Integrazione sidebar YouTube e pulsante "Aggiungi alle serie"',
      'Licenza Freemium (Lemon Squeezy) con notifiche Pro'
    ]
  }
]

export { CHANGELOG }
