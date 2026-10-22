# Agent playbook

## Do

- Read [00-quick-start.md](00-quick-start.md) and [01-architecture.md](01-architecture.md) first.
- Mutate state only in background handlers, through `commit(ctx, store => …)`.
- Throw `AppError(code, message, { retryable })`; never throw plain objects or strings.
- Build DOM with `h()`/`svg()`; dynamic CSS values via custom properties.
- Add every user-visible string to `en` **and** `it` in `src/shared/i18n.js` (the coverage test fails otherwise).
- Run `npm run check` before committing (lint, CSS lint, typecheck, tests, build, smoke + axe).

## Don't

- Write to `chrome.storage` or `store._state` outside the service worker / store (lint-enforced for `store._state`).
- Use `innerHTML`, inline `style=` attributes or `Object.assign(el.style, …)`.
- Swallow errors (`catch {}` is a lint error): log, convert to a code, or surface to the user.
- Expose a route to the content script unless the YouTube integration needs it.
- Commit `src/shared/config.js`, `firebase.config.js` or any key.

## Recipe: add a message route

1. Add the constant to `src/shared/events.js`.
2. In the relevant `src/background/handlers/*.js`: write `handler(ctx, payload)`, declare `schema` (and `mode: 'read'` / `contexts` if needed).
3. Mutations go through `commit()`; return `{ success: true, … }` or throw `AppError`.
4. Test in `src/background/__tests__/router.test.js` (in-memory storage + real `Store`).
5. Call it from the UI via `actions.js` (`command()` / `request()`), map new error codes to `error_<code>` i18n keys if user-facing.
6. Document in [02-message-protocol.md](02-message-protocol.md).

## Recipe: add a dashboard feature

1. Pure logic → `seriesView.js` (+ test). 2. View/markup → `components/` or `views/`. 3. Events/wiring → `features/<name>.js` with an `init…()` called from `app.js`. 4. UI state → `core/store.js` `UiState`. 5. Styles → existing CSS file using tokens from `variables.css`.

## Recipe: fix YouTube DOM breakage

Update selectors in `src/content/youtubeDom.js`, adjust the stub markup in `scripts/smoke.mjs` if needed, then test on a real watch page and playlist page.

## Pre-PR checklist

- [ ] `npm run check` green
- [ ] No secrets in the diff
- [ ] Knowledge docs updated if routes, flows or structure changed
