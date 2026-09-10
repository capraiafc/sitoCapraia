import './auth.js';
import { initResults } from './results.js';
import { selectFeaturedMatches, isCapraiaMatch } from './data/calendar-logic.js';

const root = document.querySelector('#partite');
const view = root ? initResults({ root, matches: [] }) : null;
const status = document.createElement('p');
status.className = 'results-connection-status';
status.setAttribute('role', 'status');
const retry = document.createElement('button');
retry.type = 'button';
retry.className = 'results-retry';
retry.textContent = 'Riprova';
retry.hidden = true;
root?.append(status, retry);
let loading = false;
let loaded = false;
let previousSnapshot = '';

// Only match data is polled. A failure in news/merch must not hide the calendar.
export async function refreshResults() {
  if (!view || loading) return;
  loading = true;
  retry.hidden = true;
  if (!loaded) { status.textContent = 'Caricamento delle partite…'; view.setNotice(status.textContent); }
  try {
    const client = window.CapraiaAuth?.supabase;
    if (!client) throw new Error('Calendario non configurato.');
    // Paginate so older seasons do not silently exhaust the API row limit.
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('matches').select('id,legacy_key,season_id,match_day,home_team,away_team,kickoff_at,venue,competition,phase,status,home_score,away_score,home_penalties,away_penalties,notes,referee,halftime_score,source_url,extra_info,published').eq('published', true)
        .order('kickoff_at', { ascending: false, nullsFirst: false }).order('id')
        .range(offset, offset + 499);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 500) break;
    }
    const snapshot = JSON.stringify(rows);
    // Recompute featured matches even when time, but not the data, changed.
    view.update(rows);
    root.append(status, retry);
    loaded = true;
    view.setNotice('');
    status.textContent = 'Aggiornamento automatico ogni minuto.';
    if (snapshot !== previousSnapshot) {
      previousSnapshot = snapshot;
      // The existing archive is a results-only view, not a future schedule.
      document.dispatchEvent(new CustomEvent('capraia:public-matches', {
        detail: rows.filter((row) => isCapraiaMatch(row) && row.status === 'completed' && Number.isInteger(row.home_score) && Number.isInteger(row.away_score)),
      }));
    }
    document.dispatchEvent(new CustomEvent('capraia:results-updated', { detail: { rows, ...selectFeaturedMatches(rows) } }));
  } catch (error) {
    status.textContent = loaded ? 'Aggiornamento non riuscito. Mostriamo le ultime partite caricate.' : 'Non riusciamo a caricare le partite. Riprova tra poco.';
    view.setNotice(status.textContent);
    retry.hidden = false;
    console.error('Calendario non disponibile:', error);
  } finally { loading = false; }
}
retry.addEventListener('click', refreshResults);
refreshResults();
window.setInterval(() => { if (!document.hidden) refreshResults(); }, 60_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshResults(); });
