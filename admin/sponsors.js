/* Gestione sponsor, contatti privati, pagamenti e riepiloghi stagionali. */
import '../auth.js?v=admin-permissions-20260729';
import { createCollectionUi, moveFormToModal, pageItems } from './crud-ui.js';
import { addImageUploadFields, removeImage, resolveImageChange } from './media.js';

(() => {
  const root = document.querySelector('[data-sponsor-management]');
  if (!root) return;
  const dashboard = document.querySelector('[data-sponsor-dashboard]');
  const form = root.querySelector('[data-sponsor-form]');
  const list = root.querySelector('[data-sponsor-list]');
  const feedback = root.querySelector('[data-sponsor-feedback]');
  const cancel = root.querySelector('[data-sponsor-cancel]');
  const submitLabel = root.querySelector('[data-sponsor-submit]');
  addImageUploadFields(form, { urlField: 'logo_url', pathField: 'logo_path' });
  const editModal = moveFormToModal({ form, id: 'sponsor-edit-modal', title: 'Aggiungi sponsor' });
  const collection = createCollectionUi({ root, list, addLabel: 'Aggiungi sponsor', searchPlaceholder: 'Cerca sponsor…' });
  const detailModal = document.createElement('dialog');
  detailModal.id = 'sponsor-detail-modal';
  detailModal.className = 'admin-edit-modal sponsor-detail-modal';
  detailModal.innerHTML = `
    <div class="admin-edit-modal__head">
      <h2 data-sponsor-detail-title>Dettaglio sponsor</h2>
      <button type="button" class="admin-edit-modal__close" data-sponsor-detail-close aria-label="Chiudi">×</button>
    </div>
    <div class="sponsor-detail-modal__body">
      <section class="sponsor-detail-contact">
        <div class="sponsor-detail-contact__head">
          <h3>Contatto</h3>
          <button type="button" class="sponsor-logo-download" data-sponsor-logo-download hidden>Scarica logo ↓</button>
        </div>
        <form data-sponsor-contact-form>
          <label>Email di contatto<input name="contact_email" type="email" maxlength="254" autocomplete="email" placeholder="referente@azienda.it" /></label>
          <label>Responsabile rapporti<select name="assigned_operator_email"><option value="">Nessun responsabile assegnato</option></select></label>
          <button class="button button-dark" type="submit">Salva contatto <span>→</span></button>
        </form>
      </section>
      <section class="sponsor-detail-payment">
        <h3>Registra pagamento</h3>
        <form data-sponsor-payment-form>
          <label>Data pagamento<input name="payment_date" type="date" required /></label>
          <label>Importo (€)<input name="amount" type="number" min="0.01" step="0.01" required /></label>
          <button class="button button-dark" type="submit">Inserisci pagamento <span>→</span></button>
        </form>
      </section>
      <section class="sponsor-detail-history">
        <div><h3>Storico pagamenti</h3><strong data-sponsor-payment-total></strong></div>
        <div class="sponsor-detail-season-summary" data-sponsor-payment-seasons></div>
        <ul data-sponsor-payment-list></ul>
      </section>
      <p class="admin-feedback" data-sponsor-detail-feedback aria-live="polite"></p>
    </div>`;
  document.body.append(detailModal);

  const contactForm = detailModal.querySelector('[data-sponsor-contact-form]');
  const paymentForm = detailModal.querySelector('[data-sponsor-payment-form]');
  const paymentList = detailModal.querySelector('[data-sponsor-payment-list]');
  const paymentTotal = detailModal.querySelector('[data-sponsor-payment-total]');
  const paymentSeasons = detailModal.querySelector('[data-sponsor-payment-seasons]');
  const detailFeedback = detailModal.querySelector('[data-sponsor-detail-feedback]');
  const logoDownload = detailModal.querySelector('[data-sponsor-logo-download]');
  let sponsors = [];
  let payments = [];
  let sponsorOperators = [];
  let editingId = null;
  let detailId = null;
  let page = 1;

  const client = () => window.CapraiaAuth?.supabase;
  const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const dateFormatter = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  const say = (text, state = 'info') => { feedback.textContent = text; feedback.dataset.state = state; };
  const sayDetail = (text, state = 'info') => { detailFeedback.textContent = text; detailFeedback.dataset.state = state; };
  const today = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  };
  const season = (dateValue = today()) => {
    const [year, month] = String(dateValue).slice(0, 10).split('-').map(Number);
    const start = month >= 7 ? year : year - 1;
    return { key: String(start), start, label: `${start}/${String(start + 1).slice(-2)}` };
  };
  const currentSeason = () => season(today());
  const paymentsFor = (sponsorId) => payments.filter((payment) => payment.sponsor_id === sponsorId);
  const sum = (items) => items.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const seasonSum = (sponsorId, seasonKey) => sum(paymentsFor(sponsorId).filter((payment) => season(payment.payment_date).key === seasonKey));
  const displayDate = (value) => dateFormatter.format(new Date(`${value}T12:00:00`));
  const operatorLabel = (operator) => operator.operator_name && operator.operator_name !== operator.operator_email
    ? `${operator.operator_name} · ${operator.operator_email}`
    : operator.operator_email;
  const renderOperatorOptions = (selectedEmail = '') => {
    const select = contactForm.elements.assigned_operator_email;
    select.replaceChildren(new Option('Nessun responsabile assegnato', ''));
    sponsorOperators.forEach((operator) => select.add(new Option(operatorLabel(operator), operator.operator_email)));
    select.value = selectedEmail || '';
  };
  const safeFilename = (value) => String(value || 'sponsor')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'sponsor';
  const logoExtension = (url, mimeType = '') => {
    const pathname = new URL(url, window.location.href).pathname;
    const pathExtension = pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
    if (pathExtension) return pathExtension === 'jpeg' ? 'jpg' : pathExtension;
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/svg+xml') return 'svg';
    if (mimeType === 'image/webp') return 'webp';
    return 'jpg';
  };
  const downloadLogo = async (sponsor) => {
    const logoUrl = String(sponsor?.logo_url || '').trim();
    if (!logoUrl) throw new Error('Logo non presente per questo sponsor.');
    const resolvedUrl = new URL(logoUrl, window.location.href).href;
    const response = await fetch(resolvedUrl);
    if (!response.ok) throw new Error('Non è stato possibile recuperare il logo.');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${safeFilename(sponsor.name)}-logo.${logoExtension(resolvedUrl, blob.type)}`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const reset = () => {
    editingId = null;
    form.reset();
    form.elements.annual_amount.value = '0';
    form.elements.sort_order.value = '0';
    form.elements.logo_background.value = 'blue-yellow';
    form.elements.active.checked = true;
    form.elements.logo_path.value = '';
    form.elements.remove_image.checked = false;
    submitLabel.textContent = 'Aggiungi sponsor';
    cancel.hidden = true;
  };

  const dashboardCard = (title, subtitle, extraClass = '') => {
    const card = document.createElement('article');
    card.className = `sponsor-dashboard__card ${extraClass}`.trim();
    const heading = document.createElement('h3'); heading.textContent = title;
    const description = document.createElement('p'); description.textContent = subtitle;
    card.append(heading, description);
    return card;
  };

  const renderDashboard = () => {
    if (!dashboard) return;
    dashboard.replaceChildren();
    const totals = new Map();
    payments.forEach((payment) => {
      const paymentSeason = season(payment.payment_date);
      totals.set(paymentSeason.key, (totals.get(paymentSeason.key) || 0) + Number(payment.amount || 0));
    });
    const seasonsCard = dashboardCard('Incassi per stagione', 'Pagamenti effettivamente registrati.');
    const seasonRows = document.createElement('div'); seasonRows.className = 'sponsor-season-totals';
    const orderedTotals = [...totals.entries()].sort(([left], [right]) => Number(right) - Number(left));
    const maxTotal = Math.max(1, ...orderedTotals.map(([, total]) => total));
    if (!orderedTotals.length) {
      const empty = document.createElement('p'); empty.className = 'sponsor-dashboard__empty'; empty.textContent = 'Nessun pagamento ancora registrato.'; seasonRows.append(empty);
    } else {
      orderedTotals.forEach(([key, total]) => {
        const row = document.createElement('div'); row.className = 'sponsor-season-totals__row';
        const label = document.createElement('span'); label.textContent = `${key}/${String(Number(key) + 1).slice(-2)}`;
        const bar = document.createElement('i'); bar.style.setProperty('--sponsor-bar', `${Math.max(4, (total / maxTotal) * 100)}%`);
        const amount = document.createElement('strong'); amount.textContent = euro.format(total);
        row.append(label, bar, amount); seasonRows.append(row);
      });
    }
    seasonsCard.append(seasonRows);

    const activeSeason = currentSeason();
    const topCard = dashboardCard('Top 3 main sponsor', `Stagione ${activeSeason.label}`);
    const ranking = sponsors
      .map((sponsor) => ({ sponsor, total: seasonSum(sponsor.id, activeSeason.key) }))
      .filter((entry) => entry.total > 0)
      .sort((left, right) => right.total - left.total)
      .slice(0, 3);
    const topList = document.createElement('ol'); topList.className = 'sponsor-top-list';
    if (!ranking.length) {
      const empty = document.createElement('li'); empty.textContent = 'Nessun pagamento nella stagione corrente.'; topList.append(empty);
    } else {
      ranking.forEach(({ sponsor, total }) => {
        const item = document.createElement('li');
        const name = document.createElement('span'); name.textContent = sponsor.name;
        const amount = document.createElement('strong'); amount.textContent = euro.format(total);
        item.append(name, amount); topList.append(item);
      });
    }
    topCard.append(topList);

    const missingLogos = sponsors.filter((sponsor) => !String(sponsor.logo_url || '').trim() && !String(sponsor.logo_path || '').trim());
    const warningCard = dashboardCard('Controllo loghi', missingLogos.length ? `${missingLogos.length} sponsor senza logo caricato.` : 'Tutti gli sponsor hanno un logo.', missingLogos.length ? 'sponsor-dashboard__warning' : 'sponsor-dashboard__ok');
    const warningList = document.createElement('ul'); warningList.className = 'sponsor-warning-list';
    missingLogos.forEach((sponsor) => { const item = document.createElement('li'); item.textContent = sponsor.name; warningList.append(item); });
    warningCard.append(warningList);
    dashboard.append(seasonsCard, topCard, warningCard);
  };

  const render = () => {
    renderDashboard();
    const activeSeason = currentSeason();
    const view = pageItems(sponsors, collection.search.value, page, (item, query) => [item.name, item.contact_email].join(' ').toLocaleLowerCase('it').includes(query));
    page = view.page;
    list.replaceChildren();
    if (!view.items.length) { const empty = document.createElement('li'); empty.textContent = 'Nessuno sponsor trovato.'; list.append(empty); }
    view.items.forEach((sponsor) => {
      const item = document.createElement('li'); item.dataset.sponsorId = sponsor.id;
      const description = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = sponsor.name;
      const meta = document.createElement('small');
      meta.textContent = `${euro.format(seasonSum(sponsor.id, activeSeason.key))} incassati nel ${activeSeason.label} · Previsto ${euro.format(Number(sponsor.annual_amount || 0))} · ${sponsor.active ? 'Attivo sul sito' : 'Nascosto dal sito'}`;
      const actions = document.createElement('div');
      [['Dettaglio', 'detail'], ['Modifica', 'edit'], ['Rimuovi', 'delete']].forEach(([label, action]) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.sponsorAction = action; actions.append(button);
      });
      description.append(title, meta); item.append(description, actions); list.append(item);
    });
    collection.renderPagination({ page, totalItems: view.filtered.length, onPageChange(next) { page = next; render(); } });
  };

  const load = async () => {
    const [sponsorResponse, contactResponse, paymentResponse, operatorResponse] = await Promise.all([
      client().from('sponsors').select('*').order('sort_order').order('name'),
      client().from('sponsor_private_details').select('sponsor_id, contact_email, assigned_operator_email'),
      client().from('sponsor_payments').select('id, sponsor_id, payment_date, amount, created_at').order('payment_date', { ascending: false }).order('created_at', { ascending: false }),
      client().rpc('list_sponsor_operator_candidates'),
    ]);
    const failed = [sponsorResponse, contactResponse, paymentResponse, operatorResponse].find((response) => response.error);
    if (failed) throw failed.error;
    const contacts = new Map((contactResponse.data || []).map((detail) => [detail.sponsor_id, detail]));
    sponsors = (sponsorResponse.data || []).map((sponsor) => {
      const details = contacts.get(sponsor.id);
      return { ...sponsor, contact_email: details?.contact_email || '', assigned_operator_email: details?.assigned_operator_email || '' };
    });
    payments = paymentResponse.data || [];
    sponsorOperators = operatorResponse.data || [];
    render();
  };

  const edit = (sponsor) => {
    editingId = sponsor.id;
    form.elements.name.value = sponsor.name;
    form.elements.contact_email.value = sponsor.contact_email || '';
    form.elements.annual_amount.value = sponsor.annual_amount ?? 0;
    form.elements.sort_order.value = sponsor.sort_order ?? 0;
    form.elements.logo_url.value = sponsor.logo_url || '';
    form.elements.logo_path.value = sponsor.logo_path || '';
    form.elements.logo_background.value = sponsor.logo_background || 'blue-yellow';
    form.elements.active.checked = sponsor.active;
    submitLabel.textContent = 'Salva modifiche'; cancel.hidden = false; editModal.open(`Modifica: ${sponsor.name}`);
  };

  const values = async () => {
    const image = await resolveImageChange({ form, folder: 'sponsors', urlField: 'logo_url', pathField: 'logo_path' });
    return {
      payload: {
        name: form.elements.name.value.trim(),
        annual_amount: Number(form.elements.annual_amount.value),
        sort_order: Number(form.elements.sort_order.value || 0),
        active: form.elements.active.checked,
        logo_background: form.elements.logo_background.value,
        logo_url: image.url,
        logo_path: image.path,
      },
      contactEmail: form.elements.contact_email.value.trim().toLocaleLowerCase('it') || null,
      removePath: image.removePath,
      path: image.path,
    };
  };

  const renderPaymentHistory = (sponsor) => {
    const sponsorPayments = paymentsFor(sponsor.id);
    paymentTotal.textContent = `${euro.format(sum(sponsorPayments))} complessivi`;
    const totals = new Map();
    sponsorPayments.forEach((payment) => {
      const paymentSeason = season(payment.payment_date);
      totals.set(paymentSeason.key, (totals.get(paymentSeason.key) || 0) + Number(payment.amount || 0));
    });
    paymentSeasons.replaceChildren();
    [...totals.entries()].sort(([left], [right]) => Number(right) - Number(left)).forEach(([key, total]) => {
      const chip = document.createElement('span');
      chip.textContent = `${key}/${String(Number(key) + 1).slice(-2)} · ${euro.format(total)}`;
      paymentSeasons.append(chip);
    });
    paymentList.replaceChildren();
    if (!sponsorPayments.length) {
      const empty = document.createElement('li'); empty.className = 'sponsor-payment-empty'; empty.textContent = 'Nessun pagamento registrato.'; paymentList.append(empty); return;
    }
    sponsorPayments.forEach((payment) => {
      const item = document.createElement('li'); item.dataset.paymentId = payment.id;
      const description = document.createElement('span');
      const amount = document.createElement('strong'); amount.textContent = euro.format(Number(payment.amount));
      const meta = document.createElement('small'); meta.textContent = `${displayDate(payment.payment_date)} · Stagione ${season(payment.payment_date).label}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.paymentAction = 'delete'; remove.textContent = 'Elimina';
      description.append(amount, meta); item.append(description, remove); paymentList.append(item);
    });
  };

  const openDetail = (sponsor, message = '') => {
    detailId = sponsor.id;
    detailModal.querySelector('[data-sponsor-detail-title]').textContent = sponsor.name;
    contactForm.elements.contact_email.value = sponsor.contact_email || '';
    renderOperatorOptions(sponsor.assigned_operator_email);
    logoDownload.hidden = !String(sponsor.logo_url || '').trim();
    paymentForm.elements.payment_date.value = today();
    paymentForm.elements.amount.value = '';
    sayDetail(message, message ? 'success' : 'info');
    renderPaymentHistory(sponsor);
    if (!detailModal.open) detailModal.showModal();
  };

  const busy = async (operation) => {
    root.setAttribute('aria-busy', 'true'); detailModal.setAttribute('aria-busy', 'true');
    try { return await operation(); } finally { root.removeAttribute('aria-busy'); detailModal.removeAttribute('aria-busy'); }
  };

  collection.add.addEventListener('click', () => { reset(); editModal.open('Aggiungi sponsor'); });
  collection.search.addEventListener('input', () => { page = 1; render(); });
  cancel.addEventListener('click', () => { reset(); editModal.close(); });
  detailModal.querySelector('[data-sponsor-detail-close]').addEventListener('click', () => detailModal.close());
  logoDownload.addEventListener('click', () => {
    const sponsor = sponsors.find((item) => item.id === detailId);
    logoDownload.disabled = true;
    downloadLogo(sponsor)
      .catch((error) => sayDetail(error.message || 'Non è stato possibile scaricare il logo.', 'error'))
      .finally(() => { logoDownload.disabled = false; });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    busy(async () => {
      const image = await values();
      const wasEditing = Boolean(editingId);
      const sponsorResponse = wasEditing
        ? await client().from('sponsors').update(image.payload).eq('id', editingId).select('id').single()
        : await client().from('sponsors').insert(image.payload).select('id').single();
      if (sponsorResponse.error) throw sponsorResponse.error;
      const sponsorId = sponsorResponse.data.id;
      const { error: contactError } = await client().from('sponsor_private_details').upsert({ sponsor_id: sponsorId, contact_email: image.contactEmail }, { onConflict: 'sponsor_id' });
      if (contactError) throw contactError;
      if (image.removePath && image.removePath !== image.path) await removeImage(image.removePath).catch(() => {});
      reset(); editModal.close(); await load(); say(wasEditing ? 'Sponsor aggiornato.' : 'Sponsor aggiunto.', 'success');
    }).catch((error) => say(error.message || 'Non è stato possibile salvare lo sponsor.', 'error'));
  });

  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    busy(async () => {
      const sponsor = sponsors.find((item) => item.id === detailId);
      if (!sponsor) throw new Error('Sponsor non disponibile.');
      const contactEmail = contactForm.elements.contact_email.value.trim().toLocaleLowerCase('it') || null;
      const assignedOperatorEmail = contactForm.elements.assigned_operator_email.value || null;
      const { error } = await client().from('sponsor_private_details').upsert({ sponsor_id: sponsor.id, contact_email: contactEmail, assigned_operator_email: assignedOperatorEmail }, { onConflict: 'sponsor_id' });
      if (error) throw error;
      await load(); openDetail(sponsors.find((item) => item.id === detailId), 'Contatto aggiornato.');
    }).catch((error) => sayDetail(error.message || 'Non è stato possibile aggiornare il contatto.', 'error'));
  });

  paymentForm.addEventListener('submit', (event) => {
    event.preventDefault();
    busy(async () => {
      const sponsor = sponsors.find((item) => item.id === detailId);
      if (!sponsor) throw new Error('Sponsor non disponibile.');
      const amount = Number(paymentForm.elements.amount.value);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Inserisci un importo maggiore di zero.');
      const { error } = await client().from('sponsor_payments').insert({ sponsor_id: sponsor.id, payment_date: paymentForm.elements.payment_date.value, amount });
      if (error) throw error;
      await load(); openDetail(sponsors.find((item) => item.id === detailId), `Pagamento registrato nella stagione ${season(paymentForm.elements.payment_date.value).label}.`);
    }).catch((error) => sayDetail(error.message || 'Non è stato possibile registrare il pagamento.', 'error'));
  });

  paymentList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-payment-action="delete"]');
    const payment = payments.find((item) => item.id === button?.closest('[data-payment-id]')?.dataset.paymentId);
    if (!button || !payment || !window.confirm(`Eliminare il pagamento di ${euro.format(Number(payment.amount))}?`)) return;
    busy(async () => {
      const { error } = await client().from('sponsor_payments').delete().eq('id', payment.id);
      if (error) throw error;
      await load(); openDetail(sponsors.find((item) => item.id === detailId), 'Pagamento eliminato.');
    }).catch((error) => sayDetail(error.message || 'Non è stato possibile eliminare il pagamento.', 'error'));
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sponsor-action]');
    const sponsor = sponsors.find((item) => item.id === button?.closest('[data-sponsor-id]')?.dataset.sponsorId);
    if (!button || !sponsor) return;
    if (button.dataset.sponsorAction === 'detail') return openDetail(sponsor);
    if (button.dataset.sponsorAction === 'edit') return edit(sponsor);
    if (!window.confirm(`Rimuovere definitivamente ${sponsor.name} e tutto il suo storico pagamenti?`)) return;
    busy(async () => {
      const { error } = await client().from('sponsors').delete().eq('id', sponsor.id);
      if (error) throw error;
      await removeImage(sponsor.logo_path).catch(() => {});
      await load(); say('Sponsor rimosso.', 'success');
    }).catch((error) => say(error.message || 'Non è stato possibile rimuovere lo sponsor.', 'error'));
  });

  (async () => {
    try {
      const access = await window.CapraiaAuth.requireOperator();
      if (!access?.isOperator || !access?.permissions?.can_sponsors) throw new Error('Accesso negato.');
      reset();
      try {
        await load();
      } catch (error) {
        say(error.message || 'Applica l’aggiornamento SQL della dashboard Sponsor e ricarica la pagina.', 'error');
        if (dashboard) {
          const notice = document.createElement('p');
          notice.className = 'admin-feedback'; notice.dataset.state = 'error';
          notice.textContent = 'Dashboard non disponibile: applica prima l’aggiornamento SQL su Supabase.';
          dashboard.replaceChildren(notice);
        }
      }
    } catch (error) {
      say(error.message || 'La sezione Sponsor non è disponibile.', 'error');
      root.closest('[data-admin-module]')?.setAttribute('hidden', '');
    }
  })();
})();
