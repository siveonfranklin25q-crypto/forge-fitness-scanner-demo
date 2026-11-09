// Calendar helpers on 'YYYY-MM-DD' strings. UTC-noon arithmetic: no time-zone or DST drift,
// and no reads of the current clock (callers pass "today" in).

const DAY_MS = 86400000;

export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + 'T12:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

function assertDate(s) {
  if (!isISODate(s)) throw new TypeError(`Expected a YYYY-MM-DD date, got ${JSON.stringify(s)}`);
}

export function weekday(s) {
  assertDate(s);
  return new Date(s + 'T12:00:00Z').getUTCDay();
}

export function addDays(s, n) {
  assertDate(s);
  return new Date(Date.parse(s + 'T12:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  assertDate(a); assertDate(b);
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY_MS);
}

/** Monday-based week start for a date (ISO week convention). */
export function weekStart(s) {
  const wd = weekday(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd);
}
