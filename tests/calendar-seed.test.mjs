import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { romeLocalToIso, romeDateTimeInput } from '../data/calendar-logic.js';

const sql = readFileSync(new URL('../supabase/migrations/202609100034_seed_calendar_2026_27.sql', import.meta.url), 'utf8');
const rows = JSON.parse(sql.split('$fixtures$')[1]);
test('2026/27 seed: 30 league fixtures, 15 home and away, plus two Capraia cup fixtures', () => {
  assert.equal(rows.length, 32);
  const league = rows.filter((r) => r.legacy_key.includes(':league:'));
  assert.equal(league.length, 30);
  assert.equal(league.filter((r) => r.home_team === 'Capraia').length, 15);
  assert.equal(league.filter((r) => r.away_team === 'Capraia').length, 15);
  assert.equal(new Set(rows.map((r) => r.legacy_key)).size, 32);
  for (let i = 0; i < 15; i++) {
    assert.equal(league[i].home_team, league[i + 15].away_team);
    assert.equal(league[i].away_team, league[i + 15].home_team);
  }
  assert.deepEqual(rows.slice(30).map((r) => r.local_kickoff), ['2026-09-13 15:30', '2026-09-23 15:30']);
  assert.ok(rows.every((r) => r.home_team === 'Capraia' || r.away_team === 'Capraia'));
});
test('all kickoff values round-trip in Rome and screenshot season boundaries match', () => {
  for (const row of rows) {
    const local = row.local_kickoff.replace(' ', 'T');
    assert.equal(romeDateTimeInput(romeLocalToIso(local)), local);
  }
  assert.equal(rows[0].local_kickoff, '2026-09-20 15:30');
  assert.equal(rows[29].local_kickoff, '2027-05-02 16:00');
  assert.equal(romeLocalToIso(rows[5].local_kickoff.replace(' ', 'T')), '2026-10-25T13:30:00.000Z');
  assert.equal(romeLocalToIso(rows[25].local_kickoff.replace(' ', 'T')), '2027-04-04T13:30:00.000Z');
});
test('seed does not overwrite existing match updates and uses Italian civil timezone', () => {
  assert.match(sql, /ON CONFLICT \(legacy_key\) DO NOTHING/i);
  assert.match(sql, /AT TIME ZONE 'Europe\/Rome'/);
  assert.doesNotMatch(sql, /DO UPDATE/i);
});
