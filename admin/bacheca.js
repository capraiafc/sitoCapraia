/* Moderazione dei messaggi lasciati dai tifosi. */
import '../auth.js?v=admin-permissions-20260729';

(() => {
  const root = document.querySelector('[data-bacheca-management]');
  if (!root) return;
  const list = root.querySelector('[data-bacheca-list]');
  const feedback = root.querySelector('[data-bacheca-feedback]');
  let messages = [];
  const client = () => window.CapraiaAuth?.supabase;
  const say = (text, state = 'info') => { feedback.textContent = text; feedback.dataset.state = state; };
  const render = () => {
    list.replaceChildren();
    if (!messages.length) { const empty = document.createElement('li'); empty.textContent = 'Nessun messaggio da moderare.'; list.append(empty); return; }
    messages.forEach((message) => {
      const item = document.createElement('li'); item.dataset.messageId = message.id;
      const description = document.createElement('div'); const text = document.createElement('strong'); const meta = document.createElement('small');
      text.textContent = `${message.display_name || 'Tifoso'}: “${message.message}”`;
      meta.textContent = `${message.published ? 'Pubblicato' : 'In attesa'} · ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.created_at))}`;
      const actions = document.createElement('div');
      [[message.published ? 'Nascondi' : 'Pubblica', 'toggle'], ['Rimuovi', 'delete']].forEach(([label, action]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.bachecaAction = action; actions.append(button); });
      description.append(text, meta); item.append(description, actions); list.append(item);
    });
  };
  const load = async () => { const { data, error } = await client().from('bacheca_messages').select('*').order('created_at', { ascending: false }); if (error) throw error; messages = data || []; render(); };
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-bacheca-action]'); const message = messages.find((item) => item.id === button?.closest('[data-message-id]')?.dataset.messageId);
    if (!button || !message) return;
    (async () => {
      if (button.dataset.bachecaAction === 'delete') { if (!window.confirm('Rimuovere definitivamente questo messaggio?')) return; const { error } = await client().from('bacheca_messages').delete().eq('id', message.id); if (error) throw error; say('Messaggio rimosso.', 'success'); }
      else { const { error } = await client().from('bacheca_messages').update({ published: !message.published }).eq('id', message.id); if (error) throw error; say(message.published ? 'Messaggio nascosto.' : 'Messaggio pubblicato.', 'success'); }
      await load();
    })().catch((error) => say(error.message || 'Non è stato possibile aggiornare il messaggio.', 'error'));
  });
  (async () => { try { const access = await window.CapraiaAuth.requireOperator(); if (!access?.isOperator) throw new Error('Accesso negato.'); await load(); } catch { root.closest('[data-admin-module]')?.setAttribute('hidden', ''); } })();
})();
