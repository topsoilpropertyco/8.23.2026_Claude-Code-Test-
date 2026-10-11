// The long-running supervisor.
//
// WHY THIS EXISTS. The engine was 288 short runs a day on a `*/5` cron, each
// sending what was due and then holding a 200-second long poll. That design is
// correct only if the scheduler honours the interval, and measured over twenty
// consecutive scheduled runs it does not: median gap 103 minutes, worst 206,
// against a requested 5. GitHub deprioritises high-frequency crons on free
// public repositories, and the consequences landed on the cues that matter most
// -- a 9pm work-shutdown nudge delivered at 11:14pm, the 10pm bedtime cue in the
// same batch. A bedtime reminder that late is a notification about the past.
//
// THE FIX. An Actions job may run for six hours, and public repositories have
// unlimited minutes. So instead of many short runs hoping to be scheduled on
// time, a few long ones: this loop checks what is due, answers replies, and
// repeats every ~25 seconds for hours. Scheduler unreliability stops being a
// precision problem and becomes a startup-latency problem -- once a run is
// going, it covers its whole window to the second.
//
// WHAT THIS HAS TO GET RIGHT. State lives in git, and a six-hour run that only
// persists at the end would lose a whole evening of delivery records if the job
// were killed -- and then re-send all of it on the next run. So state is pushed
// as soon as anything is actually sent, not on a timer and not at the end.

import { dispatch } from './dispatch.js';
import { listen } from './listen.js';
import { loadConfig } from './facts.js';
import { loadState } from './state.js';
import { scoreSeries, nightComplete } from './telemetry.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Long enough that the loop is cheap, short enough that a slot fires within
// half a minute of its target. Telegram's own long poll does the waiting, so
// this costs one held connection rather than any spinning.
const SLICE_SECONDS = 25;

// How often the Oura pull may actually go out to the network. Five minutes keeps
// the daily total in the same order as the old cron made (about 48 calls an hour
// while a night is unsettled, not 576) while still noticing a night within
// minutes of it landing.
const INGEST_COOLDOWN_SECONDS = 300;

/**
 * A fingerprint of the newest night: its date AND whether it is complete.
 *
 * Watching the date alone was not enough. A night arrives in two pieces -- the
 * score first, the sleep period later -- so the date stops changing while the
 * night is still half there. The ingest would fill in the period, thirteen
 * vitals would appear in the telemetry, and the deck would never be rebuilt
 * because the date it was keyed on had not moved. The screens kept showing the
 * scoreless-vitals version of a night that was finished.
 */
/**
 * The fingerprint of the deck that was last built, read from the health record
 * the build itself writes. Null when nothing has been built, which correctly
 * makes the first cycle rebuild.
 */
function builtFingerprint() {
  try {
    const raw = readFileSync(join(ROOT, 'state/health.json'), 'utf8');
    const h = JSON.parse(raw);
    if (!h.night) return null;
    return `${h.night}:${h.hasSleepPeriod ? 'full' : 'partial'}`;
  } catch {
    return null;
  }
}

function nightFingerprint() {
  try {
    const s = scoreSeries();
    if (!s.length) return null;
    const date = s[s.length - 1].date;
    return `${date}:${nightComplete(date) ? 'full' : 'partial'}`;
  } catch {
    return null;
  }
}

/**
 * Last night's sleep score, watched separately from the fingerprint.
 *
 * Oura revises a score after the fact. Getting up at 2am with the boys is
 * counted as a wake and scored on the spot; the sleep that follows raises the
 * number again, sometimes by a lot. The deck is built the moment the night
 * lands, so the screens read at breakfast hold the first, harshest figure of a
 * night Oura itself no longer believes -- and nothing could notice, because the
 * date had not moved and the night was already 'full'.
 *
 * The ingest was never the problem: upsertTelemetry has been correcting the
 * stored score all along. Only the trigger to rebuild was missing.
 *
 * Deliberately NOT persisted. The one file a build leaves behind that outlives
 * a window is state/health.json, and this repository is public -- that file is
 * counts and booleans, never a score. Keeping the comparison in memory costs
 * exactly one thing: a revision landing in the few seconds between one window
 * ending and the next starting is not seen. /rescore covers that case.
 */
