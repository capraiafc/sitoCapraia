import { selectFeaturedMatches, filterMatches, sortMatches, normalizeSeason, matchMonth, formatMatchDate, formatMatchTime } from './data/calendar-logic.js';

const CURRENT_SEASON = '2026-27';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const statusLabels = { scheduled: 'Da giocare', completed: 'Giocata', postponed: 'Rinviata', suspended: 'Sospesa', cancelled: 'Annullata', live: 'In corso' };
const isCapraia = (name) => /capraia/i.test(name || '');
const scoreExists = (value) => value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0;
const seasonLabel = (season) => normalizeSeason(season).replace('-', ' / ');

// URLs and all imported content are untrusted: render labels as text and allow only web images.
function imageUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value, document.baseURI);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function crest(name, source, className = '') {
  const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const url = imageUrl(source || (isCapraia(name) ? 'assets/images/capraia-logo.png' : ''));
  return `<span class="results-crest ${className}" aria-hidden="true"><span>${escapeHtml(initials)}</span>${url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async">` : ''}</span>`;
}

function competition(match) {
  const url = imageUrl(match.extra_info?.competition_logo);
  return `<span class="results-competition">${url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async">` : '<span class="results-competition-icon" aria-hidden="true">◆</span>'}<span>${escapeHtml(match.competition || 'Competizione da definire')}</span></span>`;
}

function score(match) {
  if (['completed', 'live', 'suspended'].includes(match.status) && scoreExists(match.home_score) && scoreExists(match.away_score)) {
    return `${Number(match.home_score)} <span aria-hidden="true">–</span><span class="sr-only">a</span> ${Number(match.away_score)}`;
  }
  return '<span class="results-vs">VS</span>';
}

function penalties(match) {
  const extra = match.extra_info || {};
  const home = match.home_penalties ?? extra.home_penalties;
  const away = match.away_penalties ?? extra.away_penalties;
  return scoreExists(home) && scoreExists(away) ? `<small class="results-penalties">Rigori ${Number(home)}–${Number(away)}</small>` : '';
}

function dateMarkup(match) {
  const label = `${formatMatchDate(match.kickoff_at, { weekday: 'short', day: 'numeric', month: 'long' })} · ${match.extra_info?.time_tbc ? 'Orario da definire' : formatMatchTime(match.kickoff_at)}`;
  return match.kickoff_at ? `<time datetime="${escapeHtml(match.kickoff_at)}">${escapeHtml(label)}</time>` : '<span>Data e ora da definire</span>';
}

function team(match, side, compact = false) {
  const name = match[`${side}_team`] || 'Avversario da definire';
  return `<div class="results-team ${isCapraia(name) ? 'results-team--us' : ''}">${crest(name, match.extra_info?.[`${side}_logo`], compact ? 'results-crest--small' : '')}<strong>${escapeHtml(name)}</strong></div>`;
}

function location(match) {
  return isCapraia(match.home_team) ? 'In casa' : 'In trasferta';
}

function featuredCard(match, next) {
  const title = next ? 'Prossimo match' : 'Ultimo match';
  const className = `results-feature ${next ? 'results-feature--next' : 'results-feature--last'}`;
  if (!match) return `<article class="${className} results-feature--empty"><div class="results-feature-top"><h3>${title}</h3><span class="results-feature-dot" aria-hidden="true"></span></div><div class="results-empty-feature"><strong>${next ? 'Il prossimo appuntamento' : 'La stagione è tutta da scrivere.'}</strong><p>${next ? 'Nessuna nuova gara con data confermata. Trovi qui sotto gli eventuali recuperi da programmare.' : 'Non ci sono ancora risultati finali registrati per questa stagione.'}</p></div></article>`;
  return `<article class="${className}"><div class="results-feature-top"><h3>${title}</h3><span class="results-venue-tag">${location(match)}</span></div>${competition(match)}<div class="results-feature-date">${dateMarkup(match)}</div><div class="results-scoreboard">${team(match, 'home')}<div class="results-score"><b>${score(match)}</b><small>${escapeHtml(statusLabels[match.status] || 'Da confermare')}</small>${penalties(match)}</div>${team(match, 'away')}</div><div class="results-feature-bottom"><span class="results-place">${escapeHtml(match.venue || 'Campo da confermare')}</span><span>${escapeHtml(match.phase || (match.match_day ? `Giornata ${match.match_day}` : ''))}</span></div></article>`;
}

