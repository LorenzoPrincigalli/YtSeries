# KV Global Cache — Implementation Plan

## Obiettivo
Aggiungere un layer di cache globale (Workers KV) alla Worker, tra edge cache e YouTube API. Elimina i cache miss cross-datacenter.

## Architettura

```
Request
 → caches.default (edge, 0ms, per-datacenter)
   → HIT → response (99% casi)
   → MISS
     → env.CACHE_KV.get(kvKey) (globale, ~5ms, non consuma CPU)
       → HIT → populate edge cache → response
       → MISS
         → YouTube API (100 unità)
         → store KV + edge cache → response
```

## KV usato solo per search e playlists

`playlistItems` (120s TTL) e `videos` (7gg TTL) restano solo su edge cache.

## File da modificare

### 1. `cloudflare-worker/wrangler.toml`
```toml
name = "shy-snowflake-0680"
main = "index.js"
compatibility_date = "2026-05-27"

[[kv_namespaces]]
binding = "CACHE_KV"
id = "<da-creare-su-dashboard>"
```

### 2. `cloudflare-worker/index.js`
Riscrittura con 3-layer caching:
- Nuova costante `KV_TTL` (search=86400, playlists=21600)
- Nuova funzione `useKv(endpointType)` → true per search e playlists
- Flow: edge cache → KV (con try/catch) → YouTube API
- KV value: raw response body string (sempre 200)
- Chiave KV: `{endpointType}:{normalized_path}`
- `ctx.waitUntil()` per KV write (fire-and-forget, non blocca la risposta)
- Guard `if (env.CACHE_KV)` per degradare se binding assente

## Azioni utente pre-deploy

1. Dashboard Cloudflare → Workers & Pages → KV → Create namespace `YT_SERIES_CACHE`
2. Copiare l'ID generato e comunicarmelo

## Verifica

1. `npm test` → 81 test passano (estensione invariata)
2. Deploy Worker via `wrangler deploy`
3. curl test:
   - Prima search → `X-Cache: MISS`
   - Seconda search → `X-Cache: HIT-EDGE`
   - Con refresh=1 → `X-Cache: BYPASS`

## Rischi residui (1%)
- KV eventual consistency (~60s): raro, worst case doppio fetch YouTube
- KV write > 1K/day (free limit): ctx.waitUntil fail silenzioso, response già inviata
- KV non configurato: codice degrada a edge-cache-only con guard `!env.CACHE_KV`
