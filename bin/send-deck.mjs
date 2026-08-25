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
import { sendMediaGroup, MEDIA_GROUP_MAX } from '../src/telegram.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/deck-shots');
const SCREENS = ['s1', 's2', 's3', 's4', 's5', 's6', 'n1', 'n2', 'g1', 'g2'];

const dry = process.argv.includes('--dry');
const date = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

// A failed step has already printed its own reason; a Node stack on top of that
// only buries it in the CI log.
const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error(`send-deck: step failed -- ${cmd} ${args.join(' ')}`);
    process.exit(1);
  }
};

// Rebuild in order: extract the night, regenerate every screen from it, then
// photograph them. Each step consumes the previous one's output, so a screen
// cannot carry a night the extractor did not produce.
// --dry may reuse an existing sample so the render-and-assemble chain can be
// exercised without the key. A real send never can.
if (!(dry && existsSync(join(ROOT, 'data/last-night.json')))) {
  console.log('send-deck: extracting the night');
  run('node', ['bin/build-night-data.mjs', ...(date ? [date] : [])]);
}

const night = JSON.parse(readFileSync(join(ROOT, 'data/last-night.json'), 'utf8'));
if (night.sample && !dry) {
  console.error('send-deck: refusing to send SAMPLE data as a real night.');
  process.exit(1);
}

console.log('send-deck: rebuilding screens');
run('python3', ['bin/build-screens.py']);

console.log('send-deck: rendering');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
run('node', ['bin/render.mjs', OUT, ...SCREENS.map((k) => `variants/${k}/index.html`)]);

const shots = SCREENS.map((k) => join(OUT, 'variants', k, 'index.htm.png'));
const missing = shots.filter((p) => !existsSync(p));
if (missing.length) {
  console.error(`send-deck: ${missing.length} screen(s) failed to render:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
if (shots.length > MEDIA_GROUP_MAX) {
  console.error(`send-deck: ${shots.length} screens exceeds Telegram's album cap of ${MEDIA_GROUP_MAX}.`);
  process.exit(1);
}

const s = night.standing;
const caption = `Last night — ${night.date}\n`
  + `Score ${night.score} · ${s.percentile}th percentile of your ${night.population.n} nights `
  + `· rank ${s.rank}\n`
  + `Swipe for all ${shots.length} screens. Rebuilt from last night's data, every morning.`;

if (dry) {
  console.log('send-deck: --dry, not sending. Caption would be:');
  console.log(caption.split('\n').map((l) => `  ${l}`).join('\n'));
  process.exit(0);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
if (!token || !chatId) {
  console.error('send-deck: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.');
  process.exit(1);
}

await sendMediaGroup(token, chatId, shots, caption);
console.log(`send-deck: sent ${shots.length} screens for ${night.date} (score ${night.score})`);
