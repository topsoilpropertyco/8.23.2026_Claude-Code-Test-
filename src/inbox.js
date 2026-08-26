// Inbound Telegram messages.
//
// Telegram is polled with getUpdates on the same schedule as the dispatcher, so
// replies are picked up without a webhook or a public endpoint. Every incoming
// message is routed to exactly one of three places: a logged night, a journal
// entry against the card that prompted it, or a command.

import { getUpdates, sendMessage } from './telegram.js';
import { parseEntry, buildCoachResponse, buildCoachResponseAsync } from './coach.js';
import { addJournalEntry, addSleepEntry, sleepSeries, readJournal, journalStreak, logHealth } from './journal.js';
import { buildAffirmation } from './affirm.js';
import { writeAffirmation } from './affirmllm.js';
import { prepareHabit } from './habits.js';
import { renderHabit } from './render.js';
import { recordSend } from './state.js';
import { morningPrompt, loadPrompts } from './prompts.js';
import { localDateString, localTimeString, formatClock12 } from './time.js';
import { buildDaySchedule } from './schedule.js';
import { loadLibraries, loadConfig } from './facts.js';

const PENDING_KEEP = 12;

// A ceiling on model-written journal replies per day. Not about money -- these
// cost a fraction of a cent each -- but about blast radius. Every inbound
// message now triggers an outbound API call, and the one thing that must not be
// possible is a loop that discovers itself at three in the morning. Past the
// cap the library still answers, so nothing goes silent.
const MODEL_REPLIES_PER_DAY = 40;

function replyBudget(config) {
  const n = config?.coach?.maxWrittenRepliesPerDay;
  return Number.isFinite(n) && n >= 0 ? n : MODEL_REPLIES_PER_DAY;
}

/**
 * The text of the card he was answering, looked up rather than stored.
 *
 * The pending record keeps the prompt id, not the prose. Resolving it here
 * means old pending records written before this feature existed still produce a
 * card-aware reply, and there is one copy of the text rather than two that can
 * drift.
 */
function promptTextFor(promptId) {
  if (!promptId) return null;
  try {
    return loadPrompts().prompts.find((p) => p.id === promptId)?.text ?? null;
  } catch {
    return null;
  }
}

function allowModelReply(state, dateString, config) {
  const used = state.writtenReplies?.date === dateString ? state.writtenReplies.count : 0;
  return used < replyBudget(config);
}

function countModelReply(state, dateString) {
  const current = state.writtenReplies?.date === dateString ? state.writtenReplies : { date: dateString, count: 0 };
  current.count += 1;
  state.writtenReplies = current;
}

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

/**
 * The reply to something that arrived with no words in it.
 *
 * Warm, brief, and honest about the limit rather than pretending there isn't
 * one. Naming the caption route matters: it is the difference between "this is
 * broken" and "there is a way to do what you just tried".
 */
function unreadableMessage(kind) {
  if (kind === 'voice') {
    return [
      'Got the voice note — but I can only read text right now, so I have not logged it.',
      '',
      'Type it, even roughly, and it goes in the journal and comes back answered.',
    ].join('\n');
  }
  return [
    `Got the ${kind}. There were no words with it, so there is nothing to log yet.`,
    '',
    'Add a caption next time, or send a line of text — either one becomes a journal entry.',
  ].join('\n');
}

function helpText() {
  return [
    'SLEEP OS  //  COMMANDS',
    '',
    '/status  is the engine alive, and what fires next',
    '/today   today\'s full cadence and what has fired',
    '/stats   library, rotation and journal totals',
    '/log 84  log last night (score, optional hours, optional 1-5 feel)',
    '/help    this message',
    '',
    'Any other reply is logged as a journal entry against the last card sent.',
  ].join('\n');
}

function since(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}

/**
 * The health check. Answering this over Telegram is deliberate -- it means the
 * only tool needed to confirm the engine is alive is the same phone the
 * notifications land on. A reply proves the workflow ran, reached GitHub's
 * runner, read the inbox and sent a message, which is the whole chain.
 */
