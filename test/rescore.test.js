// Asking for a night to be rescored.
//
// Oura scores a night the moment it decides the night is over. Getting up with
// a child at 2am ends it as far as the ring is concerned, so the score that
// lands -- and the deck built from it -- describes the first stretch of sleep
// only. The rest is counted later and the score is revised upward, and until
// now nothing went back to look.
//
// Two ways in, one mechanism: this file covers the asked-for one. The automatic
// one is in test/serve.test.js, and both end at the same place -- the ingest
// corrects the stored night, and the supervisor's score watcher resends the
// deck. The command deliberately does not build anything itself.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SLEEPOS_STATE_DIR = mkdtempSync(join(tmpdir(), 'sleep-os-rescore-'));
process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';

const { processInbox } = await import('../src/inbox.js');
const { upsertTelemetry } = await import('../src/telemetry.js');
const { loadConfig } = await import('../src/facts.js');

const CONFIG = loadConfig();
const NOW = '2026-10-11T14:00:00Z'; // 10am local

const night = (date, score) => ({
  date, sleep_score: score, total_sleep_duration: 25200, readiness_score: 70,
});

/** One inbound message through the real processInbox, with Oura stubbed. */
const inbound = async (text, ingest) => {
  const sends = [];
  await processInbox({
    config: CONFIG, state: { inboxOffset: 0, pending: [] },
    token: 'x', chatId: '42', now: new Date(NOW), log: () => {},
    send: async (_t, _c, body) => { sends.push(body); return { message_id: sends.length + 1 }; },
    sendCard: async () => {},
    ingest,
    fetchUpdates: async () => [{
      update_id: 9001, message: { message_id: 9001, chat: { id: 42 }, text },
    }],
  });
  return sends;
};

test('/rescore pulls again and reports the corrected number', async () => {
  upsertTelemetry([night('2026-10-11', 62)]);
  // What the real ingest does: writes the corrected night to telemetry.
  const sends = await inbound('/rescore', async () => {
    upsertTelemetry([night('2026-10-11', 81)]);
  });
  assert.ok(sends.some((s) => s.includes('81') && s.includes('62')),
    `both the new and the old score must be said, got: ${JSON.stringify(sends)}`);
});

test('a night Oura has not changed its mind about says so, and promises nothing', async () => {
  upsertTelemetry([night('2026-10-11', 81)]);
  const sends = await inbound('/rescore', async () => {});
  assert.ok(sends.some((s) => /still has/.test(s)));
  assert.ok(!sends.some((s) => /[Rr]ebuilding/.test(s)),
    'no screens are coming, so nothing may say they are');
});

test('"recalculate sleep score" works without the slash', async () => {
  // He asked for it in those words. A command whose slash has to be remembered
  // at 6am is a command that does not get used.
  upsertTelemetry([night('2026-10-11', 62)]);
  let pulled = 0;
  const sends = await inbound('recalculate sleep score', async () => {
    pulled += 1;
    upsertTelemetry([night('2026-10-11', 81)]);
  });
  assert.equal(pulled, 1, 'the plain-English form must reach Oura, not the journal');
  assert.ok(sends.some((s) => s.includes('81')));
});

test('a sentence that merely mentions rescoring is still a journal entry', async () => {
  let pulled = 0;
  await inbound('I wonder if Oura will rescore that night.', async () => { pulled += 1; });
  assert.equal(pulled, 0);
});

test('Oura refusing to answer is said out loud, not swallowed', async () => {
  upsertTelemetry([night('2026-10-11', 62)]);
  const sends = await inbound('/rescore', async () => { throw new Error('HTTP 429'); });
  assert.ok(sends.some((s) => s.includes('429')),
    'he asked for this deliberately; silence after a deliberate request is the '
    + 'failure this layer exists to prevent');
});
