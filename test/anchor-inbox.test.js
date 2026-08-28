// The anchor through the real inbound path.
//
// test/anchor.test.js covers the policy in isolation. This covers the wiring:
// that processInbox actually appends the text to what it sends, and actually
// reaches for the card after dark. Those are two different failures -- a
// correct policy that nothing calls is still a feature that does not exist.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SLEEPOS_STATE_DIR = mkdtempSync(join(tmpdir(), 'sleep-os-anchor-'));
process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';

const { processInbox, trackPending } = await import('../src/inbox.js');
const { loadConfig } = await import('../src/facts.js');
const { ANCHOR_TEXT, CARD } = await import('../src/anchor.js');

const CONFIG = loadConfig();

/**
 * One inbound message through the real processInbox.
 *
 * sendCard is always injected. The production default is the real Telegram
 * upload, so a test that runs after the evening hour and forgets to pass a stub
 * would make a live network call with a fake token -- harmless, because
 * sendAnchorCard swallows the failure, but it would be a real request from a
 * test suite, which is not acceptable.
 */
const inbound = async ({ text, atUtc }) => {
  const sends = [];
  const cards = [];
  const state = { inboxOffset: 0, pending: [] };
  trackPending(state, {
    messageId: 1, kind: 'card', promptId: 'p01',
    mechanism: 'implementation_intention', slot: 'work_shutdown', at: atUtc,
  });
  await processInbox({
    config: CONFIG, state, token: 'x', chatId: '42',
    now: new Date(atUtc), log: () => {},
    send: async (_t, _c, body) => { sends.push(body); return { message_id: sends.length + 1 }; },
    sendCard: async (_t, _c, path) => { cards.push(path); },
    fetchUpdates: async () => [{
      update_id: 9001,
      message: { message_id: 9001, chat: { id: 42 }, text },
    }],
  });
  return { sends, cards };
};

// America/Detroit is UTC-4 in August.
const EVENING = '2026-08-26T02:10:00Z'; // 10:10 PM the previous evening, local
const AFTERNOON = '2026-08-26T18:20:00Z'; // 2:20 PM local

test('a journal entry comes back carrying the anchor', async () => {
  const { sends } = await inbound({
    text: 'Shut the laptop at nine and the evening felt different.',
    atUtc: AFTERNOON,
  });
  assert.equal(sends.length, 1, 'a journal entry must never be met with silence');
  assert.ok(sends[0].endsWith(ANCHOR_TEXT), `no anchor on the reply: ${sends[0]}`);
  assert.ok(sends[0].length > ANCHOR_TEXT.length, 'the reply itself should still be there');
});

test('a command reply carries the anchor too', async () => {
  // /help, /status and the rest are messages. "Every message" has to include
  // the ones nobody thinks of as messages, which is why the sender is wrapped
  // at the seam rather than at each of the eleven call sites.
  const { sends } = await inbound({ text: '/help', atUtc: AFTERNOON });
  assert.equal(sends.length, 1);
  assert.match(sends[0], /COMMANDS/);
  assert.ok(sends[0].endsWith(ANCHOR_TEXT), `no anchor on /help: ${sends[0]}`);
});

test('a message that cannot be read still carries the anchor', async () => {
  const { sends } = await inbound({ text: '/notacommand', atUtc: AFTERNOON });
  assert.equal(sends.length, 1);
  assert.ok(sends[0].endsWith(ANCHOR_TEXT));
});

test('after dark the card comes back with the reply', async () => {
  // The "Distracted? Repeat 1 and 2" loop made real: writing to the bot at
  // 10pm is itself the distraction, so the answer is the instruction.
  const { sends, cards } = await inbound({
    text: 'Cannot settle, still thinking about tomorrow.',
    atUtc: EVENING,
  });
  assert.equal(sends.length, 1);
  assert.ok(sends[0].endsWith(ANCHOR_TEXT));
  assert.deepEqual(cards, [CARD], 'the card should have followed the reply');
});

test('before dark it does not', async () => {
  const { cards } = await inbound({
    text: 'Good afternoon, moved the shutdown earlier.',
    atUtc: AFTERNOON,
  });
  assert.deepEqual(cards, [], 'the card is for the evening, not the afternoon');
});

test('the anchor appears once, not twice', async () => {
  // processInbox wraps its sender and dispatch wraps its own. If withAnchor
  // were not idempotent, anything crossing both would print the block twice --
  // and a duplicated fixed reminder reads as a bug.
  const { sends } = await inbound({
    text: 'Logged the night and went straight up.',
    atUtc: AFTERNOON,
  });
  assert.equal(sends[0].match(/BE Top 1%/g).length, 1);
});
