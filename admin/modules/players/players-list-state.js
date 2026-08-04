export function playerMatchesSearch(player, query) {
  if (player.out_of_squad) {
    return [player.display_name, player.first_name, player.last_name]
      .join(' ').toLocaleLowerCase('it').includes(query);
  }
  return [
    player.display_name, player.first_name, player.last_name, player.position, player.status,
    player.squad_number, player.kit_size, player.email,
  ].join(' ').toLocaleLowerCase('it').includes(query);
}

export function getPlayerListView(players, query, requestedPage, pageSize = 10) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('it');
  const filtered = normalizedQuery
    ? players.filter((player) => playerMatchesSearch(player, normalizedQuery))
    : players;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Number(requestedPage) || 1), totalPages);
  return {
    filtered,
    page,
    totalPages,
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
  };
}
