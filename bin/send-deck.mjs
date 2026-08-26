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

// Two delivery modes, chosen by config so switching is not a code change.
// 'link' sends one message pointing at the encrypted dashboard; 'album' renders
// the screens and sends them as photos. The album stays the default until the
// Pages deploy is confirmed working -- a link that 404s and no photos would mean
// no morning deck at all.
// 'auto' probes the published page and uses the link when it is actually live,
// falling back to the album when it is not. That removes the manual flip: the
// day Pages is enabled the delivery switches by itself, and until then a link
// that would 404 is never sent.
const configured = loadConfig().deckDelivery || 'auto';
let mode = configured === 'link' ? 'link' : configured === 'album' ? 'album' : null;
if (mode === null) {
  const url = deckUrl();
  if (!url) {
    mode = 'album';
    console.log('send-deck: no dashboard URL configured, sending the album');
  } else {
    const base = url.split('#')[0];
    try {
      // HEAD would be enough, but some static hosts answer it differently from
      // the GET a phone will actually make.
      const res = await fetch(base, { method: 'GET', redirect: 'follow' });
      mode = res.ok ? 'link' : 'album';
      console.log(`send-deck: ${base} returned ${res.status}, sending the `
        + `${mode === 'link' ? 'link' : 'album'}`);
    } catch (err) {
      mode = 'album';
      console.log(`send-deck: could not reach the dashboard (${err.message}), sending the album`);
    }
  }
}

/**
 * Last night, as a message worth reading on its own.
 *
 * This used to be two lines -- the score and a percentile -- followed by "your
 * whole history, interactive". Which described the link accurately and buried
 * the thing actually being reported. Every figure below was already sitting in
 * data/last-night.json; none of it was being used. A morning message about last
 * night should say what happened last night, and the link should be the way to
 * go deeper rather than the only place the detail exists.
 */
function lastNightText(n, { url = null, footer = null } = {}) {
  const v = n.night ?? {};
  const sl = n.standing ?? {};
  const lines = [];

  lines.push(n.stale
    ? `${n.date} — the newest night Oura has (${n.daysBehind} days back)`
    : `LAST NIGHT — ${n.date}`);
  lines.push('');

  // A percentile is a rank, so it is a whole number. Printing one decimal turned
  // "13th" into "13.1th", which reads as a typo because it is one.
  const pct = sl.percentile == null ? null : Math.round(sl.percentile);
  const ord = (i) => {
    const r = i % 100;
    if (r >= 11 && r <= 13) return `${i}th`;
    return `${i}${['th', 'st', 'nd', 'rd'][i % 10] ?? 'th'}`;
  };
  lines.push(`Score ${n.score}`
    + (pct === null ? '' : `   ${ord(pct)} percentile of your ${n.population.n} nights`));
  if (sl.rank) lines.push(`Rank ${sl.rank} of ${n.population.n}`);

  // How it sat against the recent run, which is the comparison that answers
  // "was that bad or does it just feel bad".
  const t7 = (n.trailing ?? []).find((t) => t.window === 7);
  const t30 = (n.trailing ?? []).find((t) => t.window === 30);
  const vs = [];
  const delta = (label, avg) => {
    if (avg == null) return;
    const d = n.score - avg;
    vs.push(`${label} ${avg.toFixed(1)} ${d >= 0 ? '▲ +' : '▼ −'}${Math.abs(d).toFixed(1)}`);
  };
  delta('7-night', t7?.avg);
  delta('30-night', t30?.avg);
  if (vs.length) { lines.push(''); lines.push(vs.join('   ')); }

  // The night itself. Everything here is measured, and anything Oura did not
  // report is simply left out rather than printed as a zero.
  const sleep = [];
  if (v.asleepLabel) sleep.push(`${v.asleepLabel} asleep`);
  if (v.efficiency != null) sleep.push(`${v.efficiency}% efficient`);
  if (v.latency != null) sleep.push(`${v.latency}m to fall asleep`);
  if (sleep.length) { lines.push(''); lines.push(sleep.join('  ·  ')); }

  const stages = [];
  if (v.deep?.label) stages.push(`Deep ${v.deep.label}`);
  if (v.rem?.label) stages.push(`REM ${v.rem.label}`);
  if (v.light?.label) stages.push(`Light ${v.light.label}`);
  if (v.awake?.label) stages.push(`Awake ${v.awake.label}`);
  if (stages.length) lines.push(stages.join('  ·  '));

  const body = [];
  if (v.hrv != null) body.push(`HRV ${v.hrv}ms`);
  if (v.restingHr != null) body.push(`Low HR ${v.restingHr}`);
  if (v.breath != null) body.push(`Breath ${v.breath}/min`);
  if (body.length) lines.push(body.join('  ·  '));

  const clock = [];
  if (v.bedtimeStart) clock.push(`In bed ${v.bedtimeStart.slice(11, 16)}`);
  if (v.bedtimeEnd) clock.push(`up ${v.bedtimeEnd.slice(11, 16)}`);
  if (clock.length) lines.push(clock.join(' · '));

  if (url) {
    lines.push('');
    lines.push(`Open last night → ${url}`);
  }
  if (footer) {
    lines.push('');
    lines.push(footer);
  }
  return lines.join('\n');
}

