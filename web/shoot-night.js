// Renders the last-night screen to a PNG and sends it to Telegram.
//
// Phase 8. The screen has been correct for a while and completely unreachable:
// it built in CI and left as a GitHub Actions artifact, which means opening
// Actions, finding the run and downloading a zip. Nobody does that daily, so
// in practice the thing did not exist.
//
// A photo in the same chat that already carries everything else costs one
// message and needs no hosting, no auth and no new surface. What it gives up
// is the motion and the press-the-dial interaction -- a screenshot throws both
// away. That is the trade, and it is worth it to actually see the thing.
//
// Chromium is a build-time dependency of this one step, not of the engine. The
// zero-runtime-dependency rule still holds for everything that sends messages.

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/facts.js';

const NIGHT_HTML = join(ROOT, 'web/night.html');
const OUT_DIR = join(ROOT, 'web');
const OUT_PNG = join(OUT_DIR, 'night.png');

// The design target. Rendering at 2x makes the type crisp on a phone; Telegram
// downscales, and an undersized image looks soft in the chat.
const WIDTH = 390;
const HEIGHT = 844;
const SCALE = 2;

function chromiumPath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

export async function shootNight({ htmlPath = NIGHT_HTML, out = OUT_PNG, log = console.log } = {}) {
  if (!existsSync(htmlPath)) {
    throw new Error(`no screen to shoot at ${htmlPath} — run web/build-night.js first`);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const { chromium } = await import('playwright-core');
  const executablePath = chromiumPath();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: SCALE,
    });

    // Not networkidle: the page pulls Google Fonts, and behind a proxy that
    // request can hang for the full timeout even though the page is ready.
    await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Let webfonts settle, then let the entrance animation finish -- a shot
    // taken mid-animation catches the screen half-faded-in.
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(1600);

    const dims = await page.evaluate(() => {
      const el = document.querySelector('.screen') ?? document.body;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), sw: document.documentElement.scrollWidth };
    });
    if (dims.sw > WIDTH) throw new Error(`screen overflows horizontally: ${dims.sw}px`);

    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    log(`shot ${dims.w}x${dims.h} → ${out}`);
    return out;
  } finally {
    await browser.close();
  }
}

/** Caption: enough to make the photo legible in a notification preview. */
export function nightCaption(data) {
  const dir = data.z >= 0 ? '+' : '';
  return [
    `Last night · ${data.dateLabel}`,
    `${data.score} · ${data.asleep} asleep · ${data.efficiency}% efficient`,
    `Better than ${data.betterThan.toLocaleString('en-US')} of your last ${data.n.toLocaleString('en-US')} nights (${dir}${data.z.toFixed(2)} SD).`,
  ].join('\n');
}
