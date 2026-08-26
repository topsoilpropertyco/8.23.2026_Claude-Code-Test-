// One way to reach a model, for every writer in this system.
//
// Two providers, because the key that turned up was a Gemini one and the guard
// that makes generated text safe here -- checking the numerals in the answer
// against a list of numbers that were handed over -- does not care who wrote
// the sentence. The guarantee was never staked on a vendor, so supporting both
// costs one request shape and one response shape each.
//
// Nothing in this file knows what it is writing about. The coach and the
// journal reply each supply their own system prompt, their own context, and
// their own definition of an acceptable answer.

// 45s was too generous in the wrong direction. A morning message is something
// a person is actively waiting on, and three attempts at 45s meant a hung call
// blocked it for over two minutes before the fallback fired. 30s with a single
// retry on a timeout bounds the worst case near a minute, and a call that has
// not answered in 30s was not going to make a good morning message anyway.
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
// Timeouts are not like 429s and 5xx. A rate limit is worth waiting out; a hang
// usually is not, and each attempt costs the full ceiling.
const MAX_TIMEOUTS = 2;

export class LLMError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------- providers
 *
 * Two, because the key that turned up was a Gemini one. The verifier below does
 * not care which model wrote the sentence -- it checks the numbers in the text
 * against the sheet either way -- so supporting both costs one request shape
 * and one response shape each, and means the guarantee is not staked on a
 * particular vendor. Whichever key exists is the one that gets used.
 */

const PROVIDERS = {
  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-opus-5',
    request({ apiKey, model, system, prompt, budget }) {
      return {
        url: 'https://api.anthropic.com/v1/messages',
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: budget.maxTokens,
            // Adaptive thinking: budget_tokens is rejected outright on this model.
            thinking: { type: 'adaptive' },
            output_config: { effort: budget.effort },
            system,
            messages: [{ role: 'user', content: prompt }],
          }),
        },
      };
    },
    // Adaptive thinking is on by default, so the content array can carry
    // thinking blocks ahead of the answer. Only text blocks are the answer.
    text: (body) => (Array.isArray(body?.content) ? body.content : [])
      .filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('').trim(),
    usage: (body) => body?.usage ?? null,
    stopReason: (body) => body?.stop_reason ?? null,
  },

  gemini: {
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
    request({ apiKey, model, system, prompt, budget }) {
      return {
        // The key goes in a header, not the `?key=` query parameter the docs
        // reach for first. A URL ends up in proxy logs, error messages and
        // stack traces; a header does not.
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: Math.max(budget.maxTokens, 1024),
              // Thinking off by default, and this is a latency decision rather
              // than a quality one. The first real morning report timed out
              // three times at 45s and shipped the rule-based fallback: these
              // models deliberate before writing, and a system prompt saying
              // "a single invented figure means the whole response is thrown
              // away" is an invitation to deliberate at length over which
              // numbers are permitted. That care is already provided by
              // machine -- the facts arrive pre-computed and every numeral in
              // the answer is checked afterwards -- so paying for it twice buys
              // nothing and costs the message. coach.thinkingBudget turns it
              // back on; -1 omits the field entirely.
              ...(budget.thinkingBudget == null
                ? { thinkingConfig: { thinkingBudget: 0 } }
                : budget.thinkingBudget > 0
                  ? { thinkingConfig: { thinkingBudget: budget.thinkingBudget } }
                  : {}),
            },
          }),
        },
      };
    },
    text: (body) => (body?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p?.text ?? '').join('').trim(),
    usage: (body) => (body?.usageMetadata ? {
      input_tokens: body.usageMetadata.promptTokenCount,
      output_tokens: body.usageMetadata.candidatesTokenCount,
    } : null),
    stopReason: (body) => body?.candidates?.[0]?.finishReason ?? null,
  },
};

/**
 * Which provider, which key, which model.
 *
 * Anthropic wins when both keys are present, because it is the one this was
 * designed against; `coach.provider` in config overrides that. Returns null
 * when there is no key at all, which is the signal to use the rule-based coach.
 */
export function resolveProvider(env = process.env, config = null) {
  if (env.SLEEPOS_COACH_LLM === 'off') return null;

  const want = config?.coach?.provider ?? 'auto';
  const order = want === 'auto' ? ['anthropic', 'gemini'] : [want];

  for (const name of order) {
    const provider = PROVIDERS[name];
    if (!provider) continue;
    const apiKey = env[provider.envKey];
    if (!apiKey) continue;
    return { name, provider, apiKey, model: config?.coach?.model ?? provider.defaultModel };
  }
  return null;
}

/**
 * Ask the key what it can actually run.
 *
 * Model names move faster than any list written into a source file, and a name
 * that has been retired returns a 404 that looks exactly like a broken
 * integration. Rather than guess, ask -- and only when a guess has already
 * failed, so the ordinary path stays one request.
 */
