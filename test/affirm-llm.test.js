// The written journal reply.
//
// This path is different from the morning coach in one way that matters: there
// is no computed sheet to check the answer against, because the answer is
// responding to prose. So the allowed set is only what he himself wrote, what
// the card he was answering said, and counts of his own records. Most of what
// follows tests that the boundary holds in both directions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set before any module that resolves a path reads it. journal.js resolves per
// call now, but the ordering is still the honest thing to do.
process.env.SLEEPOS_STATE_DIR = mkdtempSync(join(tmpdir(), 'sleep-os-affirmllm-'));
process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';

const { writeAffirmation, buildFacts, buildPrompt } = await import('../src/affirmllm.js');
const { loadConfig } = await import('../src/facts.js');

const CONFIG = loadConfig();
const ENV = { GEMINI_API_KEY: 'g' };

const ENTRY = {
  text: 'When Slack pings after 9 I will leave the laptop in the kitchen and go up.',
  mechanism: 'implementation_intention',
  promptText: 'Name the exact moment tonight this is most likely to break.',
  slot: 'work_shutdown',
  streak: 9,
  journalTotal: 212,
  dateString: '2026-08-26',
};

const replies = (text) => async () => ({
  ok: true, status: 200,
  json: async () => ({
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 40 },
  }),
});

const write = (over = {}) => writeAffirmation({
  ...ENTRY, env: ENV, config: CONFIG, log: () => {}, ...over,
});

/* ------------------------------------------------------------ what it knows */

test('the writer knows only what he wrote and what he was shown', () => {
  const facts = buildFacts(ENTRY);
  assert.equal(facts.entry, ENTRY.text);
  assert.equal(facts.cardHeSaw, ENTRY.promptText);
  assert.equal(facts.consecutiveNightsWritten, 9);
  assert.equal(facts.entriesWrittenInTotal, 212);
  // The research note behind the card, so the reply can name the mechanism
  // accurately rather than inventing a rationale for it.
  assert.match(facts.whatThatMechanismIs, /Gollwitzer/);

  // Nothing about his body. This reply has no access to sleep data and must
  // not appear to: a warm line about last night's HRV would be a claim it
  // cannot support.
  const json = JSON.stringify(facts);
  for (const leak of ['sleep_score', 'hrv', 'readiness', 'efficiency', 'baseline']) {
    assert.ok(!json.toLowerCase().includes(leak), `${leak} reached the reply writer`);
  }
});

test('a streak of zero and an empty history are simply absent', () => {
  const facts = buildFacts({ text: 'first one', dateString: '2026-01-01' });
  assert.equal(facts.consecutiveNightsWritten, undefined);
  assert.equal(facts.entriesWrittenInTotal, undefined);
  assert.equal(facts.previousEntries, undefined);
  // A writer told "streak: 0" will find something to say about zero.
  assert.ok(!JSON.stringify(facts).includes(': 0'));
});

test('his entry is framed as material, never as instruction', () => {
  const prompt = buildPrompt({ facts: buildFacts(ENTRY), level: 'standard' });
  assert.match(prompt, /Every number you write must come from here/);
  // The system prompt carries the guard; assert it is actually there, since
  // the entry is the one field in this system a stranger could not write but
  // a bad day could fill with anything.
  assert.match(prompt, /LENGTH\./);
});

/* --------------------------------------------------------------- the guard */

test('a fabricated statistic is rejected even when it sounds kind', async () => {
  const logged = [];
  const r = await write({
    fetchImpl: replies('People who write this down are 40% more likely to follow through, and across 3,000 studied nights it holds.'),
    log: (m) => logged.push(m),
  });
  assert.equal(r, null, 'the library line must ship instead');
  assert.ok(logged.some((l) => /REJECTED/.test(l)));
});

test('his own numbers, and the card\'s, come back freely', async () => {
  const allowed = [
    'Nine nights of naming the exact moment is not a habit any more.',
    'You put the boundary at 9, which is the hour it actually breaks.',
    'That is 212 entries now.',
    'Specifying when and where roughly doubles follow-through. You just did that.',
  ];
  for (const text of allowed) {
    const r = await write({ fetchImpl: replies(text) });
    assert.ok(r, `wrongly rejected: ${text}`);
    assert.equal(r.text, text);
  }
});

test('a number about his body is not his to have', async () => {
  // He never mentioned an HRV. Neither did the card. So there is no honest
  // route by which the writer knows one.
  const r = await write({ fetchImpl: replies('Your HRV of 61 says the shutdown worked.') });
  assert.equal(r, null);
});

/* ------------------------------------------------------------- falling back */

