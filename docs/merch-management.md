# Gestione merch

Il modulo amministrativo è in `admin/merch.js`; costruisce la propria interfaccia nel contenitore `[data-admin-module="merch"]` e richiede che `auth.js` sia stato caricato.

Per abilitarlo nella dashboard, aggiungere a `admin.html`:

```html
<link rel="stylesheet" href="admin/merch.css" />
<script type="module" src="admin/merch.js"></script>
```

Applicare prima `supabase/migrations/20260717_operator_access.sql`, poi la migrazione merch. La tabella `public.merch_products` conserva nome, prezzo, descrizione, URL dell'immagine, disponibilità e stato di pubblicazione.

La chiave anon del client non può aggirare le policy: lettura delle bozze e ogni inserimento, modifica o rimozione richiedono `public.is_current_operator()`. I visitatori possono leggere soltanto i prodotti pubblicati. Non sono richieste né incluse chiavi `service_role`.
