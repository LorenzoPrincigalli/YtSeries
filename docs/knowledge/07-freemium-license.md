# Freemium & Licensing

> Last updated: 14 June 2026

## Model

| Feature | Free | Pro (EUR 4.99 one-time) |
|---------|------|--------------------------|
| Series | Max 3 | Unlimited |
| Episode refresh (open series) | Yes | Yes |
| Auto-refresh 24h (background) | No | Yes |
| New episode notifications | No | Yes |
| "New This Week" section | No | Yes |
| Themes (4) | Yes | Yes |
| Cloud sync (Firebase) | Optional | Optional |
| Next Episode overlay on YouTube | Yes | Yes |

Purchase via Lemon Squeezy: `PRO_CHECKOUT.URL` in `src/shared/constants.js`

## License verification

`src/services/license.js` — `LicenseService` class:
- POSTs to `https://api.lemonsqueezy.com/v1/licenses/validate`
- Validates `store_id` against `LICENSE_STORE_ID`
- Caches result for `LICENSE_CACHE_DAYS` (1 day)
- Fallback to cache on network error

## Pro status enforcement

- `Store.isPro()` checks license validity (24h re-verify window)
- `Store.canAddSeries()` blocks new series when free limit reached
- Background service worker handles `LICENSE_VERIFY` and `LICENSE_ACTIVATE` events
- License data stored in `chrome.storage.sync` with checksum

## Upsell touchpoints

| Touchpoint | Where | Free user sees |
|------------|-------|---------------|
| Dashboard banner | Bottom of home | "Free plan (X/3)" — once per day, dismissible with X |
| New Episodes tab | Dashboard | Upsell card: "Pro feature — Upgrade to unlock" |
| Limit reached | Add series modal | Inline error message (no popup) |
| YouTube Add button | Content script | Button disables showing limit message |
| Post-completion | Toast | "Series completed! Want more? Get Pro" |
| Settings | Settings modal | License key input + "Get Pro" button |
| Popup | Extension popup | Feature list: unlimited, notifications, New This Week |

## DEV_TOGGLE_PRO

Auto-disables when `EXTENSION_ID` is set (production builds). The Dev tab in settings is hidden.
