// The written coach, the intensity layer, and the guarantee that holds them.
//
// The rule-based coach could not invent a statistic because it never wrote a
// sentence -- it assembled vetted ones. Generating the sentence gives that up,
// so it has to be bought back with a machine check. Most of what follows tests
// that check, from both sides: it must reject a number that is not on the
// grounding sheet, and it must not reject an honest restatement of one that is.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pickIntensity, rarityOf, effortOf, BUDGETS, LEVELS } from '../src/intensity.js';
import { allowedNumbers, verifyNumbers, buildPrompt, llmEnabled, writeLeverage } from '../src/coachllm.js';
import { parseEntry, buildCoachResponse, buildCoachResponseAsync } from '../src/coach.js';

const history = (n, base = 79) =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`,
    score: base + ((i * 7) % 11) - 5,
  }));

/* ---------------------------------------------------------------- intensity */

test('most replies are small and a few are large', () => {
  const seen = { brief: 0, standard: 0, deep: 0 };
  for (let i = 0; i < 400; i++) seen[pickIntensity({ seed: `day-${i}` }).level] += 1;

  // Both extremes are failures. Always-large habituates within a fortnight;
  // never-large is a constant-magnitude reward, which is the thing this
  // feature exists to avoid.
  assert.ok(seen.brief > seen.standard, 'brief should be the common case');
  assert.ok(seen.deep > 0, 'a deep reply must be reachable');
  assert.ok(seen.deep < 400 * 0.25, `deep fired ${seen.deep}/400 — too often to feel rare`);
  assert.ok(seen.standard > 0);
});

test('the same seed always gives the same size', () => {
  // A retry must not be able to fish for a bigger reply.
  for (const seed of ['a', 'b', '2026-08-25:74']) {
    const first = pickIntensity({ seed }).level;
    for (let i = 0; i < 20; i++) assert.equal(pickIntensity({ seed }).level, first);
  }
});

test('a throwaway entry is capped short, and a milestone never is', () => {
  for (let i = 0; i < 200; i++) {
    const r = pickIntensity({ seed: `s-${i}`, effort: effortOf('ok') });
    assert.equal(r.level, 'brief', 'two words must never buy an essay');
  }
  // Showing up on the night a streak lands is the behaviour being rewarded,
  // so the milestone survives a short entry.
  assert.equal(pickIntensity({ seed: 'm', milestone: true, effort: 0 }).level, 'deep');
});

test('a rare night lifts the floor off brief', () => {
  for (let i = 0; i < 100; i++) {
    const r = pickIntensity({ seed: `r-${i}`, rarity: 1 });
    assert.notEqual(r.level, 'brief', 'a night unlike any other deserves more than one line');
  }
});

test('rarity is measured against his own nights, and refuses to guess', () => {
  const own = history(40).map((h) => h.score);
  assert.equal(rarityOf(80, own.slice(0, 5)), 0, 'five nights cannot support a rarity claim');
  assert.equal(rarityOf(Math.max(...own), own), 1, 'a personal best is always news');
  assert.equal(rarityOf(Math.min(...own), own), 1, 'so is a personal worst');
  assert.ok(rarityOf(Math.round(own.reduce((a, b) => a + b) / own.length), own) < 0.5,
    'an ordinary night is not news');
  assert.equal(rarityOf(null, own), 0);
});

test('every level has a budget and they grow in order', () => {
  let lastWords = 0;
  for (const level of LEVELS) {
    const b = BUDGETS[level];
    assert.ok(b, `${level} has no budget`);
    assert.ok(b.words > lastWords, `${level} is not larger than the level below it`);
    assert.ok(b.maxTokens >= b.words, 'the token ceiling must clear the word target');
    lastWords = b.words;
  }
});

/* ------------------------------------------------------------ verification */

const SHEET = {
  date: '2026-08-25',
  sleepScore: 74,
  baseline: 78.7,
  deltaVsBaseline: -4.7,
  sdFromOwnMean: -1.49,
  timeAsleep: '6h 52m',
  targetBedtime: '22:30',
  trailingAverages: [{ window: 7, average: 77, lastNightVsWindow: -3 }],
  libraryMove: 'Get 10 minutes of outdoor light within 30 minutes of waking.',
};

test('a number that is not on the sheet is caught', () => {
  const allowed = allowedNumbers(SHEET);
  const inventions = [
    'Adults who do this sleep 23% better.',
    'Across 1,200 nights the effect holds.',
    'Your deep sleep was 94 minutes.',
    'That is a 12 point swing.',
  ];
  for (const text of inventions) {
    assert.equal(verifyNumbers(text, allowed).ok, false, `let through: ${text}`);
  }
});

test('an honest restatement of a sheet number is not caught', () => {
  const allowed = allowedNumbers(SHEET);
  const honest = [
    'You ran 4.7 under your 78.7 average.',
    'A 74 against a 77 week is not a collapse.',
    'That is 1.49 SD below your own mean.',
    'You were asleep 6h 52m.',
    'Go to bed when you said you would. No number needed.',
  ];
  for (const text of honest) {
    const r = verifyNumbers(text, allowed);
    assert.equal(r.ok, true, `wrongly rejected: ${text} (${r.offenders.join(', ')})`);
  }
});

test('rounding a sheet value is allowed; rounding INTO one is not', () => {
  const allowed = allowedNumbers(SHEET);
  // 78.7 may be written as 79. That is the same fact, less precisely.
  assert.equal(verifyNumbers('about 79 on average', allowed).ok, true);

  // 79.3 is a different fact. It once passed, because the verifier rounded the
  // observed number as well as the allowed one -- so a fabricated 79.3 matched
  // a real 78.7 through their shared 79. That is the exact shape of the quiet
  // fabrication this whole file exists to prevent, so it is pinned here.
  const r = verifyNumbers('your 79.3 average', allowed);
  assert.equal(r.ok, false, '79.3 must not pass against a real baseline of 78.7');
  assert.deepEqual(r.offenders, ['79.3']);
});

test('a clock time is an instruction, not a claim', () => {
  const allowed = allowedNumbers(SHEET);
  // "Be outside by 7:15" asserts nothing about his body that could be false.
  assert.equal(verifyNumbers('Lights out at 22:30. Outside by 7:15 tomorrow.', allowed).ok, true);
  // But a statistic sitting next to a time is still a statistic.
  assert.equal(verifyNumbers('By 7:15 your HRV had climbed to 61.', allowed).ok, false);
});

test('the sheet always permits nothing-at-all and the system\'s own vocabulary', () => {
  const allowed = allowedNumbers({});
  assert.equal(verifyNumbers('Tonight\'s 1% move: go to bed.', allowed).ok, true);
  assert.equal(verifyNumbers('Your score was 88.', allowed).ok, false);
});

/* ------------------------------------------------- the grounding sheet is closed */

test('every derived number the reply prints is on the sheet', () => {
  const r = buildCoachResponse({
    entry: parseEntry('74 6.9 3'), history: history(40), date: '2026-08-25',
    useOura: false, screensUrl: null, includeJournal: false,
  });
  const g = r.grounding;

  // If the arithmetic above the written section is not on the sheet, the writer
  // cannot refer to it without being rejected -- which would make the whole
  // feature useless in exactly the cases it matters most.
  for (const key of ['baseline', 'deltaVsBaseline', 'sdFromOwnMean', 'percentileOfOwnNights',
                     'trailingAverages', 'sleepScore', 'nightsOnRecord', 'confidenceTier']) {
    assert.ok(g[key] !== undefined, `the sheet is missing ${key}`);
  }

  const allowed = allowedNumbers(g);
  const printed = r.blocks.head.join('\n');
  const check = verifyNumbers(printed, allowed);
  assert.equal(check.ok, true,
    `the reply prints numbers the writer is not allowed to repeat: ${check.offenders.join(', ')}`);
});

test('the sheet never carries a number the writer could misread as a fact about him', () => {
  const r = buildCoachResponse({
    entry: parseEntry('74'), history: history(40), date: '2026-08-25',
    useOura: false, screensUrl: null, includeJournal: false,
  });
  // The prompt is JSON, so every value is labelled. A bare array of numbers with
  // no key would be exactly the ambiguity that produces a confident wrong claim.
  const prompt = buildPrompt({ facts: r.grounding, level: 'standard' });
  assert.match(prompt, /Every number you write must come from here/);
  assert.match(prompt, /"sleepScore": 74/);
});

/* -------------------------------------------------------------- fallbacks */

const RULE_BASED = (over = {}) => buildCoachResponse({
  entry: parseEntry('74 6.9 3'), history: history(40), date: '2026-08-25',
  useOura: false, screensUrl: null, includeJournal: false, ...over,
});

const ASYNC = (over = {}) => buildCoachResponseAsync({
  entry: parseEntry('74 6.9 3'), history: history(40), date: '2026-08-25',
  useOura: false, screensUrl: null, includeJournal: false, log: () => {}, ...over,
});

const reply = (text) => async () => ({
  ok: true, status: 200,
  json: async () => ({
    content: [{ type: 'thinking', thinking: 'not the answer' }, { type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'end_turn',
  }),
});

test('with no key the reply is exactly the rule-based one', async () => {
  const r = await ASYNC({ env: {} });
  assert.equal(r.written, false);
  assert.equal(r.text, RULE_BASED().text);
  assert.equal(llmEnabled({}), false);
  assert.equal(llmEnabled({ ANTHROPIC_API_KEY: 'k' }), true);
  assert.equal(llmEnabled({ ANTHROPIC_API_KEY: 'k', SLEEPOS_COACH_LLM: 'off' }), false,
    'there must be a way to turn it off without deleting the secret');
});

test('every failure lands on the rule-based coach and none of them throw', async () => {
  const expected = RULE_BASED().text;
  const failures = {
    'network error': async () => { throw new Error('ECONNRESET'); },
    'abort': async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; },
    'bad key': async () => ({ ok: false, status: 401, text: async () => 'invalid x-api-key' }),
    'bad request': async () => ({ ok: false, status: 400, text: async () => 'unknown field' }),
    'server error': async () => ({ ok: false, status: 500, text: async () => 'upstream' }),
    'empty content': async () => ({ ok: true, status: 200, json: async () => ({ content: [], stop_reason: 'max_tokens' }) }),
    'thinking only': async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'thinking', thinking: 'x' }] }) }),
    'garbage body': async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } }),
    'invented statistic': reply('A study of 1,200 adults found a 23% gain. Sleep earlier.'),
  };

  for (const [name, fetchImpl] of Object.entries(failures)) {
    const r = await ASYNC({ env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl });
    assert.equal(r.written, false, `${name} should not have been treated as a success`);
    assert.equal(r.text, expected, `${name} did not fall back cleanly`);
  }
});

test('a rejected number is loud in the log and invisible in the message', async () => {
  const logged = [];
  const r = await ASYNC({
    env: { ANTHROPIC_API_KEY: 'k' },
    fetchImpl: reply('Your HRV of 61 is the story here.'),
    log: (m) => logged.push(m),
  });
  assert.equal(r.written, false);
  assert.ok(logged.some((l) => /REJECTED/.test(l) && /61/.test(l)),
    `the run log must name the offending number, got: ${logged.join(' | ')}`);
});

test('on success only the leverage block changes', async () => {
  const base = RULE_BASED();
  // Built from the sheet, so it passes verification for the reason a real reply
  // would: every figure in it was handed over already computed.
  const written = `You are ${Math.abs(base.grounding.deltaVsBaseline)} under your own `
    + `${base.grounding.baseline} average, and the spread says that is ordinary. Get outside before 7:15.`;
  const r = await ASYNC({ env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: reply(written) });

  assert.equal(r.written, true);
  assert.deepEqual(r.blocks.head, base.blocks.head, 'the arithmetic above must not move');
  assert.deepEqual(r.blocks.tail, base.blocks.tail, 'the link below must not move');
  assert.ok(r.text.includes(written));
  assert.ok(!r.text.includes(base.blocks.leverage.join('\n')), 'the canned block should be gone');
  assert.ok(LEVELS.includes(r.intensity));
});

test('the request is shaped for this model', async () => {
  let sent = null;
  await ASYNC({
    env: { ANTHROPIC_API_KEY: 'sk-secret' },
    fetchImpl: async (url, opts) => { sent = { url, opts, body: JSON.parse(opts.body) }; return reply('Sleep earlier tonight.')(); },
  });

  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.body.model, 'claude-opus-5');
  assert.deepEqual(sent.body.thinking, { type: 'adaptive' });
  assert.equal('budget_tokens' in sent.body.thinking, false,
    'budget_tokens is rejected outright on this model');
  assert.ok(sent.body.max_tokens > 0);
  assert.ok(['low', 'medium', 'high', 'max'].includes(sent.body.output_config.effort));
  assert.equal(sent.opts.headers['anthropic-version'], '2023-06-01');
  assert.equal(sent.opts.headers['x-api-key'], 'sk-secret');
  assert.equal(sent.body.messages.length, 1);
  assert.equal(sent.body.messages[0].role, 'user', 'no assistant prefill — it 400s on this model');
});

test('the writer is told the size it was given', async () => {
  const prompts = {};
  for (const level of LEVELS) {
    await ASYNC({
      env: { ANTHROPIC_API_KEY: 'k' },
      intensity: { level, budget: BUDGETS[level], reason: 'forced' },
      fetchImpl: async (_u, o) => { prompts[level] = JSON.parse(o.body); return reply('Sleep earlier.')(); },
    });
  }
  assert.match(prompts.brief.messages[0].content, /ONE sentence/);
  assert.notEqual(prompts.deep.messages[0].content, prompts.brief.messages[0].content);
  assert.ok(prompts.deep.max_tokens > prompts.brief.max_tokens,
    'a longer reply needs a larger ceiling');
});

/* ------------------------------------------------------- the affirmation size */

test('journal replies vary in size and only the largest carries a statistic', async () => {
  const { buildAffirmation, loadAffirmations } = await import('../src/affirm.js');
  const lib = loadAffirmations();
  const long = 'I moved the shutdown half an hour earlier and the evening felt genuinely different.';

  const sizes = new Set();
  let statsSeen = 0;
  for (let d = 1; d <= 90; d++) {
    const r = buildAffirmation({
      text: long, mechanism: 'anchoring', streak: 5, state: {},
      dateString: `2026-11-${d}`, library: lib, journalTotal: 212,
    });
    sizes.add(r.intensity);
    if (r.statShown) {
      statsSeen += 1;
      assert.equal(r.intensity, 'deep', 'only a deep reply may carry a statistic');
      assert.ok(r.text.includes('212'), 'the statistic must be the real journal total');
    }
    if (r.intensity === 'brief') {
      assert.equal(r.streakShown, false, 'a one-line reply is one line');
      assert.equal(r.statShown, false);
    }
  }
  assert.ok(sizes.size >= 2, 'a constant-size reply is the failure mode being fixed');
  assert.ok(statsSeen > 0 && statsSeen < 45, `stat line appeared ${statsSeen}/90`);
});

test('a milestone stands alone', async () => {
  const { buildAffirmation, loadAffirmations } = await import('../src/affirm.js');
  const lib = loadAffirmations();
  const long = 'A considered entry about how the evening actually went and what I would change.';
  const r = buildAffirmation({
    text: long, mechanism: 'anchoring', streak: 7, state: {},
    dateString: '2026-08-24', library: lib, journalTotal: 212,
  });
  // It is already the large reply. Hanging a streak count and a running total
  // off it would bury the one sentence worth reading.
  assert.equal(r.text, lib.milestone['7']);
  assert.equal(r.statShown, false);
  assert.equal(r.streakShown, false);
});

/* --------------------------------------------------- the state-dir regression */

test('the journal writes where the environment says, whenever it is set', async () => {
  // This is the guard on a bug that had no symptom at the site of the mistake.
  // The state directory used to be captured at module load, so the override
  // worked only if the env var was set before the first import. Adding an
  // import of journal.js to coach.js changed the load order and the suite began
  // appending fabricated nights to the real encrypted log -- surfacing two
  // files away, as an unrelated test that failed only on the second run.
  const { addJournalEntry, readJournal } = await import('../src/journal.js');
  const saved = { dir: process.env.SLEEPOS_STATE_DIR, key: process.env.SLEEPOS_DATA_KEY };
  const scratch = mkdtempSync(join(tmpdir(), 'sleep-os-statedir-'));
  try {
    process.env.SLEEPOS_STATE_DIR = scratch;
    process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';
    addJournalEntry({ date: '2099-01-01', text: 'written after the module was loaded' });

    assert.ok(existsSync(join(scratch, 'journal.ndjson')),
      'the entry did not land in the directory the environment named');
    assert.ok(readJournal().some((e) => e.date === '2099-01-01'));
    assert.ok(!readFileSync(join(scratch, 'journal.ndjson'), 'utf8').includes('written after'),
      'and it must be encrypted on the way in');
  } finally {
    if (saved.dir === undefined) delete process.env.SLEEPOS_STATE_DIR;
    else process.env.SLEEPOS_STATE_DIR = saved.dir;
    if (saved.key === undefined) delete process.env.SLEEPOS_DATA_KEY;
    else process.env.SLEEPOS_DATA_KEY = saved.key;
  }
});

/* --------------------------------------------------------------- the switches */

test('both switches exist and default to on', async () => {
  const { loadConfig } = await import('../src/facts.js');
  const cfg = loadConfig();
  assert.ok(cfg.coach, 'config must carry a coach block');
  assert.equal(typeof cfg.coach.writtenByModel, 'boolean');
  assert.equal(typeof cfg.coach.sendJournalToModel, 'boolean');
});

test('his own words can be kept off the wire without breaking anything', () => {
  const args = {
    entry: parseEntry('74 6.9 3'), history: history(40), date: '2026-08-25',
    useOura: false, screensUrl: null,
  };
  const off = buildCoachResponse({ ...args, includeJournal: false });
  assert.equal(off.grounding.recentJournalEntries, undefined,
    'nothing he wrote may reach the sheet when the switch is off');
  // Everything else is unchanged: the numbers do not depend on the journal.
  assert.equal(off.text, buildCoachResponse({ ...args, includeJournal: true }).text);
});

test('the grounding sheet never carries a raw telemetry dump', () => {
  const r = buildCoachResponse({
    entry: parseEntry('74'), history: history(40), date: '2026-08-25',
    useOura: false, screensUrl: null, includeJournal: false,
  });
  // Only finished figures leave. Handing over the raw night would give the
  // writer arithmetic to do, and arithmetic is what it is not allowed to do.
  const json = JSON.stringify(r.grounding);
  for (const raw of ['total_sleep_duration', 'average_hrv', 'bedtime_start', 'sleep_score']) {
    assert.ok(!json.includes(raw), `raw telemetry field ${raw} leaked into the sheet`);
  }
});

/* ------------------------------------------------------------- two providers */

test('whichever key exists is the one that gets used', async () => {
  const { resolveProvider } = await import('../src/coachllm.js');

  assert.equal(resolveProvider({}), null, 'no key means the rule-based coach');
  assert.equal(resolveProvider({ ANTHROPIC_API_KEY: 'a' }).name, 'anthropic');
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'g' }).name, 'gemini');

  // Anthropic wins a tie because that is what this was designed against.
  assert.equal(resolveProvider({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }).name, 'anthropic');

  // Config pins it either way, and can name a model.
  const pinned = resolveProvider({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' },
    { coach: { provider: 'gemini', model: 'gemini-3-pro' } });
  assert.equal(pinned.name, 'gemini');
  assert.equal(pinned.model, 'gemini-3-pro');

  // A pinned provider with no key falls back to the rule-based coach rather
  // than quietly using the other one.
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'g' }, { coach: { provider: 'anthropic' } }), null);
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'g' }, { coach: { provider: 'auto' } }).name, 'gemini');
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'g', SLEEPOS_COACH_LLM: 'off' }), null);
});

const geminiReply = (text, extra = {}) => async () => ({
  ok: true, status: 200,
  json: async () => ({
    candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40 },
    ...extra,
  }),
});

test('the Gemini request is shaped for Gemini', async () => {
  let sent = null;
  const r = await ASYNC({
    env: { GEMINI_API_KEY: 'AIza-secret' },
    fetchImpl: async (url, opts) => {
      sent = { url, opts, body: JSON.parse(opts.body) };
      return geminiReply('Get outside before 7:15. That is the whole move tonight.')();
    },
  });

  assert.equal(r.written, true, 'a well-formed Gemini reply must be used');
  assert.equal(r.provider, 'gemini');
  assert.match(sent.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/);
  assert.equal(sent.opts.headers['x-goog-api-key'], 'AIza-secret');

  // The key must never ride in the URL. A URL reaches proxy logs, error
  // messages and stack traces; a header does not.
  assert.ok(!sent.url.includes('AIza-secret'), 'the API key leaked into the URL');
  assert.ok(!sent.url.includes('key='), 'no ?key= query parameter');

  assert.equal(sent.body.system_instruction.parts[0].text.length > 100, true);
  assert.equal(sent.body.contents[0].role, 'user');
  assert.match(sent.body.contents[0].parts[0].text, /Every number you write must come from here/);

  // These models spend part of the allowance thinking before they write, so a
  // ceiling sized to the visible answer returns MAX_TOKENS with nothing in it.
  assert.ok(sent.body.generationConfig.maxOutputTokens >= 4096,
    'the ceiling must leave room for the thinking that precedes the answer');
});

test('a Gemini answer is held to exactly the same number check', async () => {
  const expected = RULE_BASED().text;
  const r = await ASYNC({
    env: { GEMINI_API_KEY: 'g' },
    fetchImpl: geminiReply('A trial of 4,000 adults found a 31% improvement.'),
  });
  assert.equal(r.written, false, 'an invented statistic must be rejected whoever wrote it');
  assert.equal(r.text, expected);
});

test('Gemini failures fall back as quietly as Anthropic ones', async () => {
  const expected = RULE_BASED().text;
  const failures = {
    'thinking ate the whole budget': async () => ({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }),
    }),
    'safety block': async () => ({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ finishReason: 'SAFETY' }], promptFeedback: {} }),
    }),
    'no candidates at all': async () => ({ ok: true, status: 200, json: async () => ({}) }),
    'bad key': async () => ({ ok: false, status: 403, text: async () => 'API key not valid' }),
  };
  for (const [name, fetchImpl] of Object.entries(failures)) {
    const r = await ASYNC({ env: { GEMINI_API_KEY: 'g' }, fetchImpl });
    assert.equal(r.written, false, `${name} was treated as a success`);
    assert.equal(r.text, expected, `${name} did not fall back cleanly`);
  }
});

test('a retired model name is recovered from, not surrendered to', async () => {
  // Model names move faster than any list written into a source file, and a
  // retired one 404s in a way that looks exactly like a broken integration.
  const calls = [];
  const logged = [];
  const r = await ASYNC({
    env: { GEMINI_API_KEY: 'g' },
    log: (m) => logged.push(m),
    fetchImpl: async (url, opts) => {
      calls.push(url);
      if (url.endsWith('/v1beta/models')) {
        assert.equal(opts.headers['x-goog-api-key'], 'g', 'discovery must authenticate too');
        return {
          ok: true, status: 200,
          json: async () => ({ models: [
            { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
            { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-9.1-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-9.1-flash-preview-01', supportedGenerationMethods: ['generateContent'] },
          ] }),
        };
      }
      if (url.includes('gemini-9.1-flash:')) return geminiReply('Go to bed on time tonight.')();
      return { ok: false, status: 404, text: async () => 'model not found' };
    },
  });

  assert.equal(r.written, true, 'discovery should have rescued the call');
  assert.equal(r.model, 'gemini-9.1-flash', 'newest stable general model, not the preview or the lite');
  assert.equal(calls.length, 3, 'one failed call, one discovery, one retry');
  assert.ok(logged.some((l) => /discovered/.test(l)), 'the swap must be visible in the run log');

  // Embedding models are not writers and must never be selected.
  assert.ok(!calls.some((c) => c.includes('embedding')));
});

test('discovery is attempted once, not on every retry', async () => {
  let discoveries = 0;
  const r = await ASYNC({
    env: { GEMINI_API_KEY: 'g' },
    fetchImpl: async (url) => {
      if (url.endsWith('/v1beta/models')) {
        discoveries += 1;
        return { ok: true, status: 200, json: async () => ({ models: [
          { name: 'models/gemini-4.0-flash', supportedGenerationMethods: ['generateContent'] },
        ] }) };
      }
      return { ok: false, status: 404, text: async () => 'model not found' };
    },
  });
  assert.equal(r.written, false, 'a persistent 404 still falls back');
  assert.equal(discoveries, 1, 'discovery must not loop');
});

test('a silent fallback still leaves a trace an operator can read', async () => {
  const r = await ASYNC({
    env: { GEMINI_API_KEY: 'g' },
    fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'Generative Language API has not been used in project 12345' }),
  });
  assert.equal(r.written, false);
  assert.ok(r.reason && /403/.test(r.reason),
    `the reason must survive the fallback, got ${JSON.stringify(r.reason)}`);
  // The whole point: without this, a key that has never once worked produces
  // exactly the message a working one produces on an ordinary day.
  assert.notEqual(r.reason, null);
});

test('the recorded reason carries no personal data', async () => {
  const r = await ASYNC({
    env: { GEMINI_API_KEY: 'super-secret-key' },
    fetchImpl: geminiReply('Your HRV of 61 was the story.'),
  });
  assert.equal(r.written, false);
  assert.ok(!r.reason.includes('super-secret-key'), 'the API key must never reach the state file');
  assert.ok(!/journal|wrote/i.test(r.reason), 'nothing he wrote may reach the state file');
});
