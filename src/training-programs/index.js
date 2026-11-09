// FORGE training-programs public API (Issue #5). Browser-safe ES modules, no dependencies,
// no network, no clock reads. See docs/training/README.md for the data contract.
export { CLASSIC_SIX_DAY } from './programs/classic-six-day.js';
export { DEFAULT_CONFIG, ADVANCES, normalizeConfig, buildDayPlan, planForDate, preview } from './schedule.js';
export { STAGES, STATUSES, assessSafety, createSession, reduce, restRemainingSec, currentStep, plannedSetCount, toRecord, toKg } from './session.js';
export { weeklySummary, personalBests, sessionHighlights, recommendNext } from './progress.js';
export { v08Map, fromV08Sessions, toV08Session } from './adapters/v08.js';
export { STORAGE_KEY, STORE_VERSION, emptyStore, parseStore, serializeStore, addRecord, load, save } from './storage.js';
export { isISODate, addDays, daysBetween, weekStart, weekday } from './dates.js';

/** Today's mission for the cockpit: plan, preview and honest copy. `today` is passed in. */
import { planForDate as _plan, preview as _preview } from './schedule.js';
export function todayMission(program, config, today, records = []) {
  const p = _plan(program, config, today, records);
  const next = _preview(program, config, today, 7, records).filter(x => x.kind === 'training' && x.date > today)[0] ?? null;
  const headline = p.kind === 'rest' ? 'Recovery day' : p.kind === 'before-start' ? 'Program starts soon'
    : p.alreadyCompleted ? `${p.plan.title} — done today` : `${p.plan.title}`;
  const body = p.kind === 'rest' ? 'Rest is scheduled. Recovery is part of the plan — nothing to make up.'
    : p.kind === 'before-start' ? 'Your first session is coming up.'
      : p.alreadyCompleted ? 'Logged. Next session shown below.' : `${p.plan.exercises.length} exercises · warm-up first · stop on sharp pain.`;
  return { ...p, headline, body, next };
}
