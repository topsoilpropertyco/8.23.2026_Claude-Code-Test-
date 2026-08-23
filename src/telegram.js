// Telegram Bot API client.
//
// Telegram is the delivery channel because it is free at any volume, needs no
// carrier registration, and -- unlike SMS -- can carry interactive replies when
// the behavioural journalling layer lands in a later phase.

const API = 'https://api.telegram.org';

export class TelegramError extends Error {}

async function call(token, method, payload) {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new TelegramError(`${method} returned non-JSON (HTTP ${res.status})`);
  }

  if (!body.ok) {
    throw new TelegramError(`${method} failed: ${body.description ?? `HTTP ${res.status}`}`);
  }
  return body.result;
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

/** Reads recent updates so setup can discover the chat id without a webhook. */
export async function getUpdates(token) {
  return call(token, 'getUpdates', { timeout: 0, limit: 20 });
}
