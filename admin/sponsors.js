/* Gestione sponsor. I permessi sono verificati anche dalle policy RLS. */
import '../auth.js';
import { createCollectionUi, moveFormToModal, pageItems } from './crud-ui.js';
import { addImageUploadFields, removeImage, resolveImageChange } from './media.js';

(() => {
  const root = document.querySelector('[data-sponsor-management]');
  if (!root) return;
  const form = root.querySelector('[data-sponsor-form]');
  const list = root.querySelector('[data-sponsor-list]');
  const feedback = root.querySelector('[data-sponsor-feedback]');
  const cancel = root.querySelector('[data-sponsor-cancel]');
  const submitLabel = root.querySelector('[data-sponsor-submit]');
  addImageUploadFields(form, { urlField: 'logo_url', pathField: 'logo_path' });
  const modal = moveFormToModal({ form, id: 'sponsor-edit-modal', title: 'Aggiungi sponsor' });
  const collection = createCollectionUi({ root, list, addLabel: 'Aggiungi sponsor', searchPlaceholder: 'Cerca sponsor…' });
  let sponsors = [];
  let editingId = null;
  let page = 1;

  const client = () => window.CapraiaAuth?.supabase;
  const say = (text, state = 'info') => { feedback.textContent = text; feedback.dataset.state = state; };
  const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const reset = () => {
    editingId = null;
    form.reset();
    form.elements.annual_amount.value = '0'; form.elements.sort_order.value = '0'; form.elements.logo_background.value = 'blue-yellow'; form.elements.active.checked = true;
    form.elements.logo_path.value = ''; form.elements.remove_image.checked = false;
    submitLabel.textContent = 'Aggiungi sponsor'; cancel.hidden = true;
  };
  const render = () => {
    const view = pageItems(sponsors, collection.search.value, page, (item, query) => item.name.toLocaleLowerCase('it').includes(query));
    page = view.page; list.replaceChildren();
    if (!view.items.length) { const empty = document.createElement('li'); empty.textContent = 'Nessuno sponsor trovato.'; list.append(empty); }
    view.items.forEach((sponsor) => {
      const item = document.createElement('li'); item.dataset.sponsorId = sponsor.id;
      const description = document.createElement('div'); const title = document.createElement('strong'); const meta = document.createElement('small');
      title.textContent = sponsor.name;
      meta.textContent = `${euro.format(Number(sponsor.annual_amount || 0))} / anno · ${sponsor.active ? 'Attivo sul sito' : 'Nascosto dal sito'}`;
      const actions = document.createElement('div');
      [['Modifica', 'edit'], ['Rimuovi', 'delete']].forEach(([label, action]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.sponsorAction = action; actions.append(button); });
      description.append(title, meta); item.append(description, actions); list.append(item);
    });
    collection.renderPagination({ page, totalItems: view.filtered.length, onPageChange(next) { page = next; render(); } });
  };
  const load = async () => {
    const { data, error } = await client().from('sponsors').select('*').order('sort_order').order('name');
    if (error) throw error; sponsors = data || []; render();
  };
  const edit = (sponsor) => {
    editingId = sponsor.id;
    form.elements.name.value = sponsor.name; form.elements.annual_amount.value = sponsor.annual_amount ?? 0; form.elements.sort_order.value = sponsor.sort_order ?? 0;
    form.elements.logo_url.value = sponsor.logo_url || ''; form.elements.logo_path.value = sponsor.logo_path || ''; form.elements.logo_background.value = sponsor.logo_background || 'blue-yellow'; form.elements.active.checked = sponsor.active;
    submitLabel.textContent = 'Salva modifiche'; cancel.hidden = false; modal.open(`Modifica: ${sponsor.name}`);
  };
  const values = async () => {
    const image = await resolveImageChange({ form, folder: 'sponsors', urlField: 'logo_url', pathField: 'logo_path' });
    return {
      payload: { name: form.elements.name.value.trim(), annual_amount: Number(form.elements.annual_amount.value), sort_order: Number(form.elements.sort_order.value || 0), active: form.elements.active.checked, logo_background: form.elements.logo_background.value, logo_url: image.url, logo_path: image.path },
      removePath: image.removePath,
      path: image.path,
    };
  };
  const busy = async (operation) => { root.setAttribute('aria-busy', 'true'); try { return await operation(); } finally { root.removeAttribute('aria-busy'); } };

  collection.add.addEventListener('click', () => { reset(); modal.open('Aggiungi sponsor'); });
  collection.search.addEventListener('input', () => { page = 1; render(); });
  cancel.addEventListener('click', () => { reset(); modal.close(); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    busy(async () => {
      const image = await values();
      const { error } = editingId ? await client().from('sponsors').update(image.payload).eq('id', editingId) : await client().from('sponsors').insert(image.payload);
      if (error) throw error;
      if (image.removePath && image.removePath !== image.path) await removeImage(image.removePath).catch(() => {});
      const wasEditing = Boolean(editingId); reset(); modal.close(); await load(); say(wasEditing ? 'Sponsor aggiornato.' : 'Sponsor aggiunto.', 'success');
    }).catch((error) => say(error.message || 'Non è stato possibile salvare lo sponsor.', 'error'));
  });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sponsor-action]'); const sponsor = sponsors.find((item) => item.id === button?.closest('[data-sponsor-id]')?.dataset.sponsorId);
    if (!button || !sponsor) return;
    if (button.dataset.sponsorAction === 'edit') return edit(sponsor);
    if (!window.confirm(`Rimuovere definitivamente ${sponsor.name}?`)) return;
    busy(async () => { const { error } = await client().from('sponsors').delete().eq('id', sponsor.id); if (error) throw error; await removeImage(sponsor.logo_path).catch(() => {}); await load(); say('Sponsor rimosso.', 'success'); }).catch((error) => say(error.message || 'Non è stato possibile rimuovere lo sponsor.', 'error'));
  });
  (async () => { try { const access = await window.CapraiaAuth.requireOperator(); if (!access?.isOperator) throw new Error('Accesso negato.'); reset(); await load(); } catch { root.closest('[data-admin-module]')?.setAttribute('hidden', ''); } })();
})();
