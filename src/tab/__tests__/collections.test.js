import { describe, it, expect } from 'vitest';
import { groupCollections } from '../components/collections.js';

describe('collection grouping', () => {
  it('includes explicitly saved empty collections without duplicate groups', () => {
    const groups = groupCollections([{collection:'Design'}], ['Later', 'Design']);
    expect(groups.map(([name, items]) => [name, items.length])).toEqual([['Design', 1], ['Later', 0]]);
  });
  it('groups existing assignments without changing the library', () => {
    const series = [{ playlistId:'1', collection:'Design' }, { playlistId:'2' },
      { playlistId:'3', collection:'Design' }, { playlistId:'4', collection:'Cinema' }];
    const before = structuredClone(series);
    expect(groupCollections(series).map(([name, items]) => [name, items.length]))
      .toEqual([['Cinema', 1], ['Design', 2]]);
    expect(series).toEqual(before);
  });
  it('supports arbitrary names safely and empty libraries', () => {
    expect(groupCollections([])).toEqual([]);
    expect(groupCollections([{collection:'__proto__'}])[0][0]).toBe('__proto__');
  });
});
