#!/usr/bin/env node
// Renders the ten screens for a given night and sends them as ONE swipeable
// Telegram album.
//
// Why an album rather than a link. A link has to point at something that gets
// rebuilt every morning, and nothing available here can do that: GitHub Actions
// cannot republish a claude.ai artifact, and this repository is public, so a
// Pages site would put sleep data on the open web. A pinned URL therefore always
// drifts -- which is exactly the failure Seth hit, a message about a 74 whose
// link still showed him an 88.
//
// An album has none of that. It is rendered from telemetry at send time, arrives
// in a private chat, and needs no hosting, so there is no artefact left over to
// go stale. Telegram's album cap is 10 and the deck is 10 screens.
//
//   node bin/send-deck.mjs                 # latest night
//   node bin/send-deck.mjs 2026-08-24      # a specific night
//   node bin/send-deck.mjs --dry           # render only, send nothing

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sendMediaGroup, sendMessage, MEDIA_GROUP_MAX } from '../src/telegram.js';
import { loadConfig } from '../src/facts.js';
import { deckUrl } from '../src/deckurl.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/deck-shots');
const SCREENS = ['s1', 's2', 's3', 's4', 's5', 's6', 'g1', 'g2'];

const dry = process.argv.includes('--dry');
const date = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// The workflow runs this with continue-on-error, because a broken screenshot
// must never stop the reminders going out. That is right, but it also means a
// failure here is invisible: the step reports success and no deck arrives. A
// silent absence is exactly the failure mode that produced the stale-deck bug,
// so say so in the chat instead of leaving it to be noticed weeks later.
async function bail(reason) {
  console.error(`send-deck: ${reason}`);
  if (token && chatId && !dry) {
    try {
      await sendMessage(token, chatId,
        `Sleep OS: the deck could not be built this morning.\n\n${reason}\n\n`
        + 'The reminders are unaffected. Nothing stale was sent in its place.');
    } catch (err) {
      console.error(`send-deck: could not report the failure either -- ${err.message}`);
    }
  }
  process.exit(1);
}

// A failed step has already printed its own reason; a Node stack on top of that
// only buries it in the CI log.
const run = async (cmd, args, what) => {
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    await bail(`${what} failed (${cmd} ${args.join(' ')}). See the workflow log.`);
  }
};

// Rebuild in order: extract the night, regenerate every screen from it, then
// photograph them. Each step consumes the previous one's output, so a screen
// cannot carry a night the extractor did not produce.
// --dry may reuse an existing sample so the render-and-assemble chain can be
// exercised without the key. A real send never can.
if (!(dry && existsSync(join(ROOT, 'data/last-night.json')))) {
  console.log('send-deck: extracting the night');
  await run('node', ['bin/build-night-data.mjs', ...(date ? [date] : [])], 'extracting the night');
}

const night = JSON.parse(readFileSync(join(ROOT, 'data/last-night.json'), 'utf8'));
if (night.sample && !dry) {
  await bail('the night file holds SAMPLE data, so there is no real night to send.');
}

console.log('send-deck: rebuilding screens');
await run('python3', ['bin/build-screens.py'], 'rebuilding the screens');
await run('python3', ['bin/build-deck.py'], 'building the dashboard');

// Encrypt and publish before announcing it. Sending a link to a page that has
// not been redeployed yet would point at last night's dashboard, which is the
// original bug in a new costume. Best-effort: publishing is the least important
// thing here and must not stop the message going out.
if (process.env.GITHUB_ACTIONS && process.env.SLEEPOS_DATA_KEY) {
  try {
    execFileSync('node', ['bin/build-page.mjs'], { cwd: ROOT, stdio: 'inherit' });
    execFileSync('node', ['bin/publish-page.mjs'], { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error('send-deck: publishing the dashboard failed; the message still goes out');
  }
}

// Two delivery modes, chosen by config so switching is not a code change.
// 'link' sends one message pointing at the encrypted dashboard; 'album' renders
// the screens and sends them as photos. The album stays the default until the
// Pages deploy is confirmed working -- a link that 404s and no photos would mean
// no morning deck at all.
const mode = loadConfig().deckDelivery === 'link' ? 'link' : 'album';
if (mode === 'link') {
  const url = deckUrl();
  if (!url) await bail('deckDelivery is "link" but no dashboard URL could be built.');
  const sl = night.standing;
  const text = (night.stale
      ? `${night.date} — the newest night Oura has (${night.daysBehind} days back)`
      : `Last night — ${night.date}`)
    + `\nScore ${night.score} · ${sl.percentile}th percentile of your ${night.population.n} nights`
    + `\n\nThe whole night, eight panels → ${url}`;
  if (dry) {
    console.log('send-deck: --dry, not sending. Would send:');
    console.log(text.split('\n').map((l) => `  ${l}`).join('\n'));
    process.exit(0);
  }
  if (!token || !chatId) {
    console.error('send-deck: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.');
    process.exit(1);
  }
  try {
    await sendMessage(token, chatId, text);
  } catch (err) {
    await bail(`Telegram rejected the link message -- ${err.message}`);
  }
  console.log(`send-deck: sent the dashboard link for ${night.date} (score ${night.score})`);
  process.exit(0);
}

console.log('send-deck: rendering');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await run('node', ['bin/render.mjs', OUT, ...SCREENS.map((k) => `variants/${k}/index.html`)],
          'rendering the screens');

const shots = SCREENS.map((k) => join(OUT, 'variants', k, 'index.htm.png'));
const missing = shots.filter((p) => !existsSync(p));
if (missing.length) {
  await bail(`${missing.length} of ${SCREENS.length} screens failed to render.`);
}
if (shots.length > MEDIA_GROUP_MAX) {
  await bail(`${shots.length} screens exceeds Telegram's album cap of ${MEDIA_GROUP_MAX}.`);
}

const s = night.standing;
// Name the night rather than calling it "last night". When the ring has not
// synced, the newest record is not last night, and saying so is the difference
// between a screen that is behind and a screen that is lying.
const heading = night.stale
  ? `${night.date} — the newest night Oura has (${night.daysBehind} days back)`
  : `Last night — ${night.date}`;
const caption = `${heading}\n`
  + `Score ${night.score} · ${s.percentile}th percentile of your ${night.population.n} nights `
  + `· rank ${s.rank}\n`
  + (night.stale
    ? 'Open the Oura app to sync, and I will resend with the current night.'
    : `Swipe for all ${shots.length} screens. Rebuilt from your data, every morning.`);

if (dry) {
  console.log('send-deck: --dry, not sending. Caption would be:');
  console.log(caption.split('\n').map((l) => `  ${l}`).join('\n'));
  process.exit(0);
}

if (!token || !chatId) {
  console.error('send-deck: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.');
  process.exit(1);
}

try {
  await sendMediaGroup(token, chatId, shots, caption);
} catch (err) {
  await bail(`Telegram rejected the album -- ${err.message}`);
}
console.log(`send-deck: sent ${shots.length} screens for ${night.date} (score ${night.score})`);
