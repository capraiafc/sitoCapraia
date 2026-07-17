# Gestione rosa giocatori

Il modulo in `admin/modules/players/` offre il CRUD della rosa e richiede il
contratto comune `window.CapraiaAuth.supabase` / `requireOperator()`.

## Migrazioni

Applicare prima `20260717_operator_access.sql`, poi
`202607170002_players.sql`. La tabella `public.players` ha RLS: il pubblico
legge soltanto le schede pubblicate; ogni scrittura e la lettura delle bozze
richiedono `public.is_current_operator()`. La chiave `service_role` non deve
mai essere messa nel browser.

Il servizio `players-service.js` separa il data access dall'interfaccia, per
consentire a una futura UI React o alla pagina pubblica di riusare il modulo.