// Build only what the chosen delivery actually needs, and let the rest fail
// harmlessly. The order used to be the other way round: the dashboard was built
// before the mode was decided, with `run()` -- which bails on failure. So in
// album mode a broken dashboard build took the screens down with it, and the
// screens were the thing being delivered. Nothing that only serves the link may
// be able to stop the album.
// Which page gets published behind the link. "screens" wraps the very documents
// the album photographs, so the link and the album are the same eight screens --
// which is what Seth asked for, and what should have been built first instead of
// a separate dashboard. "dashboard" keeps the interactive build available.
const pageStyle = loadConfig().pageStyle || 'screens';

// The screens are the input to both the album and the screens-style page, so
// they are rebuilt whenever either one needs them.
if (mode === 'album' || pageStyle === 'screens') {
  console.log('send-deck: rebuilding screens');
  await run('python3', ['bin/build-screens.py'], 'rebuilding the screens');
}

// The page is still published in album mode, best-effort, because the morning
// coach message carries its own link line -- stop republishing and that link
// quietly rots while everything else looks fine.
const publishPage = async () => {
  const builder = pageStyle === 'dashboard' ? 'bin/build-dashboard.mjs' : 'bin/build-deckpage.mjs';
  try {
    execFileSync('node', [builder], { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error(`send-deck: building the page (${builder}) failed`
      + (mode === 'link' ? '' : '; the screens still go out'));
    return false;
  }
  if (!process.env.GITHUB_ACTIONS || !process.env.SLEEPOS_DATA_KEY) return false;
  try {
    execFileSync('node', ['bin/build-page.mjs'], { cwd: ROOT, stdio: 'inherit' });
    execFileSync('node', ['bin/publish-page.mjs'], { cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch {
    console.error('send-deck: publishing the dashboard failed; the message still goes out');
    return false;
  }
};

if (mode === 'link') {
  // Here the page IS the delivery, so a failure to build it is fatal: a link to
  // a page that was never rebuilt points at an older night, which is the
  // original stale-deck bug wearing a different hat.
  if (!(await publishPage())) {
    await bail('delivery is "link" but the dashboard could not be built and published.');
  }
  const url = deckUrl();
  if (!url) await bail('delivery is "link" but no dashboard URL could be built.');
  const text = lastNightText(night, { url });
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

// Published before the album is sent, so the link in the caption points at the
// page for the night the photographs show rather than the one before it.
const published = await publishPage();

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

// The same summary the link message carries, from the same function. These were
// two separate builders and they had drifted: the album's still printed the
// un-rounded "13.1th" ordinal and stopped at score-and-rank, while the link
// message had grown the full night. One caption, one place to fix.
//
// Telegram allows 1024 characters on an album caption and this runs to about
// 450, so the whole summary fits alongside the screens.
// The link rides along with the photographs, pointing at the same eight screens
// as a page that can be swiped and linked to. Omitted rather than guessed at if
// the publish did not happen -- a link to a page that was not rebuilt is the
// stale-deck bug again.
const caption = lastNightText(night, {
  url: published ? deckUrl() : null,
  footer: night.stale
    ? 'Open the Oura app to sync, and I will resend with the current night.'
    : `Swipe the ${shots.length} screens here, or open the same ${shots.length} in the link above.`,
});

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
