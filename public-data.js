import './auth.js';

const positionLabels = {
  portiere: 'Portiere', difensore: 'Difensore', centrocampista: 'Centrocampista', attaccante: 'Attaccante', staff: 'Staff',
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
const safeUrl = (value) => /^https?:\/\/\S+$/i.test(String(value ?? '').trim()) ? String(value).trim() : '';
const isCapraia = (team) => String(team ?? '').toLocaleLowerCase('it').includes('capraia');
let visibleNews = new Map();
let activeNews = null;
let visibleMerch = new Map();
let upcomingHomeMatch = null;

const safeSponsorLogo = (value) => {
  const url = String(value ?? '').trim();
  return /^https?:\/\/\S+$/i.test(url) || /^assets\/sponsors\/[a-z0-9-]+\.png$/i.test(url) ? url : '';
};

function renderTicker(items) {
  const ticker = document.querySelector('[data-public-ticker]');
  if (!ticker || !items.length) return;
  const entries = items.map((item) => `<a class="ticker__entry" href="${item.href}" aria-label="${escapeHtml(item.label)}">${item.content}</a>`).join('');
  // La duplicazione rende il punto di ripartenza impercettibile durante lo scorrimento.
  ticker.innerHTML = `<div class="ticker__track">${entries}${entries}</div>`;
}

function renderSponsors(sponsors) {
  const root = document.querySelector('[data-public-sponsors]');
  const grid = root?.querySelector('.sponsor-logo-grid');
  if (!root || !grid) return;
  if (!sponsors.length) { root.hidden = true; return; }
  grid.innerHTML = sponsors.map((sponsor) => {
    const logo = safeSponsorLogo(sponsor.logo_url);
    const background = sponsor.logo_background === 'yellow-white' ? ' sponsor-logo--yellow-white' : ' sponsor-logo--blue-yellow';
    return `<div class="sponsor-logo${background}">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(sponsor.name)}" loading="lazy" />` : `<span>${escapeHtml(sponsor.name)}</span>`}</div>`;
  }).join('');
  root.hidden = false;
}

function sponsorTickerItem(sponsor) {
  const logo = safeSponsorLogo(sponsor.logo_url);
  const visual = logo
    ? `<strong class="ticker-sponsor-logo${sponsor.logo_background === 'yellow-white' ? ' ticker-sponsor-logo--yellow-white' : ' ticker-sponsor-logo--blue-yellow'}"><img src="${escapeHtml(logo)}" alt="${escapeHtml(sponsor.name)}" /></strong>`
    : `<strong>${escapeHtml(sponsor.name)}</strong>`;
  return { href: '#contatti', label: `Vai agli sponsor: ${sponsor.name}`, content: `<p>🤝 &nbsp; CON IL SUPPORTO DI ${escapeHtml(sponsor.name)}</p>${visual}` };
}

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
  const closeMerchConfirmation = event.target.closest('[data-close-merch-confirmation]');
  if (closeMerchConfirmation) { event.preventDefault(); document.querySelector('#merch-order-confirm')?.close(); return; }
  const closeMerch = event.target.closest('[data-close-merch]');
  if (closeMerch) { event.preventDefault(); document.querySelector('#merch-dialog')?.close(); return; }
  const thumbnail = event.target.closest('[data-merch-photo]');
  if (thumbnail) { event.preventDefault(); const main = document.querySelector('[data-merch-main-image]'); if (main) main.src = thumbnail.dataset.merchPhoto; document.querySelectorAll('[data-merch-photo]').forEach((item) => item.classList.toggle('is-active', item === thumbnail)); return; }
  const merchTrigger = event.target.closest('[data-merch-open]');
  if (merchTrigger) { event.preventDefault(); openMerchModal(visibleMerch.get(merchTrigger.dataset.merchOpen)); return; }
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
  const merchTrigger = event.target.closest('[data-merch-open]');
  if (merchTrigger) { event.preventDefault(); openMerchModal(visibleMerch.get(merchTrigger.dataset.merchOpen)); return; }
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
  if (!card) return '';
  if (!match) {
    card.innerHTML = '<p class="public-empty">Non ci sono ancora gare pubblicate.</p>';
    return { href: '#partite', label: 'Vai ai risultati', content: '<p>⚽ &nbsp; PROSSIMA PARTITA</p><strong>CALENDARIO IN AGGIORNAMENTO</strong>' };
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
  return { href: '#partite', label: 'Vai all’ultima partita', content: `<p>⚽ &nbsp; ${match.status === 'completed' ? 'ULTIMA PARTITA UFFICIALE' : 'PROSSIMA PARTITA'}</p><strong>${escapeHtml(match.home_team)} <span>${escapeHtml(score)}</span> ${escapeHtml(match.away_team)}</strong><p>${escapeHtml(formatDate(match.kickoff_at, { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase())} · ${escapeHtml(match.phase || match.competition)}</p>` };
}

function merchImages(product) {
  const gallery = Array.isArray(product.merch_product_images) ? product.merch_product_images : [];
  const images = gallery.slice()
    .sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || (left.sort_order || 0) - (right.sort_order || 0))
    .map((image) => safeUrl(image.image_url)).filter(Boolean);
  if (!images.length && safeUrl(product.image_url)) images.push(safeUrl(product.image_url));
  return [...new Set(images)];
}

const merchSizes = (product) => product.size_mode === 'one_size'
  ? [{ value: 'ONE_SIZE', label: 'Taglia unica', stock: Number(product.one_size_stock || 0) }]
  : [['S', 'stock_s'], ['M', 'stock_m'], ['L', 'stock_l'], ['XL', 'stock_xl'], ['XXL', 'stock_xxl']]
    .map(([label, key]) => ({ value: label, label, stock: Number(product[key] || 0) }));
const merchStock = (product) => merchSizes(product).reduce((total, size) => total + size.stock, 0);
const merchSoldOut = (product) => !product.available || merchStock(product) < 1;
const merchCardLabel = (product) => {
  if (merchSoldOut(product)) return 'Sold-out';
  if (product.size_mode === 'one_size') return 'Taglia unica';
  return `Taglie: ${merchSizes(product).filter((size) => size.stock > 0).map((size) => size.label).join(' · ')}`;
};

function openMerchModal(product) {
  const dialog = document.querySelector('#merch-dialog');
  const root = document.querySelector('#merch-dialog-content');
  if (!dialog || !root || !product) return;
  const images = merchImages(product); const main = images[0]; const sizes = merchSizes(product).filter((size) => size.stock > 0); const soldOut = merchSoldOut(product);
  const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const sizeControl = product.size_mode === 'one_size'
    ? `<input type="hidden" name="size" value="ONE_SIZE" /><p class="merch-order__single-size">Taglia unica · ${sizes[0]?.stock || 0} pezzi disponibili</p>`
    : `<label>Taglia<select name="size" required>${sizes.map((size) => `<option value="${size.value}" data-stock="${size.stock}">${size.label} · ${size.stock} disponibili</option>`).join('')}</select></label>`;
  const order = soldOut ? '<p class="merch-order__soldout">Sold-out</p>' : `<form class="merch-order" data-merch-order><h3>Richiedi il prodotto</h3>${sizeControl}<label>Quantità<input name="quantity" type="number" min="1" max="${sizes[0]?.stock || 1}" value="1" required /></label><label>Nome e cognome<input name="customer_name" autocomplete="name" maxlength="160" required /></label><label>Email<input name="customer_email" type="email" autocomplete="email" maxlength="254" required /></label><label>Telefono<input name="customer_phone" type="tel" autocomplete="tel" maxlength="60" required /></label><label class="merch-order__privacy"><input name="privacy" type="checkbox" required /> Ho letto l’informativa privacy.</label><button class="button button-dark" type="submit">Invia richiesta <span>→</span></button><p class="merch-order__feedback" data-merch-order-feedback role="status" aria-live="polite"></p></form>`;
  root.innerHTML = `<div class="merch-modal__shell"><button class="merch-modal__close" type="button" data-close-merch aria-label="Chiudi prodotto">×</button><section class="merch-modal__gallery">${main ? `<img class="merch-modal__main-image" src="${escapeHtml(main)}" alt="${escapeHtml(product.name)}" data-merch-main-image />` : '<div class="merch-modal__main-image merch-fallback">CAPRAIA FC</div>'}${images.length > 1 ? `<div class="merch-modal__thumbnails" aria-label="Altre foto del prodotto">${images.map((image, index) => `<button class="merch-modal__thumbnail${index === 0 ? ' is-active' : ''}" type="button" data-merch-photo="${escapeHtml(image)}" aria-label="Mostra foto ${index + 1}"><img src="${escapeHtml(image)}" alt="" /></button>`).join('')}</div>` : ''}</section><section class="merch-modal__details"><p class="eyebrow">merch ufficiale</p><h2 id="merch-dialog-title">${escapeHtml(product.name)}</h2><p>${escapeHtml(product.description || 'Dettagli del prodotto in aggiornamento.')}</p><strong class="merch-modal__price">${euro.format(Number(product.price))}</strong><span class="merch-modal__availability${soldOut ? ' is-unavailable' : ''}">${soldOut ? 'Sold-out' : 'Disponibile'}</span>${order}</section></div>`;
  const orderForm = root.querySelector('[data-merch-order]');
  orderForm?.addEventListener('change', (event) => {
    if (event.target.name !== 'size') return;
    const selected = event.target.selectedOptions?.[0]; const stock = Number(selected?.dataset.stock || 1); const quantity = orderForm.elements.quantity;
    quantity.max = stock; if (Number(quantity.value) > stock) quantity.value = stock;
  });
  orderForm?.addEventListener('submit', (event) => submitMerchOrder(event, product));
  if (!dialog.open) dialog.showModal();
}

async function submitMerchOrder(event, product) {
  event.preventDefault();
  const form = event.currentTarget; if (!form.reportValidity()) return;
  const feedback = form.querySelector('[data-merch-order-feedback]'); const submit = form.querySelector('[type="submit"]');
  const values = Object.fromEntries(new FormData(form)); const selected = merchSizes(product).find((size) => size.value === values.size);
  const quantity = Number(values.quantity);
  if (!selected || !Number.isInteger(quantity) || quantity < 1 || quantity > selected.stock) { feedback.textContent = 'La quantità selezionata non è disponibile.'; return; }
  submit.disabled = true; form.setAttribute('aria-busy', 'true'); feedback.textContent = 'Invio della richiesta in corso…';
  try {
    const response = await fetch(`${window.CAPRAIA_SUPABASE_URL}/functions/v1/send-merch-request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: window.CAPRAIA_SUPABASE_ANON_KEY, Authorization: `Bearer ${window.CAPRAIA_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ requestId: crypto.randomUUID(), productId: product.id, size: values.size, quantity, customerName: values.customer_name, customerEmail: values.customer_email, customerPhone: values.customer_phone, privacyAccepted: values.privacy === 'on' }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Non è stato possibile inviare la richiesta.');
    feedback.textContent = 'Richiesta inviata. Ti contatteremo presto via email.'; feedback.dataset.state = 'success'; submit.disabled = true;
    await loadPublicContent().catch((loadError) => console.error('Unable to refresh merch stock', loadError));
    document.querySelector('#merch-dialog')?.close();
    document.querySelector('#top')?.scrollIntoView({ behavior: 'auto', block: 'start' });
    showMerchOrderConfirmation();
  } catch (error) { feedback.textContent = error.message || 'Invio non riuscito. Riprova tra poco.'; feedback.dataset.state = 'error'; submit.disabled = false; }
  finally { form.removeAttribute('aria-busy'); }
}

function showMerchOrderConfirmation() {
  const dialog = document.querySelector('#merch-order-confirm');
  const content = dialog?.querySelector('[data-merch-order-confirm-content]');
  if (!dialog || !content) return;
  const matchNote = upcomingHomeMatch
    ? `<p>In alternativa, puoi ritirare alla biglietteria durante la prossima partita in casa: <strong>${escapeHtml(upcomingHomeMatch.home_team)} — ${escapeHtml(upcomingHomeMatch.away_team)}</strong>, ${escapeHtml(formatDate(upcomingHomeMatch.kickoff_at, { day: '2-digit', month: 'long', year: 'numeric' }))}.</p>`
    : '';
  content.innerHTML = `<div class="merch-order-confirm__content"><button type="button" data-close-merch-confirmation aria-label="Chiudi conferma">×</button><p class="eyebrow">ordine ricevuto</p><h2 id="merch-order-confirm-title">Grazie per il tuo <em>ordine.</em></h2><p>Ti contatteremo presto per confermare tutti i dettagli.</p><p>Puoi ritirare il prodotto presso la nostra sede: <strong>Circolo ARCI Capraia, Via Salvador Allende 152, Capraia Fiorentina.</strong></p>${matchNote}</div>`;
  dialog.showModal();
}

document.querySelector('#merch-dialog')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.querySelector('#merch-order-confirm')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

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
  visibleMerch = new Map(products.map((product) => [product.id, product]));
  root.className = 'product-grid';
  root.innerHTML = products.map((product) => {
    const image = merchImages(product)[0];
    const visual = image
      ? `<img class="product-image product-photo" src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="lazy" />`
      : '<div class="product-image merch-fallback"><span>CAPRAIA FC</span></div>';
    const soldOut = merchSoldOut(product);
    return `<article class="product-card" data-merch-open="${escapeHtml(product.id)}" role="button" tabindex="0">${visual}<h3>${escapeHtml(product.name)}</h3><strong class="product-price">${euro.format(Number(product.price))}</strong><span class="product-availability ${soldOut ? '' : 'is-available'}">${escapeHtml(merchCardLabel(product))}</span></article>`;
  }).join('');
}

async function loadPublicContent() {
  const client = window.CapraiaAuth?.supabase;
  if (!client) return;
  const [players, news, merch, matches] = await Promise.all([
    client.from('players').select('id, first_name, last_name, display_name, squad_number, position, image_url').eq('published', true).order('position').order('squad_number', { nullsFirst: false }),
    client.from('news').select('id, title, excerpt, content_type, body, external_url, source_label, cover_image_url, category, published_at, created_at').eq('published', true).order('published_at', { ascending: false }).order('created_at', { ascending: false }),
    client.from('merch_products').select('id, name, price, description, image_url, available, size_mode, stock_s, stock_m, stock_l, stock_xl, stock_xxl, one_size_stock, merch_product_images(id, image_url, sort_order, is_primary)').eq('published', true).order('created_at', { ascending: false }),
    client.from('matches').select('id, legacy_key, season_id, match_day, home_team, away_team, kickoff_at, venue, competition, phase, status, home_score, away_score, referee, halftime_score, notes, source_url, extra_info, published').eq('published', true).order('kickoff_at', { ascending: false, nullsFirst: false }),
  ]);
  const responses = [players, news, merch, matches];
  const failed = responses.find((response) => response.error);
  if (failed) throw failed.error;
  renderPlayers(players.data || []);
  renderNews(news.data || []);
  renderMerch(merch.data || []);
  const rows = matches.data || [];
  upcomingHomeMatch = rows
    .filter((match) => match.kickoff_at && new Date(match.kickoff_at).getTime() >= Date.now() && isCapraia(match.home_team) && match.status !== 'cancelled')
    .sort((left, right) => new Date(left.kickoff_at) - new Date(right.kickoff_at))[0] || null;
  const latest = rows.find((match) => match.status === 'completed') || rows[0] || null;
  const latestTicker = renderLatestMatch(latest);
  const [sponsors, messages] = await Promise.all([
    client.from('sponsors').select('id, name, logo_url, logo_background, sort_order').eq('active', true).order('sort_order').order('name'),
    client.from('bacheca_messages').select('id, display_name, message, created_at').eq('published', true).order('created_at', { ascending: false }).limit(5),
  ]);
  const activeSponsors = sponsors.error ? [] : (sponsors.data || []);
  const publishedMessages = messages.error ? [] : (messages.data || []);
  renderSponsors(activeSponsors);
  renderTicker([
    latestTicker,
    ...publishedMessages.map((item) => ({ href: '#bacheca', label: 'Vai alla bacheca', content: `<p>✦ &nbsp; DALLA BACHECA · ${escapeHtml(item.display_name)}</p><strong>“${escapeHtml(item.message)}”</strong>` })),
    ...(news.data?.[0] ? [{ href: '#news', label: 'Vai all’ultima news', content: `<p>📰 &nbsp; ULTIMA NEWS · ${escapeHtml(news.data[0].category)}</p><strong>${escapeHtml(news.data[0].title)}</strong>` }] : []),
    ...activeSponsors.map(sponsorTickerItem),
  ]);
  document.dispatchEvent(new CustomEvent('capraia:public-matches', { detail: rows }));
}

loadPublicContent().catch((error) => {
  // Il contenuto statico resta disponibile se Supabase non è ancora configurato
  // o se una tabella non è stata ancora migrata.
  console.error('Impossibile caricare i contenuti pubblici da Supabase.', error);
});
