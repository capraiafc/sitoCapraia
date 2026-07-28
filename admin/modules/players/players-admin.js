import '../../../auth.js?v=admin-permissions-20260729';
import { createCollectionUi, moveFormToModal, PAGE_SIZE } from '../../crud-ui.js?v=player-navigation-20260728';
import {
  createPlayer, listPlayers, removePlayer, updateOwnPlayerProfile, updatePlayer, withdrawOwnPlayer,
} from './players-service.js?v=player-self-service-20260727';
import { addImageUploadFields, removeImage, resolveImageChange } from '../../media.js';
import {
  downloadMedicalDocument, removeMedicalDocument, uploadMedicalDocument, validateMedicalDocument,
} from './medical-documents.js?v=player-self-service-20260727';
import { getPlayerListView } from './players-list-state.js?v=player-navigation-20260728';

const positions = { portiere: 'Portiere', difensore: 'Difensore', centrocampista: 'Centrocampista', attaccante: 'Attaccante', staff: 'Staff' };
const statuses = { active: 'In rosa', injured: 'Infortunato', unavailable: 'Indisponibile', staff: 'Staff', former: 'Ex rosa' };
const activeStatuses = new Set(['active', 'injured', 'unavailable']);
const dateFormatter = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });

const formValues = (form) => {
  const data = new FormData(form);
  return {
    first_name: data.get('first_name'),
    last_name: data.get('last_name'),
    squad_number: data.get('squad_number'),
    position: data.get('position'),
    status: data.get('status'),
    birth_year: data.get('birth_year'),
    kit_size: data.get('kit_size'),
    email: data.get('email'),
    medical_exam_expiry: data.get('medical_exam_expiry'),
    bio: data.get('bio'),
    image_url: data.get('image_url'),
    image_path: data.get('image_path'),
    published: data.get('published') === 'on',
  };
};

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const target = Date.parse(`${isoDate}T00:00:00.000Z`);
  return Number.isFinite(target) ? Math.ceil((target - todayUtc) / 86_400_000) : null;
}

function medicalLabel(days) {
  if (days === null) return 'Scadenza non inserita';
  if (days < 0) return `Scaduta da ${Math.abs(days)} giorni`;
  if (days === 0) return 'Scade oggi';
  return `${days} giorni`;
}

function medicalState(days) {
  if (days === null) return 'missing';
  if (days < 0) return 'expired';
  if (days <= 10) return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}

function createKpi(label, value, note) {
  const card = document.createElement('article');
  card.className = 'players-kpi';
  const heading = document.createElement('span'); heading.textContent = label;
  const total = document.createElement('strong'); total.textContent = value;
  const description = document.createElement('small'); description.textContent = note;
  card.append(heading, total, description);
  return card;
}

function createBarChart(title, entries) {
  const card = document.createElement('article');
  card.className = 'players-insights__card';
  const heading = document.createElement('h3'); heading.textContent = title;
  const chart = document.createElement('div'); chart.className = 'players-bars';
  const max = Math.max(1, ...entries.map((entry) => entry.value));
  entries.forEach((entry) => {
    const row = document.createElement('div'); row.className = 'players-bars__row';
    const label = document.createElement('span'); label.textContent = entry.label;
    const bar = document.createElement('i');
    bar.style.setProperty('--bar-size', `${entry.value ? Math.max(7, (entry.value / max) * 100) : 0}%`);
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', entry.label);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(max));
    bar.setAttribute('aria-valuenow', String(entry.value));
    const value = document.createElement('b'); value.textContent = String(entry.value);
    row.append(label, bar, value); chart.append(row);
  });
  card.append(heading, chart);
  return card;
}

