// The dispatcher.
//
// Every run does two things: drains anything Seth has replied with, then sends
// whatever slot is now due. Reading the inbox first matters -- a night logged at
// 6:40 should be on the record before the 8:00 card goes out.
//
// Because the schedule is derived deterministically from the date, this can be
// polled as often as the runner likes without the target times moving.

import { loadLibraries, loadConfig } from './facts.js';
import { buildDaySchedule, dueSlots } from './schedule.js';
import { selectFact } from './selector.js';
import { prepareHabit } from './habits.js';
import { selectPrompt, intakeRequest } from './prompts.js';
import { renderMessage, renderIntake, renderHabit, renderSummary } from './render.js';
import { sendMessage, sendPhoto } from './telegram.js';
import { withAnchor, imageDueForSlot, sendAnchorCard } from './anchor.js';
import { processInbox, trackPending } from './inbox.js';
import { loadState, saveState, sentSlotsFor, recordSend } from './state.js';
import { localDateString, localTimeString } from './time.js';
import { ingestRecent } from './ingest.js';
import { isAuthorised } from './oura.js';
import { nightComplete } from './telemetry.js';

/**
 * Whether this run should attempt an Oura pull.
 *
 * Three conditions, all cheap: Oura is connected, the local hour has reached
 * the configured pull time, and last night is not already on record. The last
 * one is what makes retrying free -- once the night lands, no request is made
 * for the rest of the day.
 */
export function shouldIngest({ config, now, dateString, connected = isAuthorised(), settled = null }) {
  if (!connected) return false;
  const hour = Number(localTimeString(now, config.timezone).slice(0, 2));
  if (hour < (config.ouraPullFromHour ?? 11)) return false;
  // nightComplete, not hasNight: a night with a score but no sleep period is not
  // finished, and treating it as finished is what left every vital blank.
  return !(settled ?? nightComplete(dateString));
}

