<<<<<<< HEAD
# sitoCapraia
sito del Capraia FC
=======
# Capraia Football Club — prototipo web

Sito statico mobile-first, realizzato come base visiva e funzionale per la presenza digitale del club.

## Avvio

Non richiede dipendenze né build. Per usare Google OAuth e le letture da
Supabase, servi la cartella con un server locale, ad esempio:

```powershell
py -m http.server 8080
```

Poi apri `http://localhost:8080`.

## Cosa è incluso

- Homepage responsive con prossima partita, squadra, news e Instagram.
- Richiesta tessera, newsletter, bacheca moderata e carrello demo.
- Design system gialloblù e stemma del Capraia Football Club.
- Documento operativo con architettura, API, ruoli, dati, piano di sviluppo e test.

## Prima della pubblicazione

I dati di rosa, news, prodotti e stagione futura sono dimostrativi. Lo stemma e la palette sono stati riallineati al Capraia Football Club; restano da approvare immagini, copy, calendario, listino merch, informative privacy/cookie e ragione sociale/P.IVA.

La versione live consigliata è Next.js + Supabase + Stripe, descritta in [docs/operating-plan.md](docs/operating-plan.md).

## Area operatori

L'area riservata è disponibile in `admin.html` e usa Google OAuth tramite Supabase.

1. Crea un progetto Supabase, abilita Google in **Authentication > Providers** e configura gli URL di redirect del sito.
2. Inserisci URL del progetto e chiave **publishable/anon** in `auth-config.js` (mai la chiave `service_role`).
3. Applica in ordine le migrazioni nella cartella `supabase/migrations/`.

La migrazione `202607170006_seed_current_matches.sql` importa 60 gare già
presenti nel sito, comprese le 15 con eventi/marcatori. Dal momento in cui le
migrazioni sono state applicate, rosa, news, merch e gare pubblicate vengono
letti dal sito direttamente dalle tabelle Supabase: una modifica in `admin.html`
è visibile al successivo aggiornamento della pagina pubblica.

La whitelist iniziale contiene esclusivamente `capraiafc@gmail.com`. Le autorizzazioni sono applicate dal database con RLS: il controllo del browser non concede mai permessi da solo.
>>>>>>> 74d2029 (Prima versione sito Capraia FC)
