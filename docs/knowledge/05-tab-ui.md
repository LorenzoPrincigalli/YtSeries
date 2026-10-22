# Tab UI — Dashboard

## Structure

| Path | Responsibility |
|------|----------------|
| `app.js` | Bootstrap only: subscribes renderers to the store, wires features, deep links (`?settings=1`, `?series=<id>`) |
| `core/store.js` | Read-only mirror of server state + UI state (`section`, `filter`, `collection`, `search*`, `recommended`, `detailId`); renders coalesced per animation frame |
| `core/api.js` | `send()` (never rejects) / `request()` (throws `AppError` on `success:false`) |
| `core/errorBoundary.js` | `safeRender()` fallback with Retry, `guarded()` for handlers, global error handlers |
| `actions.js` | All user intents → background commands; applies returned `state`, shows translated error toasts |
| `seriesView.js` | Pure derivations (filters, sort, hero, this-week, progress, URLs) — unit-tested |
| `views/home.js` | Main area: home rows, search results, saved library |
| `components/cards.js` | Cards, carousel rows, hero carousel, channel results |
| `components/detail.js` | Series dialog (re-renders from store; keeps scroll/sort), folder picker, channel dialog |
| `components/collections.js`, `collectionEditor.js` | Collection shelf and editor dialog |
| `features/*` | Header/search, activity bell, settings (sync, backups, import/export, reset, dev), add-playlist, footer dialogs, collection management |
| `ui/modal.js` | Accessible modals (focus trap, Escape, focus restore) and `confirmDialog()` |
| `ui/feedback.js` | Toasts (`role=status`) and `errorMessage(code)` |
| `theme.js`, `i18nDom.js` | `data-theme` switch (colours live in CSS); declarative `data-i18n` / `data-i18n-attr` translation |

DOM is built with `h()` / `svg()` from `src/shared/dom.js` and `src/shared/icons.js`. Dynamic values reach CSS only through custom properties (`--progress`, `--picker-top`).

## Data flow

Server state is never patched locally. A command's response `state` (or the following `STATE_UPDATED` broadcast) replaces the mirror; subscribers re-render. The main area re-renders only when its inputs change (opening the detail dialog does not rebuild the page).

## Design system

- `variables.css`: spacing, radii, z-index (`--z-dropdown`, `--z-modal`, `--z-toast`, `--z-popover`), on-media colours, badge colours, and the four themes as `:root[data-theme=…]` blocks (single source of truth, shared with the popup).
- `ui-kit.css`: accessibility utilities, button resets for keyboard-reachable titles, toast, progress bars.
- Contrast: text tokens meet WCAG AA in every theme; verified by the axe audit in `npm run smoke`.

## Accessibility

- Skip link, landmark `<main>`, `aria-current` nav, labelled icon buttons.
- Cards: whole card clickable by mouse; title is a real `<button>` (no nested interactive roles).
- Dialogs: `role=dialog`, `aria-modal`, focus trap, Escape, focus restore; settings sidebar follows the tabs pattern (arrow keys).
- Hero carousel pauses on hover/focus and does not auto-advance with `prefers-reduced-motion`.

## Collections, activity, backups

Behaviour unchanged from 1.1: collections are whole-series assignments synced with the series; the bell shows up to 100 local activity entries and marks them read via `ACTIVITY_MARK_READ`; five automatic backups (before delete/import/restore/reset) are listed under Settings → Reset Data.

## Search

Typing filters locally; Enter queries YouTube (`PLAYLIST_SEARCH`, 3 s server cooldown). Loading and failure are explicit states (`searchStatus`); previous results stay visible on failure.
