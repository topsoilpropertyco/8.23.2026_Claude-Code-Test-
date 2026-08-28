// The anchor through the real outbound path, live rather than dry.
//
// WHY THIS FILE EXISTS. A mutation test deleted the card send from dispatch.js
// outright and the whole suite stayed green. The dry-run branch logs its own
// "[+ the B E card]" marker from separate code, so it can never witness what
// the live branch actually does -- and the live branch is the only one that
// runs in production. This exercises the real one with the senders injected.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SLEEPOS_STATE_DIR = mkdtempSync(join(tmpdir(), 'sleep-os-anchor-dispatch-'));
process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = '42';

const { dispatch } = await import('../src/dispatch.js');
const { ANCHOR_TEXT, CARD } = await import('../src/anchor.js');

/** One forced slot down the live path, with nothing real reached. */
const fire = async (slot) => {
  const sends = [];
  const cards = [];
  await dispatch({
    force: slot,
    dryRun: false,
    skipInbox: true,
    allowIngest: false,
    log: () => {},
    send: async (_t, _c, text) => { sends.push(text); return { message_id: sends.length }; },
    sendCard: async (_t, _c, path) => { cards.push(path); },
  });
  return { sends, cards };
};

test('every cue carries the anchor text on the live path', async () => {
  for (const slot of ['intake', 'morning_light', 'morning_reflection',
                      'midday_essentialism', 'afternoon_boundary',
                      'evening_winddown', 'blue_blockers',
                      'work_shutdown', 'terminal_bedtime']) {
    const { sends } = await fire(slot);
    assert.equal(sends.length, 1, `${slot} sent ${sends.length} messages`);
    assert.ok(sends[0].endsWith(ANCHOR_TEXT), `${slot} shipped without the anchor`);
    assert.ok(sends[0].length > ANCHOR_TEXT.length + 10, `${slot} lost its own content`);
  }
});

test('the card really is uploaded on the slots that carry it', async () => {
  for (const slot of ['midday_essentialism', 'evening_winddown', 'blue_blockers',
                      'work_shutdown', 'terminal_bedtime']) {
    const { cards } = await fire(slot);
    assert.deepEqual(cards, [CARD], `${slot} did not upload the card`);
  }
});

test('and really is not, on the slots that do not', async () => {
  for (const slot of ['intake', 'morning_light', 'morning_reflection', 'afternoon_boundary']) {
    const { cards } = await fire(slot);
    assert.deepEqual(cards, [], `${slot} uploaded the card and should not have`);
  }
});

test('the text goes before the picture', async () => {
  // Order matters on a phone: the instruction should be the thing already on
  // screen when the image finishes loading, not the other way round.
  const order = [];
  await dispatch({
    force: 'terminal_bedtime', dryRun: false, skipInbox: true, allowIngest: false, log: () => {},
    send: async () => { order.push('text'); return { message_id: 1 }; },
    sendCard: async () => { order.push('card'); },
  });
  assert.deepEqual(order, ['text', 'card']);
});

test('a failed card upload does not fail the cue', async () => {
  // THE PROPERTY THIS PROTECTS. If the upload could throw, the slot would fail,
  // the state record saying the cue was delivered would never be written, and
  // the next poll would send the entire cue again -- a duplicate every 25
  // seconds until the upload started working.
  const sends = [];
  await dispatch({
    force: 'work_shutdown', dryRun: false, skipInbox: true, allowIngest: false, log: () => {},
    send: async (_t, _c, text) => { sends.push(text); return { message_id: 1 }; },
    sendCard: async () => { throw new Error('HTTP 413 Request Entity Too Large'); },
  });
  assert.equal(sends.length, 1, 'the reminder must survive a broken upload');
  assert.ok(sends[0].endsWith(ANCHOR_TEXT));
});
