import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean);
const PDF_WIDTH = 1011;
const PDF_HEIGHT = 639;
const encoder = new TextEncoder();

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

function pdfText(value: unknown) {
  // Helvetica usa WinAnsi: evitare UTF-16, che nei lettori PDF fa comparire
  // spazi anomali tra le lettere. Gli accenti comuni restano supportati.
  let hex = '';
  for (const character of String(value ?? '').normalize('NFD')) {
    const code = character.codePointAt(0) || 0;
    if (code >= 0x0300 && code <= 0x036f) continue;
    hex += (code <= 0xff ? code : 0x3f).toString(16).padStart(2, '0');
  }
  return `<${hex}>`;
}

function joinBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function pdfObject(number: number, value: string) {
  return encoder.encode(`${number} 0 obj\n${value}\nendobj\n`);
}

function pdfStream(number: number, dictionary: string, content: Uint8Array) {
  return joinBytes([encoder.encode(`${number} 0 obj\n${dictionary}\nstream\n`), content, encoder.encode('\nendstream\nendobj\n')]);
}

function base64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function centeredPdfText(value: string, centerX: number, baselineY: number, preferredSize: number, maxWidth: number) {
  const characters = Math.max([...value].length, 1);
  const size = Math.max(13, Math.min(preferredSize, maxWidth / (characters * 0.57)));
  const estimatedWidth = characters * size * 0.52;
  const x = Math.max(0, centerX - (estimatedWidth / 2));
  return `BT /F1 ${size.toFixed(2)} Tf 0.024 0.075 0.184 rg 1 0 0 1 ${x.toFixed(2)} ${baselineY} Tm ${pdfText(value)} Tj ET`;
}

function membershipCardPdf(front: Uint8Array, back: Uint8Array, name: string, cardNumber: string, memberSince: string) {
  const frontContents = encoder.encode(`q\n${PDF_WIDTH} 0 0 ${PDF_HEIGHT} 0 0 cm\n/Front Do\nQ\n`);
  const backContents = encoder.encode([
    'q', `${PDF_WIDTH} 0 0 ${PDF_HEIGHT} 0 0 cm`, '/Back Do', 'Q',
    // Le coordinate corrispondono ai tre riquadri bianchi del template.
    centeredPdfText(name, 316, 536, 27, 450),
    centeredPdfText(cardNumber, 216, 178, 25, 250),
    centeredPdfText(memberSince, 482, 178, 20, 135),
  ].join('\n'));
  const objects = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>'),
    pdfObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /XObject << /Front 5 0 R >> >> /Contents 6 0 R >>`),
    pdfObject(4, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /XObject << /Back 7 0 R >> /Font << /F1 9 0 R >> >> /Contents 8 0 R >>`),
    pdfStream(5, `<< /Type /XObject /Subtype /Image /Width ${PDF_WIDTH} /Height ${PDF_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${front.length} >>`, front),
    pdfStream(6, `<< /Length ${frontContents.length} >>`, frontContents),
    pdfStream(7, `<< /Type /XObject /Subtype /Image /Width ${PDF_WIDTH} /Height ${PDF_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${back.length} >>`, back),
    pdfStream(8, `<< /Length ${backContents.length} >>`, backContents),
    pdfObject(9, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
  ];
  const header = encoder.encode('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');
  const offsets: number[] = [0];
  let cursor = header.length;
  for (const object of objects) { offsets.push(cursor); cursor += object.length; }
  const xrefOffset = cursor;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return joinBytes([header, ...objects, encoder.encode(xref)]);
}

async function fetchCardImage(url: string) {
  const response = await fetch(url);
  const image = new Uint8Array(await response.arrayBuffer());
  if (!response.ok || image.length === 0 || image[0] !== 0xff || image[1] !== 0xd8) {
    throw new RequestError('Non è stato possibile preparare il PDF della tessera.', 502);
  }
  return image;
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
    const cardNumber = String(member.card_number ?? '—'); const memberSince = /^\d{4}-\d{2}-\d{2}$/.test(String(member.member_since || '')) ? String(member.member_since).slice(0, 4) : '—'; const amount = Number(member.renewal_total);
    const amountLabel = Number.isFinite(amount) ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount) : '—';
    const frontCard = `${siteUrl}/assets/images/tessera-socio-fronte.jpg`; const backCard = `${siteUrl}/assets/images/tessera-socio-template.jpg`;
    const [frontImage, backImage] = await Promise.all([fetchCardImage(frontCard), fetchCardImage(backCard)]);
    const cardPdf = membershipCardPdf(frontImage, backImage, name, cardNumber, memberSince);
    const emailResponse = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'User-Agent': 'capraiafc-member-renewal/1.0', 'Idempotency-Key': `member-renewal/${requestId}` }, body: JSON.stringify({
      from, to: [recipient], subject: `Tessera Capraia FC rinnovata · stagione ${season}`,
      html: `<h1>Grazie per aver scelto Capraia FC</h1><p>Ciao <strong>${escapeHtml(name)}</strong>, il tuo tesseramento per la stagione <strong>${escapeHtml(season)}</strong> è stato rinnovato con successo.</p><table role="presentation" cellpadding="8" style="border-collapse:collapse"><tbody><tr><th align="left">Metodo di pagamento</th><td>${escapeHtml(member.payment_method)}</td></tr><tr><th align="left">Totale rinnovo</th><td>${escapeHtml(amountLabel)}</td></tr></tbody></table><p>In allegato trovi il fac-simile in PDF della tua tessera Capraia FC.</p><h2>Ritiro della tessera fisica</h2><p>Puoi ritirarla in biglietteria quando giochiamo in casa oppure, su richiesta, presso il Circolo ARCI di Capraia Fiorentina, in Via Salvador Allende 152.</p><p>Ti aspettiamo al campo. Forza Capraia!</p>`,
      attachments: [{ filename: `tessera-capraia-fc-${cardNumber}-${season}.pdf`, content: base64(cardPdf) }],
    }) });
    if (!emailResponse.ok) { console.error('Resend member renewal email error', await emailResponse.text()); throw new RequestError('Invio email momentaneamente non disponibile.', 502); }
    return Response.json({ ok: true }, { status: 200, headers: cors });
  } catch (error) {
    const known = error instanceof RequestError; if (!known) console.error('Member renewal email error', error);
    return Response.json({ message: known ? error.message : 'Errore inatteso durante l’invio.' }, { status: known ? error.status : 500, headers: cors });
  }
});