test('every failure returns null and none of them throw', async () => {
  const failures = {
    'no key at all': { env: {}, fetchImpl: replies('unused') },
    'switched off': { config: { coach: { writtenAffirmations: false } }, fetchImpl: replies('unused') },
    'network': { fetchImpl: async () => { throw new Error('ECONNRESET'); } },
    'timeout': { fetchImpl: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } },
    'bad key': { fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'API key not valid' }) },
    'empty candidate': { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [] } }] }) }) },
    'nothing at all': { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) },
    'whitespace': { fetchImpl: replies('   \n  ') },
  };
  for (const [name, over] of Object.entries(failures)) {
    const r = await write(over);
    assert.equal(r, null, `${name} should have fallen back`);
  }
});

test('the size of the reply varies and is capped by effort', async () => {
  const seen = new Set();
  for (let d = 1; d <= 60; d++) {
    const r = await write({ dateString: `2026-12-${d}`, fetchImpl: replies('A specific, warm reply.') });
    seen.add(r.level);
  }
  assert.ok(seen.size >= 2, 'a constant-size reply is the failure mode being fixed');

  // Two words in never buys a long reply, whatever the roll says.
  for (let d = 1; d <= 40; d++) {
    const r = await write({ text: 'slept ok', dateString: `2026-12-${d}`, fetchImpl: replies('Short one. Still counts.') });
    assert.equal(r.level, 'brief');
  }
});

/* ----------------------------------------------------------- the whole path */

const { processInbox, trackPending } = await import('../src/inbox.js');

const inbox = async ({ text, fetchImpl, state = {}, now = '2026-08-26T21:30:00Z' }) => {
  const sends = [];
  const s = { inboxOffset: 0, pending: [], ...state };
  trackPending(s, { messageId: 1, kind: 'card', promptId: 'p01', mechanism: 'implementation_intention', slot: 'work_shutdown', at: now });
  const result = await processInbox({
    config: CONFIG, state: s, token: 'x', chatId: '42', now: new Date(now), log: () => {},
    send: async (_t, _c, body) => { sends.push(body); return { message_id: sends.length + 1 }; },
    fetchUpdates: async () => [{ update_id: 7001, message: { message_id: 7001, chat: { id: 42 }, text } }],
    // processInbox has no fetch seam of its own; the writer reads the real
    // global, so it is swapped for the duration of the call.
  });
  return { sends, state: s, result };
};

const withFetch = async (impl, fn) => {
  const saved = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = saved; }
};

test('a journal entry comes back written, through the real inbound path', async () => {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'g';
  try {
    const written = 'You put the trigger where the failure actually happens rather than where the intention lives. That is the difference between a plan and a rule.';
    const { sends, state } = await withFetch(replies(written), () =>
      inbox({ text: 'When Slack pings after 9 I will leave the laptop in the kitchen.' }));

    assert.equal(sends.length, 1, 'a journal entry must never be met with silence');
    assert.equal(sends[0], written, 'the written reply should have shipped, not the library line');
    assert.equal(state.writtenReplies.count, 1, 'the daily budget must be counted down');
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});

test('when the model is down the library still answers', async () => {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'g';
  try {
    const { sends, state } = await withFetch(
      async () => { throw new Error('ECONNRESET'); },
      () => inbox({ text: 'Moved the shutdown earlier and the evening felt calmer than usual.' }));

    assert.equal(sends.length, 1, 'silence is the one unacceptable outcome');
    assert.ok(sends[0].trim().length > 0);
    assert.equal(state.writtenReplies, undefined, 'a failed attempt must not spend the budget');
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});

test('the daily cap holds, and the library covers everything past it', async () => {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'g';
  try {
    let calls = 0;
    const counting = async (...a) => { calls += 1; return replies('A written reply.')(...a); };

    // Already at the ceiling for today.
    const state = { writtenReplies: { date: '2026-08-26', count: CONFIG.coach.maxWrittenRepliesPerDay } };
    const { sends } = await withFetch(counting, () =>
      inbox({ text: 'Another considered entry about the evening and what I would change.', state }));

    assert.equal(calls, 0, 'past the cap the model must not be called at all');
    assert.equal(sends.length, 1, 'and he must still get an answer');

    // Yesterday's count does not constrain today.
    const stale = { writtenReplies: { date: '2026-08-25', count: 999 } };
    const second = await withFetch(counting, () =>
      inbox({ text: 'Another considered entry about the evening and what I would change.', state: stale }));
    assert.equal(calls, 1, 'a new day resets the budget');
    assert.equal(second.state.writtenReplies.date, '2026-08-26');
    assert.equal(second.state.writtenReplies.count, 1);
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});
