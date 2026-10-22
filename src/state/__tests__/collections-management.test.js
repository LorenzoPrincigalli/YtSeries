import { describe, it, expect } from 'vitest';
import { Store } from '../store.js';

function fixture() {
  const store = new Store();
  for (const id of ['a', 'b', 'c']) store.addSeries({playlistId:id,title:id,thumbnail:'https://i.ytimg.com/'+id+'.jpg',videos:[]});
  store.setSeriesCollection('a','Design');
  store.setSeriesCollection('b','Design');
  store.setSeriesCollection('c','Cinema');
  return store;
}
describe('collection management', () => {
  it('creates a populated collection only after validating all selected series', () => {
    const store = fixture();
    const before = store.getState();
    expect(() => store.createCollection('New', ['a', 'missing'])).toThrow();
    expect(store.getState()).toEqual(before);
    store.createCollection('New', ['a', 'b', 'a']);
    expect(store.getState().collections).toContain('New');
    expect(store.getSeriesById('a').collection).toBe('New');
    expect(store.getSeriesById('b').collection).toBe('New');
    expect(store.getSeriesById('c').collection).toBe('Cinema');
  });
  it('persists empty collections, renames them and keeps them after moving the last series', async () => {
    const store = fixture();
    store.createCollection('  Later  ');
    expect(() => store.createCollection('Later')).toThrow('COLLECTION_EXISTS');
    expect(() => store.createCollection('Design')).toThrow('COLLECTION_EXISTS');
    expect(() => store.createCollection(' ')).toThrow('INVALID_COLLECTION');
    expect(store.editCollection('Later', 'Learning', '')).toEqual([]);
    store.moveCollectionSeries(['a'], 'Learning');
    store.moveCollectionSeries(['a'], 'Cinema');
    let saved;
    await store.saveToStorage({setLocal: async value => { saved = value; }, set: async () => {}});
    const reloaded = new Store();
    await reloaded.loadFromStorage({get: async () => ({}), getLocal: async () => saved});
    expect(reloaded.getState().collections).toEqual(['Learning']);
    reloaded.reset();
    expect(reloaded.getState().collections).toEqual([]);
  });
  it('renames all members, sets a cover and touches clocks', () => {
    const store = fixture();
    const before = store.getSeriesById('a').collectionUpdatedAt;
    expect(store.editCollection('Design','Tutorial','https://i.ytimg.com/a.jpg')).toEqual(['a','b']);
    expect(store.getSeriesById('b')).toMatchObject({collection:'Tutorial',collectionCover:'https://i.ytimg.com/a.jpg'});
    expect(store.getSeriesById('a').collectionUpdatedAt).toBeGreaterThan(before);
    store.editCollection('Tutorial','Tutorial','');
    expect(store.getSeriesById('b').collectionCover).toBe('');
  });
  it('rejects collisions and invalid cover without partial mutations', () => {
    const store = fixture();
    const before = store.getState();
    expect(()=>store.editCollection('Design','Cinema','')).toThrow('COLLECTION_EXISTS');
    expect(()=>store.editCollection('Design','Other','javascript:alert(1)')).toThrow('INVALID_COVER');
    expect(store.getState()).toEqual(before);
  });
  it('validates the entire move before mutation and inherits destination cover', () => {
    const store = fixture();
    store.editCollection('Cinema','Cinema','https://i.ytimg.com/c.jpg');
    const before = store.getState();
    expect(()=>store.moveCollectionSeries(['a','missing'],'Cinema')).toThrow();
    expect(store.getState()).toEqual(before);
    expect(store.moveCollectionSeries(['a','b','a'],'Cinema')).toEqual(['a','b']);
    expect(store.getSeriesById('a').collectionCover).toBe('https://i.ytimg.com/c.jpg');
    store.moveCollectionSeries(['a'],'');
    expect(store.getSeriesById('a')).toMatchObject({collection:'',collectionCover:''});
  });
});
