// @ts-check
// Everything that depends on YouTube's markup lives here, so a YouTube
// redesign means updating selectors in one file.

export const SELECTORS = {
  video: '.video-stream, .html5-main-video',
  player: '#movie_player, .html5-video-player',
  watchFlexy: 'ytd-watch-flexy',
  miniPlayer: '.ytp-miniplayer',
  guideSections: 'ytd-guide-section-renderer',
  playlistActions: '#playlist-action-menu #top-level-buttons-computed',
  playlistHeader: '#page-manager > ytd-browse > yt-page-header-renderer > yt-page-header-view-model > div.ytPageHeaderViewModelScrollContainer',
  blockingDialog: '[aria-modal="true"], ytd-consent-bump-v2-renderer',
  genreMeta: 'meta[itemprop="genre"]',
  playlistTitle: '#header .yt-dynamic-text-view-model'
}

/** @returns {HTMLVideoElement | null} */
export function findVideo() {
  return document.querySelector(SELECTORS.video)
}

export function isAdPlaying() {
  return Boolean(document.querySelector(SELECTORS.player)?.classList.contains('ad-showing'))
}

/** A YouTube dialog (consent, sign-in) is on screen: do not touch the page. */
export function isBlockingDialogOpen() {
  return Boolean(document.querySelector(SELECTORS.blockingDialog))
}

/** @returns {'mini' | 'full' | 'cinema' | 'normal'} */
export function playerMode() {
  if (document.querySelector(SELECTORS.miniPlayer)) return 'mini'
  if (document.fullscreenElement) return 'full'
  if (document.querySelector(`${SELECTORS.watchFlexy}[theater-mode]`)) return 'cinema'
  return 'normal'
}

/** Music videos/playlists auto-advance on their own; no "next episode" prompt. */
export function isMusicContent() {
  const genre = /** @type {HTMLMetaElement | null} */ (document.querySelector(SELECTORS.genreMeta))?.content?.toLowerCase() || ''
  if (genre.includes('music')) return true
  const title = document.querySelector(SELECTORS.playlistTitle)?.textContent?.toLowerCase() || ''
  return title.includes('music')
}

/** @returns {{ videoId: string | null, playlistId: string | null }} */
export function currentPageIds() {
  const url = new URL(window.location.href)
  return { videoId: url.searchParams.get('v'), playlistId: url.searchParams.get('list') }
}