function renderPlayerDashboard(root, players) {
  if (!root) return;
  const squad = players.filter((player) => activeStatuses.has(player.status));
  const currentYear = new Date().getFullYear();
  const ages = squad.map((player) => Number(player.birth_year) ? currentYear - Number(player.birth_year) : null).filter((age) => age && age > 0 && age < 100);
  const averageAge = ages.length ? (ages.reduce((total, age) => total + age, 0) / ages.length).toFixed(1).replace('.', ',') : '—';
  const expiring = squad
    .map((player) => ({ player, days: daysUntil(player.medical_exam_expiry) }))
    .filter((item) => item.days !== null)
    .sort((a, b) => a.days - b.days);
  const dueSoon = expiring.filter((item) => item.days <= 30).length;
  const kitCoverage = squad.filter((player) => player.kit_size).length;

  const kpis = document.createElement('div'); kpis.className = 'players-kpis';
  kpis.append(
    createKpi('Calciatori in rosa', String(squad.length), `${players.length - squad.length} tra staff ed ex rosa`),
    createKpi('Età media', averageAge === '—' ? averageAge : `${averageAge} anni`, `${ages.length} età disponibili`),
    createKpi('Visite da gestire', String(dueSoon), 'Scadute o entro 30 giorni'),
    createKpi('Kit assegnati', `${kitCoverage}/${squad.length}`, 'Giocatori con taglia inserita'),
  );

  const medicalCard = document.createElement('article'); medicalCard.className = 'players-insights__card players-medical';
  const medicalTitle = document.createElement('h3'); medicalTitle.textContent = 'Scadenze visite più vicine';
  const medicalList = document.createElement('ol');
  const upcoming = expiring.slice(0, 8);
  if (!upcoming.length) {
    const empty = document.createElement('li'); empty.textContent = 'Nessuna scadenza visita inserita.'; medicalList.append(empty);
  }
  upcoming.forEach(({ player, days }) => {
    const item = document.createElement('li'); item.dataset.state = medicalState(days);
    const name = document.createElement('strong'); name.textContent = player.display_name;
    const date = document.createElement('time'); date.dateTime = player.medical_exam_expiry; date.textContent = dateFormatter.format(new Date(`${player.medical_exam_expiry}T00:00:00`));
    const urgency = document.createElement('i');
    const urgencyValue = days < 0 ? 100 : Math.max(6, 100 - (Math.min(days, 30) / 30) * 100);
    urgency.style.setProperty('--medical-urgency', `${urgencyValue}%`);
    urgency.setAttribute('role', 'progressbar');
    urgency.setAttribute('aria-label', `Urgenza visita medica di ${player.display_name}`);
    urgency.setAttribute('aria-valuemin', '0');
    urgency.setAttribute('aria-valuemax', '100');
    urgency.setAttribute('aria-valuenow', String(Math.round(urgencyValue)));
    const badge = document.createElement('span'); badge.textContent = medicalLabel(days);
    item.append(name, date, urgency, badge); medicalList.append(item);
  });
  medicalCard.append(medicalTitle, medicalList);

  const ageEntries = [
    ['Under 20', (age) => age < 20],
    ['20–24', (age) => age >= 20 && age <= 24],
    ['25–29', (age) => age >= 25 && age <= 29],
    ['30–34', (age) => age >= 30 && age <= 34],
    ['35+', (age) => age >= 35],
  ].map(([label, test]) => ({ label, value: ages.filter(test).length }));

  const roleEntries = ['portiere', 'difensore', 'centrocampista', 'attaccante']
    .map((position) => ({ label: positions[position], value: squad.filter((player) => player.position === position).length }));

  const charts = document.createElement('div'); charts.className = 'players-insights__grid';
  charts.append(medicalCard, createBarChart('Fasce di età', ageEntries), createBarChart('Distribuzione per ruolo', roleEntries));
  root.replaceChildren(kpis, charts);
}

