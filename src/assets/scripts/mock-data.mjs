// Mock data for Chrome Web Store screenshots
// Every video ID verified working (HTTP 200) for hqdefault.jpg

const now = Date.now()
const DAY = 86400000

function vid(id, title, daysAgo, pos, secs, watched = false) {
  return {
    id,
    title,
    description: title,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    publishedAt: new Date(now - daysAgo * DAY).toISOString(),
    position: pos,
    duration: secs,
    watched,
    progress: watched ? 100 : 0
  }
}

function srs(plId, title, chId, chTitle, thumbId, videos, opts = {}) {
  return {
    playlistId: plId, title,
    description: title,
    thumbnail: `https://i.ytimg.com/vi/${thumbId}/hqdefault.jpg`,
    channelId: chId, channelTitle: chTitle,
    videoCount: videos.length, videos,
    completed: opts.completed || false,
    lastWatchedAt: opts.lastWatchedAt || null,
    addedAt: now - (opts.addedDaysAgo || 0) * DAY,
    channelPlaylists: []
  }
}

const SERIES = [
  // 1 — VIRAL HITS
  srs('viral_hits', 'Viral Hits', 'UCpDJl2EmP7Oh90FvG2RAw', 'Viral Vibes', 'dQw4w9WgXcQ', [
    vid('dQw4w9WgXcQ', 'Rick Astley — Never Gonna Give You Up', 10, 1, 212, false),
    vid('jNQXAC9IVRw', 'Me at the zoo', 14, 2, 18, false),
    vid('9bZkp7q19f0', 'PSY — Gangnam Style', 7, 3, 252, false),
    vid('XqZsoesa55w', 'Baby Shark Dance', 3, 4, 136, true),
    vid('kJQP7kiw5Fk', 'Luis Fonsi — Despacito', 5, 5, 282, false),
  ], { addedDaysAgo: 30 }),

  // 2 — GAMING
  srs('gaming_hub', 'Gaming Hub', 'UC4R8DVoMoM8yXPDNAmBKx3A', 'Game Central', 'RgKAFK5djSk', [
    vid('RgKAFK5djSk', 'Wiz Khalifa — See You Again', 20, 1, 229, false),
    vid('JGwWNGJdvx8', 'Ed Sheeran — Shape of You', 45, 2, 253, true),
    vid('fRh_vgS2dFE', 'Justin Bieber — Sorry', 12, 3, 206, false),
    vid('HP-MbfHFUqs', 'Taylor Swift — Shake It Off', 60, 4, 242, false),
    vid('YQHsXMglC9A', 'Adele — Hello', 2, 5, 367, true),
    vid('7wtfhZwyrcc', 'Imagine Dragons — Believer', 90, 6, 204, false),
  ], { addedDaysAgo: 60, lastWatchedAt: now - 2 * DAY }),

  // 3 — SCIENCE & SPACE
  srs('science_lab', 'Science & Space', 'UCsXVk37bltHxD1rDPwtNM8Q', 'Science Lab', 'dQw4w9WgXcQ', [
    vid('nfWlot6h_JM', 'Taylor Swift — Shake It Off', 50, 1, 233, true),
    vid('QcIy9NiNbmo', 'Taylor Swift — Bad Blood', 35, 2, 244, false),
    vid('CevxZvSJLk8', 'Katy Perry — Roar', 20, 3, 253, false),
    vid('kXYiU_JCYtU', 'Mark Ronson — Uptown Funk', 10, 4, 271, false),
    vid('pc0mxOXbWIU', 'Taylor Swift — Blank Space', 5, 5, 231, false),
  ], { addedDaysAgo: 80 }),

  // 4 — COOKING SHOW
  srs('cooking_show', 'Cooking Show', 'UCJFp8uSYCjXOMnkUyb3CQ3Q', 'Tasty Kitchen', 'hT_nvWreIhg', [
    vid('hT_nvWreIhg', 'OneRepublic — Counting Stars', 18, 1, 266, true),
    vid('09R8_2nJtjg', 'Maroon 5 — Sugar', 25, 2, 299, false),
    vid('fKopy74weus', 'Imagine Dragons — Thunder', 8, 3, 195, false),
    vid('OPf0YbXqDm0', 'Mark Ronson — Uptown Funk', 32, 4, 271, false),
    vid('450p7goxZqg', 'John Legend — All of Me', 15, 5, 269, true),
  ], { addedDaysAgo: 45, lastWatchedAt: now - 4 * DAY }),

  // 5 — WORLD TRAVEL
  srs('world_travel', 'World Travel', 'UCpVm7bg6pXKo1Pr6k5kxG9A', 'Earth Explorer', 'kffacxfA7G4', [
    vid('kffacxfA7G4', 'Justin Bieber — Baby', 40, 1, 220, true),
    vid('pRpeEdMmmQ0', 'Shakira — Waka Waka', 22, 2, 206, false),
    vid('0KSOMA3QBU0', 'Katy Perry — Dark Horse', 55, 3, 224, false),
    vid('e-ORhEE9VVg', 'Taylor Swift — I Knew You Were Trouble', 12, 4, 232, false),
    vid('2Vv-BfVoq4g', 'Ed Sheeran — Perfect', 30, 5, 263, true),
    vid('IdneKLhsWOQ', 'Silentó — Watch Me', 70, 6, 191, false),
  ], { addedDaysAgo: 120 }),

  // 6 — FITNESS
  srs('fitness_club', 'Fitness Club', 'UCXgYHB5jpHdXfqjI_h5YJ2w', 'Fit Life', 'nfs8NYg7yQM', [
    vid('nfs8NYg7yQM', 'Fifth Harmony — Work from Home', 5, 1, 207, false),
    vid('dQw4w9WgXcQ', 'Rick Astley — Never Gonna Give You Up', 8, 2, 212, true),
    vid('jNQXAC9IVRw', 'Me at the zoo', 15, 3, 18, false),
    vid('9bZkp7q19f0', 'PSY — Gangnam Style', 3, 4, 252, false),
    vid('kJQP7kiw5Fk', 'Luis Fonsi — Despacito', 10, 5, 282, true),
  ], { addedDaysAgo: 25, lastWatchedAt: now - 1 * DAY }),

  // 7 — MUSIC LAB
  srs('music_lab', 'Music Lab', 'UCouPeqI8YrQJcOHa4F7xHPw', 'Beat Lab', '60ItHLz5WEA', [
    vid('60ItHLz5WEA', 'Alan Walker — Faded', 30, 1, 212, true),
    vid('FM7MFYoylVs', 'Martin Garrix — Animals', 20, 2, 180, false),
    vid('p7ZsBPK656s', 'Avicii — Wake Me Up', 40, 3, 247, false),
    vid('RgKAFK5djSk', 'Wiz Khalifa — See You Again', 12, 4, 229, false),
    vid('JGwWNGJdvx8', 'Ed Sheeran — Shape of You', 50, 5, 253, false),
  ], { addedDaysAgo: 90 }),

  // 8 — MOVIE CLUB (completed)
  srs('movie_club', 'Movie Club', 'UCeY0GLeQkOZ66Q8hZ6O7HnA', 'Screen Talk', 'HP-MbfHFUqs', [
    vid('HP-MbfHFUqs', 'Taylor Swift — Shake It Off', 60, 1, 242, true),
    vid('YQHsXMglC9A', 'Adele — Hello', 45, 2, 367, true),
    vid('fRh_vgS2dFE', 'Justin Bieber — Sorry', 80, 3, 206, true),
    vid('7wtfhZwyrcc', 'Imagine Dragons — Believer', 100, 4, 204, true),
    vid('CevxZvSJLk8', 'Katy Perry — Roar', 5, 5, 253, true),
  ], { addedDaysAgo: 150, completed: true, lastWatchedAt: now - 100 * DAY }),
]

export { SERIES }
