# Development workflow

## First-time setup

1. `npm install`
2. `npm run setup` — interactive wizard for config.js and firebase.config.js
3. `npm run icons` — generate extension icons from SVG
4. Load unpacked in Chrome: `chrome://extensions` → Developer mode → Load unpacked

## Daily development

- **Test**: `npm test` (Vitest, 86 tests, 5 files)
- **Reload**: Click refresh on extension card in `chrome://extensions`
- **Debug**: Right-click icon → Inspect popup, or open tab and use DevTools

## Key architecture decisions

- **Search**: Enter triggers YouTube API search. Typing filters local series instantly.
- **Theme**: `applyTheme()` sets all CSS variables for dark/light. Toolbar icon follows theme.
- **Upsell**: Banner once/day, dismissible. No toast spam.
- **Notifications**: "New Episode Notifications" toggle — Pro only, hidden for free users.

## Build for publishing

See `PUBLISH-CHECKLIST.md`.

Quick zip:
```bash
zip -r yt-series.zip . -x "node_modules/*" ".git/*" ".agents/*" "scripts/*" "pw-profile/*" "docs/*" "*.zip" "AGENTS.md" "vitest.config.js" "package-lock.json"
```

## Post-publish

1. Set `EXTENSION_ID` in `src/shared/constants.js`
2. Update `activate.html` with hosted URL
3. Set `externally_connectable` in `manifest.json`
