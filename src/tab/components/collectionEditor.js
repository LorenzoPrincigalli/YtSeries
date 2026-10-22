import { t } from '../../shared/i18n.js';

export function openCollectionEditor({ name, series, collections, mode, onSave }) {
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'collection-editor';
  const form = document.createElement('form');
  const title = document.createElement('h2');
  title.id = 'collectionEditorTitle';
  title.textContent = t(mode === 'add' ? 'add_collection_series' : mode === 'create' ? 'create_collection' : mode === 'edit' ? 'edit_collection' : 'move_series');
  dialog.setAttribute('aria-labelledby', title.id);
  form.append(title);
  let fieldIndex = 0;
  const field = (labelText, input) => {
    const label = document.createElement('label');
    label.className = 'collection-editor-field';
    const text = document.createElement('span');
    text.id = `collection-field-${fieldIndex++}`;
    input.setAttribute('aria-labelledby', text.id);
    text.textContent = labelText;
    label.append(text, input);
    form.append(label);
  };
  const nameInput = document.createElement('input');
  nameInput.maxLength = 40;
  const cover = document.createElement('select');
  const destination = document.createElement('select');
  const checks = [];
  if (mode === 'create' || mode === 'add') {
    dialog.classList.add('collection-editor-create');
    nameInput.required = true;
    field(t('collection_name'), nameInput);
    if (mode === 'add') { nameInput.value = name; nameInput.readOnly = true; }
    const hint = document.createElement('p');
    hint.className = 'collections-hint';
    hint.textContent = t('collection_select_hint');
    form.append(hint);
    const count = document.createElement('p');
    count.className = 'collection-selection-count';
    count.setAttribute('aria-live', 'polite');
    const updateCount = () => { count.textContent = t('collection_selected_count', { n: checks.filter(input => input.checked).length }); };
    const grid = document.createElement('div');
    grid.className = 'collection-select-grid';
    for (const item of series) {
      const card = document.createElement('label');
      card.className = 'collection-select-card';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = item.playlistId;
      if (mode === 'add' && item.collection === name) { input.checked = true; input.disabled = true; }
      input.addEventListener('change', updateCount);
      checks.push(input);
      const thumb = document.createElement('span');
      thumb.className = 'collection-select-thumb';
      const source = item.thumbnail || item.videos?.[0]?.thumbnail;
      if (source) {
        const img = document.createElement('img');
        img.src = source;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => img.remove(), { once: true });
        thumb.append(img);
      }
      const text = document.createElement('span');
      text.className = 'collection-select-title';
      text.textContent = item.title;
      card.append(input, thumb, text);
      if (item.collection) {
        const current = document.createElement('span');
        current.className = 'collection-select-current';
        current.textContent = item.collection;
        card.append(current);
      }
      grid.append(card);
    }
    updateCount();
    form.append(count, grid);
  } else if (mode === 'edit') {
    nameInput.value = name;
    nameInput.required = true;
    field(t('collection_name'), nameInput);
    const automatic = new Option(t('automatic_cover'), '');
    cover.append(automatic);
    const current = [...series].sort((a,b) => (b.collectionUpdatedAt || 0) - (a.collectionUpdatedAt || 0))[0]?.collectionCover || '';
    const choices = new Map();
    for (const s of series) {
      for (const item of [s, ...(s.videos || [])]) {
        if (item.thumbnail?.startsWith('https://')) choices.set(item.thumbnail, item.title);
      }
    }
    if (current && !choices.has(current)) choices.set(current, t('current_cover'));
    for (const [url, label] of choices) cover.append(new Option(label, url));
    cover.value = current;
    field(t('collection_cover'), cover);
    const preview = document.createElement('img');
    preview.className = 'collection-editor-preview';
    preview.alt = t('collection_cover');
    const update = () => { preview.hidden = !cover.value; if (cover.value) preview.src = cover.value; else preview.removeAttribute('src'); };
    cover.addEventListener('change', update);
    update();
    form.append(preview);
  } else {
    const list = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = t('select_series');
    list.append(legend);
    list.className = 'collection-move-list';
    for (const s of series) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = s.playlistId;
      checks.push(input);
      label.append(input, document.createTextNode(s.title));
      list.append(label);
    }
    form.append(list);
    destination.append(new Option(t('no_folder'), ''));
    for (const collection of collections.filter(c => c !== name)) destination.append(new Option(collection, collection));
    field(t('move_destination'), destination);
    nameInput.placeholder = t('new_folder');
    field(t('new_collection_optional'), nameInput);
  }
  const error = document.createElement('p');
  error.className = 'error-msg';
  error.setAttribute('role', 'alert');
  const footer = document.createElement('div');
  footer.className = 'collection-editor-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn-secondary';
  cancel.textContent = t('cancel');
  cancel.addEventListener('click', () => dialog.close());
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn-primary';
  save.textContent = t('confirm');
  footer.append(cancel, save);
  form.append(error, footer);
  let pending = false;
  dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    const ids = checks.filter(input => input.checked && !input.disabled).map(input => input.value);
    if (mode === 'add' && !ids.length) { error.textContent = t('select_series'); return; }
    if (mode === 'move' && !ids.length) { error.textContent = t('select_series'); return; }
    pending = true;
    save.disabled = cancel.disabled = true;
    error.textContent = '';
    try {
      await onSave(mode === 'add' ? { ids, destination: name } : mode === 'create' ? { name: nameInput.value.trim(), ids } : mode === 'edit' ? { name, nextName: nameInput.value.trim(), cover: cover.value } :
        { ids, destination: nameInput.value.trim() || destination.value });
      dialog.close();
    } catch (err) {
      error.textContent = err?.code === 'COLLECTION_EXISTS' ? t('collection_exists') : t('collection_save_error');
    } finally { pending = false; save.disabled = cancel.disabled = false; }
  });
  dialog.append(form);
  document.body.append(dialog);
  dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); }, { once: true });
  dialog.showModal();
}
