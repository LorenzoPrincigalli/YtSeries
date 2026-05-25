# Chrome Extension - OpenCode Rules & Patterns

## 1. Obiettivo del progetto
La estensione deve essere modulare, deterministica e prevedibile. Ogni feature deve essere isolata, testabile e non accoppiata direttamente alla UI.

Non sono accettate implementazioni fuori specifica o comportamenti non deterministici.

---

## 2. Architettura obbligatoria

Struttura progetto:

- `src/background/` → service worker e orchestrazione eventi
- `src/content/` → content scripts isolati
- `src/popup/` → interfaccia principale
- `src/options/` → pagina impostazioni
- `src/shared/` → utility, costanti, tipi
- `src/services/` → logica applicativa e integrazioni esterne
- `src/state/` → gestione stato centralizzato

Regola: nessuna business logic nella UI.

---

## 3. Comunicazione tra moduli

Tutte le comunicazioni devono passare da message passing.

Pattern obbligatorio:

- `sendMessage(type, payload)`
- `onMessage(type, handler)`

Regole:
- popup → background solo via messaggi
- content → background solo via messaggi
- vietato accesso diretto tra content e popup

---

## 4. Service Layer Pattern

Tutte le operazioni su:

- Chrome APIs
- Storage
- API esterne

devono passare da services dedicati.

Esempi:

- `AuthService`
- `StorageService`
- `TabService`

Regola: la UI non chiama mai `chrome.*` direttamente.

---

## 5. State Management

- stato centralizzato unico o per dominio
- aggiornamenti immutabili
- niente duplicazione di stato tra moduli

---

## 6. Event-driven architecture

Ogni azione significativa è un evento.

Esempi:

- `USER_LOGIN`
- `TAB_UPDATED`
- `DATA_SYNCED`

Regola: preferire eventi rispetto a chiamate dirette tra moduli.

---

## 7. Chrome API Rules

Accesso consentito solo in:

- `src/services/chrome/`

Obbligatorio wrapper per:

- storage
- tabs
- runtime
- alarms

---

## 8. Content Script Rules

- stateless o quasi-stateless
- nessuna business logic
- comunicazione solo via message bridge
- DOM manipulation delegata a helper

---

## 9. Background Rules

- punto centrale di orchestrazione
- non contenere business logic complessa
- evitare file monolitici

---

## 10. UI Rules

- UI puramente presentazionale
- nessuna logica complessa nei componenti
- azioni → eventi o service calls
- gestione esplicita di loading/error

---

## 11. Error Handling

- errori standardizzati:
  - code
  - message
  - context
- services gestiscono errori internamente
- UI non riceve errori raw

---

## 12. Logging

- logging centralizzato
- livelli: info, warn, error, debug
- niente console.log sparsi
- log disattivabili in produzione

---

## 13. Naming Conventions

- camelCase → funzioni/variabili
- PascalCase → classi/service
- UPPER_SNAKE → eventi e costanti

---

## 14. Anti-pattern vietati

- business logic nella UI
- uso diretto chrome API fuori services
- stato duplicato
- comunicazione diretta content ↔ popup
- file monolitici > 300 righe senza split
- side effects non controllati

---

## 15. Regola principale

Se una regola non è definita qui:

preferire isolamento, prevedibilità e separazione delle responsabilità rispetto alla semplicità immediata.