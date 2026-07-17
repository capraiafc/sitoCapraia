# Gestione news

## Installazione

1. Applica `supabase/migrations/20260717_operator_access.sql` e poi
   `supabase/migrations/202607170003_news.sql` nel SQL Editor di Supabase (o
   tramite Supabase CLI).
2. Carica `auth-config.js` con l'URL e la chiave **anon** del progetto. Non
   inserire mai una service-role key nel browser.
3. Includi `admin/news.css` e `admin/news.js` nella pagina operatori, dopo
   `auth.js`, e aggiungi il markup con gli attributi `data-news-*` indicato in
   `admin.html`.

## Modello editoriale

- `original`: richiede il testo della notizia (`body`).
- `external`: richiede URL HTTP(S), nome della fonte e label di attribuzione.
  Il sito deve presentarlo come contenuto segnalato e collegare la fonte, senza
  ripubblicarne il testo completo.
- Una news non spuntata come `published` resta una bozza. Alla prima
  pubblicazione il database assegna `published_at`.

## Sicurezza

Il modulo chiede `window.CapraiaAuth.requireOperator()` per una UX chiara, ma
l'autorizzazione effettiva è RLS: `public.is_current_operator()` protegge
lettura di bozze, inserimento, modifica e cancellazione. I visitatori possono
leggere esclusivamente i record con `published = true`.
