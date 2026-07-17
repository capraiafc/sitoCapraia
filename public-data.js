import './auth.js';

const positionLabels = {
  portiere: 'Portiere', difensore: 'Difensore', centrocampista: 'Centrocampista', attaccante: 'Attaccante', staff: 'Staff',
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
const safeUrl = (value) => /^https?:\/\/\S+$/i.test(String(value ?? '').trim()) ? String(value).trim() : '';
const isCapraia = (team) => String(team ?? '').toLocaleLowerCase('it').includes('capraia');
let visibleNews = new Map();
let activeNews = null;

function newsUrl(item) {
  const url = new URL(window.location.href);
  url.searchParams.set('news', item.id);
  url.hash = 'news';
  return url.href;
}

async function copyNewsLink(item) {
  const url = newsUrl(item);
  try { await navigator.clipboard.writeText(url); } catch { window.prompt('Copia questo link:', url); return; }
  const toast = document.querySelector('#toast');
  if (toast) { toast.textContent = 'Link della notizia copiato.'; toast.classList.add('show'); window.setTimeout(() => toast.classList.remove('show'), 2500); }
}

function openNewsModal(item) {
  const dialog = document.querySelector('#news-dialog');
  const root = document.querySelector('#news-dialog-content');
  if (!dialog || !root || !item) return;
  activeNews = item;
  window.history.replaceState({}, '', newsUrl(item));
  const image = safeUrl(item.cover_image_url);
  const date = formatDate(item.published_at || item.created_at, { day: '2-digit', month: 'long', year: 'numeric' });
  const shareUrl = newsUrl(item);
  const shareText = encodeURIComponent(`${item.title}\n${shareUrl}`);
  root.innerHTML = `${image ? `<img class="news-modal__image" src="${escapeHtml(image)}" alt="" />` : ''}<p class="eyebrow">${escapeHtml(date)} · ${escapeHtml(item.category)}</p><h2 id="news-dialog-title">${escapeHtml(item.title)}</h2>${item.excerpt ? `<p class="news-modal__excerpt">${escapeHtml(item.excerpt)}</p>` : ''}<div class="news-modal__body">${escapeHtml(item.body || '').replace(/\n/g, '<br />')}</div><section class="news-modal__share" aria-label="Condividi notizia"><p>Condividi la notizia</p><div><button type="button" data-share-native>Instagram / altre app</button><a href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener">WhatsApp</a><a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener">Facebook</a><button type="button" data-share-copy>Copia link</button></div></section>`;
  if (!dialog.open) dialog.showModal();
}

document.addEventListener('click', (event) => {
  const close = event.target.closest('[data-close-news]');
  if (close) { event.preventDefault(); document.querySelector('#news-dialog')?.close(); return; }
  const nativeShare = event.target.closest('[data-share-native]');
  if (nativeShare && activeNews) { event.preventDefault(); if (navigator.share) navigator.share({ title: activeNews.title, text: activeNews.excerpt || '', url: newsUrl(activeNews) }).catch(() => {}); else copyNewsLink(activeNews); return; }
  const copy = event.target.closest('[data-share-copy]');
  if (copy && activeNews) { event.preventDefault(); copyNewsLink(activeNews); return; }
  const trigger = event.target.closest('[data-news-open]');
  if (!trigger) return;
  event.preventDefault();
  openNewsModal(visibleNews.get(trigger.dataset.newsOpen));
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const trigger = event.target.closest('[data-news-open]');
  if (!trigger) return;
  event.preventDefault();
  openNewsModal(visibleNews.get(trigger.dataset.newsOpen));
});

function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return 'Data da definire';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data da definire' : new Intl.DateTimeFormat('it-IT', options).format(date);
}

function formatMatchStatus(match) {
  if (match.status === 'completed') return 'Finale';
  if (match.status === 'postponed') return 'Rinviata';
  if (match.status === 'cancelled') return 'Annullata';
  return 'In programma';
}

