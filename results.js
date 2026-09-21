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

function webUrl(value) {
  return imageUrl(value);
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

function detailTeam(match, side) {
  const name = match[`${side}_team`] || 'Avversario da definire';
  return `<div class="match-detail-team ${isCapraia(name) ? 'match-detail-team--us' : ''}">${crest(name, match.extra_info?.[`${side}_logo`], 'match-detail-crest')}<strong>${escapeHtml(name)}</strong></div>`;
}

function location(match) {
  return isCapraia(match.home_team) ? 'In casa' : 'In trasferta';
}

function played(match) {
  return match.status === 'completed' && scoreExists(match.home_score) && scoreExists(match.away_score);
}

function detailKey(match) {
  if (match.legacy_key) return match.legacy_key;
  const day = match.match_day ?? match.phase ?? match.id;
  return `${normalizeSeason(match.season_id)}:${day}`;
}

function mergedDetails(match) {
  const localDetails = window.CAPRAIA_MATCH_DETAILS?.[detailKey(match)] || window.CAPRAIA_MATCH_DETAILS?.[`${normalizeSeason(match.season_id)}:${match.match_day}`] || {};
  const extra = match.extra_info && typeof match.extra_info === 'object' && !Array.isArray(match.extra_info) ? match.extra_info : {};
  return {
    ...localDetails,
    ...extra,
    kickoff: match.kickoff_at ? `${formatMatchDate(match.kickoff_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${extra.time_tbc ? 'orario da definire' : formatMatchTime(match.kickoff_at)}` : localDetails.kickoff,
    venue: match.venue || localDetails.venue,
    referee: match.referee || localDetails.referee,
    halftime: match.halftime_score || localDetails.halftime,
    source: match.source_url || localDetails.source,
    events: Array.isArray(extra.events) ? extra.events : (Array.isArray(localDetails.events) ? localDetails.events : []),
  };
}

function matchOutcome(match) {
  const home = Number(match.home_score);
  const away = Number(match.away_score);
  if (home === away) return 'Pareggio';
  const capraiaHome = isCapraia(match.home_team);
  const won = capraiaHome ? home > away : away > home;
  return won ? 'Vittoria Capraia' : 'Sconfitta Capraia';
}

function matchRoundLabel(match) {
  const competitionName = match.competition || 'Competizione';
  const rawPhase = String(match.phase || '').trim();
  const hasMatchDay = match.match_day !== null && match.match_day !== undefined && match.match_day !== '';
  const phase = rawPhase || (hasMatchDay ? `Giornata ${match.match_day}` : 'Gara');
  return `${competitionName} · ${phase}`;
}

function featuredCard(match, next) {
  const title = next ? 'Prossimo match' : 'Ultimo match';
  const className = `results-feature ${next ? 'results-feature--next' : 'results-feature--last'}`;
  if (!match) return `<article class="${className} results-feature--empty"><div class="results-feature-top"><h3>${title}</h3><span class="results-feature-dot" aria-hidden="true"></span></div><div class="results-empty-feature"><strong>${next ? 'Il prossimo appuntamento' : 'La stagione è tutta da scrivere.'}</strong><p>${next ? 'Nessuna nuova gara con data confermata. Trovi qui sotto gli eventuali recuperi da programmare.' : 'Non ci sono ancora risultati finali registrati per questa stagione.'}</p></div></article>`;
  const tag = 'article';
  const attributes = played(match) ? ` role="button" tabindex="0" data-match-detail="${escapeHtml(detailKey(match))}" aria-label="Apri il tabellino di ${escapeHtml(match.home_team)} ${Number(match.home_score)} a ${Number(match.away_score)} ${escapeHtml(match.away_team)}"` : '';
  return `<${tag} class="${className}${played(match) ? ' results-match-trigger' : ''}"${attributes}><div class="results-feature-top"><h3>${title}</h3><span class="results-venue-tag">${location(match)}</span></div>${competition(match)}<div class="results-feature-date">${dateMarkup(match)}</div><div class="results-scoreboard">${team(match, 'home')}<div class="results-score"><b>${score(match)}</b><small>${escapeHtml(statusLabels[match.status] || 'Da confermare')}</small>${penalties(match)}</div>${team(match, 'away')}</div><div class="results-feature-bottom"><span class="results-place">${escapeHtml(match.venue || 'Campo da confermare')}</span><span>${escapeHtml(match.phase || (match.match_day ? `Giornata ${match.match_day}` : ''))}</span></div></${tag}>`;
}

function matchRow(match) {
  const tag = 'article';
  const attributes = played(match) ? ` role="button" tabindex="0" data-match-detail="${escapeHtml(detailKey(match))}" aria-label="Apri il tabellino di ${escapeHtml(match.home_team)} ${Number(match.home_score)} a ${Number(match.away_score)} ${escapeHtml(match.away_team)}"` : '';
  return `<${tag} class="results-row${played(match) ? ' results-row--clickable results-match-trigger' : ''}" data-status="${escapeHtml(match.status)}"${attributes}><div class="results-row-meta">${competition(match)}<span class="results-status">${escapeHtml(statusLabels[match.status] || 'Da confermare')}</span></div><div class="results-row-main"><div class="results-row-date">${dateMarkup(match)}<span>${location(match)}</span></div><div class="results-row-teams">${team(match, 'home', true)}<div class="results-row-score"><b>${score(match)}</b>${penalties(match)}</div>${team(match, 'away', true)}</div></div><div class="results-row-detail"><span>${escapeHtml(match.venue || 'Campo da confermare')}</span><span>${escapeHtml(match.phase || (match.match_day ? `Giornata ${match.match_day}` : ''))}</span>${match.notes ? `<p>${escapeHtml(match.notes)}</p>` : ''}</div>${played(match) ? '<span class="results-row-action">Tabellino e marcatori</span>' : ''}</${tag}>`;
}

function monthLabel(value) {
  if (!value) return 'Data da definire';
  return formatMatchDate(`${value}-15T12:00:00Z`, { month: 'long', year: 'numeric' });
}

function ensureMatchDialog() {
  const modal = document.querySelector('#match-dialog');
  if (!modal || modal.dataset.resultsBound === 'true') return;
  modal.dataset.resultsBound = 'true';
  modal.querySelector('[data-close-match]')?.addEventListener('click', () => modal.close());
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.close(); });
}

