# Richieste tessera

La sezione pubblica `#tessera` invia le richieste alla funzione Supabase
`send-membership-request`. La chiave Resend resta nel server e non viene mai
inclusa in JavaScript o nel browser.

## Configurazione

1. In Resend verifica il dominio del mittente e crea una API key.
2. Nella dashboard Supabase, in **Edge Functions > Secrets**, imposta i valori
   presenti in `supabase/functions/.env.example`. `MAIL_TO` deve restare
   `capraiafc@gmail.com`.
3. Aggiungi il dominio effettivo del sito in `ALLOWED_ORIGINS`, senza slash
   finale. Per esempio: `https://capraiafc.it,https://www.capraiafc.it`.
4. Esegui il deploy:

   ```powershell
   supabase functions deploy send-membership-request --no-verify-jwt
   ```

La funzione verifica comunque l'origine consentita, i dati obbligatori, la
privacy e usa una chiave di idempotenza di Resend per evitare che un retry
generi due email.

## Richieste merch

La disponibilità del merchandising è gestita dalla migration `202607230012_merch_stock_and_orders.sql`.
Dopo averla applicata, distribuisci anche la funzione che invia la mail a `capraiafc@gmail.com`:

```powershell
supabase functions deploy send-merch-request --no-verify-jwt
```

Usa gli stessi secret `RESEND_API_KEY`, `MAIL_FROM` e `ALLOWED_ORIGINS`; opzionalmente
puoi impostare `MERCH_MAIL_TO` (per default usa `MAIL_TO`).

## Campi nuovo tesserato

I campi sono centralizzati in `membership-config.js` e vengono inclusi nel
riepilogo email. Se in futuro li modifichi, aggiorna anche la lista separata da
virgole in `NEW_MEMBER_REQUIRED_FIELDS`, affinché restino obbligatori anche
lato server.
