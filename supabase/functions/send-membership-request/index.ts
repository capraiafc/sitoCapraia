import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,60}$/;
const RENEWAL_REQUIRED_FIELDS = ['full_name', 'member_number', 'member_since'];
const NEW_MEMBER_REQUIRED_FIELDS = (Deno.env.get('NEW_MEMBER_REQUIRED_FIELDS') || 'first_name,last_name,birth_date,birth_place,nationality,tax_code,gender,residence,email,phone,identity_document,identity_document_expiry')
  .split(',').map((item) => item.trim()).filter(Boolean);
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',').map((item) => item.trim()).filter(Boolean);

class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const html = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
}[character]!));

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!isLocal && !ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function text(value: unknown, label: string, maxLength = 500) {
  if (typeof value !== 'string') throw new RequestError(`${label} non valido.`);
  const normalized = value.trim();
  if (!normalized) throw new RequestError(`${label} obbligatorio.`);
  if (normalized.length > maxLength) throw new RequestError(`${label} troppo lungo.`);
  return normalized;
}

function fieldsFrom(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError('Dati della richiesta non validi.');
  const fields: Record<string, string> = {};
  for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    if (!FIELD_KEY_PATTERN.test(key)) throw new RequestError('Nome campo non valido.');
    fields[key] = text(fieldValue, 'Campo');
  }
  if (Object.keys(fields).length > 30) throw new RequestError('Sono stati inviati troppi campi.');
  return fields;
}

function labelsFrom(value: unknown, fields: Record<string, string>) {
  const labels: Record<string, string> = {};
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  for (const key of Object.keys(fields)) {
    const label = source[key];
    labels[key] = typeof label === 'string' && label.trim() && label.trim().length <= 100 ? label.trim() : key.replaceAll('_', ' ');
  }
  return labels;
}

function requireFields(fields: Record<string, string>, required: string[]) {
  required.forEach((key) => {
    if (!fields[key]) throw new RequestError('Compila tutti i campi obbligatori.');
  });
}

serve(async (request) => {
  const cors = corsHeaders(request);
  if (!cors) return Response.json({ message: 'Origine non autorizzata.' }, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return Response.json({ message: 'Metodo non consentito.' }, { status: 405, headers: cors });

  try {
    const payload = await request.json();
    if (payload?.website) throw new RequestError('Richiesta non valida.');
    if (payload?.requestType !== 'renewal' && payload?.requestType !== 'new_member') throw new RequestError('Tipo richiesta non valido.');
    if (payload?.privacyAccepted !== true) throw new RequestError('Devi accettare l’informativa privacy.');

    const email = text(payload.email, 'Email', 254).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) throw new RequestError('Inserisci un indirizzo email valido.');
    const fields = fieldsFrom(payload.fields);
    const labels = labelsFrom(payload.fieldLabels, fields);
    requireFields(fields, payload.requestType === 'renewal' ? RENEWAL_REQUIRED_FIELDS : NEW_MEMBER_REQUIRED_FIELDS);
    if (payload.requestType === 'renewal') {
      if (!/^\d{1,8}$/.test(fields.member_number)) throw new RequestError('Il numero tessera deve contenere solo cifre.');
      if (!/^\d{4}$/.test(fields.member_since)) throw new RequestError('Inserisci l’anno di inizio tessera con quattro cifre.');
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.birth_date) || !/^\d{4}-\d{2}-\d{2}$/.test(fields.identity_document_expiry)) throw new RequestError('Inserisci date valide.');
      if (!/^[a-z0-9]{16}$/i.test(fields.tax_code)) throw new RequestError('Il codice fiscale deve contenere 16 caratteri alfanumerici.');
      if (!['Maschio', 'Femmina'].includes(fields.gender)) throw new RequestError('Seleziona il sesso.');
    }
    const submissionId = text(payload.submissionId, 'Codice richiesta', 100);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('MAIL_FROM');
    const to = Deno.env.get('MAIL_TO') || 'capraiafc@gmail.com';
    if (!resendKey || !from) throw new RequestError('Il servizio email non è ancora configurato.', 503);

    const requestLabel = payload.requestType === 'renewal' ? 'Rinnovo' : 'Nuovo tesserato';
    const applicantName = payload.requestType === 'renewal'
      ? fields.full_name
      : `${fields.first_name} ${fields.last_name}`;
    const rows = Object.entries(fields).map(([key, value]) => `<tr><th>${html(labels[key])}</th><td>${html(value)}</td></tr>`).join('');
    const cardSummary = payload.requestType === 'renewal'
      ? `<p><strong>Anteprima tessera:</strong> ${html(fields.full_name)} · Tessera n. ${html(fields.member_number)} · Socio dal ${html(fields.member_since)} · Stagione ${html(Deno.env.get('MEMBERSHIP_SEASON') || '2026/27')}</p>`
      : '';
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'capraiafc-membership-request/1.0',
        'Idempotency-Key': `membership-request/${submissionId}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `Tessera - ${applicantName}`,
        html: `<h1>Richiesta tessera Capraia FC</h1><p><strong>Tipo richiesta:</strong> ${requestLabel}</p><p><strong>Email di contatto:</strong> ${html(email)}</p><p><strong>Privacy:</strong> accettata</p>${cardSummary}<h2>Dati inseriti</h2><table><tbody>${rows}</tbody></table>`,
      }),
    });
    if (!emailResponse.ok) {
      console.error('Resend email error', await emailResponse.text());
      throw new RequestError('Invio momentaneamente non disponibile. Riprova tra poco.', 502);
    }
    return Response.json({ ok: true }, { status: 200, headers: cors });
  } catch (error) {
    const known = error instanceof RequestError;
    if (!known) console.error('Membership request error', error);
    return Response.json({ message: known ? error.message : 'Errore inatteso durante l’invio.' }, { status: known ? error.status : 500, headers: cors });
  }
});
