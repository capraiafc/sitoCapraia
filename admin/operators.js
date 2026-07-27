/* Operator management. Authentication is provided by the common auth module. */
import '../auth.js?v=admin-permissions-20260729';
import { pageItems } from './crud-ui.js';
(function initOperatorManagement() {
  'use strict';

  const root = document.querySelector('[data-operator-management]');
  if (!root) return;

  const form = root.querySelector('[data-operator-form]');
  const emailInput = root.querySelector('[data-operator-email]');
  const list = root.querySelector('[data-operator-list]');
  const feedback = root.querySelector('[data-operator-feedback]');
  const submit = form.querySelector('button[type="submit"]');
  const toolbar = document.createElement('div');
  toolbar.className = 'admin-collection-toolbar operator-management__toolbar';
  toolbar.innerHTML = '<label class="admin-collection-search">Cerca operatore<input type="search" data-operator-search placeholder="Email o nome giocatore…" autocomplete="off" /></label>';
  const search = toolbar.querySelector('[data-operator-search]');
  const pagination = document.createElement('nav');
  pagination.className = 'admin-pagination';
  pagination.setAttribute('aria-label', 'Paginazione operatori');
  list.before(toolbar);
  list.after(pagination);
  let operators = [];
  let page = 1;
  const permissionFields = [
    ['can_matches', 'Gare e risultati'], ['can_players', 'Rosa'], ['can_news', 'News'], ['can_sponsors', 'Sponsor'], ['can_bacheca', 'Bacheca'], ['can_merch', 'Merch'],
  ];

  const setFeedback = (message, state = 'info') => {
    feedback.textContent = message;
    feedback.dataset.state = state;
  };

  const getClient = () => window.CapraiaAuth && window.CapraiaAuth.supabase;

  const renderPagination = (totalItems) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / 10));
    page = Math.min(Math.max(1, page), totalPages);
    pagination.replaceChildren();
    if (totalItems <= 10) return;
    const previous = document.createElement('button');
    previous.type = 'button'; previous.textContent = '← Precedente'; previous.disabled = page === 1;
    const summary = document.createElement('span'); summary.textContent = `Pagina ${page} di ${totalPages}`;
    const next = document.createElement('button');
    next.type = 'button'; next.textContent = 'Successiva →'; next.disabled = page === totalPages;
    previous.addEventListener('click', () => { page -= 1; render(); });
    next.addEventListener('click', () => { page += 1; render(); });
    pagination.append(previous, summary, next);
  };

  const render = () => {
    const view = pageItems(operators, search.value, page, (operator, query) => [
      operator.email,
      operator.player_name,
      operator.role,
    ].join(' ').toLocaleLowerCase('it').includes(query));
    page = view.page;
    list.replaceChildren();
    view.items.forEach((operator) => {
      const item = document.createElement('li');
      item.className = 'operator-management__item';

      const details = document.createElement('span');
      details.className = 'operator-management__details';
      const email = document.createElement('strong');
      const date = document.createElement('small');
      email.textContent = operator.email;
      date.textContent = operator.email === 'capraiafc@gmail.com'
        ? 'Super user · accesso completo'
        : operator.player_id
          ? `Calciatore · solo scheda di ${operator.player_name || 'giocatore collegato'}`
          : `Operatore · abilitato dal ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(operator.created_at))}`;
      details.append(email, date);

      const permissions = document.createElement('div');
      permissions.className = 'operator-management__permissions';
      if (operator.email === 'capraiafc@gmail.com') {
        permissions.textContent = 'Dashboard, Operatori e tutte le aree abilitate.';
      } else {
        permissionFields.forEach(([key, label]) => {
          const field = document.createElement('label'); const input = document.createElement('input');
          input.type = 'checkbox'; input.checked = Boolean(operator[key]); input.dataset.operatorPermission = key;
          field.append(input, ` ${label}`); permissions.append(field);
        });
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'operator-management__remove';
      remove.textContent = 'Rimuovi';
      remove.dataset.operatorEmail = operator.email;
      remove.setAttribute('aria-label', `Rimuovi ${operator.email} dagli operatori`);

      const save = document.createElement('button'); save.type = 'button'; save.className = 'operator-management__save'; save.textContent = 'Salva diritti'; save.dataset.operatorAction = 'save'; save.dataset.operatorEmail = operator.email;

      item.append(details, permissions);
      if (operator.email !== 'capraiafc@gmail.com') item.append(save, remove);
      list.append(item);
    });
    if (!view.items.length) {
      const empty = document.createElement('li');
      empty.className = 'operator-management__empty';
      empty.textContent = 'Nessun operatore trovato.';
      list.append(empty);
    }
    renderPagination(view.filtered.length);
  };

  const load = async () => {
    const client = getClient();
    if (!client) throw new Error('Configurazione autenticazione non disponibile.');
    const { data, error } = await client.rpc('list_operator_emails');
    if (error) throw error;
    operators = data || [];
    const permissionKeys = permissionFields.map(([key]) => key);
    const missingPermissionColumns = operators.some((operator) =>
      permissionKeys.some((key) => typeof operator[key] !== 'boolean'));
    if (missingPermissionColumns) {
      throw new Error('La funzione list_operator_emails su Supabase non restituisce ancora i booleani dei permessi.');
    }
    render();
  };

  search.addEventListener('input', () => { page = 1; render(); });

  const setBusy = async (operation) => {
    submit.disabled = true;
    root.setAttribute('aria-busy', 'true');
    try {
      await operation();
    } finally {
      submit.disabled = false;
      root.removeAttribute('aria-busy');
    }
  };

  const deny = (error) => {
    root.hidden = true;
    const denied = document.querySelector('[data-operator-denied]');
    if (denied) {
      denied.hidden = false;
      denied.textContent = error.message || 'Accesso negato: account operatore richiesto.';
    }
  };

  const start = async () => {
    try {
      if (!window.CapraiaAuth || typeof window.CapraiaAuth.requireOperator !== 'function') {
        throw new Error('Modulo di autenticazione non caricato.');
      }
      const access = await window.CapraiaAuth.requireOperator();
      if (!access || !access.isSuperUser) {
        throw new Error((access && access.reason) || 'Accesso negato: account operatore richiesto.');
      }
      await load();
    } catch (error) {
      deny(error);
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!email) return;

    setBusy(async () => {
      const permissions = Object.fromEntries(permissionFields.map(([key]) => [key, form.elements[key].checked]));
      const { error } = await getClient().rpc('add_operator', { operator_email: email, p_can_matches: permissions.can_matches, p_can_players: permissions.can_players, p_can_news: permissions.can_news, p_can_sponsors: permissions.can_sponsors, p_can_bacheca: permissions.can_bacheca, p_can_merch: permissions.can_merch });
      if (error) throw error;
      form.reset();
      page = 1;
      await load();
      setFeedback('Operatore aggiunto e abilitato al prossimo accesso.', 'success');
    }).catch((error) => setFeedback(error.message || 'Non è stato possibile aggiungere l’operatore.', 'error'));
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !list.contains(button)) return;
    const email = button.dataset.operatorEmail;
    if (button.dataset.operatorAction === 'save') {
      const item = button.closest('.operator-management__item');
      const permissions = Object.fromEntries(permissionFields.map(([key]) => [key, item.querySelector(`[data-operator-permission="${key}"]`).checked]));
      setBusy(async () => {
        const { error } = await getClient().rpc('set_operator_permissions', { operator_email: email, p_can_matches: permissions.can_matches, p_can_players: permissions.can_players, p_can_news: permissions.can_news, p_can_sponsors: permissions.can_sponsors, p_can_bacheca: permissions.can_bacheca, p_can_merch: permissions.can_merch });
        if (error) throw error;
        await load(); setFeedback('Diritti operatore aggiornati.', 'success');
      }).catch((error) => setFeedback(error.message || 'Non è stato possibile aggiornare i diritti.', 'error'));
      return;
    }
    if (!button.classList.contains('operator-management__remove')) return;
    if (!window.confirm(`Rimuovere ${email} dagli operatori abilitati?`)) return;

    setBusy(async () => {
      const { error } = await getClient().rpc('remove_operator', { operator_email: email });
      if (error) throw error;
      await load();
      setFeedback('Operatore rimosso.', 'success');
    }).catch((error) => setFeedback(error.message || 'Non è stato possibile rimuovere l’operatore.', 'error'));
  });

  start();
}());
