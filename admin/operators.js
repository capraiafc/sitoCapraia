/* Operator management. Authentication is provided by the common auth module. */
import '../auth.js?v=admin-permissions-20260729';
(function initOperatorManagement() {
  'use strict';

  const root = document.querySelector('[data-operator-management]');
  if (!root) return;

  const form = root.querySelector('[data-operator-form]');
  const emailInput = root.querySelector('[data-operator-email]');
  const list = root.querySelector('[data-operator-list]');
  const feedback = root.querySelector('[data-operator-feedback]');
  const submit = form.querySelector('button[type="submit"]');
  const permissionFields = [
    ['can_matches', 'Gare e risultati'], ['can_players', 'Rosa'], ['can_news', 'News'], ['can_sponsors', 'Sponsor'], ['can_bacheca', 'Bacheca'], ['can_merch', 'Merch'],
  ];

  const setFeedback = (message, state = 'info') => {
    feedback.textContent = message;
    feedback.dataset.state = state;
  };

  const getClient = () => window.CapraiaAuth && window.CapraiaAuth.supabase;

  const render = (operators) => {
    list.replaceChildren();
    operators.forEach((operator) => {
      const item = document.createElement('li');
      item.className = 'operator-management__item';

      const details = document.createElement('span');
      const email = document.createElement('strong');
      const date = document.createElement('small');
      email.textContent = operator.email;
      date.textContent = operator.email === 'capraiafc@gmail.com'
        ? 'Super user · accesso completo'
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
  };

  const load = async () => {
    const client = getClient();
    if (!client) throw new Error('Configurazione autenticazione non disponibile.');
    const { data, error } = await client.rpc('list_operator_emails');
    if (error) throw error;
    const operators = data || [];
    const permissionKeys = permissionFields.map(([key]) => key);
    const missingPermissionColumns = operators.some((operator) =>
      permissionKeys.some((key) => typeof operator[key] !== 'boolean'));
    if (missingPermissionColumns) {
      throw new Error('La funzione list_operator_emails su Supabase non restituisce ancora i booleani dei permessi.');
    }
    render(operators);
  };

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
