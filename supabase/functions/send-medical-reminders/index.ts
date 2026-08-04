import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

class ReminderError extends Error {
  constructor(message: string, readonly status = 500) { super(message); }
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
}[character]!));

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(from: Date, iso: string) {
  const target = new Date(`${iso}T00:00:00.000Z`);
  return Math.ceil((target.getTime() - from.getTime()) / 86_400_000);
}

async function rest(path: string, options: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new ReminderError('Supabase non configurato nella funzione.');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ReminderError(payload?.message || 'Errore durante la lettura dei promemoria.');
  return payload;
}

serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ message: 'Metodo non consentito.' }, { status: 405 });

  const expectedSecret = Deno.env.get('MEDICAL_REMINDER_CRON_SECRET');
  const providedSecret = request.headers.get('x-cron-secret');
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return Response.json({ message: 'Accesso non autorizzato.' }, { status: 401 });
  }

  try {
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('MAIL_FROM');
    const clubEmail = Deno.env.get('MEDICAL_REMINDER_MAIL_TO') || Deno.env.get('MAIL_TO') || 'capraiafc@gmail.com';
    if (!resendKey || !from) throw new ReminderError('Servizio email non configurato.');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const expiredStart = isoDate(addUtcDays(today, -365));
    const end = isoDate(addUtcDays(today, 30));
    const query = new URLSearchParams({
      select: 'player_id,email,medical_exam_expiry,players!inner(first_name,last_name,status,out_of_squad)',
      medical_exam_expiry: `gte.${expiredStart}`,
      and: `(medical_exam_expiry.lte.${end})`,
      'players.status': 'in.(active,injured,unavailable)',
      'players.out_of_squad': 'eq.false',
    });
    const players = await rest(`player_private_details?${query.toString()}`) as Array<Record<string, unknown>>;
    const reminders = await rest(`player_medical_reminder_events?select=player_id,medical_exam_expiry,reminder_days&medical_exam_expiry=gte.${expiredStart}&medical_exam_expiry=lte.${end}`) as Array<Record<string, unknown>>;
    const sentKeys = new Set(reminders.map((item) => `${item.player_id}/${item.medical_exam_expiry}/${item.reminder_days}`));
    const results: Array<Record<string, unknown>> = [];

    for (const row of players) {
      const expiry = String(row.medical_exam_expiry || '');
      const remaining = daysBetween(today, expiry);
      const reminderDays = remaining < 0 ? 0 : remaining <= 10 ? 10 : remaining <= 30 ? 30 : null;
      if (reminderDays === null) continue;
      const key = `${row.player_id}/${expiry}/${reminderDays}`;
      if (sentKeys.has(key)) continue;

      const player = row.players as { first_name?: string; last_name?: string } | null;
      const playerName = `${player?.first_name || ''} ${player?.last_name || ''}`.trim() || 'Giocatore';
      const playerEmail = String(row.email || '').trim().toLowerCase();
      const recipients = [...new Set([clubEmail, ...(EMAIL_PATTERN.test(playerEmail) ? [playerEmail] : [])])];
      const isExpired = reminderDays === 0;
      const subject = isExpired
        ? `Visita medica scaduta · ${playerName}`
        : `Visita medica in scadenza · ${playerName} · ${remaining} giorni`;
      const message = isExpired
        ? `<p>La visita medica di <strong>${escapeHtml(playerName)}</strong> è scaduta il <strong>${escapeHtml(expiry)}</strong>.</p><p><strong>Finché non verrà completato e registrato il rinnovo, non è possibile allenarsi né disputare partite con il Capraia Football Club.</strong></p><p>Invitiamo a procedere con il rinnovo e a caricare il nuovo documento nella propria scheda.</p>`
        : `<p>La visita medica di <strong>${escapeHtml(playerName)}</strong> scade il <strong>${escapeHtml(expiry)}</strong>.</p><p>Mancano ${remaining} giorni alla scadenza. Organizzare il rinnovo prima della data indicata.</p>`;
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'capraiafc-medical-reminders/1.0',
          'Idempotency-Key': `medical-reminder/${key}`,
        },
        body: JSON.stringify({
          from,
          to: recipients,
          subject,
          html: `<h1>${isExpired ? 'Visita medica scaduta' : 'Promemoria visita medica'}</h1>${message}<p>Capraia Football Club</p>`,
        }),
      });
      if (!emailResponse.ok) {
        console.error('Resend medical reminder error', await emailResponse.text());
        results.push({ playerId: row.player_id, ok: false, remaining });
        continue;
      }

      await rest('player_medical_reminder_events', {
        method: 'POST',
        body: JSON.stringify({
          player_id: row.player_id,
          medical_exam_expiry: expiry,
          reminder_days: reminderDays,
          recipient_emails: recipients,
        }),
      });
      sentKeys.add(key);
      results.push({ playerId: row.player_id, ok: true, remaining, reminderDays });
    }

    return Response.json({ ok: true, checked: players.length, reminders: results });
  } catch (error) {
    console.error('Medical reminder error', error);
    const known = error instanceof ReminderError;
    return Response.json({ message: known ? error.message : 'Errore inatteso durante i promemoria.' }, { status: known ? error.status : 500 });
  }
});
