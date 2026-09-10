# Risultati Capraia — stagione 2026/2027

## Intervento e stato

Implementazione locale sul sito esistente, senza cambio di framework. Non è stata pubblicata sul sito online e le migrazioni non sono state eseguite sul database remoto.

L'analisi riguarda il codice del repository: il recupero della pagina live non è riuscito. La versione locale aveva una singola card dell'ultimo risultato in `#partite`, più un archivio in finestra modale; il caricamento delle gare dipendeva anche dalla riuscita delle richieste news, rosa e merch.

Ora `#partite` contiene due card Ultimo/Prossimo match, calendario verticale raggruppato per mese, filtri stagione/competizione/mese e vista compatta/dettagliata. Sono mantenuti menu, ancora “Risultati”, footer, archivio storico, palette blu/giallo/arancio e font del sito. Il calendario ha un caricamento indipendente: un errore nel catalogo non lo blocca.

### Dati degli allegati

- 30 gare di Prima Categoria, Girone C: 15 in casa e 15 in trasferta.
- Coppa Toscana, Girone 14: San Miniato–Capraia, 13 settembre 2026 ore 15:30; Capraia–Ginestra Fiorentina, 23 settembre 2026 ore 15:30.
- Ginestra–San Miniato del 6 settembre non entra nel calendario del Capraia.
- Tutti gli orari trascritti sono italiani. Non sono stati inventati risultati o nomi degli stadi.
- Recuperati stemma Capraia già nel sito e logo Novoli allegato. Gli altri file temporanei non risultavano disponibili; si mostrano iniziali leggibili. Mancano anche i loghi ufficiali delle competizioni: sono sostituiti da un segno neutro e dal nome. I campi logo nel backoffice consentono di completarli.
- Gli allegati testuali ripetono principalmente il brief; il testo della precedente risposta di un assistente non è stato trattato come istruzione operativa.

## Attivazione, dalla UI di Supabase

1. Apri il progetto corretto in Supabase → **SQL Editor** → **New query**. Prima di procedere conserva un'esportazione della tabella `matches`, come precauzione.
2. Copia l'intero contenuto di `supabase/migrations/202609100033_results_calendar.sql` ed eseguilo. Aggiunge rigori, stato sospesa e conferma i permessi già usati per l'area Gare. Presuppone la tabella `matches` e la funzione permessi `has_admin_area_access` già presenti nel sito.
3. In una nuova query esegui `supabase/migrations/202609100034_seed_calendar_2026_27.sql`. Inserisce le 32 gare. Non sovrascrive date o risultati dei record già inseriti con le stesse chiavi.
4. Controlla il conteggio con la query sotto. Se esistono già gare inserite manualmente con denominazioni diverse, controlla eventuali doppioni prima di pubblicare: il seed riconosce le sue chiavi stabili e i record con stessa stagione, competizione, turno e squadre, non può riconoscere ogni variante ortografica.
5. Pubblica i file del sito tramite il tuo flusso abituale, inclusi `results.js`, `results.css`, `results-data.js`, `data/calendar-logic.js`, `assets/teams/novoli.png` e i file HTML/JS modificati. Non serve creare una Edge Function o impostare nuovi segreti.
6. Ricarica la pagina. In admin → **Gare e risultati**, verifica una data e apri una gara. Per registrare il finale inserisci entrambi i gol e scegli **Giocata**. Il calendario pubblico si aggiorna entro circa un minuto, oppure subito ricaricando.

```sql
-- Conteggio delle sole gare importate da questo intervento: atteso 32.
select competition, count(*) as gare
from public.matches
where legacy_key like '2026-27:league:%'
   or legacy_key like '2026-27:cup:group14:%'
group by competition;

-- Verifica degli orari italiani senza modificare dati.
select match_day, home_team, away_team,
       kickoff_at at time zone 'Europe/Rome' as orario_italiano,
       status, home_score, away_score
from public.matches
where season_id = '2026-27'
order by kickoff_at;
```

Non occorre usare `db push`, riparare la cronologia delle vecchie migrazioni o rieseguire tutti i vecchi file SQL. I due nuovi script sono rieseguibili, ma il seed non va usato per ripristinare volontariamente gare rimosse: reinserirebbe le sue gare mancanti.

## Architettura tecnica

Frontend HTML/CSS e moduli JavaScript nativi; Supabase Auth per il login operatore; Postgres/Supabase per i dati; API REST PostgREST già disponibili attraverso il client Supabase. React e GraphQL non servono per questo intervento.

| Responsabilità | File |
| --- | --- |
| Layout, card e calendario accessibile | `results.js`, `results.css` |
| Lettura, paginazione, aggiornamento ogni 60 secondi, recupero errori | `results-data.js` |
| Regole pure per ultimo/prossimo match, filtri e fuso italiano | `data/calendar-logic.js` |
| Modifica/inserimento e validazione gare | `admin/matches.js` |
| Integrazione pagina e ticker, senza cambiare menu/footer | `index.html`, `public-data.js` |
| Schema e calendario iniziale | Migrazioni `202609100033` e `202609100034` |

### Modello dati effettivo

