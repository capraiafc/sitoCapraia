/*
 * Data access for the roster module.  It deliberately uses the authenticated
 * Supabase client supplied by the shared auth layer: RLS is the authority for
 * every read and mutation, and no privileged key is ever present in the UI.
 */

const PLAYER_COLUMNS = [
  'id', 'first_name', 'last_name', 'display_name', 'squad_number', 'position',
  'status', 'birth_year', 'bio', 'image_url', 'image_path', 'published', 'created_at', 'updated_at',
].join(', ');

const EDITABLE_FIELDS = new Set([
  'first_name', 'last_name', 'squad_number', 'position', 'status', 'birth_year',
  'bio', 'image_url', 'image_path', 'published',
]);

function client() {
  const supabase = window.CapraiaAuth?.supabase;
  if (!supabase) throw new Error('Client Supabase non disponibile.');
  return supabase;
}

function failIfError(error) {
  if (error) throw error;
}

function normaliseOptionalText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

/** Build a whitelisted payload; never pass arbitrary form data to Supabase. */
export function toPlayerPayload(values) {
  const payload = {};
  for (const [field, value] of Object.entries(values)) {
    if (!EDITABLE_FIELDS.has(field)) continue;
    if (field === 'squad_number' || field === 'birth_year') {
      payload[field] = value === '' || value === null ? null : Number(value);
    } else if (field === 'published') {
      payload[field] = Boolean(value);
    } else if (field === 'bio' || field === 'image_url' || field === 'image_path') {
      payload[field] = normaliseOptionalText(value);
    } else {
      payload[field] = normaliseOptionalText(value);
    }
  }
  return payload;
}

export async function listPlayers() {
  const { data, error } = await client()
    .from('players')
    .select(PLAYER_COLUMNS)
    .order('position', { ascending: true })
    .order('squad_number', { ascending: true, nullsFirst: false })
    .order('last_name', { ascending: true });
  failIfError(error);
  return data ?? [];
}

export async function createPlayer(values) {
  const { data, error } = await client()
    .from('players')
    .insert(toPlayerPayload(values))
    .select(PLAYER_COLUMNS)
    .single();
  failIfError(error);
  return data;
}

export async function updatePlayer(id, values) {
  const { data, error } = await client()
    .from('players')
    .update(toPlayerPayload(values))
    .eq('id', id)
    .select(PLAYER_COLUMNS)
    .single();
  failIfError(error);
  return data;
}

export async function removePlayer(id) {
  const { error } = await client().from('players').delete().eq('id', id);
  failIfError(error);
}
