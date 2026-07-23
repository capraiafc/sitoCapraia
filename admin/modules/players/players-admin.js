import '../../../auth.js?v=admin-permissions-20260729';
import { createCollectionUi, moveFormToModal, pageItems } from '../../crud-ui.js';
import { createPlayer, listPlayers, removePlayer, updatePlayer } from './players-service.js';
import { addImageUploadFields, removeImage, resolveImageChange } from '../../media.js';

const positions = { portiere: 'Portiere', difensore: 'Difensore', centrocampista: 'Centrocampista', attaccante: 'Attaccante', staff: 'Staff' };
const statuses = { active: 'In rosa', injured: 'Infortunato', unavailable: 'Indisponibile', staff: 'Staff', former: 'Ex rosa' };
const values = (form) => { const data = new FormData(form); return { first_name: data.get('first_name'), last_name: data.get('last_name'), squad_number: data.get('squad_number'), position: data.get('position'), status: data.get('status'), birth_year: data.get('birth_year'), bio: data.get('bio'), image_url: data.get('image_url'), image_path: data.get('image_path'), published: data.get('published') === 'on' }; };

function start(root) {
  const form = root.querySelector('[data-player-form]');
  addImageUploadFields(form, { urlField: 'image_url' });
  const list = root.querySelector('[data-player-list]');
  const feedback = root.querySelector('[data-player-feedback]');
  const title = root.querySelector('[data-player-form-title]');
  const cancel = root.querySelector('[data-player-cancel]');
  const submit = form.querySelector('[type="submit"]');
  const empty = root.querySelector('[data-player-empty]');
  const modal = moveFormToModal({ form, id: 'player-edit-modal', title: 'Inserisci nuovo giocatore' });
  const collection = createCollectionUi({ root, list, addLabel: 'Inserisci nuovo giocatore', searchPlaceholder: 'Nome, ruolo o numero…' });
  let players = []; let editingId = null; let page = 1;
  const say = (text, state = 'info') => { feedback.textContent = text; feedback.dataset.state = state; };
  const busy = (on) => { submit.disabled = on; root.toggleAttribute('aria-busy', on); };
  const reset = () => { form.reset(); form.elements.position.value = 'centrocampista'; form.elements.status.value = 'active'; form.elements.published.checked = true; editingId = null; title.textContent = 'Inserisci nuovo giocatore'; submit.textContent = 'Aggiungi alla rosa'; cancel.hidden = true; };
  const row = (player) => {
    const item = document.createElement('li'); item.className = 'players-admin__item'; item.dataset.playerId = player.id;
    const summary = document.createElement('div'); summary.className = 'players-admin__summary'; const name = document.createElement('strong'); name.textContent = `${player.squad_number ? `${player.squad_number} · ` : ''}${player.display_name}`; const meta = document.createElement('small'); meta.textContent = `${positions[player.position] || player.position} · ${statuses[player.status] || player.status}${player.published ? '' : ' · Bozza'}`; summary.append(name, meta);
    const actions = document.createElement('div'); actions.className = 'players-admin__actions'; [['edit', 'Modifica'], ['remove', 'Rimuovi']].forEach(([action, label]) => { const button = document.createElement('button'); button.type = 'button'; button.className = `players-admin__button ${action === 'remove' ? 'players-admin__button--danger' : ''}`; button.dataset.action = action; button.textContent = label; actions.append(button); }); item.append(summary, actions); return item;
  };
  const render = () => {
    const view = pageItems(players, collection.search.value, page, (player, query) => [player.display_name, player.first_name, player.last_name, player.position, player.status, player.squad_number].join(' ').toLocaleLowerCase('it').includes(query));
    page = view.page; list.replaceChildren(...view.items.map(row)); if (!view.items.length) { const item = document.createElement('li'); item.textContent = 'Nessun giocatore trovato.'; list.append(item); } if (empty) empty.hidden = true;
    collection.renderPagination({ page, totalItems: view.filtered.length, onPageChange(next) { page = next; render(); } });
  };
  const load = async () => { players = await listPlayers(); render(); };
  const edit = (player) => { editingId = player.id; Object.entries(player).forEach(([key, value]) => { if (!form.elements[key]) return; if (key === 'published') form.elements[key].checked = value; else form.elements[key].value = value ?? ''; }); title.textContent = `Modifica ${player.display_name}`; submit.textContent = 'Salva modifiche'; cancel.hidden = false; modal.open(`Modifica giocatore: ${player.display_name}`); };
  collection.add.addEventListener('click', () => { reset(); modal.open('Inserisci nuovo giocatore'); });
  collection.search.addEventListener('input', () => { page = 1; render(); });
  cancel.addEventListener('click', () => { reset(); modal.close(); });
  form.addEventListener('submit', async (event) => { event.preventDefault(); busy(true); try { const wasEditing = Boolean(editingId); const image = await resolveImageChange({ form, folder: 'players', urlField: 'image_url' }); const payload = values(form); payload.image_url = image.url; payload.image_path = image.path; if (wasEditing) await updatePlayer(editingId, payload); else await createPlayer(payload); if (image.removePath && image.removePath !== image.path) await removeImage(image.removePath).catch(() => {}); await load(); reset(); modal.close(); say(wasEditing ? 'Giocatore aggiornato.' : 'Giocatore aggiunto alla rosa.', 'success'); } catch (error) { say(error.message || 'Non è stato possibile salvare il giocatore.', 'error'); } finally { busy(false); } });
  list.addEventListener('click', async (event) => { const button = event.target.closest('button[data-action]'); const player = players.find((item) => item.id === button?.closest('[data-player-id]')?.dataset.playerId); if (!button || !player) return; if (button.dataset.action === 'edit') return edit(player); if (!window.confirm(`Rimuovere ${player.display_name} dalla rosa?`)) return; busy(true); try { await removePlayer(player.id); await removeImage(player.image_path).catch(() => {}); await load(); say('Giocatore rimosso dalla rosa.', 'success'); } catch (error) { say(error.message || 'Non è stato possibile rimuovere il giocatore.', 'error'); } finally { busy(false); } });
  (async () => { const access = await window.CapraiaAuth?.requireOperator?.(); if (!access?.isOperator) { root.hidden = true; root.parentElement.querySelector('[data-player-denied]')?.removeAttribute('hidden'); return; } try { reset(); await load(); } catch (error) { say(error.message || 'Impossibile caricare la rosa.', 'error'); } })();
}
document.querySelectorAll('[data-player-management]').forEach(start);
