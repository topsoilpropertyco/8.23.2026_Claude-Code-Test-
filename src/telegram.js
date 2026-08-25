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

/** Telegram rejects any sendMessage body over this. It is a hard API limit. */
export const TELEGRAM_TEXT_LIMIT = 4096;

/**
 * Split text into chunks Telegram will accept, breaking on paragraph then line
 * boundaries so a card never tears mid-sentence. Nothing the engine composes is
 * anywhere near the limit today (the longest coach reply measures ~730 chars),
 * but a journal echo or a future block could cross it, and the failure mode
 * without this is the whole send being rejected rather than arriving in two.
 */
export function chunkText(text, limit = TELEGRAM_TEXT_LIMIT) {
  const body = String(text ?? '');
  if (body.length <= limit) return [body];
  const chunks = [];
  let rest = body;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = window.lastIndexOf('\n\n');
    if (cut < limit * 0.5) cut = window.lastIndexOf('\n');
    if (cut < limit * 0.5) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = limit;              // one unbroken run: hard split
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export async function sendMessage(token, chatId, text) {
  // parse_mode is intentionally omitted: the card must render as plain text.
  const parts = chunkText(text);
  let last;
  for (const part of parts) {
    last = await call(token, 'sendMessage', {
      chat_id: chatId,
      text: part,
      disable_web_page_preview: true,
    });
  }
  return last;
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

/** Telegram's hard cap on one album. Our deck is exactly this many screens. */
export const MEDIA_GROUP_MAX = 10;

/**
 * Upload several images as ONE swipeable album.
 *
 * This is the delivery mechanism for the deck, and the reason is not cosmetic.
 * A link has to point somewhere that can be rebuilt every morning; GitHub
 * Actions cannot republish a claude.ai artifact, and this repository is public,
 * so a Pages site would put sleep data on the open web. An album is rebuilt
 * from telemetry on every run, arrives inside a private chat, and needs no
 * hosting at all -- so it cannot go stale the way a pinned URL does.
 *
 * Only the FIRST item may carry a caption; Telegram shows it as the album's
 * caption. Anything past the cap is dropped by the API, so refuse instead.
 */
export async function sendMediaGroup(token, chatId, filePaths, caption = '') {
  const { readFile } = await import('node:fs/promises');
  const { basename } = await import('node:path');
  if (!filePaths.length) throw new TelegramError('sendMediaGroup: no files');
  if (filePaths.length > MEDIA_GROUP_MAX) {
    throw new TelegramError(
      `sendMediaGroup: ${filePaths.length} files exceeds Telegram's limit of ${MEDIA_GROUP_MAX}; `
      + 'the API would silently drop the remainder',
    );
  }

  const files = await Promise.all(filePaths.map(async (p) => ({ path: p, bytes: await readFile(p) })));

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    const media = files.map((f, i) => ({
      type: 'photo',
      media: `attach://f${i}`,
      ...(i === 0 && caption ? { caption: caption.slice(0, 1024) } : {}),
    }));
    form.append('media', JSON.stringify(media));
    files.forEach((f, i) => {
      form.append(`f${i}`, new Blob([f.bytes], { type: 'image/png' }), basename(f.path));
    });

    let res;
    try {
      res = await fetch(`${API}/bot${token}/sendMediaGroup`, { method: 'POST', body: form });
    } catch (err) {
      lastError = new TelegramError(`sendMediaGroup network error: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) { await sleep(2 ** attempt * 500); continue; }
      throw lastError;
    }

    let body;
    try { body = await res.json(); } catch { body = null; }
    if (body?.ok) return body.result;

    const description = body?.description ?? `HTTP ${res.status}`;
    lastError = new TelegramError(`sendMediaGroup failed: ${description}`);
    if (!(res.status === 429 || res.status >= 500) || attempt === MAX_ATTEMPTS) throw lastError;
    await sleep((body?.parameters?.retry_after ?? 2 ** attempt) * 1000);
  }
  throw lastError;
}