function statusText({ config, state, now }) {
  const dateString = localDateString(now, config.timezone);
  const schedule = buildDaySchedule(config, dateString);
  const records = state.sends?.[dateString] ?? {};
  const delivered = Object.values(records).filter((r) => r.status === 'sent');
  const next = schedule.find((s) => !records[s.id] && now < s.targetAt);

  const allSends = Object.entries(state.sends ?? {})
    .flatMap(([d, slots]) => Object.entries(slots).map(([id, r]) => ({ date: d, id, ...r })))
    .filter((r) => r.status === 'sent' && r.at)
    .sort((a, b) => b.at.localeCompare(a.at));
  const last = allSends[0];

  const lines = [
    'SLEEP OS  //  STATUS',
    '',
    `Engine alive · ${localTimeString(now, config.timezone)} ${dateString}`,
    '',
    `Today: ${delivered.length} of ${schedule.length} delivered`,
  ];

  if (next) {
    lines.push(`Next: ${next.name.replace(/^\d+:\s*/, '')} at ${next.targetLabel} (in ${since(next.targetAt - now)})`);
  } else {
    lines.push('Next: cadence complete, resets at 6:00 AM');
  }

  if (last) {
    lines.push('');
    lines.push(`Last send: ${last.targetLabel ?? last.id} · ${last.factId ?? last.kind} · ${since(now - new Date(last.at))} ago`);
  }

  const { facts } = loadLibraries();
  lines.push('');
  lines.push(`Rotation: cycle ${state.cycle ?? 0} · ${state.remaining?.length ?? facts.length}/${facts.length} facts left`);
  lines.push(`Journal: ${readJournal().length} entries · ${sleepSeries().length} nights logged`);

  return lines.join('\n');
}

function todayText({ config, state, now }) {
  const dateString = localDateString(now, config.timezone);
  const schedule = buildDaySchedule(config, dateString);
  const records = state.sends?.[dateString] ?? {};

  const lines = [`SLEEP OS  //  ${dateString}`, ''];
  for (const slot of schedule) {
    const r = records[slot.id];
    const mark = r?.status === 'sent' ? '[x]' : r?.status === 'missed' ? '[-]' : now >= slot.targetAt ? '[!]' : '[ ]';
    const detail = r?.factId ? ` ${r.factId}${r.jackpot ? ' JACKPOT' : ''}` : '';
    lines.push(`${mark} ${slot.targetLabel.padStart(8)}  ${slot.name.replace(/^\d+:\s*/, '')}${detail}`);
  }
  return lines.join('\n');
}

function statsText({ state }) {
  const { facts } = loadLibraries();
  const nights = sleepSeries();
  const journal = readJournal();

  const mechanisms = {};
  for (const e of journal) if (e.mechanism) mechanisms[e.mechanism] = (mechanisms[e.mechanism] ?? 0) + 1;
  const top = Object.entries(mechanisms).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const lines = [
    'SLEEP OS  //  STATS',
    '',
    `Library: ${facts.length} facts · ${facts.filter((f) => f.library === 'sleep').length} sleep / ${facts.filter((f) => f.library === 'lucid').length} lucid`,
    `Cycle ${state.cycle ?? 0} · ${state.remaining?.length ?? facts.length} facts remaining`,
    `Full loop: ${(facts.length / 7).toFixed(1)} days at current cadence`,
    '',
    `Journal: ${journal.length} entries`,
    `Nights logged: ${nights.length}`,
  ];
  if (nights.length) {
    const scores = nights.map((n) => n.score).filter((s) => typeof s === 'number');
    if (scores.length) {
      lines.push(`Average score: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}`);
    }
  }
  if (top.length) {
    lines.push('');
    lines.push(`Most answered: ${top.map(([m, n]) => `${m.replace(/_/g, ' ')} ×${n}`).join(', ')}`);
  }
  return lines.join('\n');
}


