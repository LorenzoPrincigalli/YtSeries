# Agent playbook

Practical rules and recipes for Cursor agents editing YTSeries.

## Do

- Read [00-quick-start.md](00-quick-start.md) before multi-file edits
- Route all state changes through `src/background/index.js` handlers
- Call `saveToStorage()` then `broadcastStateUpdate()` after mutations
- Match existing style: vanilla JS, `logger`, minimal comments
- Use `t('key')` for new user-visible strings in tab (add `en` + `it` in `i18n.js`)
- Prefer DOM APIs over `innerHTML` for dynamic API/YouTube text
- Keep diffs small — one concern per change
- Run `npm run icons` after SVG icon changes

## Don't

- Import extension modules from content script or popup without architectural change
- Write to `chrome.storage` from tab/content/popup
- Commit `src/shared/config.js` or API keys
- Add a bundler or framework without explicit user request
- Use `innerHTML` with unsanitized playlist/video titles
- Assume `license.isPro` in UI equals background Pro enforcement
- Edit `docs/knowledge/` for one-off analysis (use gitignored `docs/YYYY-MM-DD_HHmm/`)

## File ownership (quick)

| Change type | Primary files |
|-------------|---------------|
| New feature flag / limit | `constants.js`, `store.js`, `background/index.js`, tab UI |
| New message | `events.js`, `background/index.js`, maybe content/popup strings |
| YouTube parsing | `services/youtube.js` |
| New UI screen | `tab/app.js`, `components/*`, `main.css`, `index.html` |
| YouTube integration | `content/index.js` |
| Strings | `shared/i18n.js`, HTML `data-i18n` |
| Worker | `cloudflare-worker/index.js`, `constants.js`, `manifest.json` CSP |

## Recipe: add a message type

1. Add to `src/shared/events.js`
2. Case in `handleMessage()` in `background/index.js`
3. Implement handler: validate payload → mutate store → save → broadcast
4. If content/popup sends it: duplicate string constants
5. Tab: `sendMessage()` + handle response; listen for `STATE_UPDATED` if needed
6. Document in [02-message-protocol.md](02-message-protocol.md)

## Recipe: add i18n string

1. Add key to `STRINGS.en` and `STRINGS.it` in `src/shared/i18n.js`
2. Use `t('key')` in JS or `data-i18n="key"` in HTML
3. Call `translateUI()` if language can change at runtime

## Recipe: add Pro-gated feature

1. Enforce in background with `store.isPro()` (not UI-only)
2. Return clear error code for free users if applicable
3. Update tab UI visibility using same semantics where possible
4. Document in [07-freemium-license.md](07-freemium-license.md)

## Recipe: fix YouTube DOM breakage

1. Reproduce on `youtube.com/watch` and home
2. Update selectors in `content/index.js`
3. Test SPA navigation (click another video without full reload)
4. Verify `EPISODE_WATCH` still fires with `list=` in URL

## Pre-PR checklist

- [ ] Extension reloads without service worker errors
- [ ] Dashboard loads; `STATE_GET` works
- [ ] If messages changed: content/popup strings synced
- [ ] No secrets in diff
- [ ] Knowledge docs updated if protocol/architecture changed
- [ ] `tasks-build.md` item closed or noted in PR if applicable

## Agent checklist (general)

- [ ] Identified all contexts affected (BG / tab / content / popup)
- [ ] Confirmed mutation path goes through background
- [ ] Checked Pro/free enforcement in background, not only UI
- [ ] Verified CSP if adding new `connect-src` or `frame-src`

## Related

- [10-known-issues.md](10-known-issues.md)
- [README.md](README.md)
