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

export async function listPlayerKitOverview() {
  const { data, error } = await client().rpc('list_player_kit_overview');
  fail(error); return data || [];
}

export async function listEligiblePlayers() {
  const { data, error } = await client().rpc('list_kit_eligible_players');
  fail(error); return data || [];
}

export async function listKitCatalog() {
  const { data, error } = await client().from('kit_items')
    .select('id,name,category,kit_item_sizes(id,size)')
    .eq('active', true)
    .order('category').order('name');
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

async function sendKitEmail(requestId, notification) {
  const { data, error } = await client().functions.invoke('send-kit-request-email', { body: { requestId, notification } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message || 'Invio email non riuscito.');
}

export async function createMyKitRequest({ itemId, itemSizeId, reason, requestKey = crypto.randomUUID() }) {
  const { data, error } = await client().rpc('create_my_kit_request', {
    p_kit_item_id: itemId, p_kit_item_size_id: itemSizeId, p_reason: reason, p_request_key: requestKey,
  });
  fail(error);
  const request = Array.isArray(data) ? data[0] : data;
  try { await sendKitEmail(request.id, 'new'); return { request, emailSent: true }; }
  catch (emailError) { console.error('Richiesta salvata ma email non inviata.', emailError); return { request, emailSent: false, emailError }; }
}

export async function listKitRequests(status = 'pending') {
  const { data, error } = await client().rpc('list_kit_requests', { p_status: status });
  fail(error); return data || [];
}

export async function resolveKitRequest(requestId, outcome, rejectionReason = null) {
  const { data, error } = await client().rpc('resolve_kit_request', {
    p_request_id: requestId, p_outcome: outcome, p_rejection_reason: rejectionReason,
  });
  fail(error);
  const request = Array.isArray(data) ? data[0] : data;
  try { await sendKitEmail(request.id, 'resolution'); return { request, emailSent: true }; }
  catch (emailError) { console.error('Richiesta gestita ma email non inviata.', emailError); return { request, emailSent: false, emailError }; }
}
