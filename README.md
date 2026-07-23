# Capraia Football Club

Sito ufficiale del Capraia Football Club, realizzato in HTML, CSS e JavaScript
con Supabase come backend per dati, autenticazione, storage e funzioni email.

Il progetto non richiede una fase di build: le pagine pubbliche e l'area
operatori vengono servite come file statici.

## Funzionalità

### Sito pubblico

- Calendario, prossima partita, risultati e dettagli delle gare.
- Rosa e schede dei giocatori.
- News pubblicate dal club.
- Fascia “Aggiornamenti” continua con ultimo risultato, ultima news, messaggi
  approvati dalla bacheca e sponsor attivi.
- Bacheca con nome o nickname; i nuovi messaggi rimangono nascosti finché non
  vengono approvati da un operatore.
- Sponsor attivi nel ticker e nel footer, con stile del riquadro configurabile.
- Richiesta tessera con informativa privacy da scorrere e accettare.
- Catalogo merch con galleria immagini, foto principale, taglie, quantità
  disponibili e prodotti a taglia unica.
- Richiesta merch via email e conferma del ritiro presso la sede o alla
  successiva partita casalinga disponibile.

### Area operatori

L'area riservata è disponibile in `admin.html` e utilizza Google OAuth tramite
Supabase.

Comprende:

- Dashboard con accessi per operatore e storico delle attività fino a tre mesi.
- Gestione operatori e permessi per singola area.
- Gare e risultati.
- Rosa.
- News.
- Sponsor.
- Moderazione bacheca.
- Merch, immagini, disponibilità per taglia e richieste.

Il super user è `capraiafc@gmail.com` e può accedere a Dashboard, Operatori e a
tutte le sezioni. Gli altri operatori vedono soltanto le aree abilitate tramite
i booleani:

- `can_matches`
- `can_players`
- `can_news`
- `can_sponsors`
- `can_bacheca`
- `can_merch`

I controlli visivi nel browser non sostituiscono la sicurezza del database:
RPC e policy RLS verificano nuovamente l'identità e i permessi.

## Requisiti

- Un browser moderno.
- Python oppure un altro server HTTP statico per lo sviluppo locale.
- Node.js solo per utilizzare la CLI Supabase.
- Un progetto Supabase con Google OAuth configurato.
- Un account Resend per l'invio delle email.

## Avvio locale

Installa la CLI Supabase inclusa nelle dipendenze:

```powershell
npm install
```

Copia `auth-config.example.js` come `auth-config.js` e inserisci URL e chiave
publishable/anon del progetto Supabase:

```javascript
window.CAPRAIA_SUPABASE_URL = 'https://PROJECT_REF.supabase.co';
window.CAPRAIA_SUPABASE_ANON_KEY = 'SUPABASE_PUBLISHABLE_KEY';
```

Non inserire mai la chiave `service_role` nel browser o nel repository.

Avvia quindi il sito:

```powershell
python -m http.server 8080
```

Apri:

- Sito pubblico: `http://localhost:8080`
- Area operatori: `http://localhost:8080/admin.html`

L'apertura diretta dei file tramite `file://` non è supportata per OAuth e
moduli JavaScript.

## Configurazione Google OAuth

1. Attiva Google in **Supabase → Authentication → Providers**.
2. Configura il client OAuth nella Google Cloud Console.
3. Inserisci tra gli URL consentiti il callback mostrato da Supabase.
4. Configura tra i redirect consentiti dell'applicazione:
   - `http://localhost:8080/admin.html`
   - l'URL della futura area admin in produzione.

Gli operatori devono accedere con lo stesso indirizzo email presente in
`public.operator_allowlist`.

## Database Supabase

Le migrazioni sono nella cartella `supabase/migrations/` e comprendono:

- gare e risultati;
- rosa;
- news;
- merch e galleria immagini;
- stock per taglia e richieste d'ordine;
- sponsor;
- bacheca;
- storage dei media;
- operatori, permessi e audit amministrativo;
- policy di lettura pubblica e scrittura protetta.

Per un progetto Supabase nuovo e con cronologia pulita:

```powershell
npx supabase login
npx supabase link --project-ref PROJECT_REF
npx supabase db push
```

Se il database esistente contiene migrazioni già applicate manualmente, non
rieseguire indiscriminatamente tutta la cartella. Verifica prima la cronologia:

```powershell
npx supabase migration list
```

Le correzioni più recenti per operatori e permessi sono:

- `202607230013_operator_permissions_and_audit.sql`
- `202607230014_fix_operator_permissions_insert.sql`
- `202607230015_cleanup_legacy_operator_functions.sql`
- `202607230016_restore_operator_permission_listing.sql`

L'ultima migrazione fa sì che `list_operator_emails()` restituisca anche i
booleani necessari per mostrare correttamente i checkbox nella pagina
Operatori.

## Email e Supabase Edge Functions

Il progetto contiene due funzioni:

- `send-membership-request`
- `send-merch-request`

Configura in Supabase i secret:

- `RESEND_API_KEY`
- `MAIL_FROM`
- `MAIL_TO`
- `MERCH_MAIL_TO` facoltativo; in assenza viene usato `MAIL_TO`
- `ALLOWED_ORIGINS`
- `NEW_MEMBER_REQUIRED_FIELDS`

`MAIL_TO` deve essere impostato a `capraiafc@gmail.com`.

Distribuisci le funzioni:

```powershell
npx supabase functions deploy send-membership-request --no-verify-jwt
npx supabase functions deploy send-merch-request --no-verify-jwt
```

La chiave Resend rimane esclusivamente nei secret server-side.

## Struttura principale

```text
/
├── index.html                    sito pubblico
├── admin.html                    area operatori
├── auth.js                       sessione Google e verifica accessi
├── public-data.js                dati dinamici del sito pubblico
├── membership.js                tessera e privacy
├── admin/                        moduli di amministrazione
├── assets/                       immagini, stemma e sponsor
├── docs/                         documentazione di dettaglio
└── supabase/
    ├── functions/                funzioni email
    └── migrations/               schema, RPC, RLS e dati iniziali
```

La configurazione dei campi della tessera è centralizzata in
`membership-config.js`.

## Diagnostica dell'accesso admin

Per mostrare il pannello diagnostico senza esporre token o chiavi:

```text
http://localhost:8080/admin.html?debug=1
```

Il pannello mostra:

- account Google rilevato;
- esito della funzione `current_admin_permissions`;
- decisione di accesso;
- stato visibile/nascosto dell'app e della schermata di autenticazione;
- eventuali errori non bloccanti.

## Pubblicazione

Il frontend può essere distribuito su qualsiasi hosting statico HTTPS. Prima
della pubblicazione:

1. aggiungi il dominio a `ALLOWED_ORIGINS`;
2. aggiungi il redirect admin agli URL consentiti di Supabase e Google;
3. verifica che tutte le migrazioni necessarie siano applicate;
4. distribuisci entrambe le Edge Functions;
5. prova accesso admin, tessera, privacy e ordine merch;
6. verifica le policy RLS con un account non autorizzato.

## Documentazione aggiuntiva

- [Accesso operatori](docs/operator-access.md)
- [Gestione merch](docs/merch-management.md)
- [Gestione news](docs/admin-news.md)
- [Gestione giocatori](docs/player-management.md)
- [Richieste tessera](docs/membership-requests.md)
- [Piano operativo](docs/operating-plan.md)
