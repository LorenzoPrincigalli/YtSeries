# YTSeries — Agent Knowledge Base

Structured documentation for Cursor agents and contributors working on this Chrome extension.

## Golden rule

**All state mutations go through the background service worker.** UI and content scripts send messages; they never write to `chrome.storage` directly.

## Reading order (first time)

| # | File | When to read |
|---|------|--------------|
| 1 | [00-quick-start.md](00-quick-start.md) | Always — 2-minute orientation |
| 2 | [01-architecture.md](01-architecture.md) | Before any cross-context change |
| 3 | [02-message-protocol.md](02-message-protocol.md) | Adding or changing messages |
| 4 | [03-data-model.md](03-data-model.md) | Storage, series shape, license |
| 5 | [04-services-and-apis.md](04-services-and-apis.md) | YouTube API, worker, Lemon Squeezy |
| 6 | [05-tab-ui.md](05-tab-ui.md) | Dashboard UI work |
| 7 | [06-infrastructure.md](06-infrastructure.md) | Firebase sync, costs, CSP, secrets, service map |
| 8 | [06-content-and-popup.md](06-content-and-popup.md) | YouTube page or popup changes |
| 9 | [07-freemium-license.md](07-freemium-license.md) | Pro limits, activation, gating |
| 10 | [08-dev-workflow.md](08-dev-workflow.md) | Build, icons, config, publish |
| 11 | [09-agent-playbook.md](09-agent-playbook.md) | Checklists and common tasks |
| 12 | [10-known-issues.md](10-known-issues.md) | Backlog and doc/code gaps |

## Task → file map

| Task | Read first |
|------|------------|
| Add a new message type | `02`, `09`, then `src/shared/events.js` + `src/background/index.js` |
| Change series / episode data | `03`, `src/state/store.js` |
| YouTube fetch / refresh bug | `04`, `src/services/youtube.js` |
| Tab UI / carousel / detail | `05`, `src/tab/` |
| Sidebar / auto-mark watched on YouTube | `06`, `src/content/index.js` |
| Pro feature or license UI | `07`, `09` |
| Icons, API key, worker deploy | `08`, `04` |
| Bug from backlog | `10`, `tasks-build.md` |

## Out of scope here

- User-facing install guide: root [README.md](../../README.md)
- Timestamped analysis reports: `docs/YYYY-MM-DD_HHmm/` (gitignored)
- Cursor rules (`.cursor/rules/`): not used in this project

## Conventions

- Docs are in **English** (matches code and README).
- No secrets: never document real API keys or license keys.
- Keep edits in knowledge in sync when architecture changes materially.
