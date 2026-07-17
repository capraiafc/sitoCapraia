/* News management. */
import '../auth.js';
import { createCollectionUi, moveFormToModal, pageItems } from './crud-ui.js';
import { addImageUploadFields, removeImage, resolveImageChange } from './media.js';

(() => {
  const root = document.querySelector('[data-news-management]');
  if (!root) return;
  const form = root.querySelector('[data-news-form]');
  addImageUploadFields(form, { urlField: 'cover_image_url', pathField: 'cover_image_path' });
  const list = root.querySelector('[data-news-list]');
  const feedback = root.querySelector('[data-news-feedback]');
  const submit = form.querySelector('[type="submit"]');
  const cancel = form.querySelector('[data-news-cancel]');
  const typeInputs = form.querySelectorAll('[name="content_type"]');
  const bodyField = form.querySelector('[data-news-original-fields]');
  const externalField = form.querySelector('[data-news-external-fields]');
  const modal = moveFormToModal({ form, id: 'news-edit-modal', title: 'Inserisci nuova news' });
  const collection = createCollectionUi({ root, list, addLabel: 'Inserisci nuova news', searchPlaceholder: 'Titolo, categoria o fonte…' });
  let editingId = null;
  let news = [];
  let page = 1;

  const client = () => window.CapraiaAuth?.supabase;
  const value = (name) => form.elements[name]?.value.trim();
  const say = (text, state = 'info') => { feedback.textContent = text; feedback.dataset.state = state; };
  const selectedType = () => form.querySelector('[name="content_type"]:checked').value;
  const formatDate = (date) => date ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(date)) : 'Bozza';
  const setTypeFields = () => {
    const original = selectedType() === 'original'; bodyField.hidden = !original; externalField.hidden = original;
    form.elements.body.required = original; form.elements.external_url.required = !original; form.elements.source_name.required = !original; form.elements.source_label.required = !original;
  };
  const reset = () => {
    editingId = null; form.reset(); form.elements.content_type.value = 'original'; form.elements.published.checked = false;
    submit.querySelector('[data-news-submit-label]').textContent = 'Crea news'; cancel.hidden = true; setTypeFields();
  };
  const render = () => {
    const view = pageItems(news, collection.search.value, page, (item, query) => [item.title, item.category, item.source_name, item.source_label].join(' ').toLocaleLowerCase('it').includes(query));
    page = view.page; list.replaceChildren();
    if (!view.items.length) { const empty = document.createElement('li'); empty.textContent = 'Nessuna news trovata.'; list.append(empty); }
    view.items.forEach((item) => {
      const row = document.createElement('li'); row.className = 'news-management__item'; row.dataset.newsId = item.id;
      const details = document.createElement('div'); const title = document.createElement('strong'); const meta = document.createElement('small');
      title.textContent = item.title; meta.textContent = `${item.published ? `Pubblicata · ${formatDate(item.published_at)}` : 'Bozza'} · ${item.content_type === 'external' ? `Segnalata: ${item.source_label}` : 'Articolo originale'}`;
      const actions = document.createElement('div'); actions.className = 'news-management__actions';
      [['Modifica', 'edit'], ['Rimuovi', 'delete']].forEach(([label, action]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.newsAction = action; button.className = action === 'delete' ? 'news-management__remove' : 'news-management__edit'; actions.append(button); });
      details.append(title, meta); row.append(details, actions); list.append(row);
    });
    collection.renderPagination({ page, totalItems: view.filtered.length, onPageChange(next) { page = next; render(); } });
  };
  const load = async () => {
    const { data, error } = await client().from('news').select('id, title, excerpt, content_type, body, external_url, source_name, source_label, cover_image_url, cover_image_path, category, published, published_at, created_at').order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    if (error) throw error; news = data || []; render();
  };
  const fill = (item) => {
    editingId = item.id;
    Object.entries({ title: item.title, excerpt: item.excerpt || '', body: item.body || '', external_url: item.external_url || '', source_name: item.source_name || '', source_label: item.source_label || '', cover_image_url: item.cover_image_url || '', cover_image_path: item.cover_image_path || '', category: item.category || 'Club' }).forEach(([name, entry]) => { form.elements[name].value = entry; });
    form.querySelector(`[name="content_type"][value="${item.content_type}"]`).checked = true; form.elements.published.checked = item.published;
    submit.querySelector('[data-news-submit-label]').textContent = 'Salva modifiche'; cancel.hidden = false; setTypeFields(); modal.open(`Modifica news: ${item.title}`);
  };
  const payload = () => {
    const contentType = selectedType(); const externalUrl = value('external_url');
    if (contentType === 'external') { try { new URL(externalUrl); } catch { throw new Error('Inserisci un link valido per l’articolo segnalato.'); } }
    return { title: value('title'), excerpt: value('excerpt') || null, content_type: contentType, body: contentType === 'original' ? value('body') : null, external_url: contentType === 'external' ? externalUrl : null, source_name: contentType === 'external' ? value('source_name') : null, source_label: contentType === 'external' ? value('source_label') : null, cover_image_url: value('cover_image_url') || null, cover_image_path: value('cover_image_path') || null, category: value('category') || 'Club', published: form.elements.published.checked };
  };
  const busy = async (operation) => { submit.disabled = true; root.setAttribute('aria-busy', 'true'); try { return await operation(); } finally { submit.disabled = false; root.removeAttribute('aria-busy'); } };

  collection.add.addEventListener('click', () => { reset(); modal.open('Inserisci nuova news'); });
  collection.search.addEventListener('input', () => { page = 1; render(); });
  cancel.addEventListener('click', () => { reset(); modal.close(); });
  typeInputs.forEach((input) => input.addEventListener('change', setTypeFields));
  form.addEventListener('submit', (event) => {
    event.preventDefault(); busy(async () => {
      const values = payload(); const image = await resolveImageChange({ form, folder: 'news', urlField: 'cover_image_url', pathField: 'cover_image_path' }); values.cover_image_url = image.url; values.cover_image_path = image.path; const { error } = editingId ? await client().from('news').update(values).eq('id', editingId) : await client().from('news').insert(values);
      if (error) throw error; if (image.removePath && image.removePath !== image.path) await removeImage(image.removePath).catch(() => {}); const wasEditing = Boolean(editingId); reset(); modal.close(); await load(); say(wasEditing ? 'News aggiornata.' : 'News creata.', 'success');
    }).catch((error) => say(error.message || 'Non è stato possibile salvare la news.', 'error'));
  });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-news-action]'); const item = news.find((entry) => entry.id === button?.closest('[data-news-id]')?.dataset.newsId);
    if (!button || !item) return; if (button.dataset.newsAction === 'edit') return fill(item);
    if (!window.confirm('Rimuovere definitivamente questa news?')) return;
    busy(async () => { const { error } = await client().from('news').delete().eq('id', item.id); if (error) throw error; await removeImage(item.cover_image_path).catch(() => {}); await load(); say('News rimossa.', 'success'); }).catch((error) => say(error.message || 'Non è stato possibile rimuovere la news.', 'error'));
  });
  (async () => { try { const access = await window.CapraiaAuth.requireOperator(); if (!access?.isOperator) throw new Error('Accesso negato: account operatore richiesto.'); reset(); await load(); } catch (error) { root.hidden = true; } })();
})();
