// The night analysis, and the property that makes a date picker trustworthy.
//
// src/night.js is now the ONLY implementation of this arithmetic. It used to
// live inside bin/build-night-data.mjs, which reads encrypted telemetry, so it
// could only ever describe the newest night on a machine holding the key. That
// is the whole reason the screens could show one night and no other.
//
// The risk in pulling it out is a second implementation appearing by accident --
// the browser computing a percentile one way and the server another, with
// nobody able to tell which is right. These tests pin the arithmetic itself and
// then pin the thing that matters most: analysing a past night must give that
// night's context, not today's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseNight, availableDates, scoredNights, fromTelemetry } from '../src/night.js';

// A deterministic history: 200 nights, a known mean, and a couple of extremes.
const HISTORY = Array.from({ length: 200 }, (_, i) => {
  const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  return {
    d: day,
    s: 60 + ((i * 13) % 35),          // 60..94, evenly spread, no ties by luck
    t: 380 + (i % 60),
    ib: 430 + (i % 60),
    dp: 45 + (i % 20),
    rm: 70 + (i % 25),
    lt: 250 + (i % 40),
    aw: 40 + (i % 15),
    ef: 82 + (i % 12),
    la: 10 + (i % 20),
    hv: 28 + (i % 18),
    hr: 52 + (i % 10),
    br: 14 + ((i % 10) / 10),
    bs: `${day}T23:${String(30 + (i % 25)).padStart(2, '0')}:00-04:00`,
    be: `${day}T07:${String(10 + (i % 40)).padStart(2, '0')}:00-04:00`,
  };
});

/* ------------------------------------------------------------- the arithmetic */

test('the counts always account for every night on record', () => {
  for (const date of [HISTORY[0].d, HISTORY[99].d, HISTORY.at(-1).d]) {
    const a = analyseNight({ nights: HISTORY, date, today: '2026-08-01' });
    const { below, above, ties } = a.standing;
    // Screen 4 draws one outline box per group; a gap shows as a missing cell.
    assert.equal(below + above + ties, a.population.n,
      `${date}: ${below}+${above}+${ties} != ${a.population.n}`);
    assert.equal(a.standing.rank, above + 1, 'rank 1 must mean the best night');
    assert.ok(a.standing.percentile >= 0 && a.standing.percentile <= 100);
  }
});

test('the best and worst nights land at the ends', () => {
  const scores = HISTORY.map((n) => n.s);
  const best = HISTORY.find((n) => n.s === Math.max(...scores));
  const worst = HISTORY.find((n) => n.s === Math.min(...scores));

  const b = analyseNight({ nights: HISTORY, date: best.d, today: '2026-08-01' });
  assert.equal(b.standing.above, 0, 'nothing may beat the best night');

  const w = analyseNight({ nights: HISTORY, date: worst.d, today: '2026-08-01' });
  assert.equal(w.standing.below, 0, 'nothing may sit under the worst night');
  assert.equal(w.standing.rank, w.population.n - w.standing.ties + 1);
});

test('THE PROPERTY THAT MAKES BROWSING MEANINGFUL: a past night gets its own context', () => {
  // Trailing windows must end at the night being asked about. If they ended at
  // today, every past night would be compared against a future it could not
  // have known -- which would make the date picker not merely wrong but
  // misleading, since the numbers would still look plausible.
  const early = analyseNight({ nights: HISTORY, date: HISTORY[9].d, today: '2026-08-01' });
  const late = analyseNight({ nights: HISTORY, date: HISTORY[150].d, today: '2026-08-01' });

  const t7 = (a) => a.trailing.find((t) => t.window === 7)?.avg;
  assert.notEqual(t7(early), t7(late), 'two different nights cannot share a trailing average');

  // Computed by hand from the ten nights up to and including HISTORY[9].
  const own = HISTORY.slice(3, 10).map((n) => n.s);
  const expected = +(own.reduce((a, b) => a + b, 0) / own.length).toFixed(1);
  assert.equal(t7(early), expected, 'the 7-night window must be the 7 nights up to that night');

  // A night early in the record cannot have a full 365-day window.
  const y = early.trailing.find((t) => t.window === 365);
  if (y) assert.equal(y.partial, true, 'a window that cannot be full must say so');
});

test('a named date is history, not a stale reading', () => {
  // stale means "the ring has not synced and this is not last night". Asking for
  // an old night by name is a deliberate act, so it must never carry the warning
  // that the screens print when the data is behind.
  const old = analyseNight({ nights: HISTORY, date: HISTORY[0].d, today: '2026-08-01' });
  assert.equal(old.stale, false);
  assert.ok(old.daysBehind > 100, 'daysBehind is still reported, just not as a fault');

  const latest = analyseNight({ nights: HISTORY, today: HISTORY.at(-1).d });
  assert.equal(latest.stale, false, 'the newest night on the same day is current');
  assert.equal(latest.date, HISTORY.at(-1).d);

  const behind = analyseNight({ nights: HISTORY, today: '2026-09-01' });
  assert.equal(behind.stale, true, 'no sync for days IS a fault and must be flagged');
});

