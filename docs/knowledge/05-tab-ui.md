# Tab UI — Dashboard

## Structure

| Path | Responsibility |
|------|----------------|
| `app.js` | Bootstrap only: subscribes renderers to the store, wires features, deep links (`?settings=1`, `?series=<id>`, `#import=<shared list>`) |
| `core/store.js` | Read-only mirror of server state + UI state (`section` home/saved/schedule, `filter`, `collection`, `search*`, `recommended`, `detailId`); renders coalesced per animation frame |
| `core/api.js` | `send()` (never rejects) / `request()` (throws `AppError` on `success:false`) |
| `core/errorBoundary.js` | `safeRender()` fallback with Retry, `guarded()` for handlers, global error handlers |
| `actions.js` | All user intents → background commands; applies returned `state`, shows translated error toasts |
| `seriesView.js` | Pure derivations (filters, sort, hero, this-week, progress, URLs) — unit-tested |
| `views/home.js` | Main area: home rows, search results, "Your series" (collections shelf, own search box, filter chips, grid or list via `settings.libraryView`) |
| `views/schedule.js` | Upcoming: expected releases (`releaseForecast`) for the next 7 days, late, later, and episodes out in the last week |
| `components/cards.js` | Cards, carousel rows, hero carousel, channel results |
| `components/detail.js` | Series dialog (re-renders from store; keeps scroll/sort): time left / finish estimate, trailer suggestion, "Skip episode" toggles, "Mark as ended" toggle and dormant-series suggestion, notes, share, folder picker, channel dialog with "Follow as series" |
| `components/notes.js` | Episode notes in the detail: grouped list, inline edit, delete, Markdown export |
| `components/achievements.js` | Trophy button → Achievements dialog: this week (goal, streak, time watched) and the badge grid; celebration + dot for badges earned while the dashboard is open |
| `components/collections.js`, `collectionEditor.js` | Collection shelf and editor dialog |
| `features/libraryMenu.js` | "Your series" header menu (menu button pattern): filters with counts and grid/list view; the filters live only here and in the page chips |
| `features/*` | Header/search, activity bell, settings (goals, sync, backups, import/export, reset, dev), add-playlist (playlist, channel or share links), footer dialogs, collection management, `share.js` (copy a share link, import preview) |
| `ui/modal.js` | Accessible modals (focus trap, Escape, focus restore) and `confirmDialog()` |
| `ui/feedback.js` | Toasts (`role=status`) and `errorMessage(code)` |
| `ui/celebration.js` | Queued celebration for badge levels and series milestones (medal spin, light sweep, confetti; fade only with `prefers-reduced-motion`; waits while the tab is hidden) |
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

## 1.3 progress tools

- **Excluded ("skipped") episodes** stay listed (dimmed) but never count: progress, time left, next episode, milestones. The button reads "Skip episode" / "Salta episodio"; the data field stays `excluded`. Trailers/teasers are suggested once per series and session.
- **Ended series** (`ended`): "Ended" badge on cards, a note in the detail meta row, no Upcoming forecast. The detail offers "Mark as ended" when nothing was uploaded for 90 days and there is no release rhythm.
- **No emoji** anywhere in the UI: icons are SVG from `src/shared/icons.js` (enforced by `src/shared/__tests__/no-emoji.test.js`).
- **Time left / finish estimate**: `timeLeft` and `finishEstimate` from `src/shared/seriesStats.js`; the estimate appears only when the series has a recent pace (≥ 2 episodes in 21 days).
- **Goal, milestones, badges**: `settings.weeklyGoal` (Settings → Goals); `EPISODE_WATCH` returns the milestone crossed, celebrated by `actions.celebrate`. Badges are pure functions of the library (`src/shared/achievements.js`: 12 badges × 3 levels, no stored state); the dialog lives off the home page on purpose.
- **Sharing**: `shareCodec` encodes the list in the link (`share.html#d=…`); importing re-adds playlists with `PLAYLIST_ADD` (concurrency 2) and optionally files them with `COLLECTION_MOVE`.

## Search

Typing filters locally; Enter queries YouTube (`PLAYLIST_SEARCH`, 3 s server cooldown). Loading and failure are explicit states (`searchStatus`); previous results stay visible on failure.
