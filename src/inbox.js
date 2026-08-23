// Inbound Telegram messages.
//
// Telegram is polled with getUpdates on the same schedule as the dispatcher, so
// replies are picked up without a webhook or a public endpoint. Every incoming
// message is routed to exactly one of three places: a logged night, a journal
// entry against the card that prompted it, or a command.

import { getUpdates, sendMessage } from './telegram.js';
import { parseEntry, buildCoachResponse } from './coach.js';
import { addJournalEntry, addSleepEntry, sleepSeries, readJournal } from './journal.js';
import { morningPrompt } from './prompts.js';
import { localDateString } from './time.js';

const PENDING_KEEP = 12;

/** Record a sent card so a later reply can be matched back to it. */
export function trackPending(state, record) {
  state.pending = [record, ...(state.pending ?? [])].slice(0, PENDING_KEEP);
  return state;
}

function matchPending(state, message) {
  const pending = state.pending ?? [];
  const replyTo = message.reply_to_message?.message_id;
  if (replyTo) {
    const exact = pending.find((p) => p.messageId === replyTo);
    if (exact) return exact;
  }
  return pending[0] ?? null;
}

/** True when today's intake has been sent but no night logged for it yet. */
function intakeOpen(state, dateString) {
  const sent = state.sends?.[dateString]?.intake;
  if (!sent || sent.status !== 'sent') return false;
  return !sleepSeries().some((e) => e.date === dateString);
}

function helpText() {
  return [
    'SLEEP OS  //  COMMANDS',
    '',
    '/today   today\'s cadence and what has fired',
    '/stats   rotation, streak and journal totals',
    '/log 84  log last night (score, optional hours, optional 1-5 feel)',
    '/help    this message',
    '',
    'Any other reply is logged as a journal entry against the last card sent.',
  ].join('\n');
}

async function handleSleepEntry({ token, chatId, text, state, dateString, log }) {
  const parsed = parseEntry(text);
  if (!parsed.ok) {
    await sendMessage(token, chatId, `Could not read that — ${parsed.reason}.\n\nTry: 84   or   84 7.5   or   84 7.5 4`);
    return { type: 'parse-error' };
  }

  const history = sleepSeries().filter((e) => e.date !== dateString);
  addSleepEntry({ date: dateString, score: parsed.score, hours: parsed.hours, feel: parsed.feel, source: 'manual' });

  const rotation = state.coachRotation ?? 0;
  const prompt = morningPrompt(rotation);
  const response = buildCoachResponse({ entry: parsed, history, rotation, morningPrompt: prompt });

  const sent = await sendMessage(token, chatId, response.text);
  state.coachRotation = rotation + 1;
  trackPending(state, {
    messageId: sent.message_id,
    kind: 'morning-prompt',
    promptId: prompt.id,
    mechanism: prompt.mechanism,
    slot: 'intake',
    at: new Date().toISOString(),
  });

  log(`logged night ${dateString}: score=${parsed.score} hours=${parsed.hours} feel=${parsed.feel} → lever ${response.lever}`);
  return { type: 'sleep-entry', ...response };
}

/**
 * Drain the update queue and act on anything new.
 * Returns a summary of what was handled.
 */
export async function processInbox({ config, state, token, chatId, now = new Date(), log = console.log }) {
  const updates = await getUpdates(token, state.inboxOffset ?? 0);
  const dateString = localDateString(now, config.timezone);
  const handled = [];

  for (const update of updates) {
    state.inboxOffset = update.update_id + 1;

    const message = update.message ?? update.edited_message;
    const text = message?.text?.trim();
    if (!text) continue;
    if (String(message.chat?.id) !== String(chatId)) continue;

    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.split(/\s+/);
      if (cmd === '/help' || cmd === '/start') {
        await sendMessage(token, chatId, helpText());
        handled.push({ type: 'command', cmd });
        continue;
      }
      if (cmd === '/log') {
        const body = rest.join(' ');
        handled.push(await handleSleepEntry({ token, chatId, text: body, state, dateString, log }));
        continue;
      }
      if (cmd === '/today' || cmd === '/stats') {
        // Rendered by the dispatcher, which already holds the schedule.
        handled.push({ type: 'command', cmd, defer: true });
        continue;
      }
      await sendMessage(token, chatId, `Unknown command ${cmd}.\n\n${helpText()}`);
      handled.push({ type: 'command', cmd, unknown: true });
      continue;
    }

    // A number-led reply while today's intake is open is a logged night;
    // anything else is reflection against the last card.
    const looksNumeric = /^\s*\d/.test(text);
    if (looksNumeric && intakeOpen(state, dateString)) {
      handled.push(await handleSleepEntry({ token, chatId, text, state, dateString, log }));
    } else {
      const context = matchPending(state, message);
      addJournalEntry({
        date: dateString,
        text,
        factId: context?.factId ?? null,
        promptId: context?.promptId ?? null,
        mechanism: context?.mechanism ?? null,
        slot: context?.slot ?? null,
      });
      log(`journal entry logged${context?.promptId ? ` against ${context.promptId}` : ''}`);
      handled.push({ type: 'journal', promptId: context?.promptId ?? null });
    }
  }

  return { handled, count: handled.length, journalTotal: readJournal().length };
}

export { helpText };
