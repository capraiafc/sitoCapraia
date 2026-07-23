import '../auth.js?v=admin-permissions-20260729';

(() => {
  const root = document.querySelector('[data-admin-dashboard]');
  if (!root) return;
  const client = () => window.CapraiaAuth?.supabase;
  const date = (value) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const areaLabels = { matches: 'Gare e risultati', players: 'Rosa', news: 'News', sponsors: 'Sponsor', bacheca: 'Bacheca', merch: 'Merch', operators: 'Operatori' };
  const actionLabels = { create: 'ha creato', update: 'ha modificato', delete: 'ha rimosso' };

  const renderLogins = (rows) => {
    const card = document.createElement('section'); card.className = 'admin-dashboard__card';
    const title = document.createElement('h3'); title.textContent = 'Ingressi operatori';
    const note = document.createElement('p'); note.textContent = 'Numero di accessi negli ultimi tre mesi.'; card.append(title, note);
    if (!rows.length) { const empty = document.createElement('p'); empty.textContent = 'Nessun accesso registrato al momento.'; card.append(empty); return card; }
    const max = Math.max(...rows.map((row) => Number(row.total)));
    const chart = document.createElement('div'); chart.className = 'admin-login-chart';
    rows.forEach((row) => { const item = document.createElement('div'); item.className = 'admin-login-chart__row'; const label = document.createElement('span'); label.textContent = row.operator_email; const bar = document.createElement('i'); bar.style.setProperty('--bar-width', `${Math.max(5, (Number(row.total) / max) * 100)}%`); const value = document.createElement('b'); value.textContent = String(row.total); item.append(label, bar, value); chart.append(item); });
    card.append(chart); return card;
  };

  const renderActions = (rows, history = false) => {
    const card = document.createElement('section'); card.className = 'admin-dashboard__card admin-dashboard__actions';
    const heading = document.createElement('div'); const title = document.createElement('h3'); title.textContent = history ? 'Storico attività' : 'Ultime 10 azioni'; heading.append(title);
    if (!history) { const button = document.createElement('button'); button.type = 'button'; button.className = 'link-button'; button.dataset.adminActivityHistory = 'true'; button.textContent = 'Vedi storico (3 mesi)'; heading.append(button); }
    card.append(heading);
    const list = document.createElement('ol');
    if (!rows.length) { const empty = document.createElement('li'); empty.textContent = 'Nessuna azione registrata al momento.'; list.append(empty); }
    rows.forEach((row) => { const item = document.createElement('li'); const text = document.createElement('span'); text.textContent = `${row.operator_email} ${actionLabels[row.action] || row.action} ${areaLabels[row.area] || row.area}${row.entity_label ? `: ${row.entity_label}` : ''}.`; const time = document.createElement('time'); time.dateTime = row.created_at; time.textContent = date(row.created_at); item.append(text, time); list.append(item); });
    card.append(list); return card;
  };

  const load = async (history = false) => {
    root.setAttribute('aria-busy', 'true');
    const [logins, actions] = await Promise.all([
      client().rpc('list_admin_login_counts'),
      client().rpc('list_admin_actions', { p_limit: history ? 500 : 10 }),
    ]);
    if (logins.error) throw logins.error; if (actions.error) throw actions.error;
    root.replaceChildren(renderLogins(logins.data || []), renderActions(actions.data || [], history));
    root.removeAttribute('aria-busy');
  };

  root.addEventListener('click', (event) => {
    if (!event.target.closest('[data-admin-activity-history]')) return;
    load(true).catch((error) => { root.textContent = error.message || 'Non è stato possibile caricare lo storico.'; });
  });

  (async () => {
    const access = await window.CapraiaAuth.requireOperator();
    if (!access?.isSuperUser) { root.closest('#dashboard').hidden = true; return; }
    await load();
  })().catch((error) => { root.textContent = error.message || 'Non è stato possibile caricare la dashboard.'; });
})();
