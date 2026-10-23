// Fictional-but-realistic library for Chrome Web Store screenshots.
// No real creators, titles or thumbnails: every image is generated here as
// original vector artwork (see thumbnailSvg), so the store assets carry no
// third-party copyright or implied endorsement.

const DAY = 86_400_000

/**
 * Series definitions. `watched` = number of finished episodes (from the start),
 * `inProgress` = percentage of the next episode, `fresh` = episodes published in
 * the last days (shown as "New This Week" / NEW badges).
 */
const SERIES = [
  {
    id: 'PLdeepblueocean', title: 'Deep Blue: Life in the Ocean', channel: 'Wild Frontiers', channelId: 'UCwildfrontiers',
    motif: 'waves', palette: ['#03254c', '#0a6c8c', '#59d2fe'], collection: 'Documentaries', watched: 3, inProgress: 46, addedDaysAgo: 2, lastWatchedDaysAgo: 0.2,
    episodes: ['The Living Reef', 'Giants of the Open Sea', 'Into the Twilight Zone', 'Kelp Forests', 'Arctic Waters', 'The Deep Trenches', 'Ocean Nomads', 'Our Blue Future']
  },
  {
    id: 'PLcosmosexplain', title: 'Cosmos Explained', channel: 'Orbit Lab', channelId: 'UCorbitlab',
    motif: 'planets', palette: ['#120c33', '#3b1f7a', '#f5a3ff'], collection: 'Documentaries', watched: 6, inProgress: 0, addedDaysAgo: 35, lastWatchedDaysAgo: 1,
    episodes: ['How Big Is the Universe?', 'Life of a Star', 'Black Holes, Simply', 'The Search for Life', 'Dark Matter Mysteries', 'Our Moon’s Story', 'Exoplanets', 'The Big Bang', 'Time and Space', 'The Far Future']
  },
  {
    id: 'PLstreetfoodtour', title: 'Street Food Around the World', channel: 'Hungry Nomad', channelId: 'UChungrynomad',
    motif: 'food', palette: ['#5c1a00', '#d9480f', '#ffd43b'], collection: 'Travel', watched: 5, inProgress: 22, fresh: 2, newEpisodes: 2, addedDaysAgo: 50, lastWatchedDaysAgo: 0.6,
    episodes: ['Bangkok After Dark', 'Mexico City Tacos', 'Istanbul Breakfast', 'Tokyo Ramen Alleys', 'Naples Pizza Street', 'Marrakech Night Market', 'Seoul Street Snacks', 'Lima Ceviche', 'Hanoi Pho Morning', 'Mumbai Chaat', 'Taipei Night Bites', 'Palermo Markets']
  },
  {
    id: 'PLpython30days', title: 'Learn Python in 30 Days', channel: 'Byte Sized Dev', channelId: 'UCbytesizeddev',
    motif: 'code', palette: ['#06261b', '#0f7a4a', '#7bf1a8'], collection: 'Learning', watched: 18, inProgress: 63, addedDaysAgo: 40, lastWatchedDaysAgo: 0.05,
    episodes: Array.from({ length: 30 }, (_, i) => [
      'Setup & First Script', 'Variables and Types', 'Strings in Depth', 'Lists and Tuples', 'Dictionaries', 'Control Flow', 'Loops', 'Functions', 'Modules', 'Files',
      'Error Handling', 'Classes', 'Inheritance', 'Iterators', 'Generators', 'Decorators', 'Virtual Environments', 'Testing Basics', 'Working with APIs', 'Web Scraping',
      'Data with Pandas', 'Plotting', 'SQLite', 'Async Basics', 'CLI Tools', 'Packaging', 'Type Hints', 'Performance', 'Mini Project', 'What’s Next'
    ][i])
  },
  {
    id: 'PLmountainsworld', title: 'Mountains of the World', channel: 'Summit Stories', channelId: 'UCsummitstories',
    motif: 'mountains', palette: ['#16324f', '#3d6e9e', '#e8f1ff'], collection: 'Travel', watched: 6, completed: true, addedDaysAgo: 90, lastWatchedDaysAgo: 12,
    episodes: ['The Himalaya', 'The Andes', 'The Alps', 'Kilimanjaro', 'The Rockies', 'Patagonia']
  },
  {
    id: 'PLhistorymystery', title: 'History’s Greatest Mysteries', channel: 'Past Forward', channelId: 'UCpastforward',
    motif: 'columns', palette: ['#2b1a0e', '#8a5a2b', '#f2d6a2'], collection: 'Documentaries', watched: 0, inProgress: 0, fresh: 3, newEpisodes: 1, addedDaysAgo: 3,
    episodes: ['The Lost Library', 'Builders of the Pyramids', 'The Vanished Colony', 'Secrets of the Silk Road', 'The Bronze Age Collapse', 'Atlantis: Myth or Memory?', 'The Voynich Code', 'Lost Cities of the Amazon', 'The Antikythera Machine']
  },
  {
    id: 'PLhomeworkout14', title: 'Home Workout Challenge', channel: 'Daily Move', channelId: 'UCdailymove',
    motif: 'pulse', palette: ['#3a0b3f', '#b5179e', '#ff99c8'], watched: 4, inProgress: 30, addedDaysAgo: 45, lastWatchedDaysAgo: 2,
    episodes: Array.from({ length: 14 }, (_, i) => `Day ${i + 1}: ${['Full Body', 'Core', 'Legs', 'Mobility', 'HIIT', 'Upper Body', 'Recovery'][i % 7]}`)
  },
  {
    id: 'PLindiegamedev', title: 'Indie Game Devlog', channel: 'Pixel Forge', channelId: 'UCpixelforge',
    motif: 'pixels', palette: ['#0b0a2a', '#4361ee', '#4cc9f0'], collection: 'Learning', watched: 10, inProgress: 0, fresh: 1, newEpisodes: 1, addedDaysAgo: 60, lastWatchedDaysAgo: 4,
    episodes: Array.from({ length: 15 }, (_, i) => `Devlog #${i + 1}: ${['The Idea', 'First Prototype', 'Art Style', 'Movement', 'Enemies', 'Level Design', 'Sound', 'Bosses', 'UI Polish', 'Playtesting', 'Steam Page', 'Trailer', 'Demo Day', 'Bug Hunt', 'Launch!'][i]}`)
  },
  {
    id: 'PLscienceofsleep', title: 'The Science of Sleep', channel: 'Mind Matters', channelId: 'UCmindmatters',
    motif: 'moon', palette: ['#0d1b2a', '#1b263b', '#c8b6ff'], watched: 0, inProgress: 0, addedDaysAgo: 1,
    episodes: ['Why We Sleep', 'Dreams Decoded', 'The Body Clock', 'Sleep and Memory', 'Better Nights']
  },
  {
    id: 'PLrailjourneyseu', title: 'Rail Journeys Across Europe', channel: 'Slow Travel Co.', channelId: 'UCslowtravelco',
    motif: 'rails', palette: ['#1f2a1f', '#52734d', '#f4e285'], collection: 'Travel', watched: 2, inProgress: 55, addedDaysAgo: 25, lastWatchedDaysAgo: 3,
    episodes: ['Night Train to Vienna', 'Through the Swiss Alps', 'The Norwegian Fjords', 'Lisbon to Porto', 'Scottish Highlands', 'Along the Rhine', 'The Balkans Express']
  }
]

