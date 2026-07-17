(() => {
  let history = window.CAPRAIA_HISTORY || [];
  const matchDetails = window.CAPRAIA_MATCH_DETAILS || {};
  const teamLogos = window.CAPRAIA_TEAM_LOGOS || {};
  let publicMatches = new Map();
  const modal = document.querySelector('#history-dialog');
  const root = document.querySelector('#history-dialog-content');
  const matchModal = document.querySelector('#match-dialog');
  const matchRoot = document.querySelector('#match-dialog-content');
  if (!modal || !root || !matchModal || !matchRoot || !history.length) return;

  let selected = history[0].id;
  let tab = 'matches';
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const result = (match) => {
    const [, , home, away, homeScore, awayScore] = match;
    const ours = home === 'Capraia' ? homeScore : awayScore;
    const theirs = home === 'Capraia' ? awayScore : homeScore;
    return ours > theirs ? 'win' : ours < theirs ? 'loss' : 'draw';
  };
  const crest = (team) => teamLogos[team]?.src
    ? `<img src="${esc(teamLogos[team].src)}" alt="Stemma ${esc(team)}" />`
    : `<span aria-hidden="true">${esc(team.split(' ').map((word) => word[0]).join('').slice(0, 3))}</span>`;
  const openMatch = (season, index) => {
    const [date, round, home, away, homeScore, awayScore, phase, legacyKey] = season.matches[index];
    const localDetails = matchDetails[`${season.id}:${round}`] || {};
    const record = legacyKey ? publicMatches.get(legacyKey) : null;
    const details = record ? {
      ...localDetails,
      ...(record.extra_info || {}),
      kickoff: record.kickoff_at ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(record.kickoff_at)) : localDetails.kickoff,
      venue: record.venue || localDetails.venue,
      referee: record.referee || localDetails.referee,
      halftime: record.halftime_score || localDetails.halftime,
      source: record.source_url || localDetails.source,
    } : localDetails;
    const ours = home === 'Capraia' ? homeScore : awayScore;
    const theirs = home === 'Capraia' ? awayScore : homeScore;
    const outcome = ours > theirs ? 'Vittoria Capraia' : ours < theirs ? 'Sconfitta Capraia' : 'Pareggio';
    const events = details?.events?.length
      ? `<ul class="match-events-list">${details.events.map((event) => `<li><time>${esc(event.minute || '—')}</time><div><b>${esc(event.type || 'Evento')}</b><strong>${esc(event.player || '')}</strong>${event.assist ? `<small>Assist: ${esc(event.assist)}</small>` : ''}</div></li>`).join('')}</ul>`
      : '<p>Marcatori, assist, cartellini e cronologia non risultano pubblicati dalla fonte per questa gara.</p>';
    const sourceLabel = details?.source?.includes('instagram.com')
      ? 'Apri la fonte su Instagram →'
      : 'Apri il tabellino su Tuttocampo →';
    const source = details?.source ? `<a class="match-source" href="${esc(details.source)}" target="_blank" rel="noopener">${sourceLabel}</a>` : '';
    matchRoot.innerHTML = `<p class="eyebrow">${esc(phase)}</p><div class="match-detail-score"><div><i class="detail-crest">${crest(home)}</i><strong>${esc(home)}</strong></div><b>${homeScore} <span>—</span> ${awayScore}</b><div><i class="detail-crest">${crest(away)}</i><strong>${esc(away)}</strong></div></div><p class="match-detail-outcome">${outcome}</p><div class="match-detail-grid"><div><span>Data</span><b>${esc(details?.kickoff || date)}</b></div><div><span>Giornata</span><b>${typeof round === 'number' ? `${round}ª` : esc(round)}</b></div><div><span>Luogo</span><b>${esc(details?.venue || 'Non pubblicato')}</b></div><div><span>Arbitro</span><b>${esc(details?.referee || 'Non pubblicato')}</b></div>${details?.halftime ? `<div class="match-detail-wide"><span>Primo tempo</span><b>${esc(details.halftime)}</b></div>` : ''}</div><section class="match-events"><h3 id="match-dialog-title">Eventi partita</h3>${events}${source}</section>`;
    matchModal.showModal();
  };

  const render = () => {
    const season = history.find((item) => item.id === selected);
    const select = history.map((item) => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${item.label} — ${item.status}</option>`).join('');
    const tabItems = [['matches', 'Risultati'], ['standing', 'Classifica'], ['competition', 'Campionato']];
    if (season.playoff) tabItems.push(['playoff', 'Playoff']);
    if (season.cup) tabItems.push(['cup', 'Coppa Toscana']);
    const tabs = tabItems
      .map(([id, label]) => `<button class="history-tab ${tab === id ? 'active' : ''}" data-tab="${id}" type="button">${label}</button>`).join('');
    let content = '';
    if (tab === 'cup' && season.cup) {
      content = `<div class="history-empty"><strong>${esc(season.cup.status)}</strong><p>La Coppa Toscana viene mostrata solo per la stagione corrente. Appena saranno disponibili risultati e tabellone, saranno caricati qui.</p><a class="text-link" href="${season.cup.source}" target="_blank" rel="noopener">Apri la fonte Coppa Toscana →</a></div>`;
    } else if (!season.summary) {
      content = `<div class="history-empty"><strong>Archivio in sincronizzazione.</strong><p>Questa stagione è già selezionabile: risultati, classifica e competizioni saranno caricati appena la fonte pubblica li renderà disponibili per l’importazione.</p></div>`;
    } else if (tab === 'matches') {
      content = `<div class="history-results">${season.matches.map(([date, round, home, away, homeScore, awayScore, phase], index) => `<button type="button" data-match-index="${index}" class="history-match ${result([date,round,home,away,homeScore,awayScore])}"><div><span>${esc(phase)}</span><time>${esc(date)} · ${typeof round === 'number' ? `${round}ª giornata` : esc(round)}</time></div><div class="history-teams"><b class="${home === 'Capraia' ? 'us' : ''}"><i class="club-crest">${crest(home)}</i>${esc(home)}</b><strong>${homeScore} <i>—</i> ${awayScore}</strong><b class="${away === 'Capraia' ? 'us' : ''}">${esc(away)}<i class="club-crest">${crest(away)}</i></b></div></button>`).join('')}</div>`;
    } else if (tab === 'standing') {
      content = `<div class="standing-wrap"><table><thead><tr><th>#</th><th>Squadra</th><th>Pt</th><th>G</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th></tr></thead><tbody>${season.standings.map(([team, points, played, won, drawn, lost, gf, ga], index) => `<tr class="${team === 'Capraia' ? 'us' : ''}"><td>${index + 1}</td><td>${esc(team)}</td><td><b>${points}</b></td><td>${played}</td><td>${won}</td><td>${drawn}</td><td>${lost}</td><td>${gf}</td><td>${ga}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (tab === 'competition') {
      const s = season.summary;
      content = `<div class="competition-card"><p class="eyebrow">${esc(season.status)}</p><h3>${esc(season.competition)}</h3><div class="season-stats"><div><strong>${s.position}º</strong><span>piazzamento</span></div><div><strong>${s.points}</strong><span>punti</span></div><div><strong>${s.played}</strong><span>partite</span></div><div><strong>${s.goalsFor}–${s.goalsAgainst}</strong><span>reti</span></div></div><p>Stagione regolare: ${s.won} vittorie, ${s.drawn} pareggi e ${s.lost} sconfitte. Capraia ha poi superato il playoff di girone e lo spareggio intergirone.</p>${season.source ? `<a class="text-link" href="${season.source}" target="_blank" rel="noopener">Apri la fonte dati →</a>` : ''}</div>`;
    } else {
      content = `<div class="knockout-panel"><p class="eyebrow">fase eliminatoria 2025 / 26</p><h3>${esc(season.playoff.title)}</h3><p>${esc(season.playoff.note)}</p><div class="bracket">${season.playoff.rounds.map((round) => `<div class="bracket-round"><h4>${esc(round.title)}</h4>${round.games.map(([home, away, score, highlighted]) => `<article class="bracket-game ${highlighted ? 'highlighted' : ''}"><div>${esc(home)}<b>${esc(score.split(' — ')[0])}</b></div><div>${esc(away)}<b>${esc(score.split(' — ')[1])}</b></div></article>`).join('')}</div>`).join('')}</div></div>`;
    }
    root.innerHTML = `<div class="history-heading"><div><p class="eyebrow">archivio sportivo</p><h2 id="history-dialog-title">Risultati e<br><em>stagioni.</em></h2></div><p>Ogni partita, classifica e competizione del Capraia Football Club.</p></div><div class="history-controls"><label class="season-select-label">Stagione<select id="season-select">${select}</select></label><div class="history-tabs" role="tablist">${tabs}</div></div><div class="history-content">${content}</div>`;
    root.querySelector('#season-select').addEventListener('change', (event) => { selected = event.target.value; tab = 'matches'; render(); });
    root.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { tab = button.dataset.tab; render(); }));
    root.querySelectorAll('[data-match-index]').forEach((button) => button.addEventListener('click', () => openMatch(season, Number(button.dataset.matchIndex))));
  };
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-open-history]');
    if (!trigger) return;
    event.preventDefault();
    render();
    modal.showModal();
  });
  modal.querySelector('[data-close-history]').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.close(); });
  matchModal.querySelector('[data-close-match]').addEventListener('click', () => matchModal.close());
  matchModal.addEventListener('click', (event) => { if (event.target === matchModal) matchModal.close(); });
  document.addEventListener('capraia:public-matches', (event) => {
    const records = Array.isArray(event.detail) ? event.detail : [];
    if (!records.length) return;
    const localSeasons = new Map(history.map((season) => [season.id, season]));
    publicMatches = new Map(records.filter((record) => record.legacy_key).map((record) => [record.legacy_key, record]));
    const bySeason = new Map();
    records.forEach((record) => {
      if (!bySeason.has(record.season_id)) bySeason.set(record.season_id, []);
      bySeason.get(record.season_id).push(record);
    });
    history = [...bySeason.entries()].map(([seasonId, seasonMatches]) => {
      const existing = localSeasons.get(seasonId) || {};
      return {
        id: seasonId,
        label: existing.label || seasonId.replace('-', ' / '),
        status: existing.status || 'in corso',
        competition: seasonMatches[0]?.competition || existing.competition || 'Da confermare',
        source: existing.source || '',
        summary: existing.summary || null,
        standings: existing.standings || [],
        playoff: existing.playoff || null,
        cup: existing.cup || null,
        matches: seasonMatches.sort((a, b) => new Date(a.kickoff_at || 0) - new Date(b.kickoff_at || 0)).map((record) => [
          record.kickoff_at ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(record.kickoff_at)) : 'Data da definire',
          /^\d+$/.test(record.match_day) ? Number(record.match_day) : record.match_day,
          record.home_team, record.away_team, record.home_score, record.away_score,
          record.phase || record.competition, record.legacy_key,
        ]),
      };
    }).sort((a, b) => b.id.localeCompare(a.id));
    selected = history[0].id;
    render();
  });
  render();
})();