export async function dispatch({
  now = new Date(),
  dryRun = false,
  force = null,
  skipInbox = false,
  allowIngest = true,
  log = console.log,
  // Injected so the live send path can be exercised in tests, matching the
  // seam processInbox already offers. This exists because a mutation test
  // deleted the card send outright and nothing went red: the dry-run branch
  // logs its own marker, so it cannot witness what the live branch does.
  send = sendMessage,
  sendCard = sendPhoto,
} = {}) {
  const config = loadConfig();
  const { facts } = loadLibraries();
  const state = loadState();

  const dateString = localDateString(now, config.timezone);
  const schedule = buildDaySchedule(config, dateString);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const live = !dryRun && token && chatId;

  if (!dryRun && !live) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set. Run: npm run whoami');
  }

  /* --- inbound first, so a logged night informs the day ------------------ */

  let inbox = { count: 0, handled: [] };
  if (live && !skipInbox) {
    try {
      inbox = await processInbox({ config, state, token, chatId, now, log });
    } catch (err) {
      // A failing inbox must never stop tonight's 9 PM card going out.
      log(`inbox error (continuing): ${err.message}`);
    }
  }

  /* --- Oura top-up --------------------------------------------------------- */

  // Oura only has last night once the ring has synced to their cloud, which
  // happens when the phone app is opened. Attempting from 11:00 local and
  // retrying each poll until the night lands is simpler and more reliable than
  // guessing a single time; once the night is on record the check costs
  // nothing and no request is made.
  let ingest = null;
  // allowIngest exists because the supervisor cycles every ~25 seconds rather
  // than every 5 minutes. shouldIngest is cheap, but the pull behind it is four
  // API calls, and an unsettled night would mean 576 Oura requests an hour where
  // the old cron made 48. Rate-limited pulls fail, get retried, and make it
  // worse. serve.js holds the cooldown; a one-shot dispatch is unaffected.
  if (allowIngest && live && !dryRun && shouldIngest({ config, now, dateString })) {
    try {
      ingest = await ingestRecent({ days: 3, log });
    } catch (err) {
      // A failed pull must never stop a reminder going out.
      log(`oura ingest error (continuing): ${err.message}`);
    }
  }

  /* --- outbound ----------------------------------------------------------- */

  const alreadySent = sentSlotsFor(state, dateString);
  let targets;
  if (force) {
    const slot = schedule.find((s) => s.id === force);
    if (!slot) throw new Error(`Unknown slot "${force}". Known: ${schedule.map((s) => s.id).join(', ')}`);
    targets = [slot];
  } else {
    const { due, missed } = dueSlots(schedule, now, alreadySent, config.maxLatenessMinutes ?? 75);
    for (const m of missed) {
      log(`skip  ${m.id} - window missed by ${Math.round(m.ageMinutes - (config.maxLatenessMinutes ?? 75))}m`);
      recordSend(state, dateString, m.id, { status: 'missed', at: now.toISOString() }, { persist: !dryRun });
    }
    targets = due;
  }

  const sent = [];
  for (const slot of targets) {
    let text;
    let record;

    if (slot.type === 'intake') {
      text = renderIntake({ slot, request: intakeRequest() });
      record = { status: dryRun ? 'dry-run' : 'sent', kind: 'intake', targetLabel: slot.targetLabel };
    } else if (slot.type === 'habit') {
      const prepared = prepareHabit({ slot, state, dateString });
      text = renderHabit({ habit: prepared.habit, slot, why: prepared.why,
                           showOptional: prepared.showOptional });

      // Same discipline as the fact rotation: advance only after a successful
      // send, so a delivery failure never burns a rationale.
      state.habitRotation = { ...(state.habitRotation ?? {}), ...prepared.rotation };
      record = { status: dryRun ? 'dry-run' : 'sent', ...prepared.record };

    } else {
      const choice = selectFact({ facts, state, slotId: slot.id, dateString, config });
      const lastMechanism = state.pending?.[0]?.mechanism ?? null;
      const chosenPrompt = selectPrompt({ state, slotId: slot.id, lastMechanism });

      text = renderMessage({ fact: choice.fact, slot, jackpot: choice.jackpot, prompt: chosenPrompt.prompt });

      // Rotation advances only after a successful send, so a delivery failure
      // never silently burns a fact.
      state.cycle = choice.cycle;
      state.remaining = choice.remaining;
      state.promptCycle = chosenPrompt.promptCycle;
      state.promptRemaining = chosenPrompt.promptRemaining;

      record = {
        status: dryRun ? 'dry-run' : 'sent',
        kind: 'fact',
        factId: choice.fact.id,
        library: choice.fact.library,
        category: choice.fact.category,
        jackpot: choice.jackpot,
        cycle: choice.cycle,
        promptId: chosenPrompt.prompt.id,
        mechanism: chosenPrompt.prompt.mechanism,
        targetLabel: slot.targetLabel,
      };
      sent.push({ slot, ...choice, prompt: chosenPrompt.prompt });
    }

    // Every cue carries the anchor. See src/anchor.js for why it never varies.
    text = withAnchor(text);

    if (dryRun) {
      log(`\n${'-'.repeat(64)}\n${text}\n${'-'.repeat(64)}`);
      if (imageDueForSlot(slot.id, config)) log('[+ the B E card]');
    } else {
      const result = await send(token, chatId, text);

      // The picture goes as its own message, after the text, and cannot fail
      // the send. Attaching it as a photo caption instead would cap the cue at
      // Telegram's 1024-character caption limit and silently truncate the fact
      // -- and would make the reminder itself dependent on an upload.
      if (imageDueForSlot(slot.id, config)) {
        await sendAnchorCard({ token, chatId, sendPhoto: sendCard, log });
      }
      // Track the sent message so a reply can be matched back to the card
      // that prompted it.
      trackPending(state, {
        messageId: result.message_id,
        kind: record.kind,
        factId: record.factId ?? null,
        promptId: record.promptId ?? null,
        mechanism: record.mechanism ?? null,
        slot: slot.id,
        at: new Date().toISOString(),
      });
    }

    recordSend(state, dateString, slot.id, { ...record, at: new Date().toISOString() }, { persist: !dryRun });

    // This branch used to assume anything that was not an intake was a fact,
    // and read sent[last].fact off an array habits never push to.
    if (slot.type === 'intake') {
      log(`${slot.targetLabel.padStart(8)}  intake request`);
      sent.push({ slot, intake: true });
    } else if (slot.type === 'habit') {
      log(`${slot.targetLabel.padStart(8)}  ${slot.id.padEnd(20)} ${record.whyId.padEnd(9)} habit` +
          `  cycle ${record.cycle}${record.optional ? '  +optional' : ''}`);
      sent.push({ slot, habit: slot.habit, whyId: record.whyId });
    } else {
      const s = sent[sent.length - 1];
      log(renderSummary({ fact: s.fact, slot, jackpot: s.jackpot }) + `  ${s.prompt.mechanism}`);
    }
  }

  if (!dryRun) saveState(state);

  return {
    sent,
    inbox,
    ingest,
    dateString,
    localTime: localTimeString(now, config.timezone),
    schedule,
  };
}
