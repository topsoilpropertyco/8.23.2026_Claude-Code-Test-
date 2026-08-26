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

Data is transmitted to three places: Telegram, to deliver notifications to the
operator's own chat; the Oura API, to read the operator's own data; and one
model provider, to write the coaching paragraph in the morning message.

The model provider is whichever API key is configured -- Google (Gemini) via
`GEMINI_API_KEY`, or Anthropic via `ANTHROPIC_API_KEY`. It is the only place
where personal content leaves this machine as plaintext, so it is worth being
precise about what goes and what does not.

Two things are sent. Once a day, following a logged night, the coach sends a
finished sheet of already-computed figures -- last night's score, the trailing
averages, the autonomic deltas -- together with the text of the operator's three
most recent journal entries. And each time the operator writes a journal entry,
that entry is sent along with the card it answered, the two entries before it,
and two counts: the current streak and the number of entries on record. That
second request carries no sleep data at all.

Neither ever sends the encrypted logs, the raw Oura response, the history beyond
those figures, or any identifier: no name, no email, no account number, no
device ID.

Each provider's own terms govern what it does with a request, and they are not
the same. Free-tier Google AI Studio keys in particular may allow the content
of requests to be reviewed and used to improve their products; paid Google
Cloud and Anthropic API usage generally does not. An operator sending journal
text should read the terms for the key they are actually using, or turn that
half off.

Both halves are switchable in `config.json` without touching any secret.
`coach.writtenByModel: false` stops the call entirely and restores the previous
rule-based text. `coach.sendJournalToModel: false` keeps the call but sends only
the numbers, so nothing the operator has written leaves the machine.
`coach.writtenAffirmations: false` stops the per-entry replies while leaving the
morning one, so journal text stops leaving the machine entirely.
`coach.provider` pins which provider is used. Removing the API key secret has
the same effect as turning everything off.

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