/** "More from your channels" and search results (fictional). */
const RECOMMENDED = [
  { id: 'PLreefnightdive', title: 'Night Dives: The Reef After Dark', channel: 'Wild Frontiers', motif: 'waves', palette: ['#001a33', '#00557a', '#7de2fc'] },
  { id: 'PLsolarsystemtr', title: 'A Tour of the Solar System', channel: 'Orbit Lab', motif: 'planets', palette: ['#1a0b2e', '#5a189a', '#ffb3c6'] },
  { id: 'PLdessertstreet', title: 'Sweet Streets: Desserts of Asia', channel: 'Hungry Nomad', motif: 'food', palette: ['#4a0d2b', '#e8590c', '#ffe066'] },
  { id: 'PLjavascript101', title: 'JavaScript for Beginners', channel: 'Byte Sized Dev', motif: 'code', palette: ['#2b2400', '#a68a00', '#ffe066'] },
  { id: 'PLancientempire', title: 'Rise and Fall of Ancient Empires', channel: 'Past Forward', motif: 'columns', palette: ['#331a00', '#a0522d', '#ffe8c2'] },
  { id: 'PLpixelartcours', title: 'Pixel Art from Zero', channel: 'Pixel Forge', motif: 'pixels', palette: ['#14002e', '#7209b7', '#f72585'] }
]

