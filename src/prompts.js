// Journal prompts.
//
// Every delivered fact carries one question. The prompts rotate on their own
// cycle, independent of the fact rotation, so the same fact rarely arrives with
// the same question twice -- which is the point: the fact supplies the evidence,
// the prompt decides what you do with it, and varying the mechanism keeps the
// reflection from going on autopilot the way a fixed question does.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './facts.js';
import { rngFrom, shuffle } from './rng.js';

let cache = null;

export function loadPrompts() {
  if (!cache) cache = JSON.parse(readFileSync(join(ROOT, 'data/prompts.json'), 'utf8'));
  return cache;
}

/** Fill {move}, {truth} and {category} against the fact the prompt ships with. */
export function fillPrompt(text, fact) {
  return text
    .replace(/\{move\}/g, fact.move)
    .replace(/\{truth\}/g, fact.truth)
    .replace(/\{category\}/g, fact.category);
}

/**
 * Pick the next prompt for a slot, preferring one tagged for that slot and
 * avoiding the mechanism used on the previous send so two consecutive cards
 * never ask the same shape of question.
 */
export function selectPrompt({ state, slotId, lastMechanism }) {
  const { prompts } = loadPrompts();

  let cycle = state.promptCycle ?? 0;
  let remaining = Array.isArray(state.promptRemaining) ? state.promptRemaining.slice() : [];

  if (remaining.length === 0) {
    cycle = (state.promptCycle ?? 0) + (state.promptRemaining ? 1 : 0);
    remaining = shuffle(prompts, rngFrom(`sleep-os:prompt-cycle:${cycle}`)).map((p) => p.id);
  }

  const byId = new Map(prompts.map((p) => [p.id, p]));
  const queue = remaining.map((id) => byId.get(id)).filter(Boolean);

  const forSlot = (p) => p.slots.includes(slotId);
  const fresh = (p) => p.mechanism !== lastMechanism;

  const pick =
    queue.find((p) => forSlot(p) && fresh(p)) ||
    queue.find(forSlot) ||
    queue.find(fresh) ||
    queue[0];

  return {
    prompt: pick,
    promptCycle: cycle,
    promptRemaining: remaining.filter((id) => id !== pick.id),
  };
}

/** Morning intake prompts rotate on a simple deterministic cursor. */
export function morningPrompt(index) {
  const { intake } = loadPrompts();
  return intake.prompts[index % intake.prompts.length];
}

export function intakeRequest() {
  return loadPrompts().intake.request;
}
