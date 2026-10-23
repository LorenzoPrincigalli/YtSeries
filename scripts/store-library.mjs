// Library for the Chrome Web Store screenshots: real YouTube playlists from the
// channels that publish them. The extension fetches them live (PLAYLIST_ADD,
// through the Worker); only the viewing state a regular user would have built
// up is staged here.
const DAY = 86_400_000

/**
 * watched: episodes already seen · inProgress: % of the next one · addedDaysAgo
 * orders the hero (most recently added series in progress first).
 */
const LIBRARY = [
  { playlistId: 'PL50KW6aT4UgzeTkqx8arOeJp4MtgpIEn2', collection: 'Documentaries', watched: 3, inProgress: 42, addedDaysAgo: 1, lastWatchedDaysAgo: 0, newEpisodes: 2 }, // BBC Earth — Planet Earth III
  { playlistId: 'PL7rb3uMaYmjHqT_JUcQYCBa4nEtfDKuSa', collection: 'Documentaries', watched: 5, inProgress: 65, addedDaysAgo: 6, lastWatchedDaysAgo: 1 }, // WWF UK — Our Planet
  { playlistId: 'PLAhTBeRe8IhMmRve_rSfAgL_dtEXkKh8Z', collection: 'Documentaries', watched: 0, inProgress: 0, addedDaysAgo: 3 }, // LEMMiNO — Documentaries
  { playlistId: 'PLFs4vir_WsTwEd-nJgVJCZPNL3HALHHpF', collection: 'Science', watched: 12, inProgress: 30, addedDaysAgo: 9, lastWatchedDaysAgo: 2 }, // Kurzgesagt — The Universe
  { playlistId: 'PLkahZjV5wKe9EKkCQ25-XxvtRWgW-BtC3', collection: 'Science', watched: 7, inProgress: 0, addedDaysAgo: 12, lastWatchedDaysAgo: 4, newEpisodes: 1 }, // Veritasium — Engineering
  { playlistId: 'PL8dPuuaLjXtPAJr1ysd5yGIyiSFuh0mIL', collection: 'Science', completed: true, addedDaysAgo: 60, lastWatchedDaysAgo: 20 }, // CrashCourse — Astronomy
  { playlistId: 'PLgeXOVaJo_gnqGIJeyg4GWcU4Ukx1yUXS', collection: 'Science', watched: 0, inProgress: 0, addedDaysAgo: 2 }, // Mark Rober — Mega Experiments
  { playlistId: 'PLTzMGnJjrsSyDJU9XClzZtuJ6GAIsvRk7', collection: 'Food & Travel', watched: 6, inProgress: 55, addedDaysAgo: 15, lastWatchedDaysAgo: 3 }, // Gordon Ramsay — Ultimate Cookery Course
  { playlistId: 'PLeoy0zUu6bqlV_IYKPec6F6lLrDIJdmsn', collection: 'Food & Travel', watched: 2, inProgress: 0, addedDaysAgo: 20, lastWatchedDaysAgo: 8 }, // Mark Wiens — Street Food Tours
  { playlistId: 'PLirGII1_qwvv3bV-eNIAE2NuFMsVYQTDD', collection: 'Food & Travel', watched: 0, inProgress: 0, addedDaysAgo: 4, newEpisodes: 3 } // Kara and Nate — 2026 Travel Vlogs
]

/** Series the screenshots open by id. */
const HERO_ID = LIBRARY[0].playlistId

/**
 * Applies the staged viewing state to the series the extension fetched.
 * @param {Record<string, any>} seriesMap  STATE_GET().state.series
 */
function stageLibrary(seriesMap, now = Date.now()) {
  /** @type {Record<string, any>} */
  const staged = {}
  for (const plan of LIBRARY) {
    const series = seriesMap[plan.playlistId]
    if (!series) throw new Error(`playlist ${plan.playlistId} was not added`)
    const watchedUntil = plan.completed ? series.videos.length : plan.watched
    const seenAt = now - (plan.lastWatchedDaysAgo ?? 30) * DAY
    const videos = series.videos.map((video, i) => {
      const watched = i < watchedUntil
      const inFlight = !watched && i === watchedUntil && plan.inProgress > 0
      const duration = video.duration || 600
      return {
        ...video,
        watched,
        progress: watched ? 100 : inFlight ? plan.inProgress : 0,
        resumeTime: inFlight ? Math.round(duration * plan.inProgress / 100) : 0,
        watchedAt: watched ? seenAt - (watchedUntil - i) * 3_600_000 : null,
        lastWatchedAt: watched || inFlight ? seenAt : null,
        totalWatchedTime: watched ? duration : 0
      }
    })
    staged[plan.playlistId] = {
      ...series,
      videos,
      completed: Boolean(plan.completed),
      collection: plan.collection,
      newEpisodesCount: plan.newEpisodes || 0,
      addedAt: now - plan.addedDaysAgo * DAY,
      localUpdatedAt: now
    }
  }
  return staged
}

export { LIBRARY, HERO_ID, stageLibrary }