const SEARCH_RESULTS = {
  playlists: [
    { id: 'PLoceanodyssey1', title: 'Ocean Odyssey: Full Series', channel: 'Blue Planet Lab', motif: 'waves', palette: ['#00203f', '#006494', '#a8e6ff'] },
    { id: 'PLcoralrescue22', title: 'Saving the Coral Reefs', channel: 'Reef Watch', motif: 'waves', palette: ['#002b36', '#2a9d8f', '#e9f5db'] },
    { id: 'PLoceanmachines', title: 'Machines of the Deep Ocean', channel: 'Engineering Now', motif: 'rails', palette: ['#0b132b', '#1c2541', '#5bc0be'] },
    { id: 'PLsharkweekdocs', title: 'Sharks: Myths and Facts', channel: 'Wild Frontiers', motif: 'waves', palette: ['#03045e', '#0077b6', '#90e0ef'] }
  ],
  channelPlaylists: [
    { id: 'PLclimateoceans', title: 'Climate and the Oceans', channel: 'Blue Planet Lab', motif: 'moon', palette: ['#0b2545', '#13315c', '#8da9c4'] },
    { id: 'PLplanktonworld', title: 'Plankton: Tiny Giants', channel: 'Blue Planet Lab', motif: 'pixels', palette: ['#003049', '#2a9d8f', '#e9c46a'] },
    { id: 'PLiceandseaserie', title: 'Ice and Sea', channel: 'Blue Planet Lab', motif: 'mountains', palette: ['#023e8a', '#48cae4', '#ffffff'] },
    { id: 'PLcoastalcities1', title: 'Coastal Cities of Tomorrow', channel: 'Blue Planet Lab', motif: 'columns', palette: ['#14213d', '#3a5a40', '#fca311'] }
  ],
  channel: { id: 'UCblueplanetlab', title: 'Blue Planet Lab', description: 'Documentary series about oceans, climate and the life that depends on them. New episode every Friday.', motif: 'waves', palette: ['#00203f', '#006494', '#a8e6ff'] }
}

const escapeXml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch])

