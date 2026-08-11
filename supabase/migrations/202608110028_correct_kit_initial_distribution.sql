-- Correzione per chi aveva già applicato il bootstrap iniziale del kit.
-- Totale fisico iniziale: M 15, L 10, XL 5; borsa 30. I quattro giocatori
-- indicati dalla società non hanno alcun articolo assegnato.

delete from public.kit_assignments as assignment
using public.players as player
where assignment.player_id = player.id
  and lower(trim(player.last_name)) in ('marchiani', 'mannini', 'marrazzo', 'bellucci');

update public.kit_stock as stock
set quantity = greatest(0,
  case size.size when 'M' then 15 when 'L' then 10 when 'XL' then 5 else 30 end
  - coalesce(assigned.total, 0)
),
updated_at = now(),
updated_by = auth.uid()
from public.kit_item_sizes as size
left join lateral (
  select count(*)::integer as total
  from public.kit_assignments as assignment
  where assignment.kit_item_size_id = size.id and assignment.status = 'assigned'
) as assigned on true
where stock.kit_item_size_id = size.id;