/**
 * Send the morning-light habit now, if it has not already gone out today.
 *
 * Returns false when it was already sent, when the slot is disabled, or when
 * the send fails -- never throws. The intake reply must land even if this does
 * not, and the anchor will pick it up later regardless.
 */
export async function cueMorningLight({ token, chatId, state, dateString, log = () => {},
                                        send = sendMessage, config = loadConfig() }) {
  const slot = config.slots.find((s) => s.id === 'morning_light');
  if (!slot || slot.enabled === false) return false;
  if (state.sends?.[dateString]?.morning_light) return false;   // anchor already fired

  try {
    const prepared = prepareHabit({ slot, state, dateString });
    const text = renderHabit({
      habit: prepared.habit,
      slot: { ...slot, targetLabel: 'on waking' },
      why: prepared.why,
      showOptional: prepared.showOptional,
    });
    await send(token, chatId, text);

    state.habitRotation = { ...(state.habitRotation ?? {}), ...prepared.rotation };
    recordSend(state, dateString, 'morning_light',
      { status: 'sent', ...prepared.record, trigger: 'intake-reply', at: new Date().toISOString() });
    log(`morning light cued on intake reply (${prepared.record.whyId})`);
    return true;
  } catch (err) {
    log(`morning light cue failed: ${err.message}`);
    return false;
  }
}

/** What to say when the personal logs will not decode. */
export function blindLogMessage(health) {
  const lines = [
    'SLEEP OS  //  CANNOT READ YOUR LOG',
    '',
    `${health.unreadable} record(s) on disk did not decode, so nothing was written.`,
    '',
  ];
  if (!health.keyPresent) {
    lines.push('SLEEPOS_DATA_KEY is not set on the runner. Your history is encrypted, not lost.');
  } else if (health.totallyBlind) {
    lines.push('SLEEPOS_DATA_KEY is set but decodes nothing, so it is the wrong key.');
    lines.push('Writing now would split your log across two keys. Restore the original key.');
  } else {
    lines.push('Some records failed to authenticate — likely a partial key change.');
  }
  lines.push('');
  lines.push('Run: npm run doctor');
  return lines.join('\n');
}

async function handleSleepEntry({ token, chatId, text, state, dateString, log, send = sendMessage }) {
  const parsed = parseEntry(text);
  if (!parsed.ok) {
    await send(token, chatId, `Could not read that — ${parsed.reason}.\n\nTry: 84   or   84 7.5   or   84 7.5 4`);
    return { type: 'parse-error' };
  }

  // Refuse to write only when the log is TOTALLY blind: records exist and not
  // one of them decoded, which means the key is missing or wrong. Appending then
  // would succeed under the new key and quietly split the history in two.
  //
  // Deliberately NOT triggered by a partial failure. decryptLine has always
  // tolerated an individual corrupt record ("skipping it is better than failing
  // the whole run"), so blocking on `!health.ok` would let one bad legacy line
  // refuse every future entry -- turning a benign, already-handled condition
  // into a total logging outage. Partial damage warns; it does not block.
  const health = logHealth();
  if (health.totallyBlind) {
    await send(token, chatId, blindLogMessage(health));
    log?.({ type: 'sleep-entry-refused', unreadable: health.unreadable });
    return { type: 'log-unreadable', unreadable: health.unreadable };
  }

  const history = sleepSeries().filter((e) => e.date !== dateString);
  addSleepEntry({ date: dateString, score: parsed.score, hours: parsed.hours, feel: parsed.feel, source: 'manual' });

  const rotation = state.coachRotation ?? 0;
  const prompt = morningPrompt(rotation);
  // The written coach, which falls back to the rule-based one on any failure --
  // no key, no network, or a number it could not account for. Awaiting it costs
  // a few seconds on the one message of the day worth waiting a few seconds for.
  const response = await buildCoachResponseAsync({
    entry: parsed, history, rotation, morningPrompt: prompt, date: dateString, log,
  });

  const sent = await send(token, chatId, response.text);
  state.coachRotation = rotation + 1;

  // Whether the written coach actually ran, recorded where it can be read
  // without a key. A silent fallback is the right behaviour for the reader and
  // the wrong behaviour for the operator: a secret that has never once worked
  // produces exactly the message a working one produces on an ordinary day.
  // Operational only -- provider, outcome, and a truncated reason. No score, no
  // vital, nothing he wrote.
  state.coach = {
    at: new Date().toISOString(),
    written: Boolean(response.written),
    provider: response.provider ?? null,
    model: response.model ?? null,
    intensity: response.intensity ?? null,
    reason: response.written ? null : (response.reason ?? 'no key configured').slice(0, 200),
  };
  trackPending(state, {
    messageId: sent.message_id,
    kind: 'morning-prompt',
    promptId: prompt.id,
    mechanism: prompt.mechanism,
    slot: 'intake',
    at: new Date().toISOString(),
  });

  // The morning-light cue rides out on the back of this reply. Logging your
  // sleep is the first thing you do awake, which makes it a far better wake
  // signal than a clock: the anchor has to guess, this knows. The anchor stays
  // as a backstop for mornings you do not log.
  const cued = await cueMorningLight({ token, chatId, state, dateString, log, send });

  log(`logged night ${dateString}: score=${parsed.score} hours=${parsed.hours} feel=${parsed.feel}` +
      ` → lever ${response.lever} · ${response.written ? `written (${response.intensity})` : 'rule-based'}`);
  return { type: 'sleep-entry', morningLightCued: cued, ...response };
}