function teamMark(team) {
  if (isCapraia(team)) return '<div class="team-mark capraia"><img src="assets/images/capraia-logo.png" alt="" /></div>';
  const initials = String(team || '?').split(/\s+/).map((word) => word[0]).join('').slice(0, 3);
  return `<div class="team-mark marina" aria-hidden="true">${escapeHtml(initials)}</div>`;
}

function renderLatestMatch(match) {
  const card = document.querySelector('[data-public-latest-match]');
  const ticker = document.querySelector('[data-public-ticker]');
  if (!card || !ticker) return;
  if (!match) {
    card.innerHTML = '<p class="public-empty">Non ci sono ancora gare pubblicate.</p>';
    ticker.innerHTML = '<p>⚽ &nbsp; PROSSIMA PARTITA</p><strong>CALENDARIO IN AGGIORNAMENTO</strong>';
    return;
  }
  const score = match.status === 'completed' ? `${match.home_score} — ${match.away_score}` : '—';
  const matchDate = new Date(match.kickoff_at);
  const day = match.kickoff_at ? new Intl.DateTimeFormat('it-IT', { day: '2-digit' }).format(matchDate) : '—';
  const month = match.kickoff_at ? new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(matchDate).replace('.', '').toUpperCase() : '';
  card.innerHTML = `
    <div class="match-status">${escapeHtml(match.phase || match.competition)}</div>
    <div class="club-vs">
      <div class="team">${teamMark(match.home_team)}<strong>${escapeHtml(match.home_team)}</strong></div>
      <div class="versus"><time datetime="${escapeHtml(match.kickoff_at || '')}">${day}<br /><small>${month}</small></time><b>${escapeHtml(score)}</b><span>${escapeHtml(formatMatchStatus(match))}</span></div>
      <div class="team">${teamMark(match.away_team)}<strong>${escapeHtml(match.away_team)}</strong></div>
    </div>
    <div class="match-info"><span>Stagione ${escapeHtml(match.season_id)} · ${escapeHtml(match.competition)}</span><a class="link-button" href="#storico" data-open-history>Apri lo storico completo →</a></div>`;
  ticker.innerHTML = `<p>⚽ &nbsp; ${match.status === 'completed' ? 'ULTIMA PARTITA UFFICIALE' : 'PROSSIMA PARTITA'}</p><strong>${escapeHtml(match.home_team)} <span>${escapeHtml(score)}</span> ${escapeHtml(match.away_team)}</strong><p>${escapeHtml(formatDate(match.kickoff_at, { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase())} · ${escapeHtml(match.phase || match.competition)}</p><a href="#storico" data-open-history>Storico →</a>`;
}

function renderPlayers(players) {
  const grid = document.querySelector('[data-public-players]');
  const note = document.querySelector('[data-public-players-note]');
  if (!grid) return;
  if (!players.length) {
    grid.innerHTML = '<p class="public-empty">La rosa ufficiale sarà pubblicata a breve.</p>';
    if (note) note.hidden = true;
    return;
  }
  grid.innerHTML = players.map((player, index) => {
    const image = safeUrl(player.image_url);
    const number = player.squad_number ? String(player.squad_number).padStart(2, '0') : '—';
    const visual = image
      ? `<img class="player-photo" src="${escapeHtml(image)}" alt="${escapeHtml(player.display_name)}" loading="lazy" />`
      : '<div class="player-silhouette" aria-hidden="true"></div>';
    return `<article class="player-card p${(index % 4) + 1}"><div class="shirt-number">${escapeHtml(number)}</div>${visual}<p>${escapeHtml(positionLabels[player.position] || player.position)}</p><h3>${escapeHtml(player.first_name)}<br />${escapeHtml(player.last_name)}</h3></article>`;
  }).join('');
  if (note) note.hidden = true;
  window.CapraiaPlayerCarousel?.refresh();
}

