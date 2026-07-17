export const PAGE_SIZE = 10;

export function createCollectionUi({ root, list, addLabel, searchPlaceholder }) {
  const toolbar = document.createElement('div');
  toolbar.className = 'admin-collection-toolbar';
  toolbar.innerHTML = `<button class="button button-dark" type="button" data-collection-add>${addLabel} <span>→</span></button><label class="admin-collection-search">Cerca<input type="search" data-collection-search placeholder="${searchPlaceholder}" autocomplete="off" /></label>`;
  const pagination = document.createElement('nav');
  pagination.className = 'admin-pagination';
  pagination.setAttribute('aria-label', 'Paginazione elenco');
  list.before(toolbar);
  list.after(pagination);

  const add = toolbar.querySelector('[data-collection-add]');
  const search = toolbar.querySelector('[data-collection-search]');
  return {
    add,
    search,
    renderPagination({ page, totalItems, onPageChange }) {
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
      const current = Math.min(Math.max(1, page), totalPages);
      pagination.replaceChildren();
      if (totalItems <= PAGE_SIZE) return current;
      const previous = document.createElement('button');
      previous.type = 'button'; previous.textContent = '← Precedente'; previous.disabled = current === 1;
      previous.addEventListener('click', () => onPageChange(current - 1));
      const summary = document.createElement('span');
      summary.textContent = `Pagina ${current} di ${totalPages}`;
      const next = document.createElement('button');
      next.type = 'button'; next.textContent = 'Successiva →'; next.disabled = current === totalPages;
      next.addEventListener('click', () => onPageChange(current + 1));
      pagination.append(previous, summary, next);
      return current;
    },
  };
}

export function pageItems(items, query, page, matches) {
  const normalized = String(query || '').trim().toLocaleLowerCase('it');
  const filtered = normalized ? items.filter((item) => matches(item, normalized)) : items;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), totalPages);
  return { filtered, page: current, items: filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) };
}

export function moveFormToModal({ form, id, title }) {
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'admin-edit-modal';
  dialog.innerHTML = `<div class="admin-edit-modal__head"><h2 data-modal-title>${title}</h2><button type="button" class="admin-edit-modal__close" data-modal-close aria-label="Chiudi">×</button></div>`;
  dialog.append(form);
  document.body.append(dialog);
  dialog.querySelector('[data-modal-close]').addEventListener('click', () => dialog.close());
  return {
    dialog,
    open(nextTitle = title) {
      dialog.querySelector('[data-modal-title]').textContent = nextTitle;
      if (!dialog.open) dialog.showModal();
    },
    close() { if (dialog.open) dialog.close(); },
  };
}
