# AGENTS.md — YT Series

## Scopo
Istruzioni e riferimenti rapidi per AI coding agents che lavorano su questo progetto Chrome Extension.

## Regole fondamentali
- **Tutte le mutazioni di stato** passano dal background service worker (`src/background/index.js`).
- UI e content scripts **non scrivono mai direttamente** su `chrome.storage`.
- Segui la struttura e i flussi documentati in `docs/knowledge/` (vedi mappa sotto).

## Architettura e flussi
- **Stato e mutazioni**: vedi [03-data-model.md](docs/knowledge/03-data-model.md) e [src/state/store.js](src/state/store.js)
- **Messaggi**: vedi [02-message-protocol.md](docs/knowledge/02-message-protocol.md) e [src/shared/events.js](src/shared/events.js)
- **Infrastruttura, costi, CSP, Firebase sync**: [06-infrastructure.md](docs/knowledge/06-infrastructure.md)
- **UI**: dashboard e card in [src/tab/], dettagli in [05-tab-ui.md](docs/knowledge/05-tab-ui.md)
- **Licensing**: [07-freemium-license.md](docs/knowledge/07-freemium-license.md)

## Comandi utili
- Installazione dipendenze: `npm install`
- Generazione icone: `npm run icons`
- Build/pack: vedi [08-dev-workflow.md](docs/knowledge/08-dev-workflow.md)
- Test: `npm test` (Vitest, 81 test su 5 file)
- API key in `src/shared/config.js` — NON inserire chiavi reali (vanno nel bundle)

## Documentazione chiave
- [docs/knowledge/00-quick-start.md](docs/knowledge/00-quick-start.md) — orientamento rapido
- [docs/knowledge/01-architecture.md](docs/knowledge/01-architecture.md) — overview architettura
- [docs/knowledge/09-agent-playbook.md](docs/knowledge/09-agent-playbook.md) — checklist e task comuni
- [docs/2026-05-29_1930/07-Final-Report.md](docs/2026-05-29_1930/07-Final-Report.md) — analisi completa e fix applicati

## Note
- Non duplicare documentazione già presente: **linka** sempre ai file esistenti.
- Prima di analizzare o modificare codice, consulta SEMPRE la knowledge in `docs/knowledge/`.
- Skill locali disponibili:
  - `senior-engineer` (`.agents/skills/senior-engineer/SKILL.md`) — architettura, refactoring, planning
  - `greploop` (`.agents/skills/greploop/SKILL.md`) — esplorazione iterativa del codebase via grep
  - `check-pr` (`.agents/skills/check-pr/SKILL.md`) — analisi PR con `gh` CLI
- `gh` CLI installato in `C:\Program Files\GitHub CLI` e autenticato come `LorenzoPrincigalli`
- Se trovi flussi, regole o dettagli non documentati o cambiati, aggiorna la knowledge di conseguenza.
- Se modifichi i flussi principali, aggiorna anche la doc in `docs/knowledge/`.

---

> Questo file aiuta gli agent a essere subito produttivi, riducendo errori e tempo di onboarding.
