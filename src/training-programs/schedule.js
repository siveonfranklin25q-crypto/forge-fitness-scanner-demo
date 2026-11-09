// Planning: which session (or rest) is due on a date, and what the targets are.
// Two schedule modes, both user-adjustable:
//   'fixed-week' — the weekday layout decides (source-style: Mon A1, Tue B1 ... Sat C2, Sun rest).
//   'rolling'    — the next training day continues the rotation from the last COMPLETED session,
//                  so a missed day never skips a workout and never "breaks" anything.

import { isISODate, weekday, daysBetween } from './dates.js';
import { hasTargets } from './programs/classic-six-day.js';

// A session that actually happened (fully or partly) moves the rotation on; skipped,
// aborted and safety-stopped sessions leave the same workout waiting.
export const ADVANCES = new Set(['completed', 'partial']);

export const DEFAULT_CONFIG = Object.freeze({
  mode: 'rolling',
  startDate: null,            // required: YYYY-MM-DD the program starts
  restWeekdays: [0],          // Sunday rest by default; owner may choose others
  rotation: null,             // null = program.rotation (A1 B1 C1 A2 B2 C2)
  restSec: null,              // null = program default (forge-default)
  volume: 'reduced',          // 'reduced' (default, forge-default rule) | 'source' (full prescription, opt-in)
  allowPendingSource: false,  // true only for UI/dev testing: run the verified part of an unverified day
});

/** Map legacy v1 day keys (A/B/C) to current ones; unknown keys pass through. */
export function migrateDayKey(program, key) {
  return program.legacyDayKeys?.[key] ?? key;
}

export function normalizeConfig(program, config = {}) {
  const c = { ...DEFAULT_CONFIG, ...config };
  if (c.rotation === null) c.rotation = [...program.rotation];
  const errors = [];
  if (!isISODate(c.startDate)) errors.push('startDate must be YYYY-MM-DD');
  if (!['rolling', 'fixed-week'].includes(c.mode)) errors.push('mode must be rolling or fixed-week');
  if (!Array.isArray(c.restWeekdays) || c.restWeekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) errors.push('restWeekdays must be integers 0-6');
  else if (new Set(c.restWeekdays).size >= 7) errors.push('at least one training weekday is required');
  if (!Array.isArray(c.rotation) || !c.rotation.length || c.rotation.some(k => !program.days[k])) errors.push('rotation must list program day keys');
  if (c.restSec !== null && (!Number.isInteger(c.restSec) || c.restSec < 15 || c.restSec > 600)) errors.push('restSec must be 15-600 seconds or null');
  if (!['reduced', 'source'].includes(c.volume)) errors.push('volume must be reduced or source');
  if (typeof c.allowPendingSource !== 'boolean') errors.push('allowPendingSource must be boolean');
  if (errors.length) throw new RangeError('Invalid training config: ' + errors.join('; '));
  return { ...c, restWeekdays: [...new Set(c.restWeekdays)].sort() };
}

/**
 * Targets for one program day. Pure: same inputs -> same object.
 * Exercises without primary-source targets are NEVER given guessed numbers: they are listed in
 * `pendingExercises`, and the day is `blocked: 'awaiting-source'` unless allowPendingSource is set.
 */
export function buildDayPlan(program, dayKey, config) {
  const d = program.days[dayKey];
  if (!d) throw new RangeError(`Unknown day ${dayKey}`);
  const D = program.defaults;
  const ready = d.exercises.filter(e => e.verification === 'primary-source' && hasTargets(e));
  const pending = d.exercises.filter(e => !ready.includes(e));
  const sourceComplete = d.listComplete && d.exercises.length > 0 && pending.length === 0;
  const exercises = ready.map(e => {
    const reduced = Math.min(D.reducedSetsCap, Math.ceil(e.sets * D.reducedSetsFactor));
    return {
      exerciseId: e.id,
      name: e.name,
      muscle: e.muscle,
      sourceSets: e.sets,
      targetSets: config.volume === 'source' ? e.sets : reduced,
      volume: config.volume,
      measure: e.measure,
      targetReps: e.measure === 'time' ? null : { min: e.reps[0], max: e.reps[1] },
      targetHoldSec: e.measure === 'time' ? e.holdSec : null,
      restSec: config.restSec ?? (e.compound ? D.restSecCompound : D.restSec),
      restSource: config.restSec === null ? 'forge-default' : 'user',
      verification: e.verification,
      verifiedBy: e.verifiedBy,
      v08ExerciseId: e.v08ExerciseId,
      note: e.note,
    };
  });
  let blocked = null;
  if (!sourceComplete && !config.allowPendingSource) blocked = 'awaiting-source';
  else if (!exercises.length) blocked = 'no-verified-exercises';
  return {
    dayKey, title: d.title, weekdayName: d.weekdayName,
    muscles: [...new Set(d.exercises.map(e => e.muscle))],
    warmupMinutes: D.warmupMinutes, volume: config.volume,
    sourceComplete, blocked,
    pendingExercises: pending.map(e => ({ exerciseId: e.id, name: e.name })),
    exercises: blocked === 'awaiting-source' ? [] : exercises,
  };
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
  // Both modes: a session that already happened today is shown as done, never offered again
  // (prevents duplicate counted completions).
  const sameDay = completedSessions.find(s => s && ADVANCES.has(s.status) && s.date === date);
  if (sameDay) {
    const k = migrateDayKey(program, sameDay.dayKey);
    if (program.days[k]) return { ...base, kind: 'training', dayKey: k, plan: buildDayPlan(program, k, c), alreadyCompleted: true, reason: 'Session completed today.' };
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
      .filter(s => s && ADVANCES.has(s.status) && isISODate(s.date) && s.date < date)
      .map(s => ({ ...s, dayKey: migrateDayKey(program, s.dayKey) }))
      .filter(s => c.rotation.includes(s.dayKey))
      .sort((a, b) => a.date.localeCompare(b.date));
    const last = done.at(-1);
    // Continue after the last completed day; a missed day simply waits.
    dayKey = last ? c.rotation[(c.rotation.indexOf(last.dayKey) + 1) % c.rotation.length] : c.rotation[0];
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
