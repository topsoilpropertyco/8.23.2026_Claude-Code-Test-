// The dashboard's address, key included.
//
// The page published to GitHub Pages is ciphertext (see bin/build-page.mjs). Its
// key lives in the URL fragment, which browsers never send to a server, so the
// link is the credential. This module is the single place the key is derived, so
// the builder that encrypts and the message that hands out the link cannot drift
// apart -- if they did, the link would 404 into a decrypt failure and look for
// all the world like a broken page.
//
// Derived from SLEEPOS_DATA_KEY rather than being its own secret: CI already
// holds that one, and HKDF is one-way, so a link in a chat log says nothing
// about the key guarding the telemetry. Fixed salt and info because the
// derivation has to be reproducible -- a fresh key every deploy would break the
// bookmark, which is the whole point of having a link.

import { hkdfSync } from 'node:crypto';
import { loadConfig } from './facts.js';

const SALT = 'sleep-os-deck';
const INFO = 'deck-page-v1';

/** The 32-byte page key as base64url, or null with no data key to derive from. */
export function pageKey(secret = process.env.SLEEPOS_DATA_KEY) {
  if (!secret) return null;
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(secret, 'utf8'),
             Buffer.from(SALT, 'utf8'), Buffer.from(INFO, 'utf8'), 32),
  ).toString('base64url');
}

/**
 * The full dashboard link, or null if it cannot be built.
 *
 * Null is a normal answer, not a failure: with no configured base the deck ships
 * as a Telegram album instead, and a caller that cannot build the link simply
 * omits the line. Never return a bare base without the fragment -- that is a
 * page that loads and then reports itself broken, which is worse than no link.
 */
export function deckUrl({ base = loadConfig().screensUrl, secret, version } = {}) {
  const key = pageKey(secret);
  if (!base || !key) return null;

  // A cache-busting query parameter, and it is not decoration. The page is
  // republished at the same address every time a night lands, so for a reader
  // the URL is a constant -- and a constant URL is exactly what a browser cache
  // is designed to serve without asking. Seth clicked the same link three
  // mornings running and got the same stale page each time while the live one
  // had been correct for hours; the page was fine, the cache was doing its job.
  // GitHub Pages gives no control over cache headers, so the URL has to change
  // when the content does. The key stays in the fragment, which is not part of
  // the request, so a bookmarked older link still decrypts the newer page.
  const v = version ?? new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const q = v ? `?v=${encodeURIComponent(v)}` : '';
  return `${String(base).replace(/\/+$/, '')}/${q}#${key}`;
}