function start(root) {
  const form = root.querySelector('[data-player-form]');
  addImageUploadFields(form, { urlField: 'image_url' });
  const list = root.querySelector('[data-player-list]');
  const feedback = root.querySelector('[data-player-feedback]');
  const title = root.querySelector('[data-player-form-title]');
  const cancel = root.querySelector('[data-player-cancel]');
  const submit = form.querySelector('[type="submit"]');
  const empty = root.querySelector('[data-player-empty]');
  const dashboard = root.closest('#rosa')?.querySelector('[data-player-dashboard]');
  const selfServiceIntro = root.closest('#rosa')?.querySelector('[data-player-self-service-intro]');
  const medicalCurrent = form.querySelector('[data-player-medical-current]');
  const medicalName = form.querySelector('[data-player-medical-name]');
  const downloadCurrentMedical = form.querySelector('[data-player-download-medical]');
  const modal = moveFormToModal({ form, id: 'player-edit-modal', title: 'Inserisci nuovo giocatore' });
  const collection = createCollectionUi({ root, list, addLabel: 'Inserisci nuovo giocatore', searchPlaceholder: 'Nome, ruolo, taglia o numero…' });
  let players = [];
  let editingId = null;
  let page = 1;
  let navigationLocked = false;
  let access = null;
  let selfService = false;

  const say = (text, state = 'info') => { feedback.textContent = text; feedback.dataset.state = state; };
  const busy = (on) => { submit.disabled = on; root.toggleAttribute('aria-busy', on); };
  const reset = () => {
    form.reset();
    form.elements.position.value = 'centrocampista';
    form.elements.status.value = 'active';
    form.elements.published.checked = true;
    editingId = null;
    title.textContent = 'Inserisci nuovo giocatore';
    submit.textContent = 'Aggiungi alla rosa';
    cancel.hidden = true;
    medicalCurrent.hidden = true;
    medicalName.textContent = '';
    form.dataset.initialMedicalExpiry = '';
  };

  const setSelfServiceMode = () => {
    selfService = Boolean(access?.permissions?.is_player_self_service && access?.permissions?.player_id);
    root.classList.toggle('players-admin--self-service', selfService);
    if (!selfService) return;
    if (dashboard) dashboard.hidden = true;
    if (selfServiceIntro) selfServiceIntro.hidden = false;
    collection.add.hidden = true;
    collection.search.closest('label').hidden = true;
    root.closest('#rosa')?.querySelector('h2')?.replaceChildren('La mia ', Object.assign(document.createElement('em'), { textContent: 'scheda.' }));
    form.querySelectorAll('[data-player-admin-only]').forEach((field) => {
      field.hidden = true;
      field.querySelectorAll('input, select, textarea').forEach((control) => { control.disabled = true; });
    });
    ['image_file', 'remove_image'].forEach((name) => {
      const control = form.elements[name];
      if (!control) return;
      control.disabled = true;
      if (control.closest('label')) control.closest('label').hidden = true;
    });
    form.elements.medical_exam_expiry.required = true;
  };

  const row = (player) => {
    const item = document.createElement('li'); item.className = 'players-admin__item'; item.dataset.playerId = player.id;
    const summary = document.createElement('div'); summary.className = 'players-admin__summary';
    const name = document.createElement('strong'); name.textContent = `${player.squad_number ? `${player.squad_number} · ` : ''}${player.display_name}`;
    const meta = document.createElement('small');
    const expiryDays = daysUntil(player.medical_exam_expiry);
    meta.textContent = `${positions[player.position] || player.position} · ${statuses[player.status] || player.status} · Kit ${player.kit_size || '—'} · Visita: ${medicalLabel(expiryDays)}${player.published ? '' : ' · Bozza'}`;
    const contact = document.createElement('small'); contact.textContent = player.email || 'Email non inserita';
    summary.append(name, meta, contact);
    if (player.medical_document_name) {
      const document = document.createElement('small'); document.textContent = `Documento: ${player.medical_document_name}`; summary.append(document);
    }
    const actions = document.createElement('div'); actions.className = 'players-admin__actions';
    const availableActions = selfService
      ? [['edit', 'Modifica la mia scheda'], ...(player.medical_document_path ? [['download-medical', 'Scarica visita']] : []), ...(player.status !== 'former' ? [['withdraw', 'Esci dalla rosa']] : [])]
      : [['edit', 'Modifica'], ...(player.medical_document_path ? [['download-medical', 'Scarica visita']] : []), ['remove', 'Rimuovi']];
    availableActions.forEach(([action, label]) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `players-admin__button ${action === 'remove' || action === 'withdraw' ? 'players-admin__button--danger' : ''}`; button.dataset.action = action; button.textContent = label; actions.append(button);
    });
    item.append(summary, actions);
    return item;
  };

  const renderPagination = (totalItems) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    page = Math.min(Math.max(1, page), totalPages);
    collection.pagination.replaceChildren();
    const changePage = (nextPage) => {
      if (navigationLocked || nextPage < 1 || nextPage > totalPages || nextPage === page) return;
      navigationLocked = true;
      page = nextPage;
      render();
      window.setTimeout(() => {
        navigationLocked = false;
        renderPagination(totalItems);
      }, 350);
    };
    const previous = document.createElement('button');
    previous.type = 'button'; previous.textContent = '← Precedente'; previous.disabled = navigationLocked || page === 1;
    previous.addEventListener('click', () => changePage(page - 1));
    const summary = document.createElement('span');
    summary.textContent = `${totalItems} ${totalItems === 1 ? 'giocatore' : 'giocatori'} · Pagina ${page} di ${totalPages}`;
    const next = document.createElement('button');
    next.type = 'button'; next.textContent = 'Successiva →'; next.disabled = navigationLocked || page === totalPages;
    next.addEventListener('click', () => changePage(page + 1));
    collection.pagination.append(previous, summary, next);
  };

  const render = () => {
    if (!selfService) renderPlayerDashboard(dashboard, players);
    const view = getPlayerListView(players, collection.search.value, page, PAGE_SIZE);
    page = view.page;
    list.replaceChildren(...view.items.map(row));
    if (!view.items.length) { const item = document.createElement('li'); item.textContent = 'Nessun giocatore trovato.'; list.append(item); }
    if (empty) empty.hidden = true;
    renderPagination(view.filtered.length);
  };

  const load = async () => {
    players = await listPlayers({ playerId: selfService ? access.permissions.player_id : null });
    render();
  };
  const edit = (player) => {
    editingId = player.id;
    Object.entries(player).forEach(([key, value]) => {
      if (!form.elements[key]) return;
      if (key === 'published') form.elements[key].checked = value;
      else form.elements[key].value = value ?? '';
    });
    title.textContent = `Modifica ${player.display_name}`;
    submit.textContent = 'Salva modifiche';
    cancel.hidden = false;
    form.dataset.initialMedicalExpiry = player.medical_exam_expiry || '';
    medicalCurrent.hidden = !player.medical_document_path;
    medicalName.textContent = player.medical_document_name || 'Documento visita medica';
    modal.open(`Modifica giocatore: ${player.display_name}`);
  };

  collection.add.addEventListener('click', () => { reset(); modal.open('Inserisci nuovo giocatore'); });
  const updateSearch = () => { navigationLocked = false; page = 1; render(); };
  collection.search.addEventListener('input', updateSearch);
  collection.search.addEventListener('search', updateSearch);
  collection.search.addEventListener('change', updateSearch);
  cancel.addEventListener('click', () => { reset(); modal.close(); });
  downloadCurrentMedical.addEventListener('click', () => {
    const player = players.find((item) => item.id === editingId);
    if (!player) return;
    downloadMedicalDocument(player.medical_document_path, player.medical_document_name)
      .catch((error) => say(error.message || 'Non è stato possibile scaricare il documento.', 'error'));
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); busy(true);
    let uploadedMedical = null;
    try {
      const wasEditing = Boolean(editingId);
      const currentPlayer = players.find((item) => item.id === editingId) || null;
      const payload = formValues(form);
      const medicalFile = form.elements.medical_document_file.files?.[0] || null;
      validateMedicalDocument(medicalFile);
      const expiryChanged = wasEditing && payload.medical_exam_expiry !== (currentPlayer?.medical_exam_expiry || '');
      if (expiryChanged && !medicalFile) throw new Error('Per cambiare la scadenza devi caricare il nuovo documento della visita.');

      let image = { url: null, path: null, removePath: null };
      if (!selfService) {
        image = await resolveImageChange({ form, folder: 'players', urlField: 'image_url' });
        payload.image_url = image.url;
        payload.image_path = image.path;
      }

      if (wasEditing && medicalFile) {
        uploadedMedical = await uploadMedicalDocument(medicalFile, editingId);
        Object.assign(payload, {
          medical_document_path: uploadedMedical.path,
          medical_document_name: uploadedMedical.name,
          medical_document_mime_type: uploadedMedical.mimeType,
          medical_document_size: uploadedMedical.size,
          medical_document_uploaded_at: new Date().toISOString(),
        });
      }

      if (selfService) {
        if (!wasEditing) throw new Error('Scheda personale non disponibile.');
        await updateOwnPlayerProfile(payload);
      } else if (wasEditing) {
        await updatePlayer(editingId, payload);
      } else {
        const created = await createPlayer(payload);
        if (medicalFile) {
          uploadedMedical = await uploadMedicalDocument(medicalFile, created.id);
          await updatePlayer(created.id, {
            ...payload,
            medical_document_path: uploadedMedical.path,
            medical_document_name: uploadedMedical.name,
            medical_document_mime_type: uploadedMedical.mimeType,
            medical_document_size: uploadedMedical.size,
            medical_document_uploaded_at: new Date().toISOString(),
          });
        }
      }

      if (!selfService && image.removePath && image.removePath !== image.path) await removeImage(image.removePath).catch(() => {});
      if (uploadedMedical && currentPlayer?.medical_document_path && currentPlayer.medical_document_path !== uploadedMedical.path) {
        await removeMedicalDocument(currentPlayer.medical_document_path).catch((cleanupError) => {
          console.warn('Il nuovo documento è stato salvato, ma il precedente non è stato eliminato.', cleanupError);
        });
      }
      await load(); reset(); modal.close(); say(wasEditing ? 'Giocatore aggiornato.' : 'Giocatore aggiunto alla rosa.', 'success');
    } catch (error) {
      if (uploadedMedical?.path) await removeMedicalDocument(uploadedMedical.path).catch(() => {});
      say(error.message || 'Non è stato possibile salvare il giocatore.', 'error');
    } finally { busy(false); }
  });
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    const player = players.find((item) => item.id === button?.closest('[data-player-id]')?.dataset.playerId);
    if (!button || !player) return;
    if (button.dataset.action === 'edit') return edit(player);
    if (button.dataset.action === 'download-medical') {
      return downloadMedicalDocument(player.medical_document_path, player.medical_document_name)
        .catch((error) => say(error.message || 'Non è stato possibile scaricare il documento.', 'error'));
    }
    if (button.dataset.action === 'withdraw') {
      if (!window.confirm('Vuoi davvero uscire dalla rosa? La tua scheda non sarà più visibile sul sito e non entrerai nelle statistiche della squadra.')) return;
      busy(true);
      try {
        await withdrawOwnPlayer();
        await load();
        say('La tua scheda è stata rimossa dalla rosa pubblica.', 'success');
      } catch (error) { say(error.message || 'Non è stato possibile uscire dalla rosa.', 'error'); }
      finally { busy(false); }
      return;
    }
    if (!window.confirm(`Rimuovere ${player.display_name} dalla rosa?`)) return;
    busy(true);
    try {
      await removePlayer(player.id); await removeImage(player.image_path).catch(() => {}); await load(); say('Giocatore rimosso dalla rosa.', 'success');
    } catch (error) { say(error.message || 'Non è stato possibile rimuovere il giocatore.', 'error'); }
    finally { busy(false); }
  });

  (async () => {
    access = await window.CapraiaAuth?.requireOperator?.();
    if (!access?.isOperator) { root.hidden = true; root.parentElement.querySelector('[data-player-denied]')?.removeAttribute('hidden'); return; }
    try { reset(); setSelfServiceMode(); await load(); }
    catch (error) { say(error.message || 'Impossibile caricare la rosa.', 'error'); }
  })();
}

document.querySelectorAll('[data-player-management]').forEach(start);