/**
 * Drain the update queue and act on anything new.
 *
 * An update is acknowledged only once it has actually been handled. If a
 * handler throws -- most likely because the data key is not configured yet and
 * a journal write refuses to fall back to plaintext -- the message stays in
 * Telegram's queue and a later run picks it up, rather than being lost.
 */
export async function processInbox({
  config, state, token, chatId, now = new Date(), log = console.log,
  // Injected so the failure paths can be exercised in tests. Defaults are the
  // real Telegram calls, so every existing call site is unchanged.
  send = sendMessage, fetchUpdates = getUpdates, pollTimeout = 0,
} = {}) {
  const updates = await fetchUpdates(token, state.inboxOffset ?? 0, { timeout: pollTimeout });
  const dateString = localDateString(now, config.timezone);
  const handled = [];

  for (const update of updates) {
    const message = update.message ?? update.edited_message;
    // A caption is text he wrote. A photo of the bedroom thermostat with
    // "finally got it to 65" attached is a journal entry, and reading only
    // `.text` threw the sentence away along with the picture.
    const text = (message?.text ?? message?.caption)?.trim();
    const ack = () => {
      state.inboxOffset = update.update_id + 1;
    };

    // Not his chat: acknowledge and move on. Nothing is owed to a stranger.
    if (String(message?.chat?.id) !== String(chatId)) {
      ack();
      continue;
    }

    // His message, but nothing readable in it -- a voice note, a photo with no
    // caption, a sticker. This used to acknowledge and say nothing, which is
    // the one outcome this whole layer exists to prevent. Silence after you
    // deliberately sent something reads as broken, and it is indistinguishable
    // from broken. So it answers, and it says what it can and cannot do.
    if (!text) {
      const kind = message.voice || message.audio ? 'voice'
        : message.photo ? 'photo'
        : message.video || message.video_note ? 'video'
        : message.document ? 'file'
        : 'that';
      await send(token, chatId, unreadableMessage(kind)).catch(() => {});
      log(`non-text message (${kind}) acknowledged`);
      handled.push({ type: 'unreadable', kind });
      ack();
      continue;
    }

    try {
      if (text.startsWith('/')) {
        const [cmd, ...rest] = text.split(/\s+/);

        if (cmd === '/help' || cmd === '/start') {
          await send(token, chatId, helpText());
          handled.push({ type: 'command', cmd });
        } else if (cmd === '/status') {
          await send(token, chatId, statusText({ config, state, now }));
          handled.push({ type: 'command', cmd });
        } else if (cmd === '/today') {
          await send(token, chatId, todayText({ config, state, now }));
          handled.push({ type: 'command', cmd });
        } else if (cmd === '/stats') {
          await send(token, chatId, statsText({ state }));
          handled.push({ type: 'command', cmd });
        } else if (cmd === '/log') {
          handled.push(await handleSleepEntry({ token, chatId, text: rest.join(' '), state, dateString, log, send }));
        } else {
          await send(token, chatId, `Unknown command ${cmd}.\n\n${helpText()}`);
          handled.push({ type: 'command', cmd, unknown: true });
        }

        ack();
        continue;
      }

      // A number-led reply while today's intake is open is a logged night;
      // anything else is reflection against the last card sent.
      if (/^\s*\d/.test(text) && intakeOpen(state, dateString)) {
        handled.push(await handleSleepEntry({ token, chatId, text, state, dateString, log, send }));
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

        // Close the loop. This branch used to write the entry and say nothing,
        // which made the one path carrying the most effort the only silent one.
        const entries = readJournal();
        const streak = journalStreak(entries, dateString);
        const affirmation = buildAffirmation({
          text,
          mechanism: context?.mechanism ?? null,
          streak,
          state,
          dateString,
          journalTotal: entries.length,
        });

        // Then try to write one for this entry specifically. The library reply
        // above is already built and already good, so this is pure upside: if
        // the model is slow, broken, unfunded or says something with a number
        // in it that he did not, the library line ships instead and he sees no
        // difference. A milestone is the exception -- that line is the reward
        // and it should read the same every time it is earned.
        let replyText = affirmation.text;
        let source = 'library';
        if (affirmation.shape !== 'milestone' && allowModelReply(state, dateString, config)) {
          const written = await writeAffirmation({
            text,
            mechanism: context?.mechanism ?? null,
            promptText: promptTextFor(context?.promptId),
            slot: context?.slot ?? null,
            streak,
            journalTotal: entries.length,
            // The two entries before this one, for continuity -- so a reply can
            // notice that this is the third night he has said the same thing.
            recent: entries.slice(-3, -1).reverse()
              .map((e) => ({ date: e.date, wrote: String(e.text ?? '').slice(0, 300) }))
              .filter((e) => e.wrote.trim()),
            dateString,
            log,
          }).catch(() => null);
          if (written) {
            replyText = written.text;
            source = `${written.provider}:${written.level}`;
            countModelReply(state, dateString);
          }
        }
        // Best-effort, and deliberately so. The entry is already on disk; the
        // update is acknowledged below. If this send were allowed to throw, the
        // update would go unacknowledged and the next poll would write the same
        // entry again -- and on a persistent failure (a 400, say) it would keep
        // doing that every ten minutes forever. A missing affirmation is a far
        // smaller problem than a duplicated journal.
        let affirmed = `${affirmation.shape}/${source}`;
        try {
          await send(token, chatId, replyText);
        } catch (err) {
          affirmed = `FAILED (${err.message})`;
        }

        log(`journal entry logged${context?.promptId ? ` against ${context.promptId}` : ''}` +
            ` → ${affirmed} @${affirmation.intensity}${affirmation.streakShown ? ` +streak ${streak}` : ''}`);
        handled.push({
          type: 'journal',
          promptId: context?.promptId ?? null,
          affirmed,
          streak,
        });
      }

      ack();
    } catch (err) {
      // Leave this update unacknowledged and stop: processing later messages
      // out of order would scramble the journal's sequence.
      log(`inbox: could not handle update ${update.update_id} (${err.message}); leaving it queued`);
      break;
    }
  }

  return { handled, count: handled.length, journalTotal: readJournal().length };
}

export { helpText };