function matchRow(match) {
  return `<article class="results-row" data-status="${escapeHtml(match.status)}"><div class="results-row-meta">${competition(match)}<span class="results-status">${escapeHtml(statusLabels[match.status] || 'Da confermare')}</span></div><div class="results-row-main"><div class="results-row-date">${dateMarkup(match)}<span>${location(match)}</span></div><div class="results-row-teams">${team(match, 'home', true)}<div class="results-row-score"><b>${score(match)}</b>${penalties(match)}</div>${team(match, 'away', true)}</div></div><div class="results-row-detail"><span>${escapeHtml(match.venue || 'Campo da confermare')}</span><span>${escapeHtml(match.phase || (match.match_day ? `Giornata ${match.match_day}` : ''))}</span>${match.notes ? `<p>${escapeHtml(match.notes)}</p>` : ''}</div></article>`;
}

function monthLabel(value) {
  if (!value) return 'Data da definire';
  return formatMatchDate(`${value}-15T12:00:00Z`, { month: 'long', year: 'numeric' });
}

/** One instance per section. Updating data preserves filters, keyboard focus and scroll. */
export function initResults({ root, matches = [], onOpenHistory, now } = {}) {
  if (!root) return { update() {}, destroy() {}, setNotice() {} };
  let records = matches;
  let state = { season: CURRENT_SEASON, competition: '', month: '', detailed: false };
  let destroyed = false;
  let previousFeatured = '';
  root.classList.add('results-section');
  root.innerHTML = `<div class="results-heading"><div><p class="eyebrow">Capraia Football Club</p><h2 id="match-title">Ogni partita.<br><em>La nostra stagione.</em></h2></div><a class="results-history-link" href="#storico" data-open-history>Archivio stagioni <span aria-hidden="true">↗</span></a></div><div class="results-featured" data-results-featured></div><div class="results-calendar"><div class="results-calendar-heading"><div><p class="eyebrow">Tutti gli appuntamenti</p><h3 id="results-calendar-title">Calendario e risultati</h3></div><div class="results-view-switch" role="group" aria-label="Visualizzazione partite"><button type="button" data-results-view="compact" aria-pressed="true">Compatta</button><button type="button" data-results-view="detailed" aria-pressed="false">Dettagliata</button></div></div><div class="results-filters"><label>Stagione<select data-results-season aria-label="Filtra per stagione"></select></label><label>Competizione<select data-results-competition aria-label="Filtra per competizione"></select></label><label>Mese<select data-results-month aria-label="Filtra per mese"></select></label><button type="button" class="results-reset" data-results-reset>Azzera filtri</button></div><div class="results-list-caption"><p data-results-count role="status" aria-live="polite" aria-atomic="true"></p><span>Scorri per tutte le partite ↓</span></div><p class="results-notice" data-results-notice role="status" hidden></p><div class="results-scroll" tabindex="0" role="region" aria-labelledby="results-calendar-title" data-results-list></div><p class="results-time-note">Orari locali italiani. Date e campi possono essere aggiornati dalla società.</p></div>`;

  const query = (selector) => root.querySelector(selector);
  const list = query('[data-results-list]');
  const seasonSelect = query('[data-results-season]');
  const competitionSelect = query('[data-results-competition]');
  const monthSelect = query('[data-results-month]');
  const featureRoot = query('[data-results-featured]');

  function options(select, values, selected, label, formatter = (value) => value) {
    select.innerHTML = `${label ? `<option value="">${label}</option>` : ''}${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(formatter(value))}</option>`).join('')}`;
    select.value = selected;
  }

  function render({ resetScroll = false } = {}) {
    if (destroyed) return;
    const seasons = [...new Set([CURRENT_SEASON, ...records.filter((match) => match.published === true).map((match) => normalizeSeason(match.season_id)).filter(Boolean)])].sort().reverse();
    const seasonMatches = filterMatches(records, { season: state.season });
    const competitions = [...new Set(seasonMatches.map((match) => match.competition).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
    if (!competitions.includes(state.competition)) state.competition = '';
    const months = [...new Set(filterMatches(seasonMatches, { competition: state.competition }).map((match) => matchMonth(match.kickoff_at)).filter(Boolean))].sort();
    if (!months.includes(state.month)) state.month = '';
    options(seasonSelect, seasons, state.season, '', seasonLabel);
    options(competitionSelect, competitions, state.competition, 'Tutte le competizioni');
    options(monthSelect, months, state.month, 'Tutti i mesi', monthLabel);
    const { lastMatch, nextMatch } = selectFeaturedMatches(seasonMatches, now === undefined ? Date.now() : now);
    const featured = `${featuredCard(lastMatch, false)}${featuredCard(nextMatch, true)}`;
    if (featured !== previousFeatured) {
      featureRoot.innerHTML = featured;
      previousFeatured = featured;
    }
    const visible = sortMatches(filterMatches(seasonMatches, { competition: state.competition, month: state.month }));
    query('[data-results-count]').textContent = `${visible.length} ${visible.length === 1 ? 'partita' : 'partite'} · ${seasonLabel(state.season)}`;
    const scrollTop = list.scrollTop;
    let previousMonth = null;
    list.innerHTML = visible.length ? visible.map((match) => {
      const month = matchMonth(match.kickoff_at) || '';
      const heading = month !== previousMonth ? `<h4 class="results-month-heading">${escapeHtml(monthLabel(month))}</h4>` : '';
      previousMonth = month;
      return heading + matchRow(match);
    }).join('') : '<div class="results-empty-list"><strong>Nessuna partita da mostrare</strong><p>Prova un altro mese o una competizione diversa. Il calendario viene aggiornato dalla società.</p></div>';
    list.scrollTop = resetScroll ? 0 : scrollTop;
    list.dataset.view = state.detailed ? 'detailed' : 'compact';
  }

  function onChange(event) {
    if (event.target === seasonSelect) { state.season = seasonSelect.value; state.competition = ''; state.month = ''; }
    else if (event.target === competitionSelect) { state.competition = competitionSelect.value; state.month = ''; }
    else if (event.target === monthSelect) state.month = monthSelect.value;
    else return;
    render({ resetScroll: true });
  }

  function onClick(event) {
    const viewButton = event.target.closest('[data-results-view]');
    if (viewButton) {
      state.detailed = viewButton.dataset.resultsView === 'detailed';
      root.querySelectorAll('[data-results-view]').forEach((button) => button.setAttribute('aria-pressed', String(button === viewButton)));
      list.dataset.view = state.detailed ? 'detailed' : 'compact';
    }
    if (event.target.closest('[data-results-reset]')) {
      state.competition = ''; state.month = '';
      render({ resetScroll: true });
    }
    if (onOpenHistory && event.target.closest('[data-open-history]')) { event.preventDefault(); onOpenHistory(); }
  }

  // Captured image errors expose the readable monogram without another network request.
  function onImageError(event) {
    if (event.target.tagName === 'IMG') event.target.remove();
  }
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  root.addEventListener('error', onImageError, true);
  render();
  return {
    update(nextMatches) { records = Array.isArray(nextMatches) ? nextMatches : []; render(); },
    setNotice(message = '') { const notice = query('[data-results-notice]'); notice.textContent = message; notice.hidden = !message; },
    destroy() { destroyed = true; root.removeEventListener('change', onChange); root.removeEventListener('click', onClick); root.removeEventListener('error', onImageError, true); },
  };
}
