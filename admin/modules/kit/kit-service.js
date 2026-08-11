const client = () => {
  const supabase = window.CapraiaAuth?.supabase;
  if (!supabase) throw new Error('Client Supabase non disponibile.');
  return supabase;
};

const fail = (error) => { if (error) throw error; };

export async function listKitInventory() {
  const { data, error } = await client().rpc('list_kit_inventory');
  fail(error); return data || [];
}

export async function listPlayersWithMissingKit() {
  const { data, error } = await client().rpc('list_kit_missing_players');
  fail(error); return data || [];
}

export async function listEligiblePlayers() {
  const { data, error } = await client().from('players')
    .select('id,display_name')
    .in('status', ['active', 'injured', 'unavailable'])
    .eq('out_of_squad', false)
    .order('display_name');
  fail(error); return data || [];
}

export async function listPlayerKit(playerId) {
  const { data, error } = await client().rpc('list_kit_player_assignments', { p_player_id: playerId });
  fail(error); return data || [];
}

export async function setKitStock(itemSizeId, quantity) {
  const amount = Number(quantity);
  if (!Number.isInteger(amount) || amount < 0 || amount > 10000) throw new Error('Inserisci una quantità intera da 0 a 10.000.');
  const { data, error } = await client().rpc('set_kit_stock', { p_item_size_id: itemSizeId, p_quantity: amount });
  fail(error); return data;
}

export async function assignKitItem(playerId, itemSizeId) {
  const { data, error } = await client().rpc('assign_kit_item', { p_player_id: playerId, p_item_size_id: itemSizeId });
  fail(error); return data;
}

export async function markKitItemMissing(playerId, itemId) {
  const { data, error } = await client().rpc('mark_kit_item_missing', { p_player_id: playerId, p_item_id: itemId });
  fail(error); return data;
}
