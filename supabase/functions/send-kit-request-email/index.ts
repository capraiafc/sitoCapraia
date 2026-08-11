import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((item) => item.trim()).filter(Boolean);

class RequestError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const html = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]!));

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!local && !ALLOWED_ORIGINS.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}

async function rest(path: string) {
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new RequestError('Servizio kit non configurato.', 503);
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: { Authorization: `Bearer ${key}`, apikey: key } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(payload?.message || 'Dati richiesta non disponibili.', 500);
  return payload;
}

async function authenticatedEmail(request: Request) {
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const authorization = request.headers.get('authorization') || '';
  if (!url || !key || !authorization.startsWith('Bearer ')) throw new RequestError('Accesso non autorizzato.', 401);
  const response = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: authorization, apikey: key } });
  const user = await response.json().catch(() => null); const email = String(user?.email || '').trim().toLowerCase();
  if (!response.ok || !EMAIL_PATTERN.test(email)) throw new RequestError('Accesso non autorizzato.', 401);
  return email;
}

serve(async (request) => {
  const cors = corsHeaders(request);
  if (!cors) return Response.json({ message: 'Origine non autorizzata.' }, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return Response.json({ message: 'Metodo non consentito.' }, { status: 405, headers: cors });
  try {
    const payload = await request.json();
    const requestId = String(payload?.requestId || ''); const notification = String(payload?.notification || '');
    if (!UUID_PATTERN.test(requestId) || !['new', 'resolution'].includes(notification)) throw new RequestError('Richiesta email non valida.');
    const email = await authenticatedEmail(request);
    const query = new URLSearchParams({
      select: 'id,status,reason,rejection_reason,players!inner(id,display_name,player_private_details(email)),kit_items!inner(name),kit_item_sizes!inner(size)',
      id: `eq.${requestId}`, limit: '1',
    });
    const rows = await rest(`kit_requests?${query.toString()}`) as Array<Record<string, any>>;
    const kitRequest = rows[0];
    if (!kitRequest) throw new RequestError('Richiesta kit non trovata.', 404);
    const player = kitRequest.players || {}; const details = Array.isArray(player.player_private_details) ? player.player_private_details[0] : player.player_private_details;
    const operators = await rest(`operator_allowlist?${new URLSearchParams({ select: 'role,can_players,player_id', email: `eq.${email}`, limit: '1' }).toString()}`) as Array<Record<string, unknown>>;
    const operator = operators[0]; const superUser = email === 'capraiafc@gmail.com';
    const isOwnRequest = operator?.player_id === player.id && operator?.can_players === true;
    const isRosterManager = superUser || (operator?.can_players === true && !operator?.player_id && ['operator', 'admin'].includes(String(operator?.role || '')));
    if ((notification === 'new' && !isOwnRequest) || (notification === 'resolution' && !isRosterManager)) throw new RequestError('Accesso non autorizzato.', 403);
    if (notification === 'new' && kitRequest.status !== 'pending') throw new RequestError('La richiesta non è più in attesa.', 409);
    if (notification === 'resolution' && !['approved', 'rejected'].includes(String(kitRequest.status))) throw new RequestError('La richiesta non è ancora stata gestita.', 409);

    const resendKey = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('MAIL_FROM');
    if (!resendKey || !from) throw new RequestError('Servizio email non configurato.', 503);
    const item = String(kitRequest.kit_items?.name || 'Articolo kit'); const size = String(kitRequest.kit_item_sizes?.size || '—'); const playerName = String(player.display_name || 'Giocatore');
    const recipient = notification === 'new'
      ? (Deno.env.get('KIT_REQUEST_MAIL_TO') || Deno.env.get('MAIL_TO') || 'capraiafc@gmail.com')
      : String(details?.email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(recipient)) throw new RequestError('Il giocatore non ha un indirizzo email valido.', 409);
    const approved = kitRequest.status === 'approved';
    const subject = notification === 'new'
      ? `Nuova richiesta kit · ${playerName}`
      : approved ? `Richiesta kit accettata · ${item}` : `Richiesta kit non accettata · ${item}`;
    const body = notification === 'new'
      ? `<h1>Nuova richiesta materiale</h1><p><strong>Giocatore:</strong> ${html(playerName)}</p><p><strong>Articolo:</strong> ${html(item)} · taglia ${html(size)}</p><p><strong>Motivazione:</strong><br />${html(kitRequest.reason)}</p><p>Apri l’area Kit giocatori per accettare o rifiutare la richiesta.</p>`
      : approved
        ? `<h1>Richiesta accettata</h1><p>Ciao <strong>${html(playerName)}</strong>, la tua richiesta per <strong>${html(item)}</strong>, taglia <strong>${html(size)}</strong>, è stata accettata.</p><p>Ti contatteremo per la consegna del materiale.</p><p>Forza Capraia!</p>`
        : `<h1>Richiesta non accettata</h1><p>Ciao <strong>${html(playerName)}</strong>, al momento non possiamo accettare la richiesta per <strong>${html(item)}</strong>, taglia <strong>${html(size)}</strong>.</p><p><strong>Motivazione:</strong> ${html(kitRequest.rejection_reason)}</p><p>Forza Capraia!</p>`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'User-Agent': 'capraiafc-kit/1.0', 'Idempotency-Key': `kit-request/${requestId}/${notification}` },
      body: JSON.stringify({ from, to: [recipient], subject, html: body }),
    });
    if (!response.ok) { console.error('Kit email error', await response.text()); throw new RequestError('Invio email momentaneamente non disponibile.', 502); }
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    const known = error instanceof RequestError; if (!known) console.error('Kit email error', error);
    return Response.json({ message: known ? error.message : 'Errore inatteso durante l’invio.' }, { status: known ? error.status : 500, headers: cors });
  }
});
