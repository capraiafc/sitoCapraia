const client = () => {
  const supabase = window.CapraiaAuth?.supabase;
  if (!supabase) throw new Error('Client Supabase non disponibile.');
  return supabase;
};

const fail = (error) => { if (error) throw error; };

export async function sendMyPlayerMessage({ subject, body, requestKey = crypto.randomUUID() }) {
  const { data, error } = await client().rpc('send_my_player_message', {
    p_subject: subject || null,
    p_body: body,
    p_request_key: requestKey,
  });
  fail(error); return Array.isArray(data) ? data[0] : data;
}

export async function listPlayerMessages(playerId) {
  const { data, error } = await client().rpc('list_player_messages', { p_player_id: playerId });
  fail(error); return data || [];
}

export async function markPlayerMessagesRead(playerId) {
  const { data, error } = await client().rpc('mark_player_messages_read', { p_player_id: playerId });
  fail(error); return Number(data || 0);
}

export async function archivePlayerMessage(messageId) {
  const { data, error } = await client().rpc('archive_player_message', { p_message_id: messageId });
  fail(error); return Array.isArray(data) ? data[0] : data;
}
