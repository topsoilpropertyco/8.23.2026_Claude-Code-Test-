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
export async function getUpdates(token, offset = 0, { timeout = 0 } = {}) {
  // timeout > 0 is a long poll: Telegram holds the connection open until a
  // message arrives or the timeout expires. That is what turns a ten-minute
  // worst case into a few seconds without any always-on component of our own.
  const payload = { timeout, limit: 50 };
  if (offset) payload.offset = offset;
  return call(token, 'getUpdates', payload);
}

/**
 * Upload a local image. This one cannot go through call(): Telegram wants
 * multipart/form-data for a file upload, not JSON. The retry policy is the
 * same in spirit -- transient failures are retried, a 4xx is real.
 */
export async function sendPhoto(token, chatId, filePath, caption = '') {
  const { readFile } = await import('node:fs/promises');
  const { basename } = await import('node:path');
  const bytes = await readFile(filePath);

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', caption.slice(0, 1024));
    form.append('photo', new Blob([bytes], { type: 'image/png' }), basename(filePath));

    let res;
    try {
      res = await fetch(`${API}/bot${token}/sendPhoto`, { method: 'POST', body: form });
    } catch (err) {
      lastError = new TelegramError(`sendPhoto network error: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) { await sleep(2 ** attempt * 500); continue; }
      throw lastError;
    }

    let body;
    try { body = await res.json(); } catch { body = null; }
    if (body?.ok) return body.result;

    const description = body?.description ?? `HTTP ${res.status}`;
    lastError = new TelegramError(`sendPhoto failed: ${description}`);
    if (!(res.status === 429 || res.status >= 500) || attempt === MAX_ATTEMPTS) throw lastError;
    await sleep((body?.parameters?.retry_after ?? 2 ** attempt) * 1000);
  }
  throw lastError;
}
