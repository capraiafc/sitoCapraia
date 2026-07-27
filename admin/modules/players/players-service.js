/*
 * Data access for the roster module.  It deliberately uses the authenticated
 * Supabase client supplied by the shared auth layer: RLS is the authority for
 * every read and mutation, and no privileged key is ever present in the UI.
 */

const PLAYER_COLUMNS = [
  'id', 'first_name', 'last_name', 'display_name', 'squad_number', 'position',
  'status', 'birth_year', 'bio', 'image_url', 'image_path', 'published', 'created_at', 'updated_at',
].join(', ');

const PRIVATE_COLUMNS = [
  'player_id', 'kit_size', 'email', 'medical_exam_expiry', 'medical_document_path',
  'medical_document_name', 'medical_document_mime_type', 'medical_document_size',
  'medical_document_uploaded_at',
].join(', ');

const EDITABLE_FIELDS = new Set([
  'first_name', 'last_name', 'squad_number', 'position', 'status', 'birth_year',
  'bio', 'image_url', 'image_path', 'published',
]);

const PRIVATE_EDITABLE_FIELDS = new Set([
  'kit_size', 'email', 'medical_exam_expiry', 'medical_document_path',
  'medical_document_name', 'medical_document_mime_type', 'medical_document_size',
  'medical_document_uploaded_at',
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

export function toPrivatePlayerPayload(values) {
  const payload = {};
  for (const [field, value] of Object.entries(values)) {
    if (!PRIVATE_EDITABLE_FIELDS.has(field)) continue;
    if (field === 'medical_document_size') {
      payload[field] = value === '' || value === null || value === undefined ? null : Number(value);
      continue;
    }
    const normalized = normaliseOptionalText(value);
    payload[field] = field === 'email' && normalized ? normalized.toLowerCase() : normalized;
  }
  return payload;
}

async function savePrivateDetails(playerId, values) {
  const details = toPrivatePlayerPayload(values);
  const hasDetails = Object.values(details).some(Boolean);
  if (!hasDetails) {
    const { error } = await client().from('player_private_details').delete().eq('player_id', playerId);
    failIfError(error);
    return {
      player_id: playerId,
      kit_size: null,
      email: null,
      medical_exam_expiry: null,
      medical_document_path: null,
      medical_document_name: null,
      medical_document_mime_type: null,
      medical_document_size: null,
      medical_document_uploaded_at: null,
    };
  }
  const { data, error } = await client()
    .from('player_private_details')
    .upsert({ player_id: playerId, ...details }, { onConflict: 'player_id' })
    .select(PRIVATE_COLUMNS)
    .single();
  failIfError(error);
  return data;
}

const mergePrivateDetails = (player, details) => ({
  ...player,
  kit_size: details?.kit_size ?? null,
  email: details?.email ?? null,
  medical_exam_expiry: details?.medical_exam_expiry ?? null,
  medical_document_path: details?.medical_document_path ?? null,
  medical_document_name: details?.medical_document_name ?? null,
  medical_document_mime_type: details?.medical_document_mime_type ?? null,
  medical_document_size: details?.medical_document_size ?? null,
  medical_document_uploaded_at: details?.medical_document_uploaded_at ?? null,
});

export async function listPlayers({ playerId = null } = {}) {
  let playersQuery = client()
    .from('players')
    .select(PLAYER_COLUMNS)
    .order('position', { ascending: true })
    .order('squad_number', { ascending: true, nullsFirst: false })
    .order('last_name', { ascending: true });
  let privateQuery = client().from('player_private_details').select(PRIVATE_COLUMNS);
  if (playerId) {
    playersQuery = playersQuery.eq('id', playerId);
    privateQuery = privateQuery.eq('player_id', playerId);
  }
  const [playersResponse, privateResponse] = await Promise.all([
    playersQuery,
    privateQuery,
  ]);
  failIfError(playersResponse.error);
  failIfError(privateResponse.error);
  const privateByPlayer = new Map((privateResponse.data ?? []).map((item) => [item.player_id, item]));
  return (playersResponse.data ?? []).map((player) => mergePrivateDetails(player, privateByPlayer.get(player.id)));
}

export async function createPlayer(values) {
  const { data, error } = await client()
    .from('players')
    .insert(toPlayerPayload(values))
    .select(PLAYER_COLUMNS)
    .single();
  failIfError(error);
  try {
    const details = await savePrivateDetails(data.id, values);
    return mergePrivateDetails(data, details);
  } catch (privateError) {
    await client().from('players').delete().eq('id', data.id);
    throw privateError;
  }
}

export async function updatePlayer(id, values) {
  const { data, error } = await client()
    .from('players')
    .update(toPlayerPayload(values))
    .eq('id', id)
    .select(PLAYER_COLUMNS)
    .single();
  failIfError(error);
  const details = await savePrivateDetails(id, values);
  return mergePrivateDetails(data, details);
}

export async function removePlayer(id) {
  const { error } = await client().from('players').delete().eq('id', id);
  failIfError(error);
}

export async function updateOwnPlayerProfile(values) {
  const { error } = await client().rpc('update_own_player_profile', {
    p_kit_size: normaliseOptionalText(values.kit_size),
    p_medical_exam_expiry: normaliseOptionalText(values.medical_exam_expiry),
    p_medical_document_path: normaliseOptionalText(values.medical_document_path),
    p_medical_document_name: normaliseOptionalText(values.medical_document_name),
    p_medical_document_mime_type: normaliseOptionalText(values.medical_document_mime_type),
    p_medical_document_size: values.medical_document_size || null,
  });
  failIfError(error);
}

export async function withdrawOwnPlayer() {
  const { error } = await client().rpc('withdraw_own_player');
  failIfError(error);
}
