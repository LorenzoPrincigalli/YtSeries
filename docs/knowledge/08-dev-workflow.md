# Development workflow

## Prerequisites

- Chrome (or Chromium) with Developer mode
- Node.js ≥ 18

## First-time setup

```bash
npm install
npm run icons
```

1. `chrome://extensions` → Load unpacked → repo root
2. Optional direct API: copy `src/shared/config.example.js` → `src/shared/config.js`, add `YT_API_KEY`, clear `WORKER_BASE` in constants for local testing only

**Default repo config uses Cloudflare Worker** — no `config.js` required for normal dev.

## npm scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `icons` | `node src/assets/scripts/generate-icons.cjs` | SVG → PNG 16/48/128 (+ `_light`) in `icons/` |
| `lint` | echo placeholder | **No linter configured** |

Other scripts in `src/assets/scripts/` (not in package.json):

- `mock-data.cjs` — dev fixtures
- `debug-ext.cjs` — debugging helper
- `screenshots.cjs` — store screenshots (uses storage)

## Project constraints

- **No bundler** — paths in manifest and HTML must resolve as real files
- **No test runner** — manual testing in Chrome
- ES modules only where manifest declares `type: "module"`

## Reload checklist

1. Reload extension on `chrome://extensions`
2. Hard-refresh dashboard tab (`src/tab/index.html`)
3. Refresh YouTube tabs for content script

## Worker deploy (maintainers)

```bash
cd cloudflare-worker
# wrangler secret put YT_API_KEY
# wrangler deploy
```

Update `API.WORKER_BASE` + manifest permissions/CSP if URL changes.

## Publishing (Chrome Web Store)

See root README and `src/assets/store/screenshots.md`:

1. `npm run icons`
2. Screenshots per guide
3. Host `src/assets/store/privacy-policy.html`
4. Zip or upload unpacked build (exclude `node_modules`, `docs/analysis`, secrets)
5. Set `EXTENSION_ID` in constants + `activate.html` after publish

## Version alignment

| File | Current note |
|------|----------------|
| `manifest.json` | `version` field (e.g. 1.1.0) |
| `package.json` | May differ — align on release |
| `CHANGELOG.md` | User-facing releases |
| `src/shared/changelog.js` | In-app changelog (`CHANGELOG` array often empty) |

## Gitignore highlights

- `src/shared/config.js` — API keys
- `docs/*` except `docs/knowledge/**` — analysis reports ignored
- `node_modules/`, `*.zip`

## Related

- [04-services-and-apis.md](04-services-and-apis.md)
- [10-known-issues.md](10-known-issues.md)