async function discoverModel({ apiKey, fetchImpl, log }) {
  const res = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) throw new LLMError(`model discovery failed: HTTP ${res.status}`);
  const body = await res.json();

  const candidates = (body?.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => String(m.name ?? '').replace(/^models\//, ''))
    .filter((n) => /^gemini/.test(n))
    .filter((n) => !/embedding|aqa|tts|image|audio|live|vision|thinking-exp/.test(n));

  // Newest first, and a general-purpose model ahead of a cut-down one. The
  // paragraph this writes is short; the judgement in it is the expensive part.
  const score = (n) => {
    const version = parseFloat(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? '0');
    const tier = /flash-lite/.test(n) ? 0 : /flash/.test(n) ? 2 : /pro/.test(n) ? 3 : 1;
    const stable = /preview|exp|latest/.test(n) ? 0 : 1;
    return version * 100 + tier * 10 + stable;
  };
  candidates.sort((a, b) => score(b) - score(a));

  if (!candidates.length) throw new LLMError('the key can see no usable Gemini model');
  log?.(`coach-llm discovered ${candidates.length} models, choosing ${candidates[0]}`);
  return candidates[0];
}

export { PROVIDERS };

/* ------------------------------------------------------------- the request */

export async function callModel({ provider, apiKey, model, system, prompt, budget, fetchImpl, log }) {
  let lastError;
  let discovered = false;
  let timeouts = 0;
  let droppedThinkingConfig = false;
  let effective = budget;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    const { url, init } = provider.request({ apiKey, model, system, prompt, budget: effective });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    let body = null;
    try {
      res = await fetchImpl(url, { ...init, signal: controller.signal });
      // Read the body inside the timeout, not after it. Clearing the timer on
      // the headers and then awaiting the body would leave a stalled response
      // with nothing to interrupt it -- which in a process designed to stay up
      // for six hours is not a slow morning message, it is a stopped engine.
      if (res.ok) body = await res.json();
    } catch (err) {
      const timedOut = err?.name === 'AbortError';
      // The elapsed figure separates "slow" from "hung", which the old message
      // could not: both read as "timed out after 45s".
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      lastError = new LLMError(timedOut
        ? `timed out after ${elapsed}s (ceiling ${TIMEOUT_MS / 1000}s, attempt ${attempt})`
        : `network error after ${elapsed}s: ${err.message}`);
      if (timedOut && ++timeouts >= MAX_TIMEOUTS) throw lastError;
      if (attempt < MAX_ATTEMPTS) { await sleep(2 ** attempt * 500); continue; }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      const text = provider.text(body);
      if (!text) throw new LLMError(`empty response (finished: ${provider.stopReason(body) ?? 'unknown'})`);
      return { text, usage: provider.usage(body), model };
    }

    // A 404 means the model name is wrong or retired, not that the key is bad.
    // Ask the key what it can run and try once more, rather than falling back
    // and leaving a permanently silent feature behind a working secret.
    if (res.status === 404 && !discovered && provider.envKey === 'GEMINI_API_KEY') {
      discovered = true;
      try {
        model = await discoverModel({ apiKey, fetchImpl, log });
        continue;
      } catch (err) {
        throw new LLMError(`${model} not found, and ${err.message}`);
      }
    }

    // 429 and 5xx are worth another go; 400 and 401 are configuration and will
    // fail identically forever, so they fall straight through to the rule-based
    // coach rather than costing the morning message forty-five seconds.
    const detail = await res.text().catch(() => '');

    // Some models reject thinkingConfig outright rather than ignoring it. Drop
    // it once and retry, rather than losing the message to a field that was an
    // optimisation in the first place.
    if (res.status === 400 && !droppedThinkingConfig && /thinking/i.test(detail)) {
      droppedThinkingConfig = true;
      effective = { ...effective, thinkingBudget: -1 };
      log?.('coach-llm this model rejects thinkingConfig, retrying without it');
      continue;
    }

    lastError = new LLMError(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    if (res.status !== 429 && res.status < 500) throw lastError;
    if (attempt === MAX_ATTEMPTS) throw lastError;
    log?.(`coach-llm ${lastError.message}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
    await sleep(2 ** attempt * 500);
  }

  throw lastError;
}

/**
 * Generate text, or throw. Every caller wraps this and falls back -- a model
 * outage must never be able to cost a message that has a local answer.
 */
export async function generate({ system, prompt, budget, env = process.env, config = null,
  fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const resolved = resolveProvider(env, config);
  if (!resolved) throw new LLMError('no model key configured');
  return callModel({ ...resolved, system, prompt, budget, fetchImpl, log });
}
