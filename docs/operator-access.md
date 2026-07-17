# Gestione degli operatori

L'area riservata usa Supabase Auth con Google e una whitelist lato server. La
whitelist iniziale contiene esclusivamente `capraiafc@gmail.com`.

## Configurazione

1. Attivare il provider Google in Supabase Auth e configurare il redirect URL
   indicato da Supabase anche nella Google Cloud Console.
2. Eseguire `supabase/migrations/20260717_operator_access.sql` con la Supabase
   CLI o dal SQL editor.
3. Configurare nel client solo URL Supabase e anon key pubblica. La
   `service_role` non deve mai essere pubblicata o caricata nel browser.

Il modulo auth comune espone `window.CapraiaAuth` con `supabase` e
`requireOperator()`. `admin/operators.js` si limita a usarlo per l'esperienza
di navigazione: tutte le RPC riverificano JWT ed email autorizzata nel database.

## Markup per la dashboard protetta

```html
<link rel="stylesheet" href="admin/operators.css">
<section class="operator-management" data-operator-management>
  <h2>Gestione operatori</h2>
  <form class="operator-management__form" data-operator-form>
    <label>Email Google
      <input data-operator-email type="email" autocomplete="email" required>
    </label>
    <button type="submit">Aggiungi operatore</button>
  </form>
  <p class="operator-management__feedback" data-operator-feedback aria-live="polite"></p>
  <ul class="operator-management__list" data-operator-list aria-label="Operatori abilitati"></ul>
</section>
<p hidden data-operator-denied role="alert"></p>
<script src="admin/operators.js"></script>
```

Caricare il modulo auth prima di `admin/operators.js`.

## RPC protette

- `is_current_operator()`
- `list_operator_emails()`
- `add_operator(operator_email text)`
- `remove_operator(operator_email text)`

Il database vieta accesso diretto alla tabella anche a `authenticated`; gli
operatori usano solo queste RPC. Non si può eliminare l'ultimo operatore.
