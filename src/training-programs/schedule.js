// Planning: which session (or rest) is due on a date, and what the targets are.
// Two schedule modes, both user-adjustable:
//   'fixed-week' — the weekday layout decides (source-style: Mon A, Tue B, ... Sun rest).
//   'rolling'    — the next training day continues the rotation from the last COMPLETED session,
//                  so a missed day never skips a workout and never "breaks" anything.

import { isISODate, weekday, daysBetween } from './dates.js';

// A session that actually happened (fully or partly) moves the rotation on; skipped,
// aborted and safety-stopped sessions leave the same workout waiting.
export const ADVANCES = new Set(['completed', 'partial']);

export const DEFAULT_CONFIG = Object.freeze({
  mode: 'rolling',
  startDate: null,            // required: YYYY-MM-DD the program starts
  restWeekdays: [0],          // Sunday rest by default; owner may choose others
  rotation: ['A', 'B', 'C'],
  restSec: null,              // null = program default (forge-default)
  includeOptional: true,      // include `unverified`/optional exercises
  setsChoice: 'min',          // 'min' (conservative start) or 'max' of each source set range
});

export function normalizeConfig(program, config = {}) {
  const c = { ...DEFAULT_CONFIG, ...config };
  const errors = [];
  if (!isISODate(c.startDate)) errors.push('startDate must be YYYY-MM-DD');
  if (!['rolling', 'fixed-week'].includes(c.mode)) errors.push('mode must be rolling or fixed-week');
  if (!Array.isArray(c.restWeekdays) || c.restWeekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) errors.push('restWeekdays must be integers 0-6');
  else if (new Set(c.restWeekdays).size >= 7) errors.push('at least one training weekday is required');
  if (!Array.isArray(c.rotation) || !c.rotation.length || c.rotation.some(k => !program.days[k])) errors.push('rotation must list program day keys');
  if (c.restSec !== null && (!Number.isInteger(c.restSec) || c.restSec < 15 || c.restSec > 600)) errors.push('restSec must be 15-600 seconds or null');
  if (!['min', 'max'].includes(c.setsChoice)) errors.push('setsChoice must be min or max');
  if (errors.length) throw new RangeError('Invalid training config: ' + errors.join('; '));
  return { ...c, restWeekdays: [...new Set(c.restWeekdays)].sort() };
}

/** Targets for one program day. Pure: same inputs -> same object. */
export function buildDayPlan(program, dayKey, config) {
  const d = program.days[dayKey];
  if (!d) throw new RangeError(`Unknown day ${dayKey}`);
  const exercises = d.exercises
    .filter(e => config.includeOptional || !e.optional)
    .map(e => ({
      exerciseId: e.id,
      name: e.name,
      muscle: e.muscle,
      targetSets: config.setsChoice === 'max' ? e.sets[1] : e.sets[0],
      targetReps: { min: e.reps[0], max: e.reps[1] },
      restSec: config.restSec ?? (e.compound ? program.defaults.restSecCompound : program.defaults.restSec),
      restSource: config.restSec === null ? 'forge-default' : 'user',
      verification: e.verification,
      optional: e.optional,
      v08ExerciseId: e.v08ExerciseId,
      note: e.note,
    }));
  return { dayKey, title: d.title, muscles: [...d.muscles], warmupMinutes: program.defaults.warmupMinutes, exercises };
}

/**
 * What is planned for `date`.
 * @param {object} program
 * @param {object} config            see DEFAULT_CONFIG (startDate required)
 * @param {string} date              YYYY-MM-DD
 * @param {Array}  completedSessions [{date, dayKey, status}] — 'completed' or 'partial' advance rolling mode
 * @returns {{date, kind:'before-start'|'rest'|'training', dayKey?, plan?, programWeek, reason}}
 */
export function planForDate(program, config, date, completedSessions = []) {
  const c = normalizeConfig(program, config);
  if (!isISODate(date)) throw new TypeError('date must be YYYY-MM-DD');
  const offset = daysBetween(c.startDate, date);
  if (offset < 0) return { date, kind: 'before-start', programWeek: 0, reason: 'Program has not started yet.' };
  const programWeek = Math.floor(offset / 7) + 1;
  const base = { date, programWeek, programComplete: programWeek > program.durationWeeks };
  if (c.restWeekdays.includes(weekday(date))) {
    return { ...base, kind: 'rest', reason: 'Scheduled recovery day. Rest is part of the program.' };
  }
  let dayKey;
  if (c.mode === 'fixed-week') {
    // Count training weekdays since start to index the rotation, so custom rest days still rotate A->B->C.
    let n = 0;
    for (let i = 0; i < offset; i++) {
      const wd = (weekday(c.startDate) + i) % 7;
      if (!c.restWeekdays.includes(wd)) n++;
    }
    dayKey = c.rotation[n % c.rotation.length];
  } else {
    const done = completedSessions
      .filter(s => s && ADVANCES.has(s.status) && isISODate(s.date) && s.date < date && c.rotation.includes(s.dayKey))
      .sort((a, b) => a.date.localeCompare(b.date));
    const last = done.at(-1);
    // Continue after the last completed day; a missed day simply waits.
    dayKey = last ? c.rotation[(c.rotation.indexOf(last.dayKey) + 1) % c.rotation.length] : c.rotation[0];
    const sameDay = completedSessions.find(s => s && ADVANCES.has(s.status) && s.date === date);
    if (sameDay) return { ...base, kind: 'training', dayKey: sameDay.dayKey, plan: buildDayPlan(program, sameDay.dayKey, c), alreadyCompleted: true, reason: 'Session completed today.' };
  }
  return { ...base, kind: 'training', dayKey, plan: buildDayPlan(program, dayKey, c), alreadyCompleted: false,
    reason: c.mode === 'rolling' ? 'Next session in your rotation.' : 'Scheduled for this weekday.' };
}

/**
 * Upcoming n days (for the "next session preview"). In rolling mode future training days are
 * assumed to happen in order, so the preview shows the rotation, not one repeated session.
 */
export function preview(program, config, fromDate, days, completedSessions = []) {
  const out = [];
  const simulated = [...completedSessions];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.parse(fromDate + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);
    const p = planForDate(program, config, d, simulated);
    out.push({ date: d, kind: p.kind, dayKey: p.dayKey ?? null, title: p.plan?.title ?? null });
    if (p.kind === 'training' && !p.alreadyCompleted) simulated.push({ date: d, dayKey: p.dayKey, status: 'completed' });
  }
  return out;
}