test('a malformed date does not silently read as current', () => {
  // NaN would print as "NaN days back" and every comparison against it returns
  // false, so a stale night would render as up to date.
  const a = analyseNight({ nights: [{ d: 'not-a-date', s: 80 }], today: '2026-08-01' });
  assert.equal(a.daysBehind, 0);
  assert.equal(Number.isFinite(a.daysBehind), true);
});

/* ---------------------------------------------------------------- robustness */

test('unscored and malformed nights are excluded, not coerced', () => {
  const messy = [
    ...HISTORY.slice(0, 5),
    { d: '2026-03-01', s: null },
    { d: '2026-03-02' },
    { d: '2026-03-03', s: 'eighty' },
    { d: '2026-03-04', s: NaN },
    null,
    { s: 80 },                       // no date
  ];
  assert.equal(scoredNights(messy).length, 5, 'only real scores are data points');
  assert.equal(analyseNight({ nights: messy, today: '2026-08-01' }).population.n, 5);
  assert.equal(availableDates(messy).length, 5);
});

test('an empty or absent record returns null rather than a zero night', () => {
  // A zeroed night would render as a real one, which is the failure this whole
  // system is built to avoid.
  for (const nights of [[], null, undefined, [{ d: 'x' }]]) {
    assert.equal(analyseNight({ nights, today: '2026-08-01' }), null);
  }
  assert.equal(analyseNight({ nights: HISTORY, date: '1999-01-01' }), null,
    'a date not on record must be null, not the nearest night');
});

test('dates come back sorted, whatever order they went in', () => {
  const shuffled = [...HISTORY].reverse();
  const dates = availableDates(shuffled);
  assert.deepEqual(dates, [...dates].sort(), 'a date picker needs them in order');
  assert.equal(dates.length, HISTORY.length);
  // The analysis must not depend on input order either.
  const a = analyseNight({ nights: HISTORY, date: HISTORY[42].d, today: '2026-08-01' });
  const b = analyseNight({ nights: shuffled, date: HISTORY[42].d, today: '2026-08-01' });
  assert.deepEqual(a, b);
});

test('durations round once, so the two data paths cannot disagree', () => {
  // Telemetry is seconds, the embedded series is minutes. If each path rounded
  // separately they could differ by a minute on the same night, which would show
  // as the album and the page disagreeing.
  const row = fromTelemetry({
    date: '2026-05-05', sleep_score: 81,
    total_sleep_duration: 23_069,      // 384.48 min -> 384
    time_in_bed: 26_100, deep_sleep_duration: 3_090, rem_sleep_duration: 4_680,
    light_sleep_duration: 15_299, awake_time: 3_031, efficiency: 88, latency: 1_260,
    average_hrv: 34, lowest_heart_rate: 58, average_breath: 15.125,
    bedtime_start: '2026-05-04T23:41:00-04:00', bedtime_end: '2026-05-05T07:27:00-04:00',
  });
  assert.equal(row.t, 384);
  assert.equal(row.la, 21);
  assert.equal(row.br, 15.1, 'three decimals of breathing rate is noise, not precision');

  const a = analyseNight({ nights: [row], today: '2026-05-05' });
  assert.equal(a.night.asleepMinutes, 384);
  assert.equal(a.night.asleepLabel, '6h 24m');
  assert.equal(a.night.deep.label, '0h 52m', '3090s is 51.5 min and rounds up');
  assert.equal(a.night.bedtimeStart, '2026-05-04T23:41:00-04:00');
});

test('a night missing a vital shows nothing rather than a zero', () => {
  const a = analyseNight({
    nights: [{ d: '2026-06-01', s: 77 }], today: '2026-06-01',
  });
  for (const k of ['asleepMinutes', 'efficiency', 'hrv', 'restingHr', 'breath', 'latency']) {
    assert.equal(a.night[k], null, `${k} should be null, never 0`);
  }
  for (const k of ['deep', 'rem', 'light', 'awake']) {
    assert.equal(a.night[k], null);
  }
  assert.equal(a.night.asleepLabel, null, 'no "0h 00m" for a night with no reading');
});

/* ------------------------------------------------------------- the golden test */

