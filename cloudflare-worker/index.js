// YT Series — Cloudflare Worker
// Acts as a transparent proxy for YouTube Data API v3,
// keeping the API key server-side and out of the extension bundle.

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname + url.search
    const API_KEY = env.YT_API_KEY

    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: YT_API_KEY not set' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    if (path === '/') {
      return new Response(JSON.stringify({ status: 'ok', service: 'YT Series API Proxy' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const separator = path.includes('?') ? '&' : '?'
    const target = `${YOUTUBE_BASE}${path}${separator}key=${API_KEY}`

    try {
      const response = await fetch(target, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      })

      const body = await response.text()
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60'
      }

      return new Response(body, {
        status: response.status,
        headers
      })
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Upstream fetch failed', message: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }
  }
}
