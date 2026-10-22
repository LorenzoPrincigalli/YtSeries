import { describe, it, expect } from 'vitest';
import { isInProgress } from '../seriesView.js';

describe('watching classification', () => {
  it('includes a partially started first episode', () => {
    expect(isInProgress({ videos: [{ resumeTime: 42 }] })).toBe(true);
    expect(isInProgress({ videos: [{ progress: 0.2 }] })).toBe(true);
  });
  it('includes a started series with episodes remaining', () => {
    expect(isInProgress({ videos: [{ watched: true }, { watched: false }] })).toBe(true);
  });
  it('excludes empty, unstarted, fully watched and explicitly completed series', () => {
    for (const series of [{ videos: [] }, { videos: [{}] }, { videos: [{ watched: true }] },
      { completed: true, videos: [{ resumeTime: 42 }] }]) {
      expect(isInProgress(series)).toBe(false);
    }
  });
});
