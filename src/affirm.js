// Replies to journal entries.
//
// Before this, three of the four inbound paths answered and one did not: a
// journal entry was written to disk, logged to the run output, acknowledged to
// Telegram, and met with silence. That was the path where the most work had
// been done.
//
// Three rules shape what comes back.
//
// 1. Praise habituates. "Great job" every night reads as a machine patting you
//    on the head inside a week. So the strongest shapes reference evidence
//    instead: the behavioural mechanism the prompt was targeting (already
//    stored on every entry) and the current streak (a fact, not an adjective).
//
// 2. Reward what you want more of. An effusive reply to a two-word entry
//    teaches that two-word entries pay. Short entries get a warm, small reply --
//    never a cold one, because missing is the only real failure.
//
// 3. Vary the magnitude. Constant-size reward flattens into noise. Most replies
//    are one line; occasionally one carries a streak line or a milestone. This
//    reuses the precedent already in config as `jackpot`.
//
// Nothing here calls a model or the network. It is a lookup and a deterministic
// roll, so it can run inside the polling dispatch today and move behind a
// webhook later without changing.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './facts.js';
import { rngFrom, shuffle } from './rng.js';
import { pickIntensity, effortOf } from './intensity.js';

const FILE = join(ROOT, 'data/affirmations.json');

const SHORT_CHARS = 30;
const STREAK_FLOOR = 3;     // below this a streak is not worth naming

export function loadAffirmations() {
  return JSON.parse(readFileSync(FILE, 'utf8'));
}

export function isShortEntry(text) {
  const t = (text ?? '').trim();
  return t.length < SHORT_CHARS || t.split(/\s+/).filter(Boolean).length < 5;
}

/**
 * Draw from a pool without repeating until it is exhausted, then reshuffle.
 * Same discipline as the fact and habit rotations, so no line comes round
 * again while others are still unseen.
 */
function draw(pool, key, state, seed) {
  const rot = state.affirmRotation ?? (state.affirmRotation = {});
  let remaining = rot[key];
  if (!Array.isArray(remaining) || !remaining.length) {
    remaining = shuffle(pool.map((_, i) => i), rngFrom(`sleep-os:affirm:${key}:${seed}`));
  }
  const [i, ...rest] = remaining;
  rot[key] = rest;
  return pool[Math.min(i, pool.length - 1)];
}

/**
 * Build the reply. Always returns text -- there is no input for which this
 * returns nothing, which is the entire point of the feature.
 */
export function buildAffirmation({
  text = '',
  mechanism = null,
  streak = 0,
  state = {},
  dateString = '',
  library = null,
  journalTotal = 0,
} = {}) {
  const lib = library ?? loadAffirmations();
  const lines = [];
  let shape;

  const milestone = lib.milestone?.[String(streak)];

  // How big this one gets. The roll used to live here as a local STREAK_ODDS
  // constant; it moved to src/intensity.js so the morning coach varies on the
  // same rhythm. One system with a pulse, rather than two components each
  // rolling their own dice. Still deterministic from the date, so a re-run on
  // the same day cannot fish for a bigger reply, and a two-word entry is
  // capped before the roll rather than after it.
  const intensity = pickIntensity({
    seed: `affirm:${dateString}:${streak}`,
    milestone: Boolean(milestone),
    effort: effortOf(text),
  });

  if (milestone) {
    // Rare and large by design. A milestone outranks everything else.
    shape = 'milestone';
    lines.push(milestone);
  } else if (isShortEntry(text)) {
    shape = 'short';
    lines.push(draw(lib.short, 'short', state, dateString));
  } else if (mechanism && lib.mechanism?.[mechanism]?.length) {
    shape = 'mechanism';
    lines.push(draw(lib.mechanism[mechanism], `mechanism:${mechanism}`, state, dateString));
  } else {
    shape = 'identity';
    lines.push(draw(lib.identity, 'identity', state, dateString));
  }

  // A milestone line is already the large reply -- reaching one is the whole
  // reason the level went deep. Hanging a streak count and a running total off
  // it would bury the single sentence actually worth reading.
  let streakShown = false;
  let statShown = false;

  if (shape !== 'milestone' && intensity.level !== 'brief') {
    // The streak is the strongest line available, so it rides along whenever
    // there is room for it -- which is now what "not brief" means.
    if (streak >= STREAK_FLOOR) {
      lines.push(draw(lib.streak, 'streak', state, dateString).replace('{n}', String(streak)));
      streakShown = true;
    }
    // Deep goes one further and says something about the record as a whole.
    // Only ever a count of entries: a number true by construction, because it
    // is the length of the file the line is being written into. Nothing here
    // needs the number verifier that guards the generated coach, because
    // nothing here is generated.
    if (intensity.level === 'deep' && journalTotal > 0 && lib.stat?.length) {
      lines.push(draw(lib.stat, 'stat', state, dateString).replace('{total}', String(journalTotal)));
      statShown = true;
    }
  }

  return { text: lines.join(' '), shape, streakShown, statShown, intensity: intensity.level };
}
