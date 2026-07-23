/* Operator match editor. Writes are enforced again by Supabase RLS. */
import '../auth.js?v=admin-permissions-20260729';
import { createCollectionUi, moveFormToModal, pageItems } from './crud-ui.js';

(() => {
  const root = document.querySelector('[data-match-management]');
  if (!root) return;
  const form = root.querySelector('[data-match-form]');
  const list = root.querySelector('[data-match-list]');
  const feedback = root.querySelector('[data-match-feedback]');
  const cancel = root.querySelector('[data-match-cancel]');
  const modal = moveFormToModal({ form, id: 'match-edit-modal', title: 'Inserisci nuova gara' });
  const collection = createCollectionUi({ root, list, addLabel: 'Inserisci nuova gara', searchPlaceholder: 'Squadra, stagione, giornata…' });
  let editingId = null;
  let matches = [];
  let page = 1;

  const client = () => window.CapraiaAuth?.supabase;
  const say = (text, state = 'info') => { feedback.textContent = text; feedback.dataset.state = state; };
  const inputDate = (iso) => iso ? new Date(iso).toISOString().slice(0, 16) : '';
  const reset = () => {
    editingId = null;
    form.reset(); form.elements.status.value = 'scheduled'; form.elements.published.checked = true;
    form.querySelector('[data-match-submit]').textContent = 'Salva gara'; cancel.hidden = true;
  };
  const events = () => {
    const raw = form.elements.events_json.value.trim();
    if (!raw) return {};
    let parsed; try { parsed = JSON.parse(raw); } catch { throw new Error('Gli eventi devono essere un JSON valido.'); }
    if (!Array.isArray(parsed)) throw new Error('Gli eventi devono essere una lista JSON.');
    return { events: parsed };
  };
  const values = () => ({
    season_id: form.elements.season_id.value.trim(), match_day: form.elements.match_day.value.trim(),
    home_team: form.elements.home_team.value.trim(), away_team: form.elements.away_team.value.trim(),
    competition: form.elements.competition.value.trim(), venue: form.elements.venue.value.trim() || null,
    kickoff_at: form.elements.kickoff_at.value ? new Date(form.elements.kickoff_at.value).toISOString() : null,
    status: form.elements.status.value, home_score: form.elements.home_score.value === '' ? null : Number(form.elements.home_score.value),
    away_score: form.elements.away_score.value === '' ? null : Number(form.elements.away_score.value),
    referee: form.elements.referee.value.trim() || null, halftime_score: form.elements.halftime_score.value.trim() || null,
    source_url: form.elements.source_url.value.trim() || null, extra_info: events(), notes: form.elements.notes.value.trim() || null,
    published: form.elements.published.checked,
  });
  const render = () => {
    const view = pageItems(matches, collection.search.value, page, (match, query) => [match.home_team, match.away_team, match.season_id, match.match_day, match.competition, match.status].join(' ').toLocaleLowerCase('it').includes(query));
    page = view.page;
    list.replaceChildren();
    if (!view.items.length) {
      const empty = document.createElement('li'); empty.textContent = 'Nessuna gara trovata.'; list.append(empty);
    }
    view.items.forEach((match) => {
      const item = document.createElement('li'); item.dataset.matchId = match.id;
      const description = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = `${match.home_team} ${match.home_score ?? '—'} — ${match.away_score ?? '—'} ${match.away_team}`;
      const meta = document.createElement('small'); meta.textContent = `${match.season_id} · ${match.match_day} · ${match.status}${match.kickoff_at ? ` · ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(match.kickoff_at))}` : ''}`;
      const actions = document.createElement('div');
      [['Modifica', 'edit'], ['Rimuovi', 'delete']].forEach(([label, action]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.action = action; actions.append(button); });
      description.append(title, meta); item.append(description, actions); list.append(item);
    });
    collection.renderPagination({ page, totalItems: view.filtered.length, onPageChange(next) { page = next; render(); } });
  };
  const load = async () => {
    const { data, error } = await client().from('matches').select('*').order('kickoff_at', { ascending: false, nullsFirst: false });
    if (error) throw error; matches = data || []; render();
  };
  const edit = (match) => {
    editingId = match.id;
    Object.entries(match).forEach(([key, value]) => { if (!form.elements[key]) return; form.elements[key].value = key === 'kickoff_at' ? inputDate(value) : (value ?? ''); });
    form.elements.events_json.value = match.extra_info?.events?.length ? JSON.stringify(match.extra_info.events, null, 2) : '';
    form.elements.published.checked = match.published; form.querySelector('[data-match-submit]').textContent = 'Salva modifiche'; cancel.hidden = false;
    modal.open(`Modifica: ${match.home_team} — ${match.away_team}`);
  };
  const setBusy = async (operation) => {
    root.setAttribute('aria-busy', 'true');
    try { return await operation(); } finally { root.removeAttribute('aria-busy'); }
  };

  collection.add.addEventListener('click', () => { reset(); modal.open('Inserisci nuova gara'); });
  collection.search.addEventListener('input', () => { page = 1; render(); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    setBusy(async () => {
      const payload = values(); const { error } = editingId ? await client().from('matches').update(payload).eq('id', editingId) : await client().from('matches').insert(payload);
      if (error) throw error; const wasEditing = Boolean(editingId); reset(); modal.close(); await load(); say(wasEditing ? 'Gara aggiornata.' : 'Gara inserita.', 'success');
    }).catch((error) => say(error.message || 'Non è stato possibile salvare la gara.', 'error'));
  });
  cancel.addEventListener('click', () => { reset(); modal.close(); });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]'); const match = matches.find((item) => item.id === button?.closest('[data-match-id]')?.dataset.matchId);
    if (!button || !match) return;
    if (button.dataset.action === 'edit') return edit(match);
    if (!window.confirm(`Rimuovere la gara ${match.home_team} - ${match.away_team}?`)) return;
    setBusy(async () => { const { error } = await client().from('matches').delete().eq('id', match.id); if (error) throw error; await load(); say('Gara rimossa.', 'success'); }).catch((error) => say(error.message || 'Non è stato possibile rimuovere la gara.', 'error'));
  });
  (async () => { const access = await window.CapraiaAuth?.requireOperator?.(); if (!access?.isOperator) { root.hidden = true; return; } try { reset(); await load(); } catch (error) { say(error.message || 'Impossibile caricare le gare.', 'error'); } })();
})();
