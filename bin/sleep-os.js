#!/usr/bin/env node
// Sleep OS command line.
//
//   preview   render every slot for today without sending
//   today     show today's jittered schedule and delivery status
//   dispatch  send anything currently due (this is what the cron runs)
//   send      force one slot immediately, e.g. `npm run send -- work_shutdown`
//   whoami    verify the bot token and discover your chat id
//   stats     rotation and delivery history

import { loadLibraries, loadConfig } from '../src/facts.js';
import { buildDaySchedule } from '../src/schedule.js';
import { selectFact } from '../src/selector.js';
import { selectPrompt, intakeRequest } from '../src/prompts.js';
import { renderMessage, renderIntake } from '../src/render.js';
import { readJournal, sleepSeries } from '../src/journal.js';
import { dispatch } from '../src/dispatch.js';
import { getMe, getUpdates } from '../src/telegram.js';
import { loadState, sentSlotsFor, readHistory } from '../src/state.js';
import { localDateString, localTimeString } from '../src/time.js';

const [command = 'today', ...args] = process.argv.slice(2);

function banner(title) {
  console.log(`\n\x1b[38;2;123;175;212m${title}\x1b[0m`);
  console.log('\x1b[38;2;138;153;173m' + '─'.repeat(title.length) + '\x1b[0m');
}

async function cmdToday() {
  const config = loadConfig();
  const now = new Date();
  const dateString = localDateString(now, config.timezone);
  const schedule = buildDaySchedule(config, dateString);
  const state = loadState();
  const sent = sentSlotsFor(state, dateString);
  const records = state.sends?.[dateString] ?? {};

  banner(`Sleep OS · ${dateString} · ${localTimeString(now, config.timezone)} ${config.timezone}`);
  for (const slot of schedule) {
    const rec = records[slot.id];
    const past = now >= slot.targetAt;
    const mark = rec?.status === 'sent' ? '✓' : rec?.status === 'missed' ? '×' : past ? '!' : '·';
    const detail = rec?.factId ? `${rec.factId}${rec.jackpot ? ' JACKPOT' : ''}` : past && !rec ? 'due' : 'pending';
    const jitter = `${slot.offsetMinutes >= 0 ? '+' : ''}${slot.offsetMinutes}m`;
    console.log(
      `  ${mark} ${slot.targetLabel.padStart(8)}  (${slot.anchorLabel.trim()} ${jitter})`.padEnd(34) +
        `${slot.id.padEnd(20)} ${detail}`,
    );
  }

  const remaining = state.remaining?.length;
  console.log(
    `\n  rotation: cycle ${state.cycle ?? 0}` +
      (remaining === undefined || remaining === null ? ' · not started' : ` · ${remaining} facts left in cycle`),
  );
}

async function cmdPreview() {
  const config = loadConfig();
  const { facts } = loadLibraries();
  const now = new Date();
  const dateString = localDateString(now, config.timezone);
  const schedule = buildDaySchedule(config, dateString);

  // Preview walks a scratch copy of state so it never consumes the rotation.
  let scratch = { ...loadState() };
  let lastMechanism = null;
  banner(`Preview · ${dateString} · ${config.timezone}`);
  for (const slot of schedule) {
    console.log(`\n${'─'.repeat(66)}`);
    if (slot.type === 'intake') {
      console.log(renderIntake({ slot, request: intakeRequest() }));
      continue;
    }
    const choice = selectFact({ facts, state: scratch, slotId: slot.id, dateString, config });
    const p = selectPrompt({ state: scratch, slotId: slot.id, lastMechanism });
    scratch = {
      ...scratch,
      cycle: choice.cycle,
      remaining: choice.remaining,
      promptCycle: p.promptCycle,
      promptRemaining: p.promptRemaining,
    };
    lastMechanism = p.prompt.mechanism;
    console.log(renderMessage({ fact: choice.fact, slot, jackpot: choice.jackpot, prompt: p.prompt }));
  }
  console.log(`\n${'─'.repeat(66)}`);
  console.log('\nPreview only. Rotation state was not advanced.');
}

