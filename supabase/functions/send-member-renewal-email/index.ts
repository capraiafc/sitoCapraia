import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean);

class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
}[character]!));

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!isLocal && !ALLOWED_ORIGINS.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}

function requestUuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new RequestError(`${label} non valido.`);
  return value;
}

function currentSeason() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  const year = Number(value.year); const month = Number(value.month); const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

async function rest(path: string, options: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new RequestError('Servizio tesserati non configurato.', 503);
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(payload?.message || 'Dati tesserato non disponibili.', response.status === 401 ? 401 : 500);
  return payload;
}

async function authenticatedEmail(request: Request) {
  const url = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization') || '';
  if (!url || !serviceKey) throw new RequestError('Servizio tesserati non configurato.', 503);
  if (!authorization.startsWith('Bearer ') || authorization.length < 20) throw new RequestError('Accesso non autorizzato.', 401);
  const response = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: authorization, apikey: serviceKey } });
  const user = await response.json().catch(() => null);
  const email = String(user?.email || '').trim().toLowerCase();
  if (!response.ok || !EMAIL_PATTERN.test(email)) throw new RequestError('Accesso non autorizzato.', 401);
  return email;
}

async function requireMembersPermission(email: string) {
  if (email === 'capraiafc@gmail.com') return;
  const filter = new URLSearchParams({ select: 'role,can_members', email: `eq.${email}`, limit: '1' });
  const rows = await rest(`operator_allowlist?${filter.toString()}`) as Array<{ role?: string; can_members?: boolean }>;
  const operator = rows[0];
  if (!operator || !['operator', 'admin'].includes(operator.role || '') || operator.can_members !== true) throw new RequestError('Accesso non autorizzato.', 403);
}

serve(async (request) => {
  const cors = corsHeaders(request);
  if (!cors) return Response.json({ message: 'Origine non autorizzata.' }, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return Response.json({ message: 'Metodo non consentito.' }, { status: 405, headers: cors });
  try {
    const payload = await request.json();
    const memberId = requestUuid(payload?.memberId, 'Tesserato'); const requestId = requestUuid(payload?.requestId, 'Codice rinnovo');
    const email = await authenticatedEmail(request); await requireMembersPermission(email);
    const query = new URLSearchParams({ select: 'id,first_name,last_name,email,card_number,member_since,renewed_current_season,paid,renewal_total,payment_method,renewal_season', id: `eq.${memberId}`, limit: '1' });
    const members = await rest(`members?${query.toString()}`) as Array<Record<string, unknown>>;
    const member = members[0]; const season = currentSeason();
    if (!member || member.renewed_current_season !== true || member.paid !== true || member.renewal_season !== season) throw new RequestError('Il rinnovo del tesserato non risulta completo per la stagione corrente.', 409);
    const recipient = String(member.email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(recipient)) throw new RequestError('Il tesserato non ha un indirizzo email valido.', 409);
    const resendKey = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('MAIL_FROM'); const siteUrl = (Deno.env.get('MEMBERSHIP_SITE_URL') || '').replace(/\/+$/, '');
    if (!resendKey || !from || !siteUrl) throw new RequestError('Il servizio email tessere non è ancora configurato.', 503);
    const name = `${String(member.first_name || '').trim()} ${String(member.last_name || '').trim()}`.trim() || 'Socio Capraia FC';
    const cardNumber = String(member.card_number ?? '—'); const memberSince = String(member.member_since ?? '—'); const amount = Number(member.renewal_total);
    const amountLabel = Number.isFinite(amount) ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount) : '—';
    const frontCard = `${siteUrl}/assets/images/tessera-socio-fronte.jpg`; const backCard = `${siteUrl}/assets/images/tessera-socio-template.jpg`;
    const memberCard = `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" background="${escapeHtml(backCard)}" style="width:600px;max-width:100%;height:380px;border-collapse:collapse;background:#002f86 url('${escapeHtml(backCard)}') center/cover no-repeat"><tbody>
      <tr><td height="42" style="height:42px;font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding-left:42px"><table role="presentation" width="312" cellpadding="0" cellspacing="0" border="0"><tr><td height="39" align="center" valign="middle" style="height:39px;padding:0 12px;overflow:hidden;color:#06132f;font-family:Arial,sans-serif;font-size:16px;font-weight:700;line-height:39px;white-space:nowrap">${escapeHtml(name)}</td></tr></table></td></tr>
      <tr><td height="154" style="height:154px;font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding-left:42px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="187" height="40" align="center" valign="middle" style="width:187px;height:40px;padding:0 8px;overflow:hidden;color:#06132f;font-family:Arial,sans-serif;font-size:16px;font-weight:700;line-height:40px;white-space:nowrap">${escapeHtml(cardNumber)}</td><td width="18" style="width:18px">&nbsp;</td><td width="87" height="40" align="center" valign="middle" style="width:87px;height:40px;padding:0 6px;overflow:hidden;color:#06132f;font-family:Arial,sans-serif;font-size:14px;font-weight:700;line-height:40px;white-space:nowrap">${escapeHtml(memberSince)}</td></tr></table></td></tr>
    </tbody></table>`;
    const emailResponse = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'User-Agent': 'capraiafc-member-renewal/1.0', 'Idempotency-Key': `member-renewal/${requestId}` }, body: JSON.stringify({
      from, to: [recipient], subject: `Tessera Capraia FC rinnovata · stagione ${season}`,
      html: `<h1>Grazie per aver scelto Capraia FC</h1><p>Ciao <strong>${escapeHtml(name)}</strong>, il tuo tesseramento per la stagione <strong>${escapeHtml(season)}</strong> è stato rinnovato con successo.</p><table role="presentation" cellpadding="8" style="border-collapse:collapse"><tbody><tr><th align="left">Metodo di pagamento</th><td>${escapeHtml(member.payment_method)}</td></tr><tr><th align="left">Totale rinnovo</th><td>${escapeHtml(amountLabel)}</td></tr></tbody></table><h2>La tua tessera</h2><p><img src="${escapeHtml(frontCard)}" alt="Fronte tessera Capraia FC" width="500" style="max-width:100%;height:auto;display:block" /></p>${memberCard}<p>Ti aspettiamo al campo. Forza Capraia!</p>`,
    }) });
    if (!emailResponse.ok) { console.error('Resend member renewal email error', await emailResponse.text()); throw new RequestError('Invio email momentaneamente non disponibile.', 502); }
    return Response.json({ ok: true }, { status: 200, headers: cors });
  } catch (error) {
    const known = error instanceof RequestError; if (!known) console.error('Member renewal email error', error);
    return Response.json({ message: known ? error.message : 'Errore inatteso durante l’invio.' }, { status: known ? error.status : 500, headers: cors });
  }
});
