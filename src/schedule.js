// Daily delivery schedule.
//
// Anchor times come from config; each one gets a Gaussian jitter offset derived
// deterministically from the date and slot id. Recomputing the schedule mid-day
// yields the same times, so the dispatcher can run on a tight polling loop
// without the targets drifting.

import { gaussian, rngFrom } from './rng.js';
import { parseClock, zonedWallTimeToDate, formatClock12 } from './time.js';

export function buildDaySchedule(config, dateString) {
  const { timezone, jitter } = config;

  return config.slots
    .filter((slot) => slot.enabled !== false)
    .map((slot) => {
      const anchorMinutes = parseClock(slot.anchor);
      let offset = 0;
      if (jitter?.enabled) {
        const rng = rngFrom(`sleep-os:jitter:${dateString}:${slot.id}`);
        offset = Math.round(gaussian(rng, jitter.sigmaMinutes ?? 10, jitter.maxMinutes ?? 20));
      }
      const targetMinutes = anchorMinutes + offset;
      return {
        ...slot,
        anchorMinutes,
        offsetMinutes: offset,
        targetMinutes,
        targetLabel: formatClock12(targetMinutes),
        anchorLabel: formatClock12(anchorMinutes),
        targetAt: zonedWallTimeToDate(dateString, targetMinutes, timezone),
      };
    })
    .sort((a, b) => a.targetMinutes - b.targetMinutes);
}

/**
 * Slots that are due right now: target time has passed, not already sent today,
 * and not so stale that the nudge has lost its meaning (a 9 PM shutdown alert
 * landing at 11 PM is worse than no alert).
 */
export function dueSlots(schedule, now, sentSlotIds, maxLatenessMinutes) {
  const due = [];
  const missed = [];
  for (const slot of schedule) {
    if (sentSlotIds.includes(slot.id)) continue;
    const ageMinutes = (now.getTime() - slot.targetAt.getTime()) / 60000;
    if (ageMinutes < 0) continue;
    if (ageMinutes > maxLatenessMinutes) missed.push({ ...slot, ageMinutes });
    else due.push({ ...slot, ageMinutes });
  }
  return { due, missed };
}
