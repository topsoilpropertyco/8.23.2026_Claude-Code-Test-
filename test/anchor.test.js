import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHOR_TEXT, CARD, withAnchor, anchoredSend,
  imageDueForSlot, imageDueForReply, sendAnchorCard,
  DEFAULT_IMAGE_SLOTS,
} from '../src/anchor.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));

/* --- the words themselves ------------------------------------------------- */

test('the anchor is exactly the three lines he asked for', () => {
  // Verbatim on purpose. This is the one piece of copy in the system that is
  // not allowed to be improved, reworded, or made cleverer by a later pass --
  // the whole mechanism is that it is identical every time he reads it.
  assert.equal(ANCHOR_TEXT, 'BE Top 1%\n1. Get in bed.\n2. Close your eyes.');
});

test('the anchor rides out separated from the message, not glued to it', () => {
  const out = withAnchor('Deep sleep front-loads the night.');
  assert.equal(out, 'Deep sleep front-loads the night.\n\nBE Top 1%\n1. Get in bed.\n2. Close your eyes.');
});

test('trailing whitespace on the message does not double the gap', () => {
  assert.equal(withAnchor('Score 84.\n\n\n'), `Score 84.\n\n${ANCHOR_TEXT}`);
});

test('appending twice does not print the anchor twice', () => {
  // THE BUG THIS PREVENTS. The sends are layered: dispatch wraps its sender and
  // the inbox wraps its own, so a message that passes through both would carry
  // the block twice -- and the duplicate reads as a glitch, which is exactly
  // what a fixed reminder cannot afford.
  const once = withAnchor('Logged.');
  assert.equal(withAnchor(once), once);
  assert.equal(once.match(/BE Top 1%/g).length, 1);
});

test('an empty message becomes the anchor alone rather than a blank block', () => {
  assert.equal(withAnchor(''), ANCHOR_TEXT);
  assert.equal(withAnchor(null), ANCHOR_TEXT);
  assert.equal(withAnchor('   \n '), ANCHOR_TEXT);
});

test('anchoredSend puts it on everything leaving through the seam', async () => {
  const seen = [];
  const send = anchoredSend(async (token, chatId, text) => { seen.push(text); return { message_id: 1 }; });
  await send('t', 'c', 'Could not read that.');
  await send('t', 'c', helpLike());
  assert.equal(seen.length, 2);
  for (const s of seen) assert.ok(s.endsWith(ANCHOR_TEXT), `missing anchor: ${s}`);

  function helpLike() { return 'SLEEP OS  //  COMMANDS\n\n/status  is the engine alive'; }
});

test('anchoredSend forwards extra arguments and the return value', async () => {
  const send = anchoredSend(async (token, chatId, text, extra) => ({ token, chatId, text, extra }));
  const r = await send('T', 'C', 'hi', { keep: true });
  assert.equal(r.token, 'T');
  assert.equal(r.chatId, 'C');
  assert.deepEqual(r.extra, { keep: true });
});

/* --- which slots carry the picture ---------------------------------------- */

test('the picture goes at midday and from the evening wind-down on', () => {
  for (const id of ['midday_essentialism', 'evening_winddown', 'blue_blockers',
                    'work_shutdown', 'terminal_bedtime']) {
    assert.equal(imageDueForSlot(id, config), true, `${id} should carry the card`);
  }
});

test('the morning cues and the 4pm boundary stay text-only', () => {
  // afternoon_boundary is the deliberate gap. Without it the picture runs from
  // noon to bedtime unbroken, which is "all day" -- and a card seen all day
  // stops being an instruction and becomes wallpaper.
  for (const id of ['intake', 'morning_light', 'morning_reflection', 'afternoon_boundary']) {
    assert.equal(imageDueForSlot(id, config), false, `${id} should be text-only`);
  }
});

test('an unknown slot does not get the picture', () => {
  assert.equal(imageDueForSlot('some_future_slot', config), false);
  assert.equal(imageDueForSlot(undefined, config), false);
});

