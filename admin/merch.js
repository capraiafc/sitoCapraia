/* Catalogo merch con galleria immagini e foto principale. */
import '../auth.js?v=admin-permissions-20260729';
import { createCollectionUi, moveFormToModal, pageItems } from './crud-ui.js';
import { removeImage, uploadImage } from './media.js';

(() => {
  const root = document.querySelector('[data-admin-module="merch"]');
  if (!root) return;
  root.innerHTML = `<div class="merch-management"><div class="merch-management__intro"><p class="eyebrow">catalogo</p><h2>Gestione <em>merch.</em></h2><p>Carica più foto, imposta le disponibilità e seleziona quella da mostrare sul sito.</p></div><p class="merch-management__feedback" data-merch-feedback role="status" aria-live="polite"></p><form class="merch-management__form" data-merch-form><div class="merch-management__fields"><label>Nome prodotto<input name="name" minlength="2" maxlength="160" required /></label><label>Prezzo (€)<input name="price" type="number" min="0" step="0.01" required /></label><label class="merch-management__wide">Descrizione<textarea name="description" rows="4" maxlength="4000"></textarea></label><label>Tipo di taglia<select name="size_mode"><option value="sized">Più taglie</option><option value="one_size">Taglia unica</option></select></label><div class="merch-stock-fields" data-sized-stock><p>Disponibilità per taglia</p><label>S<input name="stock_s" type="number" min="0" step="1" value="0" required /></label><label>M<input name="stock_m" type="number" min="0" step="1" value="0" required /></label><label>L<input name="stock_l" type="number" min="0" step="1" value="0" required /></label><label>XL<input name="stock_xl" type="number" min="0" step="1" value="0" required /></label><label>XXL<input name="stock_xxl" type="number" min="0" step="1" value="0" required /></label></div><label data-one-size-stock hidden>Numero di pezzi disponibili<input name="one_size_stock" type="number" min="0" step="1" value="0" required /></label><label class="merch-management__wide">Aggiungi foto<input name="gallery_files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple /></label><div class="merch-management__wide merch-gallery-upload"><button class="link-button" type="button" data-upload-gallery disabled>Carica le foto selezionate</button><small data-gallery-upload-note>Per un nuovo prodotto le foto saranno caricate quando salvi il prodotto.</small></div><div class="merch-management__wide merch-gallery-editor" data-merch-gallery-editor><p>Le foto caricate compariranno qui: scegli quella principale.</p></div><label class="merch-management__toggle"><input name="available" type="checkbox" checked /> Disponibile</label><label class="merch-management__toggle"><input name="published" type="checkbox" /> Pubblicato sul sito</label></div><div class="merch-management__form-actions"><button class="button button-dark" type="submit"><span data-merch-submit-label>Aggiungi prodotto</span> <span>→</span></button><button class="link-button" type="button" data-merch-cancel>Annulla</button></div></form><div class="merch-management__list-wrap"><h3>Prodotti <em>catalogo.</em></h3><ul class="merch-management__list" data-merch-list aria-live="polite"></ul></div></div>`;

  const form = root.querySelector('[data-merch-form]');
  const list = root.querySelector('[data-merch-list]');
  const feedback = root.querySelector('[data-merch-feedback]');
  const submit = form.querySelector('[type="submit"]');
  const cancel = form.querySelector('[data-merch-cancel]');
  const galleryEditor = form.querySelector('[data-merch-gallery-editor]');
  const uploadGallery = form.querySelector('[data-upload-gallery]');
  const uploadGalleryNote = form.querySelector('[data-gallery-upload-note]');
  const sizedStock = form.querySelector('[data-sized-stock]');
  const oneSizeStock = form.querySelector('[data-one-size-stock]');
  const modal = moveFormToModal({ form, id: 'merch-edit-modal', title: 'Inserisci nuovo prodotto' });
  const collection = createCollectionUi({ root: root.querySelector('.merch-management__list-wrap'), list, addLabel: 'Inserisci nuovo prodotto', searchPlaceholder: 'Nome, descrizione o stato…' });
  let products = []; let gallery = []; let stagedFiles = []; let removedImages = []; let selectedPrimary = null; let editingId = null; let page = 1;

  const client = () => window.CapraiaAuth?.supabase;
  const say = (text = '', state = 'info') => { feedback.textContent = text; feedback.dataset.state = state; };
  const price = (value) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value));
  const imageUrl = (image) => image.image_url || '';
  const stockSummary = (product) => product.size_mode === 'one_size'
    ? `Taglia unica: ${product.one_size_stock || 0} pezzi`
    : `S ${product.stock_s || 0} · M ${product.stock_m || 0} · L ${product.stock_l || 0} · XL ${product.stock_xl || 0} · XXL ${product.stock_xxl || 0}`;
  const activeGallery = () => gallery.filter((image) => !removedImages.includes(image.id));
  const galleryKey = (image) => `existing:${image.id}`;
  const stagedKey = (index) => `new:${index}`;
  const refreshUploadState = () => {
    const fileCount = stagedFiles.length;
    uploadGallery.disabled = !editingId || !fileCount;
    uploadGalleryNote.textContent = editingId
      ? (fileCount ? `${fileCount} foto selezionat${fileCount === 1 ? 'a' : 'e'}: puoi caricarle subito.` : 'Seleziona una o più foto da aggiungere alla galleria.')
      : 'Per un nuovo prodotto le foto saranno caricate quando salvi il prodotto.';
  };
  const refreshStockFields = () => {
    const isOneSize = form.elements.size_mode.value === 'one_size';
    sizedStock.hidden = isOneSize; oneSizeStock.hidden = !isOneSize;
  };

  const reset = () => {
    editingId = null; gallery = []; stagedFiles = []; removedImages = []; selectedPrimary = null;
    form.reset(); form.elements.available.checked = true; form.elements.published.checked = false;
    submit.querySelector('[data-merch-submit-label]').textContent = 'Aggiungi prodotto'; renderGallery(); refreshUploadState(); refreshStockFields();
  };

  const renderGallery = () => {
    const existing = activeGallery();
    const options = [
      ...existing.map((image) => ({ key: galleryKey(image), image, label: 'Foto caricata' })),
      ...stagedFiles.map((file, index) => ({ key: stagedKey(index), image: { image_url: URL.createObjectURL(file) }, label: 'Nuova foto' })),
    ];
    if (selectedPrimary && !options.some((option) => option.key === selectedPrimary)) selectedPrimary = options[0]?.key || null;
    if (!selectedPrimary && options.length) selectedPrimary = options.find((option) => option.image.is_primary)?.key || options[0].key;
    galleryEditor.replaceChildren();
    if (!options.length) { galleryEditor.innerHTML = '<p>Carica una o più foto. La prima verrà usata come principale, salvo una tua scelta diversa.</p>'; refreshUploadState(); return; }
    const heading = document.createElement('p'); heading.textContent = 'Seleziona la foto principale e rimuovi quelle non necessarie.'; galleryEditor.append(heading);
    const grid = document.createElement('div'); grid.className = 'merch-gallery-editor__grid';
    options.forEach((option) => {
      const card = document.createElement('label'); card.className = 'merch-gallery-editor__item';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'merch_primary'; radio.value = option.key; radio.checked = option.key === selectedPrimary;
      radio.addEventListener('change', () => {
        selectedPrimary = option.key;
        if (!editingId || option.key.startsWith('new:')) { renderGallery(); return; }
        busy(async () => {
          await setPrimaryImage(editingId, option.image);
          gallery = gallery.map((image) => ({ ...image, is_primary: image.id === option.image.id }));
          await load();
          say('Foto principale aggiornata.', 'success');
          renderGallery();
        }).catch((error) => say(error.message || 'Non è stato possibile aggiornare la foto principale.', 'error'));
      });
      const image = document.createElement('img'); image.src = imageUrl(option.image); image.alt = option.label;
      const caption = document.createElement('span'); caption.textContent = option.key === selectedPrimary ? 'Foto principale' : option.label;
      card.append(radio, image, caption);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'merch-gallery-editor__remove'; remove.textContent = option.key.startsWith('existing:') ? 'Rimuovi' : 'Annulla';
      remove.addEventListener('click', (event) => {
        event.preventDefault();
        if (option.key.startsWith('new:')) { stagedFiles.splice(Number(option.key.slice(4)), 1); renderGallery(); return; }
        if (!editingId) { removedImages.push(option.image.id); renderGallery(); return; }
        busy(async () => {
          const { error } = await client().from('merch_product_images').delete().eq('id', option.image.id);
          if (error) throw error;
          await removeImage(option.image.image_path).catch(() => {});
          gallery = gallery.filter((image) => image.id !== option.image.id);
          removedImages = [];
          const nextPrimary = activeGallery().find((image) => image.is_primary) || activeGallery()[0] || null;
          selectedPrimary = nextPrimary ? galleryKey(nextPrimary) : null;
          await setPrimaryImage(editingId, nextPrimary);
          await load();
          say('Foto rimossa dalla galleria.', 'success');
          renderGallery();
        }).catch((error) => say(error.message || 'Non è stato possibile rimuovere la foto.', 'error'));
      });
      card.append(remove);
      grid.append(card);
    });
    galleryEditor.append(grid); refreshUploadState();
  };

  const render = () => {
    const view = pageItems(products, collection.search.value, page, (product, query) => [product.name, product.description, product.published ? 'pubblicato' : 'bozza', product.available ? 'disponibile' : 'non disponibile'].join(' ').toLocaleLowerCase('it').includes(query));
    page = view.page; list.replaceChildren();
    if (!view.items.length) { const empty = document.createElement('li'); empty.textContent = 'Nessun prodotto trovato.'; list.append(empty); }
    view.items.forEach((product) => {
      const item = document.createElement('li'); item.className = 'merch-management__item'; item.dataset.merchId = product.id;
      const primary = product.merch_product_images?.find((image) => image.is_primary) || product.merch_product_images?.[0] || (product.image_url ? { image_url: product.image_url } : null);
      if (primary?.image_url) { const image = document.createElement('img'); image.className = 'merch-management__image'; image.src = primary.image_url; image.alt = ''; image.loading = 'lazy'; image.addEventListener('error', () => image.remove()); item.append(image); }
      const details = document.createElement('div'); details.className = 'merch-management__details'; const name = document.createElement('strong'); name.textContent = product.name; const amount = document.createElement('span'); amount.className = 'merch-management__price'; amount.textContent = price(product.price); const meta = document.createElement('small'); meta.textContent = `${product.merch_product_images?.length || 0} foto · ${stockSummary(product)} · ${product.published ? 'Pubblicato' : 'Bozza'}`; details.append(name, amount, meta);
      const actions = document.createElement('div'); actions.className = 'merch-management__actions'; [['Modifica', 'edit'], ['Rimuovi', 'delete']].forEach(([label, action]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.merchAction = action; button.className = action === 'delete' ? 'merch-management__remove' : 'merch-management__edit'; actions.append(button); }); item.append(details, actions); list.append(item);
    });
    collection.renderPagination({ page, totalItems: view.filtered.length, onPageChange(next) { page = next; render(); } });
  };

  const load = async () => { const { data, error } = await client().from('merch_products').select('id, name, price, description, image_url, image_path, available, published, size_mode, stock_s, stock_m, stock_l, stock_xl, stock_xxl, one_size_stock, created_at, merch_product_images(id, image_url, image_path, sort_order, is_primary)').order('created_at', { ascending: false }); if (error) throw error; products = data || []; render(); };
  const fill = (product) => { editingId = product.id; gallery = [...(product.merch_product_images || [])]; stagedFiles = []; removedImages = []; selectedPrimary = gallery.find((image) => image.is_primary) ? galleryKey(gallery.find((image) => image.is_primary)) : (gallery[0] ? galleryKey(gallery[0]) : null); form.elements.name.value = product.name; form.elements.price.value = Number(product.price).toFixed(2); form.elements.description.value = product.description || ''; form.elements.size_mode.value = product.size_mode || 'sized'; ['stock_s', 'stock_m', 'stock_l', 'stock_xl', 'stock_xxl', 'one_size_stock'].forEach((name) => { form.elements[name].value = Number(product[name] || 0); }); form.elements.available.checked = product.available; form.elements.published.checked = product.published; submit.querySelector('[data-merch-submit-label]').textContent = 'Salva modifiche'; refreshStockFields(); renderGallery(); modal.open(`Modifica prodotto: ${product.name}`); };
  const payload = () => { const amount = Number(form.elements.price.value); if (!Number.isFinite(amount) || amount < 0) throw new Error('Inserisci un prezzo valido.'); const stock = (name) => { const value = Number(form.elements[name].value); if (!Number.isInteger(value) || value < 0) throw new Error('Inserisci quantità intere non negative.'); return value; }; const sizeMode = form.elements.size_mode.value; return { name: form.elements.name.value.trim(), price: Math.round((amount + Number.EPSILON) * 100) / 100, description: form.elements.description.value.trim() || null, size_mode: sizeMode, stock_s: sizeMode === 'sized' ? stock('stock_s') : 0, stock_m: sizeMode === 'sized' ? stock('stock_m') : 0, stock_l: sizeMode === 'sized' ? stock('stock_l') : 0, stock_xl: sizeMode === 'sized' ? stock('stock_xl') : 0, stock_xxl: sizeMode === 'sized' ? stock('stock_xxl') : 0, one_size_stock: sizeMode === 'one_size' ? stock('one_size_stock') : 0, available: form.elements.available.checked, published: form.elements.published.checked }; };
  const setPrimaryImage = async (productId, image) => {
    const { error: clearPrimaryError } = await client().from('merch_product_images').update({ is_primary: false }).eq('product_id', productId);
    if (clearPrimaryError) throw clearPrimaryError;
    if (image) {
      const { error } = await client().from('merch_product_images').update({ is_primary: true }).eq('id', image.id);
      if (error) throw error;
    }
    const { error: productError } = await client().from('merch_products').update({ image_url: image?.image_url || null, image_path: image?.image_path || null }).eq('id', productId);
    if (productError) throw productError;
  };
  const uploadStagedImages = async (productId) => {
    if (!stagedFiles.length) return;
    const files = [...stagedFiles]; const selectedStaged = selectedPrimary;
    const saved = {};
    const offset = activeGallery().length;
    for (let index = 0; index < files.length; index += 1) {
      const uploaded = await uploadImage(files[index], 'merch');
      const { data, error } = await client().from('merch_product_images').insert({ product_id: productId, image_url: uploaded.url, image_path: uploaded.path, sort_order: offset + index, is_primary: false }).select().single();
      if (error) throw error;
      saved[stagedKey(index)] = data;
    }
    gallery = [...activeGallery(), ...Object.values(saved)]; removedImages = []; stagedFiles = [];
    const primary = selectedStaged?.startsWith('new:') ? saved[selectedStaged] : gallery.find((image) => galleryKey(image) === selectedPrimary) || gallery[0];
    selectedPrimary = primary ? galleryKey(primary) : null;
    await setPrimaryImage(productId, primary);
    gallery = gallery.map((image) => ({ ...image, is_primary: image.id === primary?.id }));
    form.elements.gallery_files.value = '';
    renderGallery();
  };
  const syncGallery = async (productId) => {
    const removed = gallery.filter((image) => removedImages.includes(image.id));
    if (removed.length) { const { error } = await client().from('merch_product_images').delete().in('id', removed.map((image) => image.id)); if (error) throw error; await Promise.all(removed.map((image) => removeImage(image.image_path).catch(() => {}))); }
    if (removed.length) { gallery = activeGallery(); removedImages = []; const retainedPrimary = gallery.find((image) => image.is_primary) || gallery[0]; selectedPrimary = retainedPrimary ? galleryKey(retainedPrimary) : null; }
    await uploadStagedImages(productId);
    const primary = activeGallery().find((image) => galleryKey(image) === selectedPrimary) || activeGallery()[0] || null;
    await setPrimaryImage(productId, primary);
    gallery = activeGallery().map((image) => ({ ...image, is_primary: image.id === primary?.id }));
  };
  const busy = async (operation) => { submit.disabled = true; root.setAttribute('aria-busy', 'true'); try { return await operation(); } finally { submit.disabled = false; root.removeAttribute('aria-busy'); } };

  collection.add.addEventListener('click', () => { reset(); modal.open('Inserisci nuovo prodotto'); });
  collection.search.addEventListener('input', () => { page = 1; render(); });
  cancel.addEventListener('click', () => { reset(); modal.close(); });
  form.elements.size_mode.addEventListener('change', refreshStockFields);
  form.elements.gallery_files.addEventListener('change', () => {
    stagedFiles = [...stagedFiles, ...form.elements.gallery_files.files];
    form.elements.gallery_files.value = '';
    renderGallery();
  });
  uploadGallery.addEventListener('click', () => {
    if (!editingId || !stagedFiles.length) return;
    busy(async () => {
      await uploadStagedImages(editingId);
      await load();
      say('Foto aggiunte alla galleria.', 'success');
    }).catch((error) => say(error.message || 'Non è stato possibile caricare le foto.', 'error'));
  });
  form.addEventListener('submit', (event) => { event.preventDefault(); busy(async () => { const values = payload(); let productId = editingId; if (editingId) { const { error } = await client().from('merch_products').update(values).eq('id', editingId); if (error) throw error; } else { const { data, error } = await client().from('merch_products').insert(values).select().single(); if (error) throw error; productId = data.id; } await syncGallery(productId); const wasEditing = Boolean(editingId); reset(); modal.close(); await load(); say(wasEditing ? 'Prodotto aggiornato.' : 'Prodotto aggiunto al catalogo.', 'success'); }).catch((error) => say(error.message || 'Non è stato possibile salvare il prodotto.', 'error')); });
  list.addEventListener('click', (event) => { const button = event.target.closest('[data-merch-action]'); const product = products.find((item) => item.id === button?.closest('[data-merch-id]')?.dataset.merchId); if (!button || !product) return; if (button.dataset.merchAction === 'edit') return fill(product); if (!window.confirm(`Rimuovere definitivamente “${product.name}” dal catalogo?`)) return; busy(async () => { const { error } = await client().from('merch_products').delete().eq('id', product.id); if (error) throw error; await Promise.all((product.merch_product_images || []).map((image) => removeImage(image.image_path).catch(() => {}))); await load(); say('Prodotto rimosso.', 'success'); }).catch((error) => say(error.message || 'Non è stato possibile rimuovere il prodotto.', 'error')); });
  (async () => { try { const access = await window.CapraiaAuth.requireOperator(); if (!access?.isOperator) throw new Error('Accesso negato.'); reset(); await load(); } catch { root.hidden = true; } })();
})();
