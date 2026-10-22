// Presentation-only predicates: state mutations remain in the background worker.
export function isInProgress(series) {
  const videos = series.videos || [];
  return !series.completed && videos.some(video => !video.watched) &&
    videos.some(video => video.watched || video.resumeTime > 0 || video.progress > 0);
}