function latestScore() {
  try {
    const s = scoreSeries();
    return s.length ? s[s.length - 1].score : null;
  } catch {
    return null;
  }
}

// A ceiling on resends for one night. Oura normally settles after a single
// correction; this is here so that a night it keeps nudging cannot turn into a
// morning of albums.
const MAX_REVISIONS_PER_NIGHT = 2;

/**
 * Run the engine continuously until the deadline.
 *
 * @param {number}   seconds     how long to stay up
 * @param {function} persist     called after anything is sent; commits and pushes state
 * @param {function} onNewNight  called with the date when the ingest lands a new night
 */
export async function serve({
  seconds = 20700,
  log = console.log,
  now = () => Date.now(),
  persist = null,
  onNewNight = null,
  sliceSeconds = SLICE_SECONDS,
  ingestCooldownSeconds = INGEST_COOLDOWN_SECONDS,
  dispatchFn = dispatch,
  listenFn = listen,
  // Injected for the same reason dispatchFn is: the score watcher below decides
  // whether to resend a deck, and that decision is worth testing without a
  // decryption key and 1,074 real nights behind it.
  builtFn = builtFingerprint,
  nightFn = nightFingerprint,
  scoreFn = latestScore,
} = {}) {
  const deadline = now() + seconds * 1000;
  const started = now();
  // A zero or negative window exits before touching the network, which is what
  // makes `serve 0` a safe way to prove the command's wiring end to end.
  if (seconds <= 0) {
    log('serve: window is zero, nothing to do');
    return { loops: 0, sent: 0, handled: 0, minutes: 0 };
  }
  // Seeded from the last deck that was actually BUILT, not from current
  // telemetry. Seeding from telemetry meant a night that completed before the
  // window opened was captured as the starting state and never counted as a
  // change -- so the deck stayed on whatever it was built from, and nothing
  // would ever correct it until the next night arrived. That is exactly what
  // happened: the period landed at 18:11 and the screens were still the 17:31
  // build hours later.
  let lastNight = builtFn();
  // Seeded from what telemetry holds right now, not from the deck: a window
  // opening must not treat the score it inherits as a revision and resend on
  // its first cycle. Only a change DURING the window is a correction.
  let lastScore = scoreFn();
  let revisions = 0;
  let loops = 0;
  // -Infinity, not 0: a window opening must pull on its first cycle. With 0 and a
  // clock at 0 the cooldown reads as already-satisfied-never, and a fresh window
  // would sit blind for five minutes -- exactly when a night is most likely to be
  // waiting for it.
  let lastIngestAt = -Infinity;
  let totalSent = 0;
  let totalHandled = 0;
  let nightsSeen = 0;

  log(`serve: up for ${Math.round(seconds / 60)} min, checking every ${sliceSeconds}s`);
  log(`serve: deck was last built from ${lastNight ?? 'nothing'}; `
    + `telemetry now has ${nightFn() ?? 'nothing'} (score ${lastScore ?? '--'})`);

  // A quiet loop prints nothing, which made ten minutes of healthy silence
  // indistinguishable from a hang when the first window was killed. A line every
  // few minutes is the difference between "working, nothing due" and "stuck".
  const HEARTBEAT_EVERY = Math.max(1, Math.round(300 / sliceSeconds));

  while (now() < deadline) {
    loops += 1;
    let sentThisLoop = 0;

    // 1. Anything due goes out. Cheap when nothing is: dispatch reads the
    //    schedule and returns without sending.
    // The Oura pull is rate-limited to once per cooldown. Slot delivery still
    // runs every cycle -- only the network pull is throttled, so punctuality is
    // unaffected and a night is still picked up within a few minutes of landing.
    const wantIngest = now() - lastIngestAt >= ingestCooldownSeconds * 1000;
    if (wantIngest) lastIngestAt = now();
    try {
      const result = await dispatchFn({ log, allowIngest: wantIngest });
      sentThisLoop = result?.sent?.length ?? 0;
      totalSent += sentThisLoop;
      totalHandled += result?.inbox?.handled ?? 0;
    } catch (err) {
      // A failed cycle must never end the window -- the next one is 25s away.
      log(`serve: dispatch failed (continuing): ${err.message}`);
    }

    // 2. A new night means the deck is worth rebuilding and sending. Checked
    //    here rather than once at startup because the ingest happens inside
    //    dispatch, hours into the run.
    const night = nightFn();
    if (night && night !== lastNight) {
      log(`serve: night changed — ${night}`);
      lastNight = night;
      lastScore = scoreFn();
      revisions = 0;
      nightsSeen += 1;
      if (onNewNight) {
        try {
          await onNewNight(night);
        } catch (err) {
          log(`serve: deck delivery failed (continuing): ${err.message}`);
        }
      }
    } else if (night && night.endsWith(':full')) {
      // 2b. Same night, different number -- see latestScore() above. A finished
      //     night whose score moves is a corrected night, and the screens that
      //     were already sent are now wrong about it.
      const score = scoreFn();
      if (score != null && lastScore != null && score !== lastScore) {
        const from = lastScore;
        // Taken before the resend, not after: if the build fails, the window
        // must not retry it every twenty-five seconds for five hours.
        lastScore = score;
        if (revisions >= MAX_REVISIONS_PER_NIGHT) {
          log(`serve: ${night} revised again (${from} → ${score}); already resent `
            + `${revisions}× for this night, leaving it`);
        } else {
          revisions += 1;
          log(`serve: Oura revised ${night} — ${from} → ${score}, resending the deck`);
          nightsSeen += 1;
          if (onNewNight) {
            try {
              await onNewNight(night, { revised: { from, to: score } });
            } catch (err) {
              log(`serve: deck resend failed (continuing): ${err.message}`);
            }
          }
        }
      }
    }

    // 3. Persist immediately after a send. Not on a timer: the window between
    //    delivering a message and recording that it was delivered is exactly
    //    the window in which a killed job causes a duplicate tomorrow.
    // The first cycle always flushes. Steps before this one (the ingest, the
    // deck, the health record) leave changes in state/ that would otherwise sit
    // unpushed for the whole window -- and a window that gets killed takes them
    // with it. It also means the pipeline's health is visible within a minute of
    // a run starting rather than when it ends, which for a six-hour window is
    // the difference between observable and not.
    if (persist && (loops === 1 || sentThisLoop > 0 || nightsSeen > 0)) {
      try {
        await persist();
        nightsSeen = 0;
      } catch (err) {
        log(`serve: state push failed (continuing): ${err.message}`);
      }
    }

    if (loops % HEARTBEAT_EVERY === 0) {
      const upMin = Math.round((now() - started) / 60000);
      const leftMin = Math.round((deadline - now()) / 60000);
      log(`serve: alive — ${loops} cycles, ${upMin} min up, ${leftMin} min left, `
        + `${totalSent} sent, ${totalHandled} answered`);
    }

    // 4. Hold a long poll for the rest of the slice, so a reply is answered in
    //    seconds rather than at the next loop.
    const left = Math.floor((deadline - now()) / 1000);
    if (left <= 1) break;
    const slice = Math.min(sliceSeconds, left);
    try {
      const config = loadConfig();
      const r = await listenFn({
        config,
        state: loadState(),
        token: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
        seconds: slice,
        log: () => {},          // one line per 25s slice would be thousands
      });
      const h = r?.handled ?? 0;
      if (h) {
        totalHandled += h;
        log(`serve: answered ${h} message(s)`);
        if (persist) {
          try { await persist(); } catch (err) { log(`serve: state push failed: ${err.message}`); }
        }
      }
    } catch (err) {
      log(`serve: listen failed (continuing): ${err.message}`);
      // Without the long poll this loop would spin. Wait out the slice.
      await new Promise((r) => setTimeout(r, slice * 1000));
    }
  }

  const mins = Math.round((now() - started) / 60000);
  log(`serve: window closed after ${mins} min — ${loops} cycles, ${totalSent} sent, `
    + `${totalHandled} replies answered`);
  return { loops, sent: totalSent, handled: totalHandled, minutes: mins };
}
