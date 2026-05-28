# Freemium and license

## Tiers

| Feature | Free | Pro |
|---------|------|-----|
| Max series | 3 (`FREE_LIMITS.MAX_SERIES`) | Unlimited |
| Auto-refresh alarm | No | Yes (if `settings.autoRefresh`) |
| New episode badges / “New” filter row | UI hidden or limited | Yes |
| New episode highlight in detail (7 days) | No | Yes |

Enforcement for add/refresh: `store.canAddSeries()` and `store.isPro()` in **background**.

## Critical: `store.isPro()` vs `license.isPro`

| Check | Where | Logic |
|-------|-------|-------|
| `license.isPro` | Tab, popup UI | Persisted flag from last verify |
| `store.isPro()` | Background enforcement | Requires `isPro`, `key`, and `verifiedAt` within **24 hours** |

**UI can show “Pro” while background blocks Pro actions** if `verifiedAt` is older than 24h until user re-verifies.

When changing Pro features, consider aligning UI with `store.isPro()` or triggering re-verify on tab load.

## Activation paths

1. **Settings → Activate** — tab sends `LICENSE_VERIFY` with `{ key }`
2. **`activate.html`** on GitHub Pages — `chrome.runtime.sendMessage(EXTENSION_ID, { type: 'ACTIVATE_LICENSE', key })`
3. Checkout — `PRO_CHECKOUT.URL` (no auto-activation)

### External activation requirements

- `EXTENSION_ID` in `src/shared/constants.js` (empty until Chrome Web Store publish)
- `manifest.json` → `externally_connectable.matches`
- `activate.html` must use same extension ID

## Verify flow (background)

1. Rate limiter check (`_rateLimiter` in local storage, exponential backoff)
2. `licenseService.verify(key)` → Lemon Squeezy API
3. Valid → `setLicense({ key, isPro: true, verifiedAt: Date.now() })`, save, broadcast
4. Invalid → clear license, clear `autoRefresh` alarm, broadcast

## Re-verification

| Trigger | Behavior |
|---------|----------|
| `init()` / `reverifyLicense()` | If Pro and `verifiedAt` older than `LICENSE_CACHE_DAYS` (1 day), re-validate; invalid → strip Pro |
| `licenseHeartbeat` alarm | Daily → `reverifyLicense()` |
| `store.isPro()` | Hard 24h window on `verifiedAt` for runtime checks |

## Tamper protection

On load, license checksum mismatch → reset to free, increment `_tamperCount`.

Do not remove `_checksum` logic when editing license persistence.

## License service cache

`license.js` caches successful validation in memory for network failures (up to `LICENSE_CACHE_DAYS`).

## UI references

- `app.js`: license badge, pro settings section, buy button, `homePage.setPro(state.license.isPro)`
- `popup.js`: Pro badge, buy button visibility

## Agent notes

- Use `LIMIT_REACHED` when testing free tier add
- After license changes, confirm `broadcastStateUpdate()` fired
- Do not commit real license keys in docs or code

## Related

- [02-message-protocol.md](02-message-protocol.md) — `LICENSE_VERIFY`, `ACTIVATE_LICENSE`
- [10-known-issues.md](10-known-issues.md) — `EXTENSION_ID` empty, UI/enforcement gap