Si estende la tabella `public.matches` esistente. Non si crea una seconda tabella in concorrenza con quella già usata dall'admin.

| Campo | Tipo / significato |
| --- | --- |
| `id`, `legacy_key` | UUID primario; chiave testuale univoca per import idempotente |
| `season_id` | Stagione testuale normalizzata, es. `2026-27` |
| `match_day`, `phase` | Giornata/numero gara e fase, es. Andata o Semifinale |
| `competition` | Nome competizione; liberamente estendibile a nuovi tornei |
| `home_team`, `away_team` | Squadre, da cui si ricava casa/trasferta del Capraia |
| `kickoff_at` | `timestamptz`, un solo istante; NULL quando la data è da definire |
| `venue` | Campo/stadio, facoltativo |
| `status` | `scheduled`, `completed`, `postponed`, `suspended`, `cancelled` |
| `home_score`, `away_score` | Gol 0–99; entrambi obbligatori per una gara giocata |
| `home_penalties`, `away_penalties` | Serie finale dei rigori separata dai gol, opzionale |
| `extra_info` | JSON con eventi, `home_logo`, `away_logo`, `competition_logo`; le altre chiavi sono conservate durante le modifiche |
| `published` | Se falso, la gara non è pubblica |
| `referee`, `halftime_score`, `notes`, `source_url` | Informazioni supplementari già disponibili |
| `created_at`, `updated_at`, `created_by`, `updated_by` | Audit esistente |

I rigori sono ammessi soltanto a coppie, su gara conclusa in parità, con un vincitore nella serie. I gol possono includere i supplementari; i rigori non si sommano al risultato.

Per contenere l'intervento, le competizioni restano un campo testuale: usare sempre lo stesso nome per evitare filtri duplicati. Un futuro catalogo `competitions(id, name, logo_url)` con chiave esterna sarebbe utile per gestire molte competizioni, ma non è necessario ora e non è stato introdotto.

### API REST e autorizzazione

Base: `https://<progetto>.supabase.co/rest/v1`. La chiave pubblica del progetto non sostituisce l'autorizzazione: le scritture richiedono il token della sessione operatore e sono controllate da Row Level Security.

| Operazione | Metodo e percorso | Corpo / risposta |
| --- | --- | --- |
| Calendario pubblico | `GET /matches?published=eq.true&season_id=eq.2026-27&order=kickoff_at.asc` | Elenco gare pubblicate |
| Inserisci turno | `POST /matches` | Oggetto gara |
| Modifica data, stato, avversario | `PATCH /matches?id=eq.<uuid>` | Soltanto i campi da cambiare |
| Segna giocata | Stesso `PATCH` | `status: completed` e i due gol |
| Rimuovi gara | `DELETE /matches?id=eq.<uuid>` | Azione admin con conferma |

Header REST: `apikey: <chiave pubblica>`, `Authorization: Bearer <access_token>` per scrivere, `Content-Type: application/json`; facoltativo `Prefer: return=representation`. Nel sito li gestisce il client esistente. Non mettere una chiave `service_role` nel frontend.

L'admin controlla `permissions.can_matches` (o superadmin) e il database verifica `has_admin_area_access('matches')`. Un operatore abilitato soltanto a un'altra area non può modificare le gare attraverso le policy definite nelle migrazioni del repository. Le policy del progetto remoto vanno verificate dopo l'applicazione, soprattutto se sono state aggiunte manualmente policy ulteriori.

### Esempi sul client già presente

```js
const db = window.CapraiaAuth.supabase;

// Registra un finale. Sostituire matchId con l'UUID della gara reale.
const { error } = await db.from('matches').update({
  status: 'completed', home_score: 1, away_score: 2,
  home_penalties: null, away_penalties: null,
}).eq('id', matchId);
if (error) throw error;

// Aggiungi un futuro turno di coppa, con data ancora da comunicare.
const inserted = await db.from('matches').insert({
  season_id: '2026-27', match_day: 'Semifinale',
  competition: 'Coppa Toscana · Prima Categoria', phase: 'Semifinale',
  home_team: 'Capraia', away_team: 'Avversario da definire',
  kickoff_at: null, venue: null, status: 'scheduled', published: true,
});
if (inserted.error) throw inserted.error;
```

```js
import { initResults } from './results.js';
import { filterMatches, selectFeaturedMatches } from './data/calendar-logic.js';

// Il componente reale contiene card, filtri, gruppi mensili e lista scorrevole.
const view = initResults({ root: document.querySelector('#partite'), matches });

// Dopo una lettura aggiornata non serve salvare last/next nel database.
view.update(updatedMatches); // conserva filtri e posizione di scorrimento
const { lastMatch, nextMatch } = selectFeaturedMatches(
  filterMatches(updatedMatches, { season: '2026-27' }), Date.now()
);
```

### Regole ultimo/prossimo