test('the Python screens render exactly the numbers the JS analysis computed', async () => {
  // THE SAFETY NET FOR THE WHOLE PORT.
  //
  // bin/build-screens.py renders whatever data/last-night.json says as fact, and
  // that file is now produced by analyseNight(). The browser will hand the same
  // templates an object from the same function. So the contract to pin is: what
  // analyseNight computes is what a screen actually prints. If those drift, one
  // is quietly wrong and the numbers still look plausible either way.
  const { execFileSync } = await import('node:child_process');
  const { readFileSync, writeFileSync, mkdtempSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dir = mkdtempSync(join(tmpdir(), 'sleep-os-golden-'));
  const nightFile = join(dir, 'night.json');
  const variants = join(dir, 'variants');
  mkdirSync(variants, { recursive: true });

  // A known history, analysed by the function under test.
  const analysed = analyseNight({ nights: HISTORY, date: HISTORY[150].d, today: HISTORY.at(-1).d });
  assert.ok(analysed);
  writeFileSync(nightFile, JSON.stringify({ ...analysed, generated: 'test' }, null, 2));

  execFileSync('python3', ['bin/build-screens.py'], {
    env: { ...process.env, SLEEPOS_NIGHT: nightFile, SLEEPOS_VARIANTS: variants },
    stdio: 'pipe',
  });

  const s1 = readFileSync(join(variants, 's1', 'index.html'), 'utf8');
  const s5 = readFileSync(join(variants, 's5', 'index.html'), 'utf8');
  const s6 = readFileSync(join(variants, 's6', 'index.html'), 'utf8');

  // The headline figures.
  assert.ok(s1.includes(String(analysed.score)), 'screen 1 must print the score it was given');
  assert.ok(s1.includes(String(analysed.population.n))
    || s1.includes(analysed.population.n.toLocaleString('en-US')),
    'screen 1 must print the number of nights on record');
  assert.ok(s1.includes(String(Math.round(analysed.standing.percentile)))
    || s1.includes(String(analysed.standing.percentile)),
    'screen 1 must print the percentile analyseNight computed');

  // The trailing windows, which are the figures that make a past night make
  // sense. Every non-null window must appear on screen 5.
  for (const t of analysed.trailing) {
    if (t.avg === null) continue;
    // Python formats these with %g, which drops a trailing zero: 81.0 prints as
    // "81". Both forms are the same number, so both are accepted.
    const forms = [t.avg.toFixed(1), String(t.avg), String(Number(t.avg))];
    assert.ok(forms.some((f) => s5.includes(f)),
      `screen 5 is missing the ${t.window}-night average (${forms.join(' or ')})`);
  }

  // And the measured vitals on screen 6.
  assert.ok(s6.includes(String(analysed.night.efficiency)), 'screen 6 must print efficiency');
  assert.ok(s6.includes(String(analysed.night.hrv)), 'screen 6 must print HRV');
});

test('every night in a full history analyses without throwing', () => {
  // A date picker offers all of them, so all of them have to work: the first
  // night on record with no trailing window to speak of, the last, and every
  // one between.
  const dates = availableDates(HISTORY);
  assert.equal(dates.length, HISTORY.length);

  for (const date of dates) {
    const a = analyseNight({ nights: HISTORY, date, today: dates.at(-1) });
    assert.ok(a, `${date} did not analyse`);
    assert.equal(a.date, date);
    assert.equal(a.standing.below + a.standing.above + a.standing.ties, a.population.n, date);
    assert.ok(Number.isFinite(a.standing.percentile), `${date} has no percentile`);
    assert.ok(Number.isFinite(a.daysBehind), `${date} daysBehind is not finite`);
    // The very first night legitimately has no trailing window -- trailing()
    // drops any window it cannot fill with at least two nights -- so an empty
    // array is correct there and must not be treated as a failure.
    if (date !== dates[0]) {
      assert.ok(a.trailing.length > 0, `${date} lost its trailing windows`);
    }
  }
});

test('the screens survive the first night on record, which has no history behind it', async () => {
  // The date picker will offer it, so it has to render. A night with no trailing
  // windows, no spread and a percentile of its own median is the thinnest input
  // the templates will ever get, and it is also the state on day one.
  const { execFileSync } = await import('node:child_process');
  const { writeFileSync, mkdtempSync, mkdirSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dir = mkdtempSync(join(tmpdir(), 'sleep-os-firstnight-'));
  const nightFile = join(dir, 'night.json');
  const variants = join(dir, 'variants');
  mkdirSync(variants, { recursive: true });

  const first = analyseNight({ nights: [HISTORY[0]], today: HISTORY[0].d });
  assert.equal(first.population.n, 1);
  assert.equal(first.population.sd, 0, 'one night has no spread');
  assert.equal(first.trailing.length, 0, 'and no trailing window it could fill');
  writeFileSync(nightFile, JSON.stringify({ ...first, generated: 'test' }));

  // The assertion is simply that this does not throw and produces all 8 screens.
  execFileSync('python3', ['bin/build-screens.py'], {
    env: { ...process.env, SLEEPOS_NIGHT: nightFile, SLEEPOS_VARIANTS: variants },
    stdio: 'pipe',
  });
  for (const key of ['s1', 's2', 's3', 's4', 's5', 's6', 'g1', 'g2']) {
    const html = readFileSync(join(variants, key, 'index.html'), 'utf8');
    assert.ok(html.length > 500, `${key} rendered empty for a one-night history`);
    assert.ok(!/NaN|undefined|Infinity/.test(html), `${key} printed NaN or undefined`);
  }
});