async function cmdWhoami() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not set.\n');
    console.error('  1. Open Telegram, message @BotFather, send /newbot');
    console.error('  2. Copy the token it gives you');
    console.error('  3. export TELEGRAM_BOT_TOKEN="123456:ABC..."');
    console.error('  4. Send your new bot any message, then re-run this command');
    process.exit(1);
  }
  const me = await getMe(token);
  banner('Bot');
  console.log(`  @${me.username} (${me.first_name})`);

  const updates = await getUpdates(token);
  const chats = new Map();
  for (const u of updates) {
    const msg = u.message ?? u.edited_message ?? u.channel_post;
    if (msg?.chat) chats.set(msg.chat.id, msg.chat);
  }

  banner('Chats that have messaged this bot');
  if (chats.size === 0) {
    console.log('  none yet — open Telegram, send your bot a message, then re-run');
    return;
  }
  for (const chat of chats.values()) {
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || chat.username;
    console.log(`  ${String(chat.id).padEnd(16)} ${name}`);
  }
  console.log('\n  Use the id above as TELEGRAM_CHAT_ID.');
}

async function cmdJournal() {
  const entries = readJournal().slice(-15).reverse();
  const nights = sleepSeries();

  banner(`Journal · ${readJournal().length} entries`);
  if (entries.length === 0) {
    console.log('  none yet — reply to any card in Telegram and it lands here');
  }
  for (const e of entries) {
    console.log(`\n  ${e.date}  ${e.mechanism ?? 'unprompted'}${e.factId ? `  (${e.factId})` : ''}`);
    console.log(`  ${e.text}`);
  }

  banner(`Sleep log · ${nights.length} nights`);
  for (const n of nights.slice(-10)) {
    console.log(`  ${n.date}  score ${String(n.score ?? '—').padStart(3)}  ${n.hours ? n.hours + 'h' : '   '}  ${n.feel ? 'feel ' + n.feel : ''}`);
  }
}

async function cmdStats() {
  const { facts } = loadLibraries();
  const state = loadState();
  const history = readHistory();
  const delivered = history.filter((h) => h.status === 'sent');

  banner('Library');
  const sleep = facts.filter((f) => f.library === 'sleep').length;
  const lucid = facts.filter((f) => f.library === 'lucid').length;
  console.log(`  ${facts.length} facts · ${sleep} sleep science / ${lucid} lucid`);
  console.log(`  ${facts.filter((f) => f.intensity === 'high').length} high-intensity (jackpot eligible)`);
  console.log(`  full cycle: ${facts.length} sends ≈ ${(facts.length / 6).toFixed(1)} days at 6/day`);

  banner('Rotation');
  console.log(`  cycle ${state.cycle ?? 0} · ${state.remaining?.length ?? facts.length} facts remaining`);

  banner('Delivered');
  console.log(`  ${delivered.length} notifications`);
  if (delivered.length) {
    const counts = new Map();
    for (const h of delivered) counts.set(h.factId, (counts.get(h.factId) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`  ${delivered.filter((h) => h.jackpot).length} jackpot drops`);
    console.log(`  ${counts.size}/${facts.length} distinct facts seen`);
    if (top.length) console.log(`  most sent: ${top.map(([id, n]) => `${id}×${n}`).join(', ')}`);
  }

  if (facts.length < 90) {
    banner('Note');
    console.log(`  The library loops every ${(facts.length / 6).toFixed(1)} days at full cadence.`);
    console.log('  Add facts to data/facts.*.json to widen the loop.');
  }
}

try {
  switch (command) {
    case 'today':
      await cmdToday();
      break;
    case 'preview':
      await cmdPreview();
      break;
    case 'dispatch':
      await dispatch({ dryRun: args.includes('--dry-run') });
      break;
    case 'send': {
      const slot = args.find((a) => !a.startsWith('--'));
      if (!slot) throw new Error('Usage: npm run send -- <slot_id> [--dry-run]');
      await dispatch({ force: slot, dryRun: args.includes('--dry-run') });
      break;
    }
    case 'whoami':
      await cmdWhoami();
      break;
    case 'stats':
      await cmdStats();
      break;
    case 'journal':
      await cmdJournal();
      break;
    default:
      console.error(`Unknown command "${command}". Try: today, preview, dispatch, send, whoami, stats, journal`);
      process.exit(1);
  }
} catch (err) {
  console.error(`\n${err.message}\n`);
  process.exit(1);
}