/** Deterministic pseudo-random numbers so every run renders identical art. */
function rng(seed) {
  let s = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

function motifShapes(motif, [, mid, accent], random, w, h) {
  const r = () => random()
  switch (motif) {
    case 'waves':
      return Array.from({ length: 5 }, (_, i) => {
        const y = h * (0.45 + i * 0.12)
        const a = 18 + r() * 14
        return `<path d="M0 ${y} Q ${w * 0.25} ${y - a} ${w * 0.5} ${y} T ${w} ${y} V ${h} H 0 Z" fill="${accent}" opacity="${0.12 + i * 0.07}"/>`
      }).join('') + `<circle cx="${w * 0.78}" cy="${h * 0.24}" r="${h * 0.12}" fill="${accent}" opacity="0.35"/>`
    case 'planets':
      return Array.from({ length: 40 }, () => `<circle cx="${r() * w}" cy="${r() * h}" r="${r() * 1.6 + 0.4}" fill="#fff" opacity="${0.4 + r() * 0.6}"/>`).join('') +
        `<circle cx="${w * 0.7}" cy="${h * 0.55}" r="${h * 0.3}" fill="${mid}"/><circle cx="${w * 0.7}" cy="${h * 0.55}" r="${h * 0.3}" fill="url(#shine)"/>` +
        `<ellipse cx="${w * 0.7}" cy="${h * 0.55}" rx="${h * 0.52}" ry="${h * 0.09}" fill="none" stroke="${accent}" stroke-width="5" opacity="0.8" transform="rotate(-14 ${w * 0.7} ${h * 0.55})"/>` +
        `<circle cx="${w * 0.22}" cy="${h * 0.3}" r="${h * 0.07}" fill="${accent}" opacity="0.7"/>`
    case 'food':
      return Array.from({ length: 6 }, (_, i) => `<circle cx="${w * (0.15 + (i % 3) * 0.35)}" cy="${h * (0.38 + Math.floor(i / 3) * 0.4)}" r="${h * (0.14 + r() * 0.06)}" fill="${i % 2 ? accent : mid}" opacity="${0.35 + r() * 0.4}"/>`).join('') +
        `<circle cx="${w * 0.62}" cy="${h * 0.56}" r="${h * 0.28}" fill="none" stroke="${accent}" stroke-width="10" opacity="0.6"/>`
    case 'code':
      return Array.from({ length: 9 }, (_, i) => `<rect x="${w * 0.08 + (i % 3) * 18}" y="${h * 0.18 + i * 22}" width="${60 + r() * 180}" height="9" rx="4" fill="${i % 4 === 0 ? accent : mid}" opacity="0.75"/>`).join('') +
        `<text x="${w * 0.66}" y="${h * 0.66}" font-family="Consolas, monospace" font-size="${h * 0.42}" font-weight="700" fill="${accent}" opacity="0.85" text-anchor="middle">&lt;/&gt;</text>`
    case 'mountains':
      return `<circle cx="${w * 0.75}" cy="${h * 0.25}" r="${h * 0.09}" fill="${accent}" opacity="0.8"/>` +
        `<polygon points="0,${h} ${w * 0.25},${h * 0.35} ${w * 0.5},${h} " fill="${mid}" opacity="0.9"/>` +
        `<polygon points="${w * 0.3},${h} ${w * 0.6},${h * 0.22} ${w * 0.9},${h}" fill="${mid}"/>` +
        `<polygon points="${w * 0.6},${h * 0.22} ${w * 0.52},${h * 0.36} ${w * 0.68},${h * 0.36}" fill="${accent}"/>` +
        `<polygon points="${w * 0.25},${h * 0.35} ${w * 0.19},${h * 0.48} ${w * 0.31},${h * 0.48}" fill="${accent}"/>` +
        `<polygon points="${w * 0.65},${h} ${w * 0.85},${h * 0.45} ${w},${h * 0.7} ${w},${h}" fill="${mid}" opacity="0.7"/>`
    case 'columns':
      return Array.from({ length: 5 }, (_, i) => `<rect x="${w * (0.12 + i * 0.16)}" y="${h * 0.35}" width="${w * 0.07}" height="${h * 0.5}" fill="${accent}" opacity="0.55"/>`).join('') +
        `<polygon points="${w * 0.06},${h * 0.35} ${w * 0.5},${h * 0.12} ${w * 0.94},${h * 0.35}" fill="${accent}" opacity="0.7"/>` +
        `<rect x="${w * 0.06}" y="${h * 0.85}" width="${w * 0.88}" height="${h * 0.05}" fill="${accent}" opacity="0.7"/>`
    case 'pulse':
      return `<polyline points="0,${h * 0.6} ${w * 0.25},${h * 0.6} ${w * 0.32},${h * 0.3} ${w * 0.4},${h * 0.85} ${w * 0.48},${h * 0.45} ${w * 0.55},${h * 0.6} ${w},${h * 0.6}" fill="none" stroke="${accent}" stroke-width="10" stroke-linejoin="round"/>` +
        Array.from({ length: 3 }, (_, i) => `<circle cx="${w * 0.8}" cy="${h * 0.35}" r="${h * (0.08 + i * 0.07)}" fill="none" stroke="${accent}" stroke-width="3" opacity="${0.7 - i * 0.2}"/>`).join('')
    case 'pixels':
      return Array.from({ length: 60 }, () => {
        const size = 18
        return `<rect x="${Math.floor(r() * (w / size)) * size}" y="${Math.floor(r() * (h / size)) * size}" width="${size}" height="${size}" fill="${r() > 0.5 ? accent : mid}" opacity="${0.3 + r() * 0.6}"/>`
      }).join('')
    case 'moon':
      return Array.from({ length: 30 }, () => `<circle cx="${r() * w}" cy="${r() * h * 0.7}" r="${r() * 1.5 + 0.5}" fill="#fff" opacity="${0.4 + r() * 0.5}"/>`).join('') +
        `<circle cx="${w * 0.68}" cy="${h * 0.42}" r="${h * 0.22}" fill="${accent}"/><circle cx="${w * 0.74}" cy="${h * 0.36}" r="${h * 0.2}" fill="${mid}"/>` +
        `<path d="M0 ${h * 0.82} Q ${w * 0.5} ${h * 0.7} ${w} ${h * 0.82} V ${h} H 0 Z" fill="${mid}" opacity="0.9"/>`
    case 'rails':
      return `<polygon points="${w * 0.42},${h * 0.35} ${w * 0.58},${h * 0.35} ${w * 0.95},${h} ${w * 0.05},${h}" fill="${mid}" opacity="0.8"/>` +
        Array.from({ length: 7 }, (_, i) => { const y = h * (0.4 + i * i * 0.016); const half = w * (0.09 + i * i * 0.012); return `<rect x="${w / 2 - half}" y="${y}" width="${half * 2}" height="${3 + i * 1.5}" fill="${accent}" opacity="0.8"/>` }).join('') +
        `<circle cx="${w * 0.5}" cy="${h * 0.25}" r="${h * 0.1}" fill="${accent}" opacity="0.6"/>`
    default:
      return ''
  }
}

/**
 * Original thumbnail artwork. Series covers carry no text (the UI already
 * shows the title); episode thumbnails get an "EP n" badge and short label.
 */
function thumbnailSvg({ seed, motif, palette, label = '', badge = '', w = 1280, h = 720 }) {
  const [dark, mid, accent] = palette
  const random = rng(seed)
  const angle = Math.floor(random() * 60) - 30
  const textBlock = label
    ? `<rect x="0" y="${h * 0.62}" width="${w}" height="${h * 0.38}" fill="url(#fade)"/>` +
      `<text x="${w * 0.05}" y="${h * 0.9}" font-family="Segoe UI, Arial, sans-serif" font-size="${h * 0.1}" font-weight="800" fill="#fff">${escapeXml(label)}</text>`
    : ''
  const badgeBlock = badge
    ? `<rect x="${w * 0.05}" y="${h * 0.08}" rx="${h * 0.035}" width="${badge.length * h * 0.055 + h * 0.08}" height="${h * 0.12}" fill="${accent}"/>` +
      `<text x="${w * 0.05 + h * 0.04}" y="${h * 0.165}" font-family="Segoe UI, Arial, sans-serif" font-size="${h * 0.075}" font-weight="800" fill="${dark}">${escapeXml(badge)}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
    <radialGradient id="shine" cx=".3" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${motifShapes(motif, palette, random, w, h)}
  ${textBlock}${badgeBlock}
</svg>`
}

/** Image URL scheme served by the screenshot script's request router. */
const coverUrl = id => `https://i.ytimg.com/vi/cover-${id}/maxresdefault.jpg`
const episodeUrl = (id, n) => `https://i.ytimg.com/vi/ep-${id}-${n}/hqdefault.jpg`

/** Library in the extension's stored series shape (validated by normalizeSeries on import). */
function buildLibrary(now = Date.now()) {
  const library = {}
  for (const s of SERIES) {
    const total = s.episodes.length
    const freshFrom = total - (s.fresh || 0)
    const videos = s.episodes.map((title, i) => {
      const watched = i < s.watched
      const inFlight = !watched && i === s.watched && s.inProgress > 0
      const duration = 540 + ((i * 337 + s.id.length * 61) % 1500)
      const publishedDaysAgo = i >= freshFrom ? 1 + (total - 1 - i) : 14 + (total - i) * 6
      return {
        id: `${s.id.slice(2, 10)}${String(i + 1).padStart(3, '0')}`,
        title,
        thumbnail: episodeUrl(s.id, i + 1),
        publishedAt: new Date(now - publishedDaysAgo * DAY).toISOString(),
        position: i,
        duration,
        watched,
        progress: watched ? 100 : inFlight ? s.inProgress : 0,
        resumeTime: inFlight ? Math.round(duration * s.inProgress / 100) : 0,
        watchedAt: watched ? now - (s.lastWatchedDaysAgo ?? 30) * DAY - (s.watched - i) * 3_600_000 : null,
        lastWatchedAt: watched || inFlight ? now - (s.lastWatchedDaysAgo ?? 30) * DAY : null,
        totalWatchedTime: watched ? duration : 0,
        progressUpdatedAt: watched || inFlight ? now - (s.lastWatchedDaysAgo ?? 30) * DAY : 0
      }
    })
    library[s.id] = {
      playlistId: s.id,
      title: s.title,
      description: `${s.title} — a ${total}-part series by ${s.channel}.`,
      thumbnail: coverUrl(s.id),
      channelTitle: s.channel,
      channelId: s.channelId,
      videoCount: total,
      videos,
      newEpisodesCount: s.newEpisodes || 0,
      completed: Boolean(s.completed),
      collection: s.collection || '',
      addedAt: now - s.addedDaysAgo * DAY,
      lastRefreshedAt: now,
      localUpdatedAt: now
    }
  }
  return library
}

const ART = Object.fromEntries([
  ...SERIES.map(s => [s.id, s]),
  ...RECOMMENDED.map(r => [r.id, r]),
  ...SEARCH_RESULTS.playlists.map(p => [p.id, p]),
  ...SEARCH_RESULTS.channelPlaylists.map(p => [p.id, p]),
  [SEARCH_RESULTS.channel.id, SEARCH_RESULTS.channel]
])

/** Renders the SVG for an i.ytimg.com URL produced above. */
function imageForUrl(url) {
  const match = new URL(url).pathname.match(/^\/vi\/(cover|ep)-([A-Za-z0-9_]+?)(?:-(\d+))?\/[a-z]+\.jpg$/)
  if (!match) return null
  const [, kind, id, n] = match
  const art = ART[id]
  if (!art) return null
  if (kind === 'cover') return thumbnailSvg({ seed: id, motif: art.motif, palette: art.palette })
  const title = art.episodes?.[Number(n) - 1] || ''
  const short = title.length > 26 ? `${title.slice(0, 25)}…` : title
  return thumbnailSvg({ seed: `${id}-${n}`, motif: art.motif, palette: art.palette, badge: `EP ${n}`, label: short, w: 640, h: 360 })
}

/** Fake YouTube Data API (served at the Worker URL). */
function apiResponse(url) {
  const q = url.searchParams
  const endpoint = url.pathname.slice(1)
  const playlistItem = p => ({ id: p.id, snippet: { title: p.title, channelTitle: p.channel, channelId: `UC${p.channel.replace(/\W/g, '').toLowerCase()}`, thumbnails: { high: { url: coverUrl(p.id) } } }, contentDetails: { itemCount: 8 + p.id.length % 9 } })
  if (endpoint === 'playlists' && q.get('channelId')) {
    if (q.get('channelId') === SEARCH_RESULTS.channel.id) return { items: SEARCH_RESULTS.channelPlaylists.map(playlistItem) }
    const series = SERIES.find(s => s.channelId === q.get('channelId'))
    return { items: RECOMMENDED.filter(r => r.channel === series?.channel).map(playlistItem) }
  }
  if (endpoint === 'search') {
    const c = SEARCH_RESULTS.channel
    return { items: [
      ...SEARCH_RESULTS.playlists.map(p => ({ id: { kind: 'youtube#playlist', playlistId: p.id }, snippet: playlistItem(p).snippet })),
      { id: { kind: 'youtube#channel' }, snippet: { channelId: c.id, title: c.title, description: c.description, thumbnails: { high: { url: coverUrl(c.id) } } } }
    ] }
  }
  return { items: [] }
}

export { SERIES, buildLibrary, imageForUrl, apiResponse }
