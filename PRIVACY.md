# Privacy Policy — Sleep OS

_Last updated: 24 August 2026_

Sleep OS is a personal, single-user, open-source behavioural reminder tool. It
is operated by one individual for their own use. It is not a commercial
service, it has no customers, and it does not accept sign-ups.

## What data exists

**Data you enter.** Sleep scores, hours slept, a subjective 1–5 rating, and
free-text journal entries, all sent by the operator to their own Telegram bot.

**Data read from Oura.** With the operator's explicit authorisation, Sleep OS
reads that same person's Oura data — daily sleep and readiness summaries, sleep
periods, heart rate and heart-rate variability, and personal information used
to resolve their timezone. It reads only the authorising account's own data.

**Operational data.** Which reminder was sent when, and where the fact rotation
has reached.

## Where it goes

Everything is stored in this GitHub repository. Journal entries and the sleep
log are encrypted with AES-256-GCM before being written; the key is held as a
repository secret and is not present in the source. Operational data is stored
unencrypted because it contains no personal content.

Data is transmitted to exactly two places: Telegram, to deliver notifications
to the operator's own chat, and the Oura API, to read the operator's own data.

## What does not happen

No analytics. No advertising. No third-party trackers. No data is sold, shared,
rented, or transferred to anyone. No other person's data is ever accessed. There
are no other users to share anything with.

## Retention and removal

Data persists in the repository's git history until deleted. The operator can
remove all of it at any time by deleting the repository, and can revoke Sleep
OS's access to Oura at any time from their Oura account settings.

## Contact

Raise an issue on this repository.
