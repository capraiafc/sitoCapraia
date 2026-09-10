import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectFeaturedMatches, sortMatches, filterMatches, normalizeSeason,
  matchMonth, formatMatchTime, romeDateTimeInput, romeLocalToIso,
} from '../data/calendar-logic.js';

const NOW = new Date('2026-09-10T12:00:00Z');
const match = (id, changes = {}) => ({
  id, home_team: 'Capraia A.S.D.', away_team: 'Isolotto', published: true,
  season_id: '2026-27', competition: 'Campionato', status: 'scheduled',
  kickoff_at: '2026-09-20T13:30:00Z', home_score: null, away_score: null, ...changes,
});

test('last and next include cup and league, in chronological order rather than insertion order', () => {
  const league = match('league');
  const cup = match('cup', { competition: 'Coppa Toscana', kickoff_at: '2026-09-13T13:30:00Z' });
  const oldLeague = match('old-league', { kickoff_at: '2026-08-30T13:30:00Z', status: 'completed', home_score: 4, away_score: 1 });
  const lastCup = match('last-cup', { competition: 'Coppa Toscana', kickoff_at: '2026-09-06T13:30:00Z', status: 'completed', home_score: 0, away_score: 0 });
  assert.deepEqual(selectFeaturedMatches([league, oldLeague, cup, lastCup], NOW), { lastMatch: lastCup, nextMatch: cup });
});

test('saving a completed match advances featured cards, and rescheduling changes next chronologically', () => {
  const first = match('first', { kickoff_at: '2026-09-13T13:30:00Z' });
  const second = match('second');
  assert.equal(selectFeaturedMatches([first, second], NOW).nextMatch.id, 'first');
  const result = { ...first, status: 'completed', home_score: 2, away_score: 0 };
  assert.deepEqual(selectFeaturedMatches([result, second], '2026-09-13T16:00:00Z'), { lastMatch: result, nextMatch: second });
  assert.equal(selectFeaturedMatches([{ ...first, kickoff_at: '2026-09-27T13:30:00Z' }, second], NOW).nextMatch.id, 'second');
});

test('featured excludes unavailable states, stale scheduled dates, non-Capraia fixtures and private records', () => {
  const excluded = ['postponed', 'suspended', 'cancelled', 'live'].map((status) => match(status, { status }));
  excluded.push(match('stale', { kickoff_at: '2026-09-01T13:00:00Z' }), match('hidden', { published: false }),
    match('other-teams', { home_team: 'San Miniato', away_team: 'Ginestra Fiorentina' }),
    match('undated', { kickoff_at: null }), match('invalid-date', { kickoff_at: 'invalid' }));
  assert.deepEqual(selectFeaturedMatches(excluded, NOW), { lastMatch: null, nextMatch: null });
});

test('invalid/incomplete scores and prematurely completed future matches are not last match', () => {
  const invalid = [null, '', -1, 1.5, '2', 100].map((score, id) => match(id, {
    status: 'completed', kickoff_at: '2026-09-06T13:30:00Z', home_score: score, away_score: 1,
  }));
  invalid.push(match('future-completed', { status: 'completed', home_score: 1, away_score: 0 }));
  assert.equal(selectFeaturedMatches(invalid, NOW).lastMatch, null);
});

test('empty data, exact kickoff boundaries, ties and immutable sorting', () => {
  assert.deepEqual(selectFeaturedMatches([], NOW), { lastMatch: null, nextMatch: null });
  const first = match('first', { kickoff_at: NOW.toISOString() });
  const second = match('second', { kickoff_at: NOW.toISOString() });
  const undated = match('undated', { kickoff_at: null });
  const input = [undated, first, second];
  assert.deepEqual(sortMatches(input), [first, second, undated]);
  assert.deepEqual(input, [undated, first, second]);
  assert.equal(selectFeaturedMatches(input, NOW).nextMatch.id, 'first');
});

test('calendar retains postponed fixtures and filters season aliases, competitions and Rome month boundaries', () => {
  const september = match('september', { kickoff_at: '2026-08-31T22:30:00Z', status: 'postponed' });
  const cup = match('cup', { competition: 'Coppa Toscana' });
  const privateMatch = match('private', { published: false });
  assert.equal(matchMonth(september.kickoff_at), '2026-09');
  assert.deepEqual(filterMatches([september, cup, privateMatch], { season: '2026/2027', month: '2026-09', competition: 'Campionato' }), [september]);
  assert.equal(normalizeSeason('2026/27'), '2026-27');
});

test('Rome kickoff editing and display are consistent through summer/winter DST', () => {
  assert.equal(romeLocalToIso('2026-09-20T15:30'), '2026-09-20T13:30:00.000Z');
  assert.equal(romeLocalToIso('2026-10-25T14:30'), '2026-10-25T13:30:00.000Z');
  assert.equal(romeDateTimeInput('2026-09-20T13:30:00Z'), '2026-09-20T15:30');
  assert.equal(formatMatchTime('2026-10-25T13:30:00Z'), '14:30');
  assert.equal(romeLocalToIso('2027-03-28T02:30'), null); // Clock jumps forward.
  assert.equal(romeLocalToIso('2026-10-25T02:30'), null); // This civil time occurs twice.
  assert.equal(romeLocalToIso('2026-02-30T15:30'), null);
  assert.equal(romeLocalToIso(''), null);
});
