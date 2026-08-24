// Telegram Bot API client.
//
// Telegram is the delivery channel because it is free at any volume, needs no
// carrier registration, and -- unlike SMS -- can carry interactive replies when
// the behavioural journalling layer lands in a later phase.

const API = 'https://api.telegram.org';
const MAX_ATTEMPTS = 4;

export class TelegramError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A transient failure must not cost a card. Network blips, Telegram 5xx and
 * rate limits are all retried with backoff; a 4xx that is not a rate limit is
 * a real error (bad token, blocked bot) and fails immediately, because
 * retrying it would only delay a failure the run should surface.
 */
async function call(token, method, payload, { log = () => {} } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(`${API}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      });
    } catch (err) {
      lastError = new TelegramError(`${method} network error: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(2 ** attempt * 500);
        log(`${method} network error, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
        continue;
      }
      throw lastError;
    }

    let body;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (body?.ok) return body.result;

    const description = body?.description ?? `HTTP ${res.status}`;
    const retryAfter = body?.parameters?.retry_after;
    const retriable = res.status === 429 || res.status >= 500;

    lastError = new TelegramError(`${method} failed: ${description}`);
    if (!retriable || attempt === MAX_ATTEMPTS) throw lastError;

    const waitMs = retryAfter ? (retryAfter + 1) * 1000 : 2 ** attempt * 500;
    log(`${method} ${description}, waiting ${Math.round(waitMs / 1000)}s (retry ${attempt}/${MAX_ATTEMPTS - 1})`);
    await sleep(waitMs);
  }

  throw lastError;
}

export async function sendMessage(token, chatId, text) {
  // parse_mode is intentionally omitted: the card must render as plain text.
  return call(token, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

export async function getMe(token) {
  return call(token, 'getMe');
}

/**
 * Reads pending updates. Passing an offset acknowledges everything before it,
 * which is how the queue is drained without a webhook.
 */
export async function getUpdates(token, offset = 0) {
  const payload = { timeout: 0, limit: 50 };
  if (offset) payload.offset = offset;
  return call(token, 'getUpdates', payload);
}
