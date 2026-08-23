// The dispatcher.
//
// Runs on a short polling interval and asks one question: is any slot due right
// now that has not already gone out today? Because the schedule is derived
// deterministically from the date, the poll can run as often as it likes
// without the target times moving.

import { loadLibraries, loadConfig } from './facts.js';
import { buildDaySchedule, dueSlots } from './schedule.js';
import { selectFact } from './selector.js';
import { renderMessage, renderSummary } from './render.js';
import { sendMessage } from './telegram.js';
import { loadState, saveState, sentSlotsFor, recordSend } from './state.js';
import { localDateString, localTimeString } from './time.js';

export async function dispatch({ now = new Date(), dryRun = false, force = null, log = console.log } = {}) {
  const config = loadConfig();
  const { facts } = loadLibraries();
  const state = loadState();

  const dateString = localDateString(now, config.timezone);
  const schedule = buildDaySchedule(config, dateString);
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

  if (targets.length === 0) {
    if (!dryRun) saveState(state);
    return { sent: [], dateString, localTime: localTimeString(now, config.timezone), schedule };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!dryRun && (!token || !chatId)) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set. Run: npm run whoami');
  }

  const sent = [];
  for (const slot of targets) {
    const choice = selectFact({ facts, state, slotId: slot.id, dateString, config });
    const text = renderMessage({ fact: choice.fact, slot, jackpot: choice.jackpot });

    if (dryRun) {
      log(`\n${'-'.repeat(64)}\n${text}\n${'-'.repeat(64)}`);
    } else {
      await sendMessage(token, chatId, text);
    }

    // Advance the rotation only after a successful send, so a delivery failure
    // does not silently burn a fact.
    state.cycle = choice.cycle;
    state.remaining = choice.remaining;
    recordSend(state, dateString, slot.id, {
      status: dryRun ? 'dry-run' : 'sent',
      factId: choice.fact.id,
      library: choice.fact.library,
      category: choice.fact.category,
      jackpot: choice.jackpot,
      cycle: choice.cycle,
      targetLabel: slot.targetLabel,
      at: new Date().toISOString(),
    }, { persist: !dryRun });

    sent.push({ slot, ...choice });
    log(renderSummary({ fact: choice.fact, slot, jackpot: choice.jackpot }));
  }

  if (!dryRun) saveState(state);
  return { sent, dateString, localTime: localTimeString(now, config.timezone), schedule };
}