1. Si considerano solo gare pubblicate del Capraia nella stagione selezionata. Filtri mese e competizione riguardano solo il calendario: le due card restano trasversali alle competizioni.
2. Ultimo = gara `completed`, con entrambi i risultati validi, con kickoff non futuro e più recente. Conta la data della partita, non l'ordine di inserimento: correggere oggi un vecchio risultato non lo rende l'ultimo match.
3. Prossimo = prima gara `scheduled` con data/ora uguale o successiva all'istante attuale.
4. Le gare sospese, rinviate, annullate o senza data restano consultabili ma non diventano il prossimo appuntamento confermato. Per riprogrammare, aggiornare la data e scegliere **In programma**.
5. Il semplice passare del tempo non inventa un risultato: una gara scaduta senza finale non diventa “Ultimo match”.
6. In assenza di risultati nella stagione selezionata si mostra un messaggio esplicito. Non si attribuisce il risultato della stagione precedente alla nuova.

L'editor converte sempre da orario italiano a UTC e viceversa, anche se l'operatore è all'estero. Le ore ambigue o inesistenti nel cambio ora vengono rifiutate. Il pubblico formatta tutto in `Europe/Rome`.

## UX e wireframe

```text
Menu esistente → Risultati (#partite)
Titolo breve                          Archivio stagioni ↗
┌ Ultimo match ─────────────────┐ ┌ Prossimo match ───────────────┐
│ Competizione · data/ora       │ │ Competizione · data/ora       │
│ Stemma casa  RISULTATO ospiti │ │ Stemma casa    VS    ospiti  │
│ Casa/trasferta · campo · fase │ │ Casa/trasferta · campo · fase │
└──────────────────────────────┘ └──────────────────────────────┘
Calendario e risultati                  [Compatta | Dettagliata]
[Stagione] [Competizione] [Mese] [Azzera filtri]
Numero di gare
Elenco verticale scorrevole, gruppi per mese
  Data · ora · competizione · stato
  Squadra casa + stemma · risultato · ospite + stemma
  Dettagli: campo, fase e note
```

Su telefono le card vanno una sotto l'altra; la competizione occupa una riga completa nei filtri; i loghi precedono i nomi senza forzare scorrimento orizzontale. La lista verticale privilegia il gesto naturale di lettura e il confronto cronologico. Il riquadro scorrevole è raggiungibile da tastiera. Controlli da almeno 44 px, etichette esplicite, stato espresso anche in testo, focus visibile e supporto a `prefers-reduced-motion`.

```text
Admin → Gare e risultati
[Inserisci nuova gara] [Cerca squadra / competizione / stagione]
Elenco paginato 10 gare: squadre, risultato, data, stato
  [Modifica] [Rimuovi con conferma]

Modale inserimento/modifica
  Stagione · giornata · squadre · competizione · data/ora italiana
  Campo · stato · gol · rigori · fase
  Loghi casa/ospiti/competizione
  Arbitro · eventi · note · pubblicazione
  Feedback di validazione vicino ai campi
  [Salva gara / Salva modifiche] [Annulla]
```

Non è un nuovo login o un nuovo backoffice: si estende quello già usato dalla società.

## Aggiornamento e recupero errori

Il sito legge le gare a blocchi da 500, per non perdere vecchie stagioni a causa del limite righe API. Aggiorna solo le gare ogni 60 secondi mentre la pagina è visibile e quando si torna alla scheda. Non introduce WebSocket o nuove configurazioni Realtime.

Se una lettura fallisce dopo un caricamento riuscito, conserva gli ultimi dati e segnala che non sono stati aggiornati, con pulsante **Riprova**. Al primo errore mostra indisponibilità, senza sostituire il database con partite statiche che potrebbero essere obsolete o rimosse.

## Lavoro degli agenti

| Agente | Input → output | Collaborazione |
| --- | --- | --- |
| Logica calendario | Record `matches` + istante corrente → selezione last/next, filtri, conversione Rome, test | Contratto comune fornito a UI e backoffice |
| UI/UX risultati | Stile locale e record → `results.js` e CSS responsive | Usa la stessa funzione di selezione, senza duplicare regole |
| Backoffice/dati | Schema e permessi esistenti → editor e migrazione schema | Usa conversioni Rome comuni e metadati concordati con UI |
| Coordinamento | Calendari/asset allegati e contributi → integrazione, seed, verifiche e guida | Controllo incrociato delle interfacce e test browser locali |

## Verifiche e limiti

Test logica e seed:

```sh
node --test --test-isolation=none tests/calendar-logic.test.mjs tests/calendar-seed.test.mjs
```

Test browser (richiede Playwright disponibile nel percorso moduli Node e Microsoft Edge):

```sh
node tests/results-browser.cjs
```

Il test usa il sito locale con dati simulati e blocca tutte le richieste remote. Copre 32 gare, filtri, vista dettagliata, larghezze 320/390 px, avanzamento delle card, inserimento coppa con rigori, modifica con conservazione logo, conversione orario e blocco UI per operatore senza permesso. Gli screenshot sono in `test-artifacts/`, escluso da Git.

Le migrazioni e le policy non sono state eseguite/testate sul progetto Supabase remoto. Non sono stati inviati messaggi né modificati risultati reali. Dopo l'attivazione occorre una verifica con account autorizzato e uno senza permesso; completare inoltre i loghi mancanti e confermare i campi di gioco.
