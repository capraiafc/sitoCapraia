-- Permessi espliciti per le letture anonime del sito pubblico.
-- Le policy RLS delle singole tabelle restano il controllo effettivo:
-- vengono restituiti soltanto record con published = true.

grant select on public.players to anon;
grant select, insert, update, delete on public.players to authenticated;

grant select on public.matches to anon;
grant select, insert, update, delete on public.matches to authenticated;

grant select on public.news to anon;
grant select, insert, update, delete on public.news to authenticated;

grant select on public.merch_products to anon;
grant select, insert, update, delete on public.merch_products to authenticated;
