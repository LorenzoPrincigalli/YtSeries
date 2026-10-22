import { t } from '../../shared/i18n.js';

export function groupCollections(series, names = []) {
  const groups = new Map(names.map(name => [name, []]));
  for (const item of series) {
    if (!item.collection) continue;
    if (!groups.has(item.collection)) groups.set(item.collection, []);
    groups.get(item.collection).push(item);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
}

export function renderCollections(series, selected, onSelect, names = [], onCreate) {
  const groups = groupCollections(series, names);
  const section = document.createElement('section');
  section.className = 'collections-section';
  section.setAttribute('aria-label', t('your_collections'));
  const heading = document.createElement('h2');
  heading.textContent = t('your_collections');
  const hint = document.createElement('p');
  hint.className = 'collections-hint';
  hint.textContent = t('collections_hint');
  section.append(heading, hint);
  const grid = document.createElement('div');
  grid.className = 'collections-shelf';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'collection-tile collection-add';
  add.setAttribute('aria-label', t('create_collection'));
  add.title = t('create_collection');
  const plus = document.createElement('span');
  plus.className = 'collection-cover collection-add-cover';
  plus.setAttribute('aria-hidden', 'true');
  plus.textContent = '+';
  add.append(plus);
  add.addEventListener('click', () => onCreate?.());
  grid.append(add);
  for (const [name, items] of [['', series], ...groups]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'collection-tile';
    button.dataset.collection = name;
    button.setAttribute('aria-pressed', String(name === selected));
    const cover = document.createElement('span');
    cover.className = 'collection-cover';
    cover.setAttribute('aria-hidden', 'true');
    const custom = name && [...items].sort((a, b) => (b.collectionUpdatedAt || 0) - (a.collectionUpdatedAt || 0))[0]?.collectionCover;
    if (custom) cover.classList.add('collection-cover-custom');
    for (let index = 0; index < (custom ? 1 : 4); index++) {
      const cell = document.createElement('span');
      cell.className = 'collection-cover-cell';
      const item = items[index];
      const source = custom || item?.thumbnail || item?.videos?.[0]?.thumbnail;
      if (source) {
        const img = document.createElement('img');
        img.src = source;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => img.remove(), { once: true });
        cell.append(img);
      }
      cover.append(cell);
    }
    const title = document.createElement('span');
    title.className = 'collection-name';
    title.textContent = name || t('all_saved');
    const count = document.createElement('span');
    count.className = 'collection-count';
    count.textContent = t('collection_series_count', { n: items.length });
    button.append(cover, title, count);
    button.addEventListener('click', () => onSelect(name));
    grid.append(button);
  }
  section.append(grid);
  return section;
}
