# Quick start (agents)

## What this is

**YT Series** — Chrome **Manifest V3** extension that turns YouTube playlists into a TV-series tracker.

## Stack

| Item | Choice |
|------|--------|
| Language | Vanilla JavaScript (ES2023), JSDoc types, `// @ts-check` on core modules |
| Build | **esbuild** → `dist/` (same layout as `src/`); load `dist/` unpacked |
| UI | DOM micro-kit (`src/shared/dom.js` `h()`), no framework, no HTML strings |
| State | Service-worker `store` + `chrome.storage`; tab keeps a read-only mirror |
| APIs | YouTube Data API v3 via Cloudflare Worker; optional Firebase Cloud Sync |
| Quality gates | `npm run check` = ESLint + CSS lint + `tsc` + Vitest + build + Playwright smoke (incl. axe) |

## Entry points

| Context | Path | Notes |
|---------|------|-------|
| Service worker | `src/background/index.js` | Wiring only; logic in `router.js` + `handlers/*` |
| Dashboard | `src/tab/index.html` + `app.js` | Bootstrap; features in `features/`, views in `views/` |
| Toolbar popup | `src/popup/popup.html` + `popup.js` | Bundled (IIFE), shares i18n/events/theme |
| Content script | `src/content/index.js` on `youtube.com` | Bundled (IIFE), restricted message set |

## Golden rule

```
tab / popup / content --sendMessage--> router (schema + sender check) --> handler
                                           --> commit(): store.transaction + save --> sync queue --> STATE_UPDATED
```

Never mutate `store` or `chrome.storage` outside the service worker.

## Key files

| Concern | File |
|---------|------|
| Message routing, validation, authorisation | `src/background/router.js` |
| Domain handlers | `src/background/handlers/{series,episodes,collections,settings,library,app}.js` |
| Mutation helper | `commit()` in `src/background/context.js` |
| State + persistence | `src/state/store.js` |
| Errors / logging / resilience / schemas | `src/shared/{errors,logger,resilience,schema}.js` |
| YouTube HTTP | `src/services/youtube.js` |
| Dashboard intents | `src/tab/actions.js` |

## Run it

```bash
npm install
npm run build        # then chrome://extensions → Load unpacked → dist/
npm run check        # all gates
```

Next: [01-architecture.md](01-architecture.md), then [09-agent-playbook.md](09-agent-playbook.md).
Pre-publish: `PUBLISH-CHECKLIST.md`.