function renderNews(items) {
  const grid = document.querySelector('[data-public-news]');
  if (!grid) return;
  visibleNews = new Map(items.map((item) => [item.id, item]));
  const requestedNews = new URL(window.location.href).searchParams.get('news');
  if (requestedNews && visibleNews.has(requestedNews)) window.setTimeout(() => openNewsModal(visibleNews.get(requestedNews)), 0);
  if (!items.length) {
    grid.innerHTML = '<p class="public-empty">Le prossime notizie del club saranno pubblicate qui.</p>';
    return;
  }
  grid.innerHTML = items.map((item, index) => {
    const image = safeUrl(item.cover_image_url);
    const sourceUrl = safeUrl(item.external_url);
    const date = formatDate(item.published_at || item.created_at, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    const action = item.content_type === 'external'
      ? `<a class="text-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(item.source_label || 'Leggi l’articolo')} →</a>`
      : '<span class="news-card__open text-link">Leggi la storia →</span>';
    const visual = image
      ? `<img class="news-image news-cover" src="${escapeHtml(image)}" alt="" loading="lazy" />`
      : `<div class="news-image image-placeholder"><span>${String(index + 1).padStart(2, '0')}</span></div>`;
    const opener = item.content_type === 'original' ? ` data-news-open="${escapeHtml(item.id)}" role="button" tabindex="0"` : '';
    return `<article class="news-card ${index === 0 ? 'featured' : ''}"${opener}>${visual}<div><p class="news-meta">${escapeHtml(date)} · ${escapeHtml(item.category)}</p><h3>${escapeHtml(item.title)}</h3>${item.excerpt ? `<p class="news-excerpt">${escapeHtml(item.excerpt)}</p>` : ''}${action}</div></article>`;
  }).join('');
}

function renderMerch(products) {
  const root = document.querySelector('[data-public-merch]');
  if (!root) return;
  if (!products.length) {
    root.innerHTML = '<p class="public-empty">Il catalogo ufficiale è in aggiornamento.</p>';
    return;
  }
  const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  root.className = 'product-grid';
  root.innerHTML = products.map((product) => {
    const image = safeUrl(product.image_url);
    const visual = image
      ? `<img class="product-image product-photo" src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="lazy" />`
      : '<div class="product-image merch-fallback"><span>CAPRAIA FC</span></div>';
    return `<article class="product-card">${visual}<h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description || '')}</p><strong class="product-price">${euro.format(Number(product.price))}</strong><span class="product-availability ${product.available ? 'is-available' : ''}">${product.available ? 'Disponibile' : 'Non disponibile'}</span></article>`;
  }).join('');
}

async function loadPublicContent() {
  const client = window.CapraiaAuth?.supabase;
  if (!client) return;
  const [players, news, merch, matches] = await Promise.all([
    client.from('players').select('id, first_name, last_name, display_name, squad_number, position, image_url').eq('published', true).order('position').order('squad_number', { nullsFirst: false }),
    client.from('news').select('id, title, excerpt, content_type, body, external_url, source_label, cover_image_url, category, published_at, created_at').eq('published', true).order('published_at', { ascending: false }).order('created_at', { ascending: false }),
    client.from('merch_products').select('id, name, price, description, image_url, available').eq('published', true).order('created_at', { ascending: false }),
    client.from('matches').select('id, legacy_key, season_id, match_day, home_team, away_team, kickoff_at, venue, competition, phase, status, home_score, away_score, referee, halftime_score, notes, source_url, extra_info, published').eq('published', true).order('kickoff_at', { ascending: false, nullsFirst: false }),
  ]);
  const responses = [players, news, merch, matches];
  const failed = responses.find((response) => response.error);
  if (failed) throw failed.error;
  renderPlayers(players.data || []);
  renderNews(news.data || []);
  renderMerch(merch.data || []);
  const rows = matches.data || [];
  const latest = rows.find((match) => match.status === 'completed') || rows[0] || null;
  renderLatestMatch(latest);
  document.dispatchEvent(new CustomEvent('capraia:public-matches', { detail: rows }));
}

loadPublicContent().catch((error) => {
  // Il contenuto statico resta disponibile se Supabase non è ancora configurato
  // o se una tabella non è stata ancora migrata.
  console.error('Impossibile caricare i contenuti pubblici da Supabase.', error);
});
