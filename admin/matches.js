/* Operator match editor. Writes are enforced again by Supabase RLS. */
import '../auth.js?v=members-20260730';
import { createCollectionUi, moveFormToModal, pageItems } from './crud-ui.js';
import { normalizeSeason, romeDateTimeInput, romeLocalToIso } from '../data/calendar-logic.js';

(() => {
  const root = document.querySelector('[data-match-management]');
  if (!root) return;
  const form = root.querySelector('[data-match-form]');
  const list = root.querySelector('[data-match-list]');
  const feedback = root.querySelector('[data-match-feedback]');
  const cancel = root.querySelector('[data-match-cancel]');
  const statusLabels = { scheduled: 'In programma', completed: 'Giocata', postponed: 'Da recuperare', suspended: 'Sospesa', cancelled: 'Annullata' };
  Object.entries(statusLabels).forEach(([value, label]) => {
    let option = Array.from(form.elements.status.options).find((entry) => entry.value === value);
    if (!option) { option = document.createElement('option'); option.value = value; form.elements.status.append(option); }
    option.textContent = label;
  });
  const addField = (name, text, options = {}) => {
    const label = document.createElement('label'); label.textContent = text;
    const input = document.createElement('input'); input.name = name;
    Object.assign(input, options); label.append(input);
    form.elements.referee.closest('label').before(label);
    return input;
  };
  addField('phase', 'Fase / turno', { placeholder: 'Andata, ritorno, girone 14, semifinale…', maxLength: 160 });
  addField('home_penalties', 'Rigori casa (solo serie finale)', { type: 'number', min: '0', max: '99', step: '1' });
  addField('away_penalties', 'Rigori ospiti (solo serie finale)', { type: 'number', min: '0', max: '99', step: '1' });
  addField('home_logo', 'Logo squadra casa', { placeholder: '/assets/loghi/squadra.png oppure https://…' });
  addField('away_logo', 'Logo squadra ospite', { placeholder: '/assets/loghi/squadra.png oppure https://…' });
  addField('competition_logo', 'Logo competizione', { placeholder: '/assets/loghi/coppa.svg oppure https://…' });
  form.elements.competition.placeholder = 'Prima Categoria · Girone C / Coppa Toscana';
  form.elements.season_id.placeholder = '2026-27';
  const timeHint = document.createElement('small');
  timeHint.textContent = 'Orario italiano (Europe/Rome). Lascia vuoto se la data è da definire. Per un recupero, aggiorna data e ora e scegli “In programma”.';
  form.elements.kickoff_at.closest('label').append(timeHint);
  const modalFeedback = document.createElement('p'); modalFeedback.className = 'admin-feedback'; modalFeedback.setAttribute('role', 'status');
  form.prepend(modalFeedback);
  const modal = moveFormToModal({ form, id: 'match-edit-modal', title: 'Inserisci nuova gara' });
  const collection = createCollectionUi({ root, list, addLabel: 'Inserisci nuova gara', searchPlaceholder: 'Squadra, stagione, giornata…' });
  let editingId = null;
  let editingMetadata = {};
  let matches = [];
  let page = 1;
  let busy = false;

  const client = () => window.CapraiaAuth?.supabase;
  const say = (text, state = 'info') => {
    [feedback, modalFeedback].forEach((element) => { element.textContent = text; element.dataset.state = state; });
  };
  const inputDate = romeDateTimeInput;
  const reset = () => {
    editingId = null;
    editingMetadata = {};
    form.reset(); form.elements.status.value = 'scheduled'; form.elements.published.checked = true;
    form.elements.season_id.value = '2026-27';
    modalFeedback.textContent = '';
    form.querySelector('[data-match-submit]').textContent = 'Salva gara'; cancel.hidden = true;
  };
  const events = () => {
    const raw = form.elements.events_json.value.trim();
    if (!raw) return { events: [] };
    let parsed; try { parsed = JSON.parse(raw); } catch { throw new Error('Gli eventi devono essere un JSON valido.'); }
    if (!Array.isArray(parsed)) throw new Error('Gli eventi devono essere una lista JSON.');
    return { events: parsed };
  };
  const logoValue = (name) => {
    const value = form.elements[name].value.trim();
    if (!value) return null;
    if (/^assets\/[A-Za-z0-9_./%-]+$/.test(value) && !value.split('/').includes('..')) return value;
    if (/^\/(?!\/)/.test(value) && !/[\\\u0000-\u001f]/.test(value)) return value;
    let url; try { url = new URL(value); } catch { throw new Error('Per i loghi usa un indirizzo https:// oppure un percorso del sito che inizia con / o assets/.'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('L’indirizzo del logo deve usare https:// o http://.');
    return value;
  };
  const scoreValue = (name) => {
    const raw = form.elements[name].value;
    if (raw === '') return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 99) throw new Error('Gol e rigori devono essere numeri interi da 0 a 99.');
    return value;
  };
  const values = () => {
    const status = form.elements.status.value;
    const homeScore = scoreValue('home_score'); const awayScore = scoreValue('away_score');
    const homePenalties = scoreValue('home_penalties'); const awayPenalties = scoreValue('away_penalties');
    if (status === 'completed' && (homeScore === null || awayScore === null)) throw new Error('Per segnare una gara come giocata, inserisci entrambi i risultati.');
    if (homePenalties !== null || awayPenalties !== null) {
      if (homePenalties === null || awayPenalties === null || status !== 'completed' || homeScore !== awayScore || homePenalties === awayPenalties) {
        throw new Error('I rigori richiedono una gara giocata con gol in parità e due punteggi della serie finale diversi.');
      }
    }
    const extraInfo = { ...editingMetadata, ...events() };
    const localKickoff = form.elements.kickoff_at.value;
    const kickoff = localKickoff ? romeLocalToIso(localKickoff) : null;
    if (localKickoff && !kickoff) throw new Error('Data o ora non valida nel fuso italiano. Evita le ore ambigue o inesistenti durante il cambio dell’ora legale.');
    ['home_logo', 'away_logo', 'competition_logo'].forEach((key) => {
      const value = logoValue(key); if (value) extraInfo[key] = value; else delete extraInfo[key];
    });
    return {
    season_id: normalizeSeason(form.elements.season_id.value.trim()), match_day: form.elements.match_day.value.trim(),
    home_team: form.elements.home_team.value.trim(), away_team: form.elements.away_team.value.trim(),
    competition: form.elements.competition.value.trim(), venue: form.elements.venue.value.trim() || null,
    kickoff_at: kickoff,
    status, home_score: homeScore, away_score: awayScore,
    home_penalties: homePenalties, away_penalties: awayPenalties, phase: form.elements.phase.value.trim() || null,
    referee: form.elements.referee.value.trim() || null, halftime_score: form.elements.halftime_score.value.trim() || null,
    source_url: form.elements.source_url.value.trim() || null, extra_info: extraInfo, notes: form.elements.notes.value.trim() || null,
    published: form.elements.published.checked,
    };
  };
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
      if (match.home_penalties != null && match.away_penalties != null) title.textContent += ` (${match.home_penalties}–${match.away_penalties} d.c.r.)`;
      const meta = document.createElement('small'); meta.textContent = `${match.season_id} · ${match.competition} · ${match.match_day} · ${statusLabels[match.status] || match.status}${match.kickoff_at ? ` · ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(new Date(match.kickoff_at))}` : ' · Data da definire'}${match.published ? '' : ' · Bozza'} `;
      const actions = document.createElement('div');
      [['Modifica', 'edit'], ['Rimuovi', 'delete']].forEach(([label, action]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.action = action; actions.append(button); });
      description.append(title, meta); item.append(description, actions); list.append(item);
    });
    collection.renderPagination({ page, totalItems: view.filtered.length, onPageChange(next) { page = next; render(); } });
  };
  const load = async () => {
    const allMatches = [];
    const batchSize = 500;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await client().from('matches').select('*')
        .order('kickoff_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true }).range(offset, offset + batchSize - 1);
      if (error) throw error;
      allMatches.push(...(data || []));
      if (!data || data.length < batchSize) break;
    }
    matches = allMatches; render();
  };
  const edit = (match) => {
    reset();
    editingId = match.id;
    editingMetadata = match.extra_info && typeof match.extra_info === 'object' && !Array.isArray(match.extra_info) ? { ...match.extra_info } : {};
    Object.entries(match).forEach(([key, value]) => { if (!form.elements[key]) return; form.elements[key].value = key === 'kickoff_at' ? inputDate(value) : (value ?? ''); });
    form.elements.events_json.value = match.extra_info?.events?.length ? JSON.stringify(match.extra_info.events, null, 2) : '';
    ['home_logo', 'away_logo', 'competition_logo'].forEach((key) => { form.elements[key].value = editingMetadata[key] || ''; });
    form.elements.published.checked = match.published; form.querySelector('[data-match-submit]').textContent = 'Salva modifiche'; cancel.hidden = false;
    modal.open(`Modifica: ${match.home_team} — ${match.away_team}`);
  };
  const setBusy = async (operation) => {
    if (busy) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    form.setAttribute('aria-busy', 'true');
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try { return await operation(); } finally { busy = false; root.removeAttribute('aria-busy'); form.removeAttribute('aria-busy'); submit.disabled = false; }
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
  (async () => { const access = await window.CapraiaAuth?.requireOperator?.(); if (!access?.isOperator || (!access.isSuperUser && !access.permissions?.can_matches)) { root.hidden = true; return; } try { reset(); await load(); } catch (error) { say(error.message || 'Impossibile caricare le gare.', 'error'); } })();
})();
