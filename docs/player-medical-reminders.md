# Reminder visite mediche

Email, taglia kit, scadenza e documento della visita medica sono conservati in
`player_private_details`, separata dalla tabella pubblica `players`. La tabella
è protetta da RLS ed è leggibile soltanto dagli operatori abilitati alla Rosa.
I documenti sono archiviati nel bucket privato `capraia-medical-visits`: non
esiste un URL pubblico e il download richiede una sessione autorizzata.

## Installazione

1. Applica `supabase/migrations/202607270017_player_private_data_and_medical_reminders.sql`.
2. Applica `supabase/migrations/202607270018_player_self_service_and_medical_documents.sql`.
3. Dal SQL Editor esegui il file locale, escluso da Git,
   `supabase/private/import_player_accounts_2026_27.sql`.
4. Imposta i secret della Edge Function:
   - `RESEND_API_KEY`
   - `MAIL_FROM`
   - `MAIL_TO`
   - `MEDICAL_REMINDER_MAIL_TO` (facoltativo)
   - `MEDICAL_REMINDER_CRON_SECRET`
5. Distribuisci la funzione:

   ```powershell
   npx supabase functions deploy send-medical-reminders --no-verify-jwt
   ```

La funzione invia l'avviso all'indirizzo del club e, se presente, anche
all'email del giocatore. Ogni reminder a 30 giorni, 10 giorni e a visita
scaduta è registrato in
`player_medical_reminder_events`, evitando duplicati per la stessa scadenza.
L'avviso di scadenza comunica che, fino al rinnovo, non è possibile allenarsi
né disputare partite con il Capraia Football Club.

## Account personali dei calciatori

Gli account importati hanno soltanto `can_players = true` e un `player_id`
collegato. Possono quindi aprire esclusivamente la sezione Rosa e visualizzare
una sola scheda. Le sole azioni consentite dal database sono:

- aggiornare la taglia del kit;
- aggiornare la scadenza caricando contestualmente un nuovo PDF, JPG o PNG;
- scaricare il proprio documento;
- uscire dalla rosa, impostando la scheda come non pubblicata ed ex rosa.

La sostituzione carica prima il nuovo documento e, dopo il salvataggio dei
metadati, elimina il precedente dal bucket privato.

## Programmazione giornaliera

Supabase Cron può invocare periodicamente una Edge Function tramite `pg_cron`
e `pg_net`. URL, publishable key e secret del cron devono essere conservati in
Supabase Vault, non nel repository.

Nel SQL Editor, crea una volta i secret sostituendo i valori di esempio:

```sql
select vault.create_secret('https://PROJECT_REF.supabase.co', 'project_url');
select vault.create_secret('SUPABASE_PUBLISHABLE_KEY', 'publishable_key');
select vault.create_secret('LO_STESSO_VALORE_DELLA_EDGE_FUNCTION', 'medical_reminder_cron_secret');
```

Abilita **Cron** da **Integrations → Cron**, quindi crea il job giornaliero:

```sql
select cron.schedule(
  'capraia-medical-reminders-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'project_url'
      limit 1
    ) || '/functions/v1/send-medical-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'publishable_key'
        limit 1
      ),
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'publishable_key'
        limit 1
      ),
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'medical_reminder_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

L'orario `0 7 * * *` corrisponde alle 07:00 UTC. Il risultato delle esecuzioni
è consultabile nella sezione Cron della dashboard Supabase e nei log della
Edge Function.

## Privacy

La scadenza di una visita medica è un dato gestionale collegato all'idoneità
sportiva. Non viene mai selezionata dal sito pubblico. Prima dell'uso in
produzione, l'associazione deve verificare che informativa, base giuridica,
tempi di conservazione e autorizzazioni interne coprano questo trattamento.