/** One instance per section. Updating data preserves filters, keyboard focus and scroll. */
export function initResults({ root, matches = [], onOpenHistory, now } = {}) {
  if (!root) return { update() {}, destroy() {}, setNotice() {} };
  let records = matches;
  let state = { season: CURRENT_SEASON, competition: '', month: '', detailed: false };
  let destroyed = false;
  let previousFeatured = '';
  root.classList.add('results-section');
  ensureMatchDialog();
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
    const matchTrigger = event.target.closest('[data-match-detail]');
    if (matchTrigger) {
      const match = records.find((record) => detailKey(record) === matchTrigger.dataset.matchDetail);
      if (match && played(match)) openMatchDetail(match);
    }
    if (onOpenHistory && event.target.closest('[data-open-history]')) { event.preventDefault(); onOpenHistory(); }
  }

  function onKeydown(event) {
    const matchTrigger = event.target.closest('[data-match-detail]');
    if (!matchTrigger || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    matchTrigger.click();
  }

  function openMatchDetail(match) {
    const modal = document.querySelector('#match-dialog');
    const content = document.querySelector('#match-dialog-content');
    if (!modal || !content) return;
    const details = mergedDetails(match);
    const events = details.events.length
      ? `<ul class="match-events-list">${details.events.map((event) => `<li><time>${escapeHtml(event.minute || '—')}</time><div><b>${escapeHtml(event.type || 'Evento')}</b><strong>${escapeHtml(event.player || 'Giocatore non indicato')}</strong>${event.assist || event.team ? `<small>${escapeHtml([event.assist ? `Assist: ${event.assist}` : '', event.team || ''].filter(Boolean).join(' · '))}</small>` : ''}</div></li>`).join('')}</ul>`
      : '<p>Marcatori, minuti ed eventi non sono ancora stati pubblicati per questa gara.</p>';
    const sourceText = String(details.source || '');
    const sourceLabel = sourceText.includes('instagram.com') ? 'Apri la fonte su Instagram →' : 'Apri il tabellino completo →';
    const sourceHref = webUrl(details.source);
    const source = sourceHref ? `<a class="match-source" href="${escapeHtml(sourceHref)}" target="_blank" rel="noopener">${sourceLabel}</a>` : '';
    content.innerHTML = `<div class="match-detail-hero"><p class="eyebrow">Tabellino partita</p><h2 id="match-dialog-title">${escapeHtml(matchOutcome(match))}</h2><p class="match-detail-meta">${escapeHtml(matchRoundLabel(match))}</p><div class="match-detail-score">${detailTeam(match, 'home')}<b>${Number(match.home_score)} <span>—</span> ${Number(match.away_score)}</b>${detailTeam(match, 'away')}</div>${penalties(match) ? `<p class="match-detail-outcome">${penalties(match).replace(/<\/?small[^>]*>/g, '')}</p>` : ''}</div><div class="match-detail-grid"><div><span>Data</span><b>${escapeHtml(details.kickoff || 'Non pubblicata')}</b></div><div><span>Gara</span><b>${escapeHtml(matchRoundLabel(match))}</b></div><div><span>Campo</span><b>${escapeHtml(details.venue || 'Non pubblicato')}</b></div><div><span>Arbitro</span><b>${escapeHtml(details.referee || 'Non pubblicato')}</b></div>${details.halftime ? `<div class="match-detail-wide"><span>Primo tempo</span><b>${escapeHtml(details.halftime)}</b></div>` : ''}${match.notes ? `<div class="match-detail-wide"><span>Note</span><b>${escapeHtml(match.notes)}</b></div>` : ''}</div><section class="match-events"><div class="match-events-heading"><span aria-hidden="true">⚽</span><h3>Marcatori ed eventi</h3></div>${events}${source}</section>`;
    modal.showModal();
  }

  // Captured image errors expose the readable monogram without another network request.
  function onImageError(event) {
    if (event.target.tagName === 'IMG') event.target.remove();
  }
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeydown);
  root.addEventListener('error', onImageError, true);
  render();
  return {
    update(nextMatches) { records = Array.isArray(nextMatches) ? nextMatches : []; render(); },
    setNotice(message = '') { const notice = query('[data-results-notice]'); notice.textContent = message; notice.hidden = !message; },
    destroy() { destroyed = true; root.removeEventListener('change', onChange); root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKeydown); root.removeEventListener('error', onImageError, true); },
  };
}
