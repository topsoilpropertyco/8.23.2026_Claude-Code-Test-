// Encryption for the personal data files.
//
// The repository is public so the engine can use unlimited GitHub Actions
// minutes, which means everything committed is world-readable. The code is
// fine that way; the journal and the sleep log are not. Those two files are
// therefore stored as ciphertext and only the runner, holding the key from a
// repository secret, can read them.
//
// Records are encrypted one line at a time rather than as a whole file, so
// appending stays a single write and a corrupted line can never take the rest
// of the journal down with it.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENV = 'SLEEPOS_DATA_KEY';

export class MissingKeyError extends Error {
  constructor() {
    super(
      `${ENV} is not set. Personal data cannot be read or written without it.\n` +
        `Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\n` +
        `then store it as the ${ENV} repository secret.`,
    );
    this.name = 'MissingKeyError';
  }
}

export function hasKey() {
  return Boolean(process.env[ENV]);
}

/**
 * Does this line look like one of our ciphertext records?
 *
 * Needed to tell three situations apart that all used to look identical from
 * the outside: a genuinely empty log, a log we cannot read because the key is
 * absent, and a log we cannot read because the key is WRONG. The last one is
 * the dangerous case -- writes keep succeeding under the new key while every
 * older record silently vanishes from every read.
 */
export function looksEncrypted(line) {
  const trimmed = String(line).trim();
  if (!trimmed || trimmed.startsWith('{')) return false;
  let buf;
  try {
    buf = Buffer.from(trimmed, 'base64');
  } catch {
    return false;
  }
  return buf.length > IV_BYTES + TAG_BYTES;
}

function key() {
  const raw = process.env[ENV];
  if (!raw) throw new MissingKeyError();
  // Accept base64, hex, or a passphrase; anything that is not already 32 bytes
  // is hashed to 32 so a mistyped key length can never silently weaken this.
  const buf = Buffer.from(raw, /^[0-9a-fA-F]{64}$/.test(raw) ? 'hex' : 'base64');
  return buf.length === 32 ? buf : createHash('sha256').update(raw).digest();
}

/** Encrypt one record to a single base64 line. */
export function encryptLine(plaintext) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

/**
 * Decrypt one line. A line that is not ciphertext is returned unchanged, which
 * keeps pre-encryption records readable rather than throwing on old data.
 */
export function decryptLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{')) return trimmed; // legacy plaintext record

  let buf;
  try {
    buf = Buffer.from(trimmed, 'base64');
  } catch {
    return trimmed;
  }
  if (buf.length <= IV_BYTES + TAG_BYTES) return trimmed;

  try {
    const decipher = createDecipheriv(ALGO, key(), buf.subarray(0, IV_BYTES));
    decipher.setAuthTag(buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(buf.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // A record that will not authenticate is corrupt or from another key.
    // Skipping it is better than failing the whole run.
    return '';
  }
}
