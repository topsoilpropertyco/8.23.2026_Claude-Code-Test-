// Near-instant replies without an always-on server.
//
// The problem: reinforcement wants seconds, and a ten-minute poll gives up to
// ten minutes. The obvious fix is a Telegram webhook, but that means standing
// up the first always-on component in a deliberately serverless design -- an
// account, a deploy target, a second thing that can break at 3am.
//
// There is a cheaper answer hiding in the Bot API. getUpdates accepts a
// timeout: pass one and Telegram holds the connection open until a message
// arrives. So a scheduled job can sit on an open long poll for most of its
// interval and answer within a second or two of the message landing, using
// exactly the infrastructure that already exists.
//
// This does not make delivery instant *guaranteed* -- GitHub's scheduler runs
// late under load, and there is a gap between one run ending and the next
// starting. It turns the common case from minutes into seconds, which is the
// part that matters for a reinforcement loop. A webhook is still the only way
// to make it certain, and that decision is still open.

import { processInbox } from './inbox.js';
import { saveState } from './state.js';

// Telegram caps a long poll at 50s. Staying under it leaves room for the
// request itself so a poll cannot outlive the window it was given.
const MAX_POLL_SECONDS = 45;

export async function listen({
  config, state, token, chatId,
  seconds = 240,
  now = () => Date.now(),
  log = console.log,
  persist = true,
  ...injected
} = {}) {
  const deadline = now() + seconds * 1000;
  let batches = 0;
  let handled = 0;

  log(`listening for ${seconds}s (long poll, up to ${MAX_POLL_SECONDS}s per call)`);

  while (now() < deadline) {
    const remaining = Math.floor((deadline - now()) / 1000);
    if (remaining < 2) break;
    const pollTimeout = Math.min(MAX_POLL_SECONDS, remaining);

    let result;
    try {
      result = await processInbox({
        config, state, token, chatId,
        now: new Date(), log, pollTimeout, ...injected,
      });
    } catch (err) {
      // One bad poll must not end the window. The offset is only advanced on
      // success, so nothing is lost by trying again.
      log(`poll failed: ${err.message}`);
      continue;
    }

    batches += 1;
    if (result.count > 0) {
      handled += result.count;
      // Persist immediately. If the job is killed mid-window, the offset must
      // already be on disk or the next run answers the same message twice.
      if (persist) saveState(state);
      log(`handled ${result.count} message${result.count === 1 ? '' : 's'}`);
    }
  }

  if (persist && handled > 0) saveState(state);
  log(`listen window closed: ${batches} polls, ${handled} handled`);
  return { batches, handled };
}
