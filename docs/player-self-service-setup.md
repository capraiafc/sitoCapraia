# Attivazione scheda personale calciatori

## 1. Database e archivio privato

Dal SQL Editor di Supabase eseguire, nell'ordine:

1. `supabase/migrations/202607270017_player_private_data_and_medical_reminders.sql`, se non è già stata applicata;
2. `supabase/migrations/202607270018_player_self_service_and_medical_documents.sql`;
3. `supabase/migrations/202607270019_player_email_operator_sync.sql`.

Le migrazioni creano il bucket privato `capraia-medical-visits`, collegano
gli operatori ai giocatori e applicano i permessi RLS per impedire l'accesso alle
schede e ai documenti altrui.

## 2. Importazione Excel

Aprire ed eseguire nel SQL Editor:

`supabase/private/import_player_accounts_2026_27.sql`

Il file è escluso da Git perché contiene indirizzi email e scadenze mediche.
L'ultima tabella restituita deve mostrare 25 righe importate. Per le righe con
`EMAIL MANCANTE` vengono salvate taglia e scadenza, ma non viene creato un
accesso.

Dal foglio ricevuto restano senza accesso finché non viene fornita un'email:

- Alessandro Marchiani;
- Tommaso Gabuzzini;
- Giorgio Bellucci.

L'accesso usa Google OAuth. Gli indirizzi Outlook, Hotmail o aziendali devono
essere associati a un account Google con lo stesso indirizzo, altrimenti sarà
necessario sostituirli con l'email Google usata per entrare.

## 3. Pubblicazione del sito

Pubblicare i file aggiornati del sito e forzare un aggiornamento della pagina
admin. Un calciatore collegato vedrà soltanto la voce Rosa e la propria scheda.

## 4. Aggiornamento reminder

Ridistribuire la Edge Function `send-medical-reminders`, mantenendo disattivata
la verifica JWT della piattaforma e lasciando invariati i secret già
configurati. La funzione invia una volta ciascuno:

- reminder entro 30 giorni;
- reminder entro 10 giorni;
- avviso a visita scaduta, con sospensione da allenamenti e partite fino al
  rinnovo.

## 5. Collaudo

1. Accedere come operatore Rosa e aprire un giocatore.
2. Caricare un PDF, JPG o PNG e salvare.
3. Scaricare il documento dalla scheda.
4. Cambiare la data senza file: il salvataggio deve essere bloccato.
5. Cambiare data e caricare un nuovo documento: il salvataggio deve riuscire e
   il vecchio oggetto deve sparire dal bucket.
6. Accedere con l'email di un calciatore: devono essere visibili soltanto Rosa e
   la sua scheda.
7. Verificare che il calciatore possa modificare soltanto taglia, data e
   documento.
8. Provare `Esci dalla rosa`: la scheda deve diventare non pubblicata e `former`
   senza essere eliminata dal database.