test('config drives the slot list, and its default matches the shipped config', () => {
  assert.deepEqual(config.anchor.imageSlots, DEFAULT_IMAGE_SLOTS);
  // An explicit override wins, so the shape can change without a code edit.
  const only = { anchor: { imageSlots: ['terminal_bedtime'] } };
  assert.equal(imageDueForSlot('terminal_bedtime', only), true);
  assert.equal(imageDueForSlot('midday_essentialism', only), false);
  // No anchor block at all falls back to the defaults rather than to nothing.
  assert.equal(imageDueForSlot('work_shutdown', {}), true);
});

/* --- replies after dark --------------------------------------------------- */

const at = (hhmm) => {
  // A wall clock in America/Detroit, which is UTC-4 in August. 22:00 local is
  // 02:00Z the NEXT day -- the case that makes a naive UTC hour check wrong.
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 7, 29, h + 4, m));
};

test('a message he sends after 6pm gets the card back', () => {
  for (const t of ['18:00', '19:30', '21:00', '22:00', '23:59']) {
    assert.equal(imageDueForReply(at(t), config), true, `${t} local should return the card`);
  }
});

test('a message before 6pm does not', () => {
  for (const t of ['00:30', '06:00', '08:00', '12:00', '16:00', '17:59']) {
    assert.equal(imageDueForReply(at(t), config), false, `${t} local should be text-only`);
  }
});

test('the cutoff is his local hour, not the runner UTC hour', () => {
  // THE BUG THIS CATCHES. The runner is UTC. 22:00 in Detroit is 02:00Z, so a
  // check written against getUTCHours() would call his 10pm message "2am" --
  // and 2am is before 18, so the card he most needs would never arrive.
  const tenPmLocal = at('22:00');
  assert.equal(tenPmLocal.getUTCHours(), 2, 'fixture should straddle midnight UTC');
  assert.equal(imageDueForReply(tenPmLocal, config), true);
});

test('the evening hour is configurable', () => {
  assert.equal(imageDueForReply(at('20:00'), { timezone: 'America/Detroit', anchor: { eveningFromHour: 21 } }), false);
  assert.equal(imageDueForReply(at('21:00'), { timezone: 'America/Detroit', anchor: { eveningFromHour: 21 } }), true);
});

/* --- the card upload can never take the message down ---------------------- */

test('a failed upload is reported and swallowed', async () => {
  // THE PROPERTY THIS PROTECTS. The text is the reminder; the picture is the
  // emphasis. If a Telegram hiccup on a 92 KB upload could throw, it would fail
  // the slot, skip the state record that says the cue was delivered, and the
  // next poll would send the whole cue again.
  const notes = [];
  const ok = await sendAnchorCard({
    token: 't', chatId: 'c', log: (m) => notes.push(m),
    sendPhoto: async () => { throw new Error('HTTP 429'); },
  });
  assert.equal(ok, false);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /HTTP 429/);
});

test('the committed card is what gets uploaded', async () => {
  const notes = [];
  let uploadedPath = null;
  const ok = await sendAnchorCard({
    token: 't', chatId: 'c', log: (m) => notes.push(m),
    sendPhoto: async (tok, chat, path) => { uploadedPath = path; },
  });
  assert.equal(ok, true);
  assert.equal(uploadedPath, CARD);
  assert.ok(readFileSync(CARD).length > 20_000, 'the committed card should be readable');
  assert.deepEqual(notes, [], 'a clean send should log nothing');
});

test('a missing card file fails before the upload, not inside it', async () => {
  // readFileSync runs first so the failure is one clear message, rather than
  // three retries deep inside sendPhoto reporting a network error for a file
  // that was never there.
  const notes = [];
  let uploaded = false;
  const ok = await sendAnchorCard({
    token: 't', chatId: 'c', card: '/nonexistent/be-card.png',
    log: (m) => notes.push(m),
    sendPhoto: async () => { uploaded = true; },
  });
  assert.equal(ok, false);
  assert.equal(uploaded, false, 'must not attempt an upload with no file');
  assert.match(notes[0], /ENOENT|no such file/i);
});

test('the card is sent with no caption', async () => {
  // The cue text already went as its own message. A caption here would either
  // duplicate it or, at over 1024 characters, truncate it.
  let caption = 'unset';
  await sendAnchorCard({
    token: 't', chatId: 'c',
    sendPhoto: async (tok, chat, path, cap) => { caption = cap; },
  });
  assert.equal(caption, '');
});
