/*
 * Accesso dati per l'area Tesserati.
 *
 * Le operazioni che cambiano lo stato della tessera passano da RPC: il
 * browser non assegna numeri tessera e non decide la stagione corrente.
 * Questo file non contiene rendering: può quindi essere riusato dalla UI.
 */

const MEMBER_COLUMNS = [
  'id', 'card_number', 'first_name', 'last_name', 'email', 'birth_date',
  'birth_place', 'nationality', 'tax_code', 'gender', 'residence', 'phone',
  'identity_document', 'identity_document_expiry', 'experience_feedback', 'member_since',
  'renewed_current_season', 'paid', 'payment_method', 'renewal_total',
  'renewal_season', 'renewed_at', 'created_at', 'updated_at',
].join(', ');

const EDITABLE_MEMBER_FIELDS = new Set([
  'first_name', 'last_name', 'email', 'birth_date', 'birth_place',
  'nationality', 'tax_code', 'gender', 'residence', 'phone',
  'identity_document', 'identity_document_expiry', 'experience_feedback', 'member_since',
]);

function client() {
  const supabase = window.CapraiaAuth?.supabase;
  if (!supabase) throw new Error('Client Supabase non disponibile.');
  return supabase;
}

function failIfError(error) {
  if (error) throw error;
}

function optionalText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function requiredText(value, label, maxLength = 160) {
  const normalized = optionalText(value);
  if (!normalized || normalized.length > maxLength) throw new Error(`${label} non valido.`);
  return normalized;
}

function optionalDate(value, label) {
  const normalized = optionalText(value);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00`).getTime())) {
    throw new Error(`${label} non valida.`);
  }
  return normalized;
}

function uuid(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${label} non valido.`);
  }
  return normalized;
}

function renewalResult(data) {
  return Array.isArray(data) ? data[0] : data;
}

/** Invocata prima della lista: l'RPC è idempotente e gestisce il 1° luglio. */
export async function synchroniseMembershipSeason() {
  const { error } = await client().rpc('reset_membership_renewals_for_current_season');
  failIfError(error);
}

export async function listMembers({ synchroniseSeason = true } = {}) {
  if (synchroniseSeason) await synchroniseMembershipSeason();
  const { data, error } = await client()
    .from('members')
    .select(MEMBER_COLUMNS)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });
  failIfError(error);
  return data ?? [];
}

export function toMemberDetailsPayload(values) {
  const payload = {};
  for (const [field, value] of Object.entries(values || {})) {
    if (!EDITABLE_MEMBER_FIELDS.has(field)) continue;
    if (field === 'email') {
      const email = optionalText(value);
      payload.email = email ? email.toLowerCase() : null;
    } else {
      payload[field] = optionalText(value);
    }
  }
  return payload;
}

/** Il database attribuisce il primo numero tessera libero in una transazione. */
export async function createMember(values) {
  const payload = toMemberDetailsPayload(values);
  payload.first_name = requiredText(payload.first_name, 'Nome', 80);
  payload.last_name = requiredText(payload.last_name, 'Cognome', 80);
  const { data, error } = await client().rpc('create_member', { p_member: payload });
  failIfError(error);
  return renewalResult(data);
}

export async function updateMemberDetails(memberId, values) {
  const id = uuid(memberId, 'Tesserato');
  const payload = toMemberDetailsPayload(values);
  const { data, error } = await client()
    .from('members')
    .update(payload)
    .eq('id', id)
    .select(MEMBER_COLUMNS)
    .single();
  failIfError(error);
  return data;
}

async function sendRenewalEmail(memberId, requestId) {
  const { data, error } = await client().functions.invoke('send-member-renewal-email', {
    body: { memberId, requestId },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message || 'Invio email non riuscito.');
  return data;
}

/** Registra il rinnovo prima dell'email: un errore email non perde il pagamento. */
export async function renewMember(memberId, { amount, paymentMethod, memberSince, requestId = crypto.randomUUID() } = {}) {
  const id = uuid(memberId, 'Tesserato');
  const total = Number(amount);
  if (!Number.isFinite(total) || total < 0 || total > 100000) throw new Error('Importo rinnovo non valido.');
  const method = requiredText(paymentMethod, 'Metodo di pagamento', 120);
  const since = optionalDate(memberSince, 'Data socio dal');
  const operationId = uuid(requestId, 'Codice rinnovo');
  const { data, error } = await client().rpc('renew_member', {
    p_member_id: id,
    p_amount: total,
    p_payment_method: method,
    p_request_id: operationId,
    p_member_since: since,
  });
  failIfError(error);
  const member = renewalResult(data) || { id };
  try {
    await sendRenewalEmail(member.id || id, operationId);
    return { member, emailSent: true, requestId: operationId };
  } catch (emailError) {
    console.error('Rinnovo registrato, ma email non inviata.', emailError);
    return { member, emailSent: false, emailError, requestId: operationId };
  }
}

export async function resendRenewalEmail(memberId, requestId = crypto.randomUUID()) {
  const id = uuid(memberId, 'Tesserato');
  const operationId = uuid(requestId, 'Codice rinnovo');
  await sendRenewalEmail(id, operationId);
  return { emailSent: true, requestId: operationId };
}

export const MEMBERSHIP_MEMBER_COLUMNS = MEMBER_COLUMNS;
