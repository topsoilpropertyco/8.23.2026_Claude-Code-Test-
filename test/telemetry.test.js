import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Both must be set BEFORE the modules under test are imported: they read the
// state directory and the key once, at module scope.
process.env.SLEEPOS_STATE_DIR = mkdtempSync(join(tmpdir(), 'sleepos-telem-'));
process.env.SLEEPOS_DATA_KEY = 'a'.repeat(64);

const { upsertTelemetry, readTelemetry, writeTelemetry, scoreSeries, hasNight,
        nightComplete, TELEMETRY_PATH } = await import('../src/telemetry.js');

const night = (date, score, extra = {}) => ({
  date, sleep_score: score, total_sleep_duration: 27000, deep_sleep_duration: 5400,
  rem_sleep_duration: 7200, light_sleep_duration: 14400, awake_time: 1200,
  time_in_bed: 28800, efficiency: 94, latency: 600, average_hrv: 37,
  average_heart_rate: 60, lowest_heart_rate: 55, fetched_at: '2026-08-25T00:00:00Z',
  ...extra,
});

test('the scratch directory is honoured, so no test can touch the real history', () => {
  assert.ok(TELEMETRY_PATH.startsWith(process.env.SLEEPOS_STATE_DIR));
  assert.ok(!TELEMETRY_PATH.includes(`${join(process.cwd(), 'state')}/`));
});

// THE REGRESSION. appendFileSync was missing from telemetry.js's imports, and it
// is reached only inside `if (fresh.length)` -- so every ingest with nothing new
// returned cleanly and every ingest that actually had a night to store threw a
// ReferenceError, which dispatch caught and logged as "continuing". Oura was
// returning the data the whole time; four nights went missing this way. Nothing
// in the suite had ever appended, which is exactly why it survived.
test('appending a genuinely new night writes it to disk', () => {
  const result = upsertTelemetry([night('2026-08-20', 81)]);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 0);
  assert.ok(existsSync(TELEMETRY_PATH), 'nothing was written');
  assert.equal(readTelemetry().length, 1);
  assert.equal(readTelemetry()[0].sleep_score, 81);
});

test('a second append adds to the file rather than replacing it', () => {
  upsertTelemetry([night('2026-08-21', 74)]);
  upsertTelemetry([night('2026-08-22', 88)]);
  const dates = readTelemetry().map((r) => r.date);
  assert.ok(dates.includes('2026-08-20'), 'the earlier night was lost');
  assert.ok(dates.includes('2026-08-21'));
  assert.ok(dates.includes('2026-08-22'));
});

test('a re-fetch of an unchanged night writes nothing', () => {
  const before = readFileSync(TELEMETRY_PATH, 'utf8');
  const result = upsertTelemetry([night('2026-08-22', 88)]);
  assert.equal(result.added, 0);
  assert.equal(result.updated, 0);
  // fetched_at changes on every pull, so comparing whole records would make
  // every re-fetch look like a change and the file would grow without bound.
  const again = upsertTelemetry([night('2026-08-22', 88, { fetched_at: '2026-09-01T12:00:00Z' })]);
  assert.equal(again.added, 0);
  assert.equal(again.updated, 0);
  assert.equal(readFileSync(TELEMETRY_PATH, 'utf8'), before, 'the file was rewritten for no change');
});

test('a corrected night is recorded as an update, and the correction wins', () => {
  const result = upsertTelemetry([night('2026-08-22', 90)]);
  assert.equal(result.updated, 1);
  assert.equal(result.added, 0);
  const rows = readTelemetry().filter((r) => r.date === '2026-08-22');
  assert.equal(rows.length, 1, 'readTelemetry must collapse a superseded night');
  assert.equal(rows[0].sleep_score, 90);
});

test('a night with no date is skipped rather than stored keyless', () => {
  const before = readTelemetry().length;
  const result = upsertTelemetry([{ sleep_score: 70 }, night('2026-08-23', 79)]);
  assert.equal(result.added, 1);
  assert.equal(readTelemetry().length, before + 1);
});

test('hasNight and scoreSeries agree with what was stored', () => {
  assert.equal(hasNight('2026-08-23'), true);
  assert.equal(hasNight('2026-08-30'), false);
  const series = scoreSeries();
  const dates = series.map((s) => s.date);
  assert.deepEqual(dates, [...dates].sort(), 'scoreSeries must be oldest-first');
  assert.equal(series.at(-1).date, '2026-08-23');
});

test('an unscored night is stored but does not count as settled', () => {
  upsertTelemetry([night('2026-08-24', null)]);
  assert.ok(readTelemetry().some((r) => r.date === '2026-08-24'), 'the record is stored');
  assert.ok(!scoreSeries().some((s) => s.date === '2026-08-24'),
    'an unscored night must not enter the statistics');
  // hasNight deliberately requires a score, because shouldIngest uses it to
  // decide whether the night is finished. Oura sometimes returns a period
  // before it has scored it, and treating that as settled would stop the
  // ingest retrying and freeze the night unscored forever.
  assert.equal(hasNight('2026-08-24'), false, 'an unscored night is not settled');
});

test('writeTelemetry replaces the file wholesale', () => {
  const n = writeTelemetry([night('2026-01-01', 70), night('2026-01-02', 75)]);
  assert.equal(n, 2);
  assert.equal(readTelemetry().length, 2);
  assert.equal(readTelemetry()[0].date, '2026-01-01');
});

/* ------------------------------------------------- score without a period */

test('a night with a score but no sleep period is not complete', () => {
  // THE BUG THIS EXISTS FOR. The score comes from daily_sleep; every duration,
  // stage, HRV and heart-rate figure comes from the sleep period, and Oura
  // publishes the score first. shouldIngest asked hasNight, which only checks
  // the score -- so the instant one landed the ingest declared the night settled
  // and stopped retrying for good. The period never arrived and the screen
  // showed a real score with thirteen dashes behind it.
  writeTelemetry([{ date: '2026-07-01', sleep_score: 74, total_sleep_duration: null }]);
  assert.equal(hasNight('2026-07-01'), true, 'the score is there');
  assert.equal(nightComplete('2026-07-01'), false, 'but the night is not finished');
});

test('a night is complete once its period arrives', () => {
  writeTelemetry([{ date: '2026-07-02', sleep_score: 74, total_sleep_duration: 27000 }]);
  assert.equal(nightComplete('2026-07-02'), true);
});

test('an unscored night is never complete, period or not', () => {
  writeTelemetry([{ date: '2026-07-03', sleep_score: null, total_sleep_duration: 27000 }]);
  assert.equal(nightComplete('2026-07-03'), false);
});

test('the ingest keeps retrying until the period lands, then stops', async () => {
  const { shouldIngest } = await import('../src/dispatch.js');
  const cfg = { timezone: 'America/Detroit', ouraPullFromHour: 6 };
  const noon = new Date('2026-07-04T16:00:00Z');   // 12:00 local
  const base = { config: cfg, dateString: '2026-07-04', connected: true, now: noon };

  // Score only: keep pulling. This is the case that used to stop.
  writeTelemetry([{ date: '2026-07-04', sleep_score: 74, total_sleep_duration: null }]);
  assert.equal(shouldIngest(base), true, 'must keep retrying for the missing period');

  // Score and period: done for the day.
  writeTelemetry([{ date: '2026-07-04', sleep_score: 74, total_sleep_duration: 27000 }]);
  assert.equal(shouldIngest(base), false, 'a complete night must stop the pulling');
});
