import '../../../auth.js?v=kit-permissions-20260811';
import {
  assignKitItem, listEligiblePlayers, listKitInventory, listKitRequests, listPlayerKit,
  listPlayersWithMissingKit, markKitItemMissing, resolveKitRequest, setKitStock,
} from './kit-service.js?v=kit-permissions-20260811';

const $ = (selector, root = document) => root.querySelector(selector);
const byCategory = (items) => items.reduce((groups, item) => {
  (groups[item.category] ||= []).push(item); return groups;
}, {});
const categoryName = (category) => category === 'training' ? 'Allenamento' : 'Passeggio';

function option(value, label) {
  const element = document.createElement('option'); element.value = value; element.textContent = label; return element;
}

function start(root) {
  const inventoryRoot = $('[data-kit-inventory]', root);
  const missingRoot = $('[data-kit-missing-players]', root);
  const feedback = $('[data-kit-feedback]', root);
  const assignDialog = $('[data-kit-assign-dialog]');
  const assignForm = $('[data-kit-assign-form]', assignDialog);
  const playerDialog = $('[data-kit-player-dialog]');
  const playerSelect = $('[data-kit-player-select]', playerDialog);
  const playerItems = $('[data-kit-player-items]', playerDialog);
  const kpiItems = $('[data-kit-item-count]', root);
  const kpiMissing = $('[data-kit-missing-count]', root);
  const kpiStock = $('[data-kit-stock-count]', root);
  const requestsRoot = $('[data-kit-requests]', root);
  const requestCount = $('[data-kit-request-count]', root);
  const resolutionDialog = $('[data-kit-resolution-dialog]');
  const resolutionForm = $('[data-kit-resolution-form]', resolutionDialog);
  const resolutionDetail = $('[data-kit-resolution-detail]', resolutionDialog);
  let inventory = [];
  let players = [];
  let requests = [];
  let selectedRequestId = null;

  const say = (message, state = 'info') => { feedback.textContent = message; feedback.dataset.state = state; };
  const close = (dialog) => { if (dialog.open) dialog.close(); };
  const open = (dialog) => { if (!dialog.open) dialog.showModal(); };

  function renderInventory() {
    inventoryRoot.replaceChildren();
    const groups = byCategory(inventory);
    Object.entries(groups).forEach(([category, items]) => {
      const section = document.createElement('section'); section.className = 'kit-category';
      const heading = document.createElement('h3'); heading.textContent = categoryName(category); section.append(heading);
      const uniqueItems = [...new Map(items.map((item) => [item.item_id, item])).values()];
      uniqueItems.forEach((item) => {
        const card = document.createElement('article'); card.className = 'kit-item-card';
        const title = document.createElement('h4'); title.textContent = item.item_name;
        const sizes = document.createElement('div'); sizes.className = 'kit-size-grid';
        items.filter((entry) => entry.item_id === item.item_id).forEach((entry) => {
          const form = document.createElement('form'); form.className = 'kit-stock-size';
          const label = document.createElement('label'); label.textContent = entry.size;
          const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '10000'; input.step = '1'; input.value = String(entry.quantity); input.setAttribute('aria-label', `Disponibilità ${entry.item_name}, taglia ${entry.size}`);
          const assigned = document.createElement('small'); assigned.textContent = `${entry.assigned_count} consegnati`;
          const button = document.createElement('button'); button.type = 'submit'; button.className = 'link-button'; button.textContent = 'Aggiorna';
          form.addEventListener('submit', async (event) => {
            event.preventDefault(); button.disabled = true;
            try { await setKitStock(entry.item_size_id, input.value); await load(); say(`Disponibilità ${entry.item_name} · ${entry.size} aggiornata.`, 'success'); }
            catch (error) { say(error.message || 'Non è stato possibile aggiornare la disponibilità.', 'error'); }
            finally { button.disabled = false; }
          });
          label.append(input); form.append(label, assigned, button); sizes.append(form);
        });
        card.append(title, sizes); section.append(card);
      });
      inventoryRoot.append(section);
    });
  }

  function renderMissing(missing) {
    missingRoot.replaceChildren();
    if (!missing.length) { missingRoot.textContent = 'Nessun giocatore ha materiale mancante.'; return; }
    const list = document.createElement('ol');
    missing.forEach((player) => {
      const item = document.createElement('li'); item.textContent = `${player.display_name} · ${player.missing_count} oggetti mancanti`; list.append(item);
    });
    missingRoot.append(list);
  }

  function updateKpis(missing) {
    kpiItems.textContent = String(new Set(inventory.map((item) => item.item_id)).size);
    kpiMissing.textContent = String(missing.reduce((total, item) => total + Number(item.missing_count || 0), 0));
    kpiStock.textContent = String(inventory.reduce((total, item) => total + Number(item.quantity || 0), 0));
  }

  function renderRequests() {
    requestCount.textContent = String(requests.length);
    requestsRoot.replaceChildren();
    if (!requests.length) { requestsRoot.textContent = 'Nessuna richiesta in attesa.'; return; }
    const list = document.createElement('ul'); list.className = 'kit-request-list';
    requests.forEach((request) => {
      const item = document.createElement('li');
      const details = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = `${request.player_name} · ${request.item_name} · ${request.size}`;
      const note = document.createElement('small'); note.textContent = request.reason;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'link-button'; button.textContent = 'Apri';
      button.addEventListener('click', () => {
        selectedRequestId = request.id;
        resolutionDetail.textContent = `${request.player_name} richiede ${request.item_name}, taglia ${request.size}. Motivazione: ${request.reason}`;
        resolutionForm.reset(); resolutionForm.elements.outcome.value = 'approved';
        $('[data-kit-rejection-reason]', resolutionForm).hidden = true;
        open(resolutionDialog);
      });
      details.append(title, note); item.append(details, button); list.append(item);
    });
    requestsRoot.append(list);
  }

  function fillAssignmentSelects() {
    const player = assignForm.elements.player_id;
    const itemSize = assignForm.elements.item_size_id;
    player.replaceChildren(option('', 'Seleziona giocatore'), ...players.map((entry) => option(entry.id, entry.display_name)));
    itemSize.replaceChildren(option('', 'Seleziona articolo e taglia'), ...inventory.map((entry) => option(entry.item_size_id, `${entry.item_name} · ${entry.size} · disponibili ${entry.quantity}`)));
  }

  async function loadPlayerMaterial() {
    const playerId = playerSelect.value;
    playerItems.replaceChildren();
    if (!playerId) return;
    try {
      const assignments = await listPlayerKit(playerId);
      assignments.forEach((entry) => {
        const row = document.createElement('div'); row.className = 'kit-player-item'; row.dataset.state = entry.status;
        const detail = document.createElement('span'); detail.textContent = `${entry.item_name}${entry.size ? ` · ${entry.size}` : ''}`;
        const status = document.createElement('strong'); status.textContent = entry.status === 'assigned' ? 'Consegnato' : 'Mancante';
        row.append(detail, status);
        if (entry.status === 'assigned') {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'link-button'; button.textContent = 'Segna mancante';
          button.addEventListener('click', async () => {
            button.disabled = true;
            try { await markKitItemMissing(playerId, entry.item_id); await load(); await loadPlayerMaterial(); say(`${entry.item_name} segnato come mancante.`, 'success'); }
            catch (error) { say(error.message || 'Non è stato possibile aggiornare il materiale.', 'error'); }
            finally { button.disabled = false; }
          });
          row.append(button);
        }
        playerItems.append(row);
      });
    } catch (error) { say(error.message || 'Non è stato possibile caricare il materiale del giocatore.', 'error'); }
  }

  async function load() {
    const [nextInventory, nextPlayers, missing, nextRequests] = await Promise.all([listKitInventory(), listEligiblePlayers(), listPlayersWithMissingKit(), listKitRequests()]);
    inventory = nextInventory; players = nextPlayers; requests = nextRequests;
    renderInventory(); renderMissing(missing); renderRequests(); updateKpis(missing); fillAssignmentSelects();
    const selected = playerSelect.value;
    playerSelect.replaceChildren(option('', 'Seleziona giocatore'), ...players.map((entry) => option(entry.id, entry.display_name)));
    if (players.some((entry) => entry.id === selected)) playerSelect.value = selected;
  }

  $('[data-kit-open-assign]', root).addEventListener('click', () => { fillAssignmentSelects(); open(assignDialog); });
  $('[data-kit-open-player]', root).addEventListener('click', () => { open(playerDialog); });
  $$('[data-kit-dialog-close]').forEach((button) => button.addEventListener('click', () => close(button.closest('dialog'))));
  playerSelect.addEventListener('change', loadPlayerMaterial);
  assignForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const submit = $('[data-kit-assign-submit]', assignForm); submit.disabled = true;
    try { await assignKitItem(assignForm.elements.player_id.value, assignForm.elements.item_size_id.value); close(assignDialog); await load(); say('Materiale assegnato e magazzino aggiornato.', 'success'); }
    catch (error) { say(error.message || 'Non è stato possibile assegnare il materiale.', 'error'); }
    finally { submit.disabled = false; }
  });
  resolutionForm.elements.outcome.addEventListener('change', () => {
    const rejected = resolutionForm.elements.outcome.value === 'rejected';
    const reason = $('[data-kit-rejection-reason]', resolutionForm); reason.hidden = !rejected; reason.querySelector('textarea').required = rejected;
  });
  resolutionForm.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!selectedRequestId) return;
    const submit = $('[data-kit-resolution-submit]', resolutionForm); submit.disabled = true;
    try {
      const result = await resolveKitRequest(selectedRequestId, resolutionForm.elements.outcome.value, resolutionForm.elements.rejection_reason.value);
      close(resolutionDialog); await load(); say(result.emailSent ? 'Richiesta gestita ed email inviata al giocatore.' : 'Richiesta gestita, ma email non inviata.', result.emailSent ? 'success' : 'error');
    } catch (error) { say(error.message || 'Non è stato possibile gestire la richiesta.', 'error'); }
    finally { submit.disabled = false; }
  });

  (async () => {
    const access = await window.CapraiaAuth?.requireOperator?.();
    if (!access?.isSuperUser && (!access?.permissions?.can_kit || access?.permissions?.is_player_self_service)) { root.hidden = true; root.parentElement.querySelector('[data-kit-denied]')?.removeAttribute('hidden'); return; }
    try { await load(); } catch (error) { say(error.message || 'Impossibile caricare il kit giocatori.', 'error'); }
  })();
}

const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
document.querySelectorAll('[data-kit-management]').forEach(start);
