import '../auth.js?v=members-20260730';
import { PAGE_SIZE, pageItems } from './crud-ui.js?v=member-navigation-20260730';
import {
  createMember, listMembers, renewMember, resendRenewalEmail,
} from './members-service.js?v=membership-reset-fix-20260730';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' });

function currentSeason() {
  const now = new Date();
  const year = now.getFullYear() - (now.getMonth() < 6 ? 1 : 0);
  return `${year}-${String(year + 1).slice(-2)}`;
}

function displayName(member) {
  return [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Tesserato senza nome';
}

function text(value, fallback = '—') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '—' : date.format(parsed);
}

function ageFor(value) {
  if (!value) return null;
  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const birthdayThisYear = new Date(now.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  if (now < birthdayThisYear) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function genderName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['m', 'maschio', 'maschile'].includes(normalized)) return 'Maschile';
  if (['f', 'femmina', 'femminile'].includes(normalized)) return 'Femminile';
  if (normalized) return 'Altro / non specificato';
  return 'Non indicato';
}

(function initMembers() {
  const root = $('[data-member-management]');
  if (!root) return;

  const list = $('[data-member-list]', root);
  const empty = $('[data-member-empty]', root);
  const feedback = $('[data-member-feedback]', root);
  const search = $('[data-member-search]', root);
  const pagination = $('[data-member-pagination]', root);
  const summary = $('[data-member-list-summary]', root);
  const template = $('#member-list-item-template');
  const detailModal = $('[data-member-detail-modal]');
  const createModal = $('[data-member-create-modal]');
  const detailForm = $('[data-member-renewal-form]', detailModal);
  const createForm = $('[data-member-create-form]', createModal);
  const season = currentSeason();
  let members = [];
  let page = 1;
  let selectedMember = null;

  const setFeedback = (message, state = 'info') => {
    feedback.textContent = message;
    feedback.dataset.state = state;
  };
  const setBusy = (element, busy) => {
    element.toggleAttribute('aria-busy', busy);
    $$('button,input,select,textarea', element).forEach((control) => { control.disabled = busy; });
  };
  const openModal = (modal, opener) => {
    modal.__opener = opener || document.activeElement;
    if (!modal.open) modal.showModal();
  };
  const closeModal = (modal) => { if (modal.open) modal.close(); };
  const closeButtons = [
    [$('[data-member-modal-close]', detailModal), detailModal],
    [$('[data-member-create-close]', createModal), createModal],
    [$('[data-member-create-cancel]', createModal), createModal],
  ];
  closeButtons.forEach(([button, modal]) => button?.addEventListener('click', () => closeModal(modal)));
  [detailModal, createModal].forEach((modal) => modal.addEventListener('close', () => modal.__opener?.focus?.()));

  const hasRenewed = (member) => member.renewed_current_season === true;
  const currentMembers = () => members.filter((member) => hasRenewed(member));

  function renderBars(container, entries) {
    container.replaceChildren();
    const maximum = Math.max(1, ...entries.map((entry) => entry.value));
    entries.forEach((entry) => {
      const row = document.createElement('div'); row.className = 'members-bars__row';
      const label = document.createElement('span'); label.textContent = entry.label;
      const bar = document.createElement('i');
      const value = entry.value ? Math.max(6, (entry.value / maximum) * 100) : 0;
      bar.style.setProperty('--members-bar-size', `${value}%`);
      bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', entry.label);
      bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(maximum)); bar.setAttribute('aria-valuenow', String(entry.value));
      const amount = document.createElement('b'); amount.textContent = String(entry.value);
      row.append(label, bar, amount); container.append(row);
    });
  }

  function renderDashboard() {
    const renewed = currentMembers();
    const paid = renewed.filter((member) => member.paid === true);
    const revenue = paid.reduce((sum, member) => sum + Number(member.renewal_total || 0), 0);
    $('[data-members-current-season]').textContent = `Stagione in corso · ${season}`;
    $('[data-members-total-revenue]').textContent = euro.format(revenue);
    $('[data-members-revenue-note]').textContent = `${paid.length} pagamenti registrati`;
    $('[data-members-total-count]').textContent = String(members.length);
    $('[data-members-renewed-count]').textContent = `${renewed.length} rinnovati per ${season}`;
    const rate = members.length ? Math.round((renewed.length / members.length) * 100) : 0;
    $('[data-members-renewal-rate]').textContent = `${rate}%`;
    $('[data-members-pending-count]').textContent = `${Math.max(0, members.length - renewed.length)} da completare`;

    const ages = renewed.map((member) => ageFor(member.birth_date)).filter((value) => value !== null);
    $('[data-members-age-note]').textContent = `Dati disponibili: ${ages.length}`;
    renderBars($('[data-members-age-bars]'), [
      ['Under 18', (age) => age < 18], ['18–29', (age) => age >= 18 && age <= 29],
      ['30–44', (age) => age >= 30 && age <= 44], ['45–59', (age) => age >= 45 && age <= 59], ['60+', (age) => age >= 60],
    ].map(([label, condition]) => ({ label, value: ages.filter(condition).length })));

    const identified = renewed.filter((member) => String(member.gender || '').trim());
    const masculine = identified.filter((member) => genderName(member.gender) === 'Maschile').length;
    const feminine = identified.filter((member) => genderName(member.gender) === 'Femminile').length;
    const other = Math.max(0, identified.length - masculine - feminine);
    const mainPercentage = identified.length ? Math.round((masculine / identified.length) * 100) : 0;
    const ring = $('[data-members-gender-ring]');
    ring.style.setProperty('--members-gender-main', `${mainPercentage}%`);
    $('[data-members-gender-main-percent]').textContent = identified.length ? `${mainPercentage}% M` : '—';
    $('[data-members-gender-note]').textContent = `${identified.length} profili indicati`;
    const legend = $('[data-members-gender-legend]'); legend.replaceChildren();
    [['Maschile', masculine, '#002f86'], ['Femminile', feminine, '#ffd21c'], ['Altro', other, '#7584a3']].forEach(([label, amount, color]) => {
      const item = document.createElement('li'); const left = document.createElement('span'); const swatch = document.createElement('i');
      swatch.style.setProperty('--member-gender-color', color); left.append(swatch, label);
      const value = document.createElement('b'); value.textContent = identified.length ? `${Math.round((amount / identified.length) * 100)}%` : '—';
      item.append(left, value); legend.append(item);
    });
  }

  function renderPagination(totalItems) {
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    page = Math.min(Math.max(1, page), totalPages);
    pagination.replaceChildren();
    if (totalItems <= PAGE_SIZE) return;
    const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '← Precedente'; previous.disabled = page === 1;
    const label = document.createElement('span'); label.textContent = `Pagina ${page} di ${totalPages}`;
    const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Successiva →'; next.disabled = page === totalPages;
    previous.addEventListener('click', () => { page -= 1; renderList(); });
    next.addEventListener('click', () => { page += 1; renderList(); });
    pagination.append(previous, label, next);
  }

  function renderList() {
    const view = pageItems(members, search.value, page, (member, query) => [
      member.first_name, member.last_name, member.card_number, member.email,
    ].join(' ').toLocaleLowerCase('it').includes(query));
    page = view.page;
    list.replaceChildren();
    view.items.forEach((member) => {
      const item = template.content.firstElementChild.cloneNode(true);
      const button = $('[data-member-open]', item); button.dataset.memberId = member.id;
      $('[data-member-name]', item).textContent = displayName(member);
      $('[data-member-card-number]', item).textContent = `Tessera ${text(member.card_number)}`;
      const renewed = hasRenewed(member);
      const dot = $('[data-member-renewal-dot]', item); dot.dataset.state = renewed ? 'renewed' : 'pending';
      const status = $('[data-member-renewal-label]', item); status.dataset.state = renewed ? 'renewed' : 'pending';
      status.textContent = renewed ? 'Rinnovato' : 'Da rinnovare';
      button.setAttribute('aria-label', `Apri la scheda di ${displayName(member)}, tessera ${member.card_number}`);
      list.append(item);
    });
    empty.hidden = view.items.length > 0 || !members.length;
    summary.textContent = members.length
      ? `${view.filtered.length} tesserati${search.value ? ' trovati' : ` · pagina ${page}`}`
      : 'Nessun tesserato registrato';
    renderPagination(view.filtered.length);
  }

  function setDetail(member) {
    selectedMember = member;
    $('[data-member-modal-title]', detailModal).textContent = displayName(member);
    $('[data-member-detail-name]', detailModal).textContent = displayName(member);
    $('[data-member-detail-card-number]', detailModal).textContent = text(member.card_number);
    $('[data-member-detail-email]', detailModal).textContent = text(member.email, 'Email non indicata');
    $('[data-member-detail-since]', detailModal).textContent = formatDate(member.member_since);
    const fieldValues = {
      'birth-date': formatDate(member.birth_date), 'birth-place': text(member.birth_place), nationality: text(member.nationality),
      gender: genderName(member.gender), phone: text(member.phone), 'tax-code': text(member.tax_code), residence: text(member.residence),
      'identity-document': text(member.identity_document), 'identity-document-expiry': formatDate(member.identity_document_expiry),
      'experience-feedback': text(member.experience_feedback),
    };
    Object.entries(fieldValues).forEach(([field, value]) => { const target = $(`[data-member-detail-${field}]`, detailModal); if (target) target.textContent = value; });
    const status = $('[data-member-detail-paid-status]', detailModal);
    status.textContent = member.paid ? `Pagato · ${euro.format(Number(member.renewal_total || 0))}` : 'Pagamento non registrato';
    const complete = hasRenewed(member);
    $('[data-member-renewal-season]', detailModal).textContent = season;
    const badge = $('[data-member-renewal-badge]', detailModal); badge.dataset.state = complete ? 'renewed' : 'pending'; badge.textContent = complete ? 'Rinnovato' : 'Da rinnovare';
    $('[data-member-renewal-pending]', detailModal).hidden = complete;
    $('[data-member-renewal-complete]', detailModal).hidden = !complete;
    $('[data-member-renewal-complete-note]', detailModal).textContent = complete
      ? `Rinnovo ${member.renewed_at ? `registrato il ${formatDate(member.renewed_at.slice(0, 10))}` : 'registrato'}${member.paid ? ` · ${euro.format(Number(member.renewal_total || 0))} · ${text(member.payment_method, 'metodo non indicato')}` : ''}.`
      : '';
    detailForm.reset();
  }

  async function load() {
    setBusy(root, true);
    try {
      members = await listMembers();
      renderDashboard(); renderList();
    } finally { setBusy(root, false); }
  }

  root.addEventListener('click', (event) => {
    const add = event.target.closest('[data-member-add]');
    if (add) {
      createForm.reset(); createForm.elements.member_since.value = new Date().toISOString().slice(0, 10);
      $('[data-member-create-feedback]', createModal).textContent = '';
      openModal(createModal, add); return;
    }
    const button = event.target.closest('[data-member-open]');
    if (!button) return;
    const member = members.find((item) => item.id === button.dataset.memberId);
    if (!member) return;
    setDetail(member); openModal(detailModal, button);
  });
  search.addEventListener('input', () => { page = 1; renderList(); });

  detailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedMember) return;
    const submit = $('[data-member-renew]', detailForm);
    submit.disabled = true;
    try {
      const result = await renewMember(selectedMember.id, {
        amount: detailForm.elements.renewal_amount.value,
        paymentMethod: detailForm.elements.payment_method.value,
      });
      await load();
      const renewed = members.find((member) => member.id === selectedMember.id) || result.member;
      setDetail(renewed);
      setFeedback(result.emailSent ? 'Rinnovo registrato ed email inviata al tesserato.' : 'Rinnovo registrato. L’email non è stata inviata: puoi riprovare dalla scheda.', result.emailSent ? 'success' : 'error');
    } catch (error) {
      setFeedback(error.message || 'Non è stato possibile registrare il rinnovo.', 'error');
    } finally { submit.disabled = false; }
  });

  $('[data-member-resend-email]', detailModal)?.addEventListener('click', async (event) => {
    if (!selectedMember) return;
    const button = event.currentTarget; button.disabled = true;
    try {
      await resendRenewalEmail(selectedMember.id);
      setFeedback('Email e fac-simile tessera reinviati al tesserato.', 'success');
    } catch (error) { setFeedback(error.message || 'Non è stato possibile reinviare l’email.', 'error'); }
    finally { button.disabled = false; }
  });

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = $('[data-member-create-feedback]', createModal);
    const submit = $('[data-member-create-submit]', createForm);
    submit.disabled = true;
    try {
      const result = await createMember(Object.fromEntries(new FormData(createForm)));
      await load(); closeModal(createModal);
      const created = members.find((member) => member.id === result.id) || result;
      setDetail(created); openModal(detailModal, $('[data-member-add]', root));
      setFeedback(`Tesserato creato: assegnata la tessera ${created.card_number}. Registra ora il primo rinnovo.`, 'success');
    } catch (error) {
      message.textContent = error.message || 'Non è stato possibile creare il tesserato.';
      message.dataset.state = 'error';
    } finally { submit.disabled = false; }
  });

  async function start() {
    try {
      const access = await window.CapraiaAuth.requireOperator();
      if (!access?.isSuperUser && !access?.permissions?.can_members) throw new Error('Non hai l’autorizzazione per gestire i tesserati.');
      await load();
    } catch (error) {
      root.hidden = true;
      const denied = $('[data-member-denied]'); if (denied) { denied.hidden = false; denied.textContent = error.message || 'Accesso negato.'; }
    }
  }
  start();
}());
