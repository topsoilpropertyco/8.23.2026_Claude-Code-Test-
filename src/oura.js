// Oura API v2 client with OAuth2 token management.
//
// Personal Access Tokens were retired by Oura in 2025 ("new Personal Access
// Tokens can no longer be created"), so this uses the server-side OAuth2 flow.
//
// The awkward part is that Oura's refresh tokens are SINGLE USE and rotate:
// every refresh invalidates the old token and issues a new one. Lose the new
// one and the integration is dead until a human re-authorises in a browser.
// Two things guard against that:
//
//   1. The token set is written to disk the instant a refresh returns, before
//      the access token is used for anything else, so the window in which a
//      crash could lose it is as small as possible.
//   2. A refresh only happens when the access token has actually expired --
//      roughly once a day rather than on every ten-minute poll -- so that
//      window is entered as rarely as possible.
//
// The token set is encrypted with the same key as the journal, because the
// repository is public.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './facts.js';
import { encryptLine, decryptLine, hasKey, MissingKeyError } from './crypto.js';

// Applications created in Oura's post-2025 developer portal authenticate
// against a different OAuth server from the legacy one, with differently named
// scopes. Discovered from the issuer in the callback:
//   https://moi.ouraring.com/oauth/v2/ext/oauth-anonymous/.well-known/openid-configuration
// The legacy endpoints (cloud.ouraring.com/oauth/authorize and
// api.ouraring.com/oauth/token) return "Invalid client" for these apps.
const AUTHORIZE_URL = 'https://moi.ouraring.com/oauth/v2/ext/oauth-authorize';
const TOKEN_URL = 'https://moi.ouraring.com/oauth/v2/ext/oauth-token';
const API = 'https://api.ouraring.com/v2/usercollection';

const TOKEN_FILE = join(ROOT, 'state/oura.enc');
const REDIRECT_URI = 'https://example.com/callback';

// Refresh this long before actual expiry, so a slow run never sends a request
// with a token that expires mid-flight.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

// The new server namespaces its scopes; the bare names the legacy docs list
// are silently not granted.
export const SCOPES = [
  'extapi:personal',
  'extapi:daily',
  'extapi:heartrate',
  'extapi:session',
  'extapi:stress',
  'extapi:heart_health',
];

export class OuraError extends Error {}
export class NotAuthorisedError extends OuraError {
  constructor() {
    super('Oura is not authorised yet. Run the authorise flow to connect it.');
    this.name = 'NotAuthorisedError';
  }
}

/* ------------------------------------------------------------ token store */

export function readTokens() {
  if (!existsSync(TOKEN_FILE)) return null;
  if (!hasKey()) throw new MissingKeyError();
  const raw = decryptLine(readFileSync(TOKEN_FILE, 'utf8').trim());
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeTokens(tokens) {
  if (!hasKey()) throw new MissingKeyError();
  mkdirSync(join(ROOT, 'state'), { recursive: true });
  writeFileSync(TOKEN_FILE, `${encryptLine(JSON.stringify(tokens))}\n`);
  return tokens;
}

export function isAuthorised() {
  try {
    return Boolean(readTokens()?.refresh_token);
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------- authorisation */

/** The URL a human opens once to grant access. */
export function authorizeUrl(clientId, state = 'sleep-os') {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OuraError(`token endpoint returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new OuraError(`token request failed (HTTP ${res.status}): ${parsed.error_description ?? parsed.error ?? text}`);
  }
  return parsed;
}

function shape(result) {
  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    // Oura returns a lifetime in seconds; store the absolute instant instead so
    // expiry is not re-derived from an assumed clock on every run.
    expires_at: new Date(Date.now() + (result.expires_in ?? 86400) * 1000).toISOString(),
    obtained_at: new Date().toISOString(),
  };
}

/** One-time exchange of the authorisation code for a token pair. */
export async function exchangeCode({ code, clientId, clientSecret }) {
  const tokens = shape(
    await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  );
  return writeTokens(tokens);
}

/**
 * Return a usable access token, refreshing only if the current one has expired.
 * The rotated refresh token is persisted before this returns.
 */
export async function accessToken({ clientId, clientSecret, log = () => {} } = {}) {
  const tokens = readTokens();
  if (!tokens?.refresh_token) throw new NotAuthorisedError();

  const expiresAt = new Date(tokens.expires_at ?? 0).getTime();
  if (tokens.access_token && Date.now() < expiresAt - EXPIRY_MARGIN_MS) {
    return tokens.access_token;
  }

  log('oura: access token expired, refreshing');
  const refreshed = shape(
    await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  );

  // Persist immediately. The old refresh token is already dead at this point.
  writeTokens(refreshed);
  log('oura: refreshed and persisted');
  return refreshed.access_token;
}

/* --------------------------------------------------------------- endpoints */

async function get(path, token, params = {}) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 500;
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
    }
    if (res.status === 401) throw new OuraError('Oura rejected the token (401). Re-authorisation needed.');
    if (!res.ok) throw new OuraError(`GET ${path} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);

    return res.json();
  }
  throw new OuraError(`GET ${path} failed after 4 attempts`);
}

/** Page through a date-ranged collection until Oura stops handing back a cursor. */
export async function collection(path, token, { start, end } = {}) {
  const rows = [];
  let nextToken = null;

  do {
    const page = await get(path, token, {
      start_date: start,
      end_date: end,
      next_token: nextToken,
    });
    rows.push(...(page.data ?? []));
    nextToken = page.next_token ?? null;
  } while (nextToken);

  return rows;
}

export const dailySleep = (token, range) => collection('daily_sleep', token, range);
export const dailyReadiness = (token, range) => collection('daily_readiness', token, range);
export const dailyStress = (token, range) => collection('daily_stress', token, range);
export const sleepPeriods = (token, range) => collection('sleep', token, range);
export const personalInfo = (token) => get('personal_info', token);

export { REDIRECT_URI, AUTHORIZE_URL, TOKEN_URL };
