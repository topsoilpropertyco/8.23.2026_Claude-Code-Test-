// Timezone-aware wall-clock helpers.
//
// Sleep OS thinks entirely in Seth's local wall time ("9:00 PM in Detroit"),
// but the process may run anywhere and the workflow runner is on UTC. These
// helpers convert between the two using the IANA zone, so daylight saving is
// handled by the platform rather than by a hardcoded offset.

const PARTS = ['year', 'month', 'day', 'hour', 'minute', 'second'];

function partsIn(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) {
    if (PARTS.includes(p.type)) out[p.type] = Number(p.value);
  }
  // Intl renders midnight as hour 24 in some ICU versions.
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** Local calendar date in the zone, as YYYY-MM-DD. */
export function localDateString(date, timeZone) {
  const p = partsIn(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Local wall clock in the zone, as HH:MM. */
export function localTimeString(date, timeZone) {
  const p = partsIn(date, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Offset in minutes between the zone and UTC at a given instant. */
function offsetMinutes(date, timeZone) {
  const p = partsIn(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

/**
 * Convert a local wall time in `timeZone` to the UTC instant it refers to.
 *
 * Two passes: guess using the offset at the naive instant, then re-check the
 * offset at the guess. That second pass is what makes the DST transition days
 * come out right instead of landing an hour off.
 */
export function zonedWallTimeToDate(dateString, minutesFromMidnight, timeZone) {
  const [y, m, d] = dateString.split('-').map(Number);
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = ((minutesFromMidnight % 60) + 60) % 60;
  const naive = Date.UTC(y, m - 1, d, hour, minute, 0);

  let guess = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60000);
  guess = new Date(naive - offsetMinutes(guess, timeZone) * 60000);
  return guess;
}

/** "21:00" -> 1260 */
export function parseClock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 1260 -> "9:00 PM" */
export function formatClock12(minutesFromMidnight) {
  const total = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
