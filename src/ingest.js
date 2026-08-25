// Oura ingestion.
//
// Two entry points, same merge path:
//
//   backfill()  one sweep over the whole history, so the analytics have a real
//               baseline the day they ship rather than accumulating one over
//               months. Chunked, because a multi-year range in a single request
//               is a good way to get rate limited.
//
//   ingestDay() the daily top-up. A night is only considered settled once the
//               sleep score exists; before the ring syncs, Oura simply has no
//               row, so an unsuccessful pull is a no-op that the next poll
//               retries rather than an error.

import { accessToken, dailySleep, dailyReadiness, dailyStress, sleepPeriods } from './oura.js';
import { normalise, upsertTelemetry, readTelemetry, hasNight } from './telemetry.js';

const DAY_MS = 86400000;
const CHUNK_DAYS = 120;

const iso = (d) => new Date(d).toISOString().slice(0, 10);
const shift = (dateString, days) => iso(new Date(`${dateString}T12:00:00Z`).getTime() + days * DAY_MS);

/** Index rows by their `day` field so the four collections can be zipped. */
function byDay(rows) {
  const m = new Map();
  for (const r of rows ?? []) if (r?.day) m.set(r.day, r);
  return m;
}

function periodsByDay(rows) {
  const m = new Map();
  for (const r of rows ?? []) {
    if (!r?.day) continue;
    if (!m.has(r.day)) m.set(r.day, []);
    m.get(r.day).push(r);
  }
  return m;
}

/** Fetch and merge one date range. Returns normalised records. */
async function fetchRange(token, start, end, log) {
  // The sleep-period endpoint is asked for one extra day on the end.
  //
  // Evidence: every pull came back with one fewer period than daily_sleep row,
  // and the missing one was always the newest day -- "4 days (4 sleep, 3
  // periods)". The effect on the screens was a night with a real score and
  // thirteen blank vitals, because the score comes from daily_sleep and every
  // duration, stage and vital comes from the period.
  //
  // The most likely reason is that end_date is exclusive on this collection
  // where it is inclusive on the daily ones. That is inferred from the row
  // counts rather than confirmed against Oura's docs, so the fix is chosen to be
  // right either way: if end_date is inclusive, the extra day is simply a date
  // with no data and nothing changes.
  const periodEnd = shift(end, 1);
  const [sleep, readiness, stress, periods] = await Promise.all([
    dailySleep(token, { start, end }),
    dailyReadiness(token, { start, end }).catch(() => []),
    dailyStress(token, { start, end }).catch(() => []),
    sleepPeriods(token, { start, end: periodEnd }).catch(() => []),
  ]);

  const s = byDay(sleep);
  const r = byDay(readiness);
  const t = byDay(stress);
  const p = periodsByDay(periods);

  // Union of every day any collection knows about.
  const days = [...new Set([...s.keys(), ...r.keys(), ...t.keys(), ...p.keys()])].sort();
  log(`  ${start} → ${end}: ${days.length} days (${sleep.length} sleep, ${periods.length} periods)`);
  // A score with no period renders as a screen full of dashes, so name the days
  // it happens to rather than leaving it to be spotted on the screen itself.
  const scoreless = [...s.keys()].filter((d) => !p.has(d));
  if (scoreless.length) log(`  no sleep period yet for: ${scoreless.join(', ')}`);

  // Written to disk because a six-hour job will not release its log until it
  // ends, and this is the question that has now been wrong twice: the score
  // comes from daily_sleep, every duration and vital comes from the period, and
  // widening the period request by a day did not fix the newest day still
  // arriving without one. Dates and counts only -- no scores, no vital values.
  try {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    mkdirSync(join(root, 'state'), { recursive: true });
    writeFileSync(join(root, 'state/health.ingest.json'), `${JSON.stringify({
      _comment: 'What the last Oura pull actually saw. Public file: dates and counts only.',
      at: new Date().toISOString(),
      requested: { start, end, periodEnd },
      rows: { dailySleep: sleep.length, periods: periods.length,
              readiness: readiness.length, stress: stress.length },
      // The diagnosis. If a date appears here, daily_sleep had it and the sleep
      // collection did not -- so the gap is Oura's, not the merge's. If this is
      // empty and vitals are still missing, the merge is dropping them.
      daysWithScoreButNoPeriod: scoreless,
      periodDays: [...p.keys()].sort(),
      // A period can exist and still be discarded: mainSleep prefers a
      // long_sleep row and falls back to the longest. A day whose only period is
      // a nap would land here with a period but no useful night.
      periodTypes: [...new Set((periods ?? []).map((r) => r?.type).filter(Boolean))],
    }, null, 2)}\n`);
  } catch {
    // Diagnostics must never break an ingest.
  }

  return days.map((day) =>
    normalise({ day, sleep: s.get(day), readiness: r.get(day), stress: t.get(day), periods: p.get(day) }),
  );
}

async function token(log) {
  return accessToken({
    clientId: process.env.OURA_CLIENT_ID,
    clientSecret: process.env.OURA_CLIENT_SECRET,
    log,
  });
}

/**
 * Sweep the full history in chunks, oldest first.
 * `years` bounds how far back to look; Oura returns nothing for dates before
 * the ring was worn, so overshooting is harmless.
 */
export async function backfill({ years = 3, log = console.log } = {}) {
  const t = await token(log);
  const end = iso(Date.now());
  const start = shift(end, -Math.round(years * 365));

  log(`backfill ${start} → ${end}`);
  const all = [];
  let cursor = start;
  while (cursor < end) {
    const chunkEnd = shift(cursor, CHUNK_DAYS) > end ? end : shift(cursor, CHUNK_DAYS);
    all.push(...(await fetchRange(t, cursor, chunkEnd, log)));
    cursor = shift(chunkEnd, 1);
  }

  const result = upsertTelemetry(all);
  const scored = readTelemetry().filter((r) => r.sleep_score != null);
  log(`backfill complete: ${result.added} added, ${result.updated} updated, ${result.total} stored`);
  if (scored.length) log(`  earliest ${scored[0].date} · latest ${scored[scored.length - 1].date}`);
  return { ...result, scored: scored.length };
}

/**
 * Top up recent days. Looks back a short window rather than only at today, so a
 * night that was still syncing on an earlier run gets corrected.
 */
export async function ingestRecent({ days = 5, log = console.log } = {}) {
  const t = await token(log);
  const end = iso(Date.now());
  const start = shift(end, -days);
  const records = await fetchRange(t, start, end, log);
  const result = upsertTelemetry(records);
  log(`ingest: ${result.added} added, ${result.updated} updated`);
  return result;
}

/** True when the given local date already has a scored night on record. */
export const isSettled = (date) => hasNight(date);
