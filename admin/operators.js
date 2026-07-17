/* Operator management. Authentication is provided by the common auth module. */
import '../auth.js';
(function initOperatorManagement() {
  'use strict';

  const root = document.querySelector('[data-operator-management]');
  if (!root) return;

  const form = root.querySelector('[data-operator-form]');
  const emailInput = root.querySelector('[data-operator-email]');
  const list = root.querySelector('[data-operator-list]');
  const feedback = root.querySelector('[data-operator-feedback]');
  const submit = form.querySelector('button[type="submit"]');

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
      date.textContent = `Operatore · abilitato dal ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(operator.created_at))}`;
      details.append(email, date);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'operator-management__remove';
      remove.textContent = 'Rimuovi';
      remove.dataset.operatorEmail = operator.email;
      remove.setAttribute('aria-label', `Rimuovi ${operator.email} dagli operatori`);

      item.append(details, remove);
      list.append(item);
    });
  };

  const load = async () => {
    const client = getClient();
    if (!client) throw new Error('Configurazione autenticazione non disponibile.');
    const { data, error } = await client.rpc('list_operator_emails');
    if (error) throw error;
    render(data || []);
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
      if (!access || !access.isOperator) {
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
      const { error } = await getClient().rpc('add_operator', { operator_email: email });
      if (error) throw error;
      emailInput.value = '';
      await load();
      setFeedback('Operatore aggiunto e abilitato al prossimo accesso.', 'success');
    }).catch((error) => setFeedback(error.message || 'Non è stato possibile aggiungere l’operatore.', 'error'));
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('.operator-management__remove');
    if (!button || !list.contains(button)) return;
    const email = button.dataset.operatorEmail;
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
