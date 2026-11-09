// Progress derived ONLY from logged sets in finished session records (see session.toRecord).
// No streaks, no invented milestones, no penalty for rest or missed days.

import { isISODate, daysBetween, weekStart, addDays } from './dates.js';
import { planForDate } from './schedule.js';
import { toKg } from './session.js';

const HAPPENED = new Set(['completed', 'partial']);
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Weekly view: planned vs actually logged, per-muscle working sets. */
export function weeklySummary(program, config, records, anyDateInWeek) {
  const start = weekStart(anyDateInWeek);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const inWeek = records.filter(r => r && days.includes(r.date));
  const happened = inWeek.filter(r => HAPPENED.has(r.status));
  const plannedTrainingDays = days.filter(d => planForDate(program, config, d, records).kind === 'training').length;
  const plannedSets = happened.reduce((n, r) => n + r.plannedSets, 0);
  const loggedSets = happened.reduce((n, r) => n + r.loggedSets, 0);
  const setsByMuscle = {};
  for (const r of happened) for (const s of r.sets) setsByMuscle[s.muscle] = (setsByMuscle[s.muscle] || 0) + 1;
  return {
    weekStart: start,
    plannedTrainingDays,
    sessionsDone: happened.length,
    sessionsStoppedForSafety: inWeek.filter(r => r.status === 'stopped_safety').length,
    plannedSetsInDoneSessions: plannedSets,
    loggedSets,
    setCompletionRatio: plannedSets ? round(loggedSets / plannedSets, 2) : null,
    setsByMuscle,
  };
}

/** Best (heaviest kg, then most reps at that load) logged set per exercise, with provenance. */
export function personalBests(records) {
  const best = {};
  for (const r of [...records].filter(r => r && HAPPENED.has(r.status)).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const s of r.sets) {
      const kg = toKg(s.load, s.unit);
      const b = best[s.exerciseId];
      if (!b || kg > b.kg + 1e-9 || (Math.abs(kg - b.kg) < 1e-9 && s.reps > b.reps)) {
        best[s.exerciseId] = { exerciseId: s.exerciseId, kg: round(kg, 2), reps: s.reps, load: s.load, unit: s.unit, date: r.date, sessionId: r.id };
      }
    }
  }
  return best;
}

/** Facts worth celebrating in ONE finished session, compared with earlier history only. */
export function sessionHighlights(record, history) {
  if (!record || !HAPPENED.has(record.status)) return [];
  const earlier = history.filter(r => r && r.id !== record.id && r.date <= record.date && HAPPENED.has(r.status));
  const before = personalBests(earlier);
  const out = [];
  if (!earlier.length) {
    // One clear message for the very first session instead of a "first" per exercise.
    out.push({ kind: 'first-session', text: 'First logged session in this program.' });
    out.push({ kind: 'volume', text: `${record.loggedSets} working set${record.loggedSets === 1 ? '' : 's'} logged.` });
    return out;
  }
  const after = personalBests([...earlier, record]);
  for (const [id, b] of Object.entries(after)) {
    if (b.sessionId !== record.id) continue;
    const prev = before[id];
    if (!prev) out.push({ kind: 'first-log', exerciseId: id, text: `First logged ${id}: ${b.reps} × ${b.load} ${b.unit}.` });
    else out.push({ kind: 'best', exerciseId: id, text: `New best on ${id}: ${b.reps} × ${b.load} ${b.unit} (was ${prev.reps} × ${prev.load} ${prev.unit}).` });
  }
  out.push({ kind: 'volume', text: `${record.loggedSets} working set${record.loggedSets === 1 ? '' : 's'} logged.` });
  return out;
}

/**
 * Conservative double progression for one exercise.
 * Increase only when the last TWO separate-day sessions (≤30 days apart) both hit the top of the
 * rep range on every working set at the same top load, with no symptoms and ≥2 reps in reserve
 * when RIR was recorded. Everything else holds, repeats or backs off — and says why.
 */
export function recommendNext(records, exerciseId, targetReps, opts = {}) {
  const incKg = opts.incrementKg ?? 2.5;
  const incLb = opts.incrementLb ?? 5;
  const sessions = records
    .filter(r => r && HAPPENED.has(r.status) && isISODate(r.date) && r.sets.some(s => s.exerciseId === exerciseId))
    .sort((a, b) => a.date.localeCompare(b.date));
  const basis = sessions.slice(-2).map(r => ({ sessionId: r.id, date: r.date }));
  if (!sessions.length) return { action: 'baseline', basis, reason: 'No logs yet. Start light, pick a load you can do for the bottom of the rep range with good form.' };
  const last = sessions.at(-1);
  if (last.symptoms === 'worse') return { action: 'reduce', basis, reason: 'Worsening symptoms were logged. Reduce load or skip this exercise and seek advice if it persists.' };
  if (last.symptoms === 'mild' || last.reducedForSafety) return { action: 'hold', basis, reason: 'The last session had mild symptoms or reduced volume. Keep the same load.' };
  const work = r => r.sets.filter(s => s.exerciseId === exerciseId);
  const lastSets = work(last);
  if (lastSets.some(s => s.rir !== null && s.rir <= 1)) return { action: 'hold', basis, reason: 'A set was at 0–1 reps in reserve. Keep the load and own the reps first.' };
  if (sessions.length < 2) return { action: 'repeat', basis, reason: 'One session logged. Repeat the load on another day before judging progress.' };
  const prev = sessions.at(-2);
  const gap = daysBetween(prev.date, last.date);
  if (gap < 1) return { action: 'repeat', basis, reason: 'The two latest logs share a date. Progress is judged across separate days.' };
  if (gap > 30) return { action: 'baseline', basis, reason: 'More than 30 days between logs. Re-establish a comfortable baseline.' };
  const topOf = sets => Math.max(...sets.map(s => toKg(s.load, s.unit)));
  const hitTop = sets => { const t = topOf(sets); return sets.filter(s => Math.abs(toKg(s.load, s.unit) - t) < 1e-6).every(s => s.reps >= targetReps.max); };
  const prevSets = work(prev);
  const sameLoad = Math.abs(topOf(prevSets) - topOf(lastSets)) < 1e-6;
  if (sameLoad && hitTop(prevSets) && hitTop(lastSets)) {
    const unit = lastSets[0].unit;
    const step = unit === 'lb' ? incLb : incKg;
    const current = Math.max(...lastSets.map(s => s.load));
    return { action: 'increase', basis, nextLoad: round(current + step, 2), unit, nextReps: targetReps.min,
      reason: `Top of the ${targetReps.min}–${targetReps.max} range on every top-load set in two sessions. Add ${step} ${unit} and restart at ${targetReps.min} reps.` };
  }
  return { action: 'repeat', basis, reason: `Keep the load and add reps until every set reaches ${targetReps.max}.` };
}
