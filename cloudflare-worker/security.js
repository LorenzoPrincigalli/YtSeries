/** Shared client token — must match WORKER_CLIENT_TOKEN in src/shared/constants.js */
const DEFAULT_CLIENT_TOKEN = 'yt-series-extension-v1'

const CLIENT_HEADER = 'X-YT-Series-Client'
const RATE_LIMIT_PER_DAY = 3000

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown'
}

function validateWorkerClient(request, env) {
  const expected = env?.YT_SERIES_CLIENT_TOKEN || DEFAULT_CLIENT_TOKEN
  const token = request.headers.get(CLIENT_HEADER)
  if (!token || token !== expected) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  return { ok: true }
}

async function checkDailyRateLimit(request, env) {
  if (!env?.CACHE_KV) return { ok: true }
  const ip = getClientIp(request)
  const day = new Date().toISOString().slice(0, 10)
  const key = `rl:${ip}:${day}`
  const raw = await env.CACHE_KV.get(key)
  const count = parseInt(raw || '0', 10)
  if (count >= RATE_LIMIT_PER_DAY) {
    return { ok: false, status: 429, error: 'Rate limit exceeded' }
  }
  await env.CACHE_KV.put(key, String(count + 1), { expirationTtl: 86400 })
  return { ok: true }
}

export {
  CLIENT_HEADER,
  DEFAULT_CLIENT_TOKEN,
  RATE_LIMIT_PER_DAY,
  getClientIp,
  validateWorkerClient,
  checkDailyRateLimit
}
