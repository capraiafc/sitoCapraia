/** Pure calendar rules shared by the public site and backoffice. */
export const MATCH_TIME_ZONE = 'Europe/Rome';

export function kickoffTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const timestamp = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function normalizeSeason(value) {
  const season = String(value ?? '').trim();
  const parts = season.match(/^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/);
  return parts ? `${parts[1]}-${parts[2].slice(-2)}` : season;
}

export function isCapraiaMatch(match) {
  return [match?.home_team, match?.away_team].some((team) => /\bcapraia\b/i.test(String(team ?? '')));
}

const publicMatch = (match) => match?.published === true && isCapraiaMatch(match);
const validScore = (score) => Number.isInteger(score) && score >= 0 && score <= 99;

/** Ascending kickoff; undated records last. Equal kickoffs preserve input order. */
export function sortMatches(matches = []) {
  return [...matches].sort((a, b) => {
    const left = kickoffTimestamp(a?.kickoff_at);
    const right = kickoffTimestamp(b?.kickoff_at);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return left - right;
  });
}

/** The scheduled/completed states are authoritative: elapsed time alone is not a result. */
export function selectFeaturedMatches(matches = [], now = Date.now()) {
  const currentTime = kickoffTimestamp(now);
  if (currentTime === null) return { lastMatch: null, nextMatch: null };
  const visible = sortMatches(matches.filter(publicMatch));
  let lastMatch = null;
  let nextMatch = null;
  for (const match of visible) {
    const kickoff = kickoffTimestamp(match.kickoff_at);
    if (kickoff === null) continue;
    if (match.status === 'completed' && validScore(match.home_score) && validScore(match.away_score) && kickoff <= currentTime) {
      // Keep the first record when two matches share a kickoff, for stable rendering.
      if (!lastMatch || kickoff > kickoffTimestamp(lastMatch.kickoff_at)) lastMatch = match;
    }
    if (!nextMatch && match.status === 'scheduled' && kickoff >= currentTime) nextMatch = match;
  }
  return { lastMatch, nextMatch };
}

const dateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: MATCH_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function romeParts(value) {
  const timestamp = kickoffTimestamp(value);
  if (timestamp === null) return null;
  return Object.fromEntries(dateParts.formatToParts(timestamp).map(({ type, value: part }) => [type, part]));
}

export function matchMonth(value) {
  const parts = romeParts(value);
  return parts ? `${parts.year}-${parts.month}` : '';
}

/** Filters never conceal suspended/postponed fixtures from the calendar itself. */
export function filterMatches(matches = [], { competition, month, season } = {}) {
  const unrestricted = (value) => !value || value === 'all';
  return sortMatches(matches.filter((match) => publicMatch(match)
    && (unrestricted(competition) || match.competition === competition)
    && (unrestricted(month) || matchMonth(match.kickoff_at) === month)
    && (unrestricted(season) || normalizeSeason(match.season_id) === normalizeSeason(season))));
}

export function formatMatchDate(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const timestamp = kickoffTimestamp(value);
  return timestamp === null ? 'Data da definire' : new Intl.DateTimeFormat('it-IT', { ...options, timeZone: MATCH_TIME_ZONE }).format(timestamp);
}

export function formatMatchTime(value) {
  const timestamp = kickoffTimestamp(value);
  return timestamp === null ? 'Orario da definire' : new Intl.DateTimeFormat('it-IT', {
    timeZone: MATCH_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(timestamp);
}

/** Populate datetime-local using Italian civil time, regardless of the browser timezone. */
export function romeDateTimeInput(value) {
  const parts = romeParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : '';
}

/**
 * Convert datetime-local to UTC. Returns null for invalid, nonexistent or ambiguous
 * civil times at a DST transition, so the editor can request an unambiguous time.
 */
export function romeLocalToIso(value) {
  const input = String(value ?? '');
  const parts = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!parts) return null;
  const [, year, month, day, hour, minute] = parts.map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const candidates = [60, 120]
    .map((offset) => naiveUtc - offset * 60_000)
    .filter((timestamp) => romeDateTimeInput(timestamp) === input);
  return candidates.length === 1 ? new Date(candidates[0]).toISOString() : null;
}
