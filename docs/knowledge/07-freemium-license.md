# Donation Model & Legacy Licensing

> Last updated: 16 June 2026

## Current model

**Donation-only — fully free for everyone.**

No license keys, no feature gating, no upsells.
Voluntary support via [Buy Me a Coffee](https://buymeacoffee.com/ytseriessun).

| Feature | Status |
|---------|--------|
| Series | Unlimited |
| Episode refresh (open series) | Yes |
| Auto-refresh 24h (background) | Yes |
| New episode notifications | Yes |
| "New This Week" section | Yes |
| Themes (4) | Yes |
| Cloud sync (Firebase) | Optional |
| Next Episode overlay on YouTube | Yes |

Support button appears in: dashboard settings, popup, and post-completion toast.

## Legacy license infrastructure (dead code)

The old Lemon Squeezy freemium model was removed but **kept as dead code stubs** for potential future reactivation if a suitable Merchant of Record is found.

| Artifact | Status |
|----------|--------|
| `src/services/license.js` | Stub — `verify()` always returns `{ valid: false }` |
| `src/shared/events.js` | `LICENSE_VERIFY`, `ACTIVATE_LICENSE`, `DEV_TOGGLE_PRO` removed |
| `src/shared/constants.js` | `PRO_CHECKOUT`, `LICENSE_STORE_ID`, `API.LICENSE_VERIFY` removed |
| `src/state/store.js` | `isPro()` → true, `canAddSeries()` → true, `setLicense()` removed |
| `src/background/index.js` | All license handlers and `isPro()` checks removed |
| `activate.html` | Preserved but unused (can be removed post-publish) |
| `cloudflare-worker/index.js` | Cleaned up — LS validation removed, now pure YouTube API proxy |
| Privacy policies | Still reference LS — update before publish |

## Reactivation plan (if ever needed)

1. Choose a Merchant of Record that accepts the product (LS rejected us on risk scoring, not policy)
2. Restore license infrastructure from git history or rewrite
3. Re-implement feature gating in `store.js`
4. Update `PUBLISH-CHECKLIST.md` blockers
