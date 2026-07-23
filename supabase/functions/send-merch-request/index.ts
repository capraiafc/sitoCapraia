import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((item) => item.trim()).filter(Boolean);

class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const html = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]!));
const text = (value: unknown, label: string, min = 1, max = 160) => {
  if (typeof value !== 'string') throw new RequestError(`${label} non valido.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new RequestError(`${label} non valido.`);
  return normalized;
};

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

async function rpc(name: string, body: Record<string, unknown>) {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new RequestError('Servizio ordini non configurato.', 503);
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(typeof data?.message === 'string' ? data.message : 'Prodotto non disponibile nella quantità richiesta.', 409);
  return data;
}

serve(async (request) => {
  const cors = corsHeaders(request);
  if (!cors) return Response.json({ message: 'Origine non autorizzata.' }, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return Response.json({ message: 'Metodo non consentito.' }, { status: 405, headers: cors });

  let requestId = '';
  let stockReserved = false;
  let emailSent = false;
  try {
    const payload = await request.json();
    requestId = text(payload.requestId, 'Codice richiesta', 36, 36);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new RequestError('Codice richiesta non valido.');
    const productId = text(payload.productId, 'Prodotto', 36, 36);
    const size = text(payload.size, 'Taglia', 1, 12);
    const quantity = Number(payload.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new RequestError('Quantità non valida.');
    const customerName = text(payload.customerName, 'Nome e cognome', 2, 160);
    const customerEmail = text(payload.customerEmail, 'Email', 5, 254).toLowerCase();
    if (!EMAIL_PATTERN.test(customerEmail)) throw new RequestError('Inserisci un indirizzo email valido.');
    const customerPhone = text(payload.customerPhone, 'Telefono', 5, 60);
    if (payload.privacyAccepted !== true) throw new RequestError('Devi confermare di aver letto l’informativa privacy.');

    const reservation = await rpc('reserve_merch_stock', {
      p_request_id: requestId, p_product_id: productId, p_size: size, p_quantity: quantity,
      p_customer_name: customerName, p_customer_email: customerEmail, p_customer_phone: customerPhone,
    });
    stockReserved = true;

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('MAIL_FROM');
    const to = Deno.env.get('MERCH_MAIL_TO') || Deno.env.get('MAIL_TO') || 'capraiafc@gmail.com';
    if (!resendKey || !from) throw new RequestError('Il servizio email non è ancora configurato.', 503);
    const total = Number(reservation.unit_price) * Number(reservation.quantity);
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'User-Agent': 'capraiafc-merch-request/1.0', 'Idempotency-Key': `merch-request/${requestId}` },
      body: JSON.stringify({
        from, to: [to], reply_to: customerEmail,
        subject: `Merch - ${reservation.product_name} · ${reservation.size_label}`,
        html: `<h1>Nuova richiesta merch Capraia FC</h1><table><tbody><tr><th>Prodotto</th><td>${html(reservation.product_name)}</td></tr><tr><th>Taglia</th><td>${html(reservation.size_label)}</td></tr><tr><th>Quantità</th><td>${reservation.quantity}</td></tr><tr><th>Prezzo unitario</th><td>€ ${Number(reservation.unit_price).toFixed(2)}</td></tr><tr><th>Totale indicativo</th><td>€ ${total.toFixed(2)}</td></tr><tr><th>Nome</th><td>${html(customerName)}</td></tr><tr><th>Email</th><td>${html(customerEmail)}</td></tr><tr><th>Telefono</th><td>${html(customerPhone)}</td></tr><tr><th>Codice richiesta</th><td>${html(requestId)}</td></tr></tbody></table>`,
      }),
    });
    if (!emailResponse.ok) {
      console.error('Resend merch email error', await emailResponse.text());
      throw new RequestError('Invio momentaneamente non disponibile. Riprova tra poco.', 502);
    }
    emailSent = true;
    await rpc('mark_merch_request_emailed', { p_request_id: requestId }).catch((error) => console.error('Unable to mark merch request emailed', error));
    return Response.json({ ok: true, reservation }, { status: 200, headers: cors });
  } catch (error) {
    if (stockReserved && !emailSent) await rpc('cancel_merch_reservation', { p_request_id: requestId }).catch(() => {});
    const known = error instanceof RequestError;
    if (!known) console.error('Merch request error', error);
    return Response.json({ message: known ? error.message : 'Errore inatteso durante l’invio della richiesta.' }, { status: known ? error.status : 500, headers: cors });
  }
});
