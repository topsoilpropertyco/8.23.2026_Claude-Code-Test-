// THE ANCHOR. Three lines that ride out on every single message, and a picture
// that rides out on some of them.
//
// WHY THIS EXISTS. Everything else Sleep OS sends is retrospective and
// computed: a score, a percentile, a fact drawn from rotation, a paragraph a
// model wrote about last night. None of it tells him what to do while he is
// standing in the kitchen at 10pm holding his phone. The anchor is the
// instruction rather than the report, so it never varies -- not by day, not by
// slot, not by how he slept. Reinforcement works by repetition, and anything
// that varies invites reading instead of obeying.
//
// TEXT ON EVERYTHING, PICTURE ON SOME. The text is three lines and free, so it
// goes on all of it. The picture is the thing that carries weight, and weight
// is spent by overuse: a card seen twenty times a day stops registering as an
// instruction and becomes wallpaper. So it arrives at midday once, and then on
// every evening cue from wind-down onward -- when it is actually true. The 4pm
// boundary cue stays text-only on purpose: it is the gap that keeps "midday"
// and "evening" from collapsing into "all day".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { localTimeString } from './time.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The photograph of web/be-card.html, committed by bin/build-anchor.mjs. */
export const CARD = join(ROOT, 'assets/be-card.png');

// Verbatim, and not to be improved. "BE" is the acronym the card is built on --
// Bed, Eyes -- and it happens to spell the thing he is trying to do at that
// hour, which is stop doing and just be.
export const ANCHOR_TEXT = [
  'BE Top 1%',
  '1. Get in bed.',
  '2. Close your eyes.',
].join('\n');

// Slots that carry the picture as well as the text. One at midday, then every
// cue from the evening wind-down on. Overridable from config so the shape can
// change without a code edit, but these are the defaults his spec asked for.
export const DEFAULT_IMAGE_SLOTS = [
  'midday_essentialism',
  'evening_winddown',
  'blue_blockers',
  'work_shutdown',
  'terminal_bedtime',
];

/** Local hour from which anything he sends gets the picture back. */
export const DEFAULT_EVENING_FROM_HOUR = 18;

/**
 * Append the anchor to a message, once.
 *
 * Idempotent because the sends are layered -- dispatch wraps its sender, the
 * inbox wraps its own, and a message that passed through both would otherwise
 * carry the block twice.
 */
export function withAnchor(text) {
  const body = String(text ?? '');
  if (!body.trim()) return ANCHOR_TEXT;
  if (body.includes(ANCHOR_TEXT)) return body;
  return `${body.replace(/\s+$/, '')}\n\n${ANCHOR_TEXT}`;
}

/**
 * Wrap a sender so everything leaving through it carries the anchor.
 *
 * Wrapping the seam rather than editing each call site is deliberate: inbox.js
 * alone sends from eleven places -- replies, /help, /status, parse errors, the
 * unreadable-log warning -- and "every message" has to mean every message,
 * including the ones nobody thinks of as messages.
 */
export function anchoredSend(send) {
  return (token, chatId, text, ...rest) => send(token, chatId, withAnchor(text), ...rest);
}

const config = (c) => c?.anchor ?? {};

/** Does this scheduled slot carry the picture as well as the text? */
export function imageDueForSlot(slotId, cfg = {}) {
  const slots = config(cfg).imageSlots ?? DEFAULT_IMAGE_SLOTS;
  return slots.includes(slotId);
}

/**
 * Does a message he just sent get the picture back?
 *
 * Anything from the evening hour onward, by his local wall clock rather than
 * UTC -- the whole point is where the sun is, and the runner is in UTC.
 */
export function imageDueForReply(now, cfg = {}) {
  const from = config(cfg).eveningFromHour ?? DEFAULT_EVENING_FROM_HOUR;
  const zone = cfg.timezone ?? 'America/Detroit';
  const hour = Number(localTimeString(now, zone).slice(0, 2));
  return Number.isFinite(hour) && hour >= from;
}

/**
 * Send the card, best effort.
 *
 * Never throws. The text is the reminder and the picture is the emphasis, so a
 * Telegram hiccup on the upload must not take down the message it accompanies,
 * fail the slot, or stop the state record that says the cue was delivered.
 * Returns true if it went, false if it did not, so callers can log the truth.
 */
export async function sendAnchorCard({ token, chatId, sendPhoto, log = () => {}, card = CARD }) {
  try {
    readFileSync(card); // fail here rather than inside the upload retry loop
    await sendPhoto(token, chatId, card, '');
    return true;
  } catch (err) {
    log(`anchor: the card did not go out -- ${err.message}`);
    return false;
  }
}
