// Message rendering.
//
// The five-field card is sent as plain text with no markdown: no bold, no
// italics, no bullets, no asterisks. That formatting choice is deliberate and
// locked -- Telegram is called with parse_mode omitted so nothing renders as
// markup and the card reads exactly as written in the library.

import { CARD_FIELDS, CARD_LABELS } from './facts.js';

/** The five-field card, verbatim, one labelled line per field. */
export function renderCard(fact) {
  return CARD_FIELDS.map((field) => `${CARD_LABELS[field]}: ${fact[field]}`).join('\n\n');
}

/**
 * Full notification body: a thin context header, then the card.
 * The header is the only Sleep OS voice in the message; the card is the source.
 */
export function renderMessage({ fact, slot, jackpot, prompt }) {
  const lines = [];

  if (jackpot) {
    lines.push('SLEEP OS  //  JACKPOT DROP');
  } else {
    lines.push(`SLEEP OS  //  ${slot.name}`);
  }
  lines.push(`${slot.targetLabel}  ·  ${slot.objective}`);
  lines.push('');
  lines.push(renderCard(fact));

  // One question per card. Reflection is what turns a read fact into a
  // decision, so the prompt travels with the evidence rather than arriving
  // separately where it would be ignored.
  if (prompt) {
    lines.push('');
    lines.push('─────');
    lines.push(prompt.text);
  }

  return lines.join('\n');
}

/** The 6 AM intake ask. No fact -- this slot collects rather than delivers. */
export function renderIntake({ slot, request }) {
  return [`SLEEP OS  //  ${slot.name}`, `${slot.targetLabel}  ·  ${slot.objective}`, '', request].join('\n');
}

/** One-line summary for logs and the CLI. */
export function renderSummary({ fact, slot, jackpot }) {
  const tag = jackpot ? ' [JACKPOT]' : '';
  return `${slot.targetLabel.padStart(8)}  ${slot.id.padEnd(20)} ${fact.id.padEnd(9)} ${fact.library.padEnd(5)} ${fact.category}${tag}`;
}
