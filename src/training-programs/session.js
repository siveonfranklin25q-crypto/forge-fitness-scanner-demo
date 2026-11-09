// Live session flow as a pure reducer: reduce(state, action) -> new state.
// Stages: safety -> warmup -> exercise <-> rest -> review -> done
//         (any stage) -> stopped (pain / warning sign)   (any stage) -> done (aborted / finished early)
// Time is always passed in (`now`, epoch ms); nothing reads the clock, so every path is testable.
// PLANNED targets (state.plan) are never modified by logging; ACTUAL work lives only in state.sets.

export const STAGES = Object.freeze(['safety', 'warmup', 'exercise', 'rest', 'review', 'stopped', 'done']);
export const STATUSES = Object.freeze(['in_progress', 'completed', 'partial', 'skipped', 'aborted', 'stopped_safety']);
export const UNITS = Object.freeze(['kg', 'lb']);
const LB = 0.45359237;

export const toKg = (load, unit) => (unit === 'lb' ? load * LB : load);

/** Pre-session safety check. Conservative and non-diagnostic. */
export function assessSafety(answers = {}) {
  const reasons = [];
  let level = 'go';
  const stop = r => { level = 'stop'; reasons.push(r); };
  const reduce = r => { if (level !== 'stop') level = 'reduce'; reasons.push(r); };
  if (answers.chestPainOrDizziness) stop('Chest pain, pressure, fainting or dizziness reported.');
  if (answers.pain === 'sharp') stop('Sharp or worsening pain reported.');
  if (answers.feelingUnwell) stop('Feeling unwell (fever, illness) reported.');
  if (answers.pain === 'mild') reduce('Mild discomfort reported.');
  if (Number.isFinite(answers.sleepHours) && answers.sleepHours < 6) reduce('Less than 6 hours of sleep reported.');
  const message = level === 'stop'
    ? 'Skip training today. If chest pain, fainting, or sharp or worsening pain occurs, seek medical assessment. Rest is not a failure.'
    : level === 'reduce'
      ? 'Train lighter today: one fewer set per exercise and no new personal bests. Stop if anything worsens.'
      : 'Clear to train. Stop any exercise that causes sharp pain.';
  return { level, reasons, message };
}

export function createSession({ id, date, programId, dayPlan, now }) {
  if (!id || !date || !dayPlan || !Number.isFinite(now)) throw new TypeError('createSession needs id, date, dayPlan, now');
  if (dayPlan.blocked || !dayPlan.exercises?.length) {
    throw new RangeError(`Day ${dayPlan.dayKey} cannot start: ${dayPlan.blocked ?? 'no exercises'} (targets are never guessed).`);
  }
  return {
    version: 1, id: String(id), programId: programId ?? null, date, dayKey: dayPlan.dayKey, title: dayPlan.title,
    status: 'in_progress', stage: 'safety', createdAt: now, startedAt: null, endedAt: null,
    plan: structuredClone(dayPlan), // immutable plan snapshot
    effectivePlan: null,            // plan after a 'reduce' safety adjustment (targets only)
    safety: null, warmupDone: false,
    cursor: { exercise: 0, set: 1 }, rest: null,
    sets: [], skipped: [], symptoms: null, error: null,
  };
}

const targets = s => (s.effectivePlan ?? s.plan).exercises;
const err = (s, e) => ({ ...s, error: e });
const ok = s => ({ ...s, error: null });

function advance(s, now) {
  const exs = targets(s);
  const cur = exs[s.cursor.exercise];
  if (s.cursor.set < cur.targetSets) {
    return { ...s, stage: 'rest', cursor: { ...s.cursor, set: s.cursor.set + 1 }, rest: { endsAt: now + cur.restSec * 1000, seconds: cur.restSec } };
  }
  if (s.cursor.exercise + 1 < exs.length) {
    return { ...s, stage: 'rest', cursor: { exercise: s.cursor.exercise + 1, set: 1 }, rest: { endsAt: now + cur.restSec * 1000, seconds: cur.restSec } };
  }
  return { ...s, stage: 'review', rest: null };
}

export function plannedSetCount(s) { return targets(s).reduce((n, e) => n + e.targetSets, 0); }

function finalStatus(s) {
  const logged = s.sets.length;
  if (!logged) return 'aborted';
  return logged >= plannedSetCount(s) ? 'completed' : 'partial';
}

export function reduce(state, action) {
  const s = state;
  const now = action?.now;
  if (s.stage === 'done' || s.stage === 'stopped') return err(s, 'Session already ended.');
  switch (action?.type) {
    case 'SKIP_SESSION':
      if (s.stage !== 'safety' && s.stage !== 'warmup') return err(s, 'Can only skip before starting.');
      return ok({ ...s, stage: 'done', status: 'skipped', endedAt: now ?? null });
    case 'SAFETY_CHECK': {
      if (s.stage !== 'safety') return err(s, 'Safety check already done.');
      const safety = assessSafety(action.answers);
      if (safety.level === 'stop') return ok({ ...s, safety, stage: 'stopped', status: 'stopped_safety', endedAt: now ?? null });
      const effectivePlan = safety.level === 'reduce'
        ? { ...s.plan, exercises: s.plan.exercises.map(e => ({ ...e, targetSets: Math.max(1, e.targetSets - 1) })) }
        : null;
      return ok({ ...s, safety, effectivePlan, stage: 'warmup' });
    }
    case 'WARMUP_DONE':
    case 'SKIP_WARMUP':
      if (s.stage !== 'warmup') return err(s, 'Not in warm-up.');
      return ok({ ...s, warmupDone: action.type === 'WARMUP_DONE', stage: 'exercise', startedAt: now ?? null });
    case 'LOG_SET': {
      if (s.stage !== 'exercise' && s.stage !== 'rest') return err(s, 'Not ready to log a set.');
      const reps = Number(action.reps), load = Number(action.load), rir = action.rir === undefined || action.rir === null ? null : Number(action.rir);
      const unit = action.unit ?? 'kg';
      const ex0 = targets(s)[s.cursor.exercise];
      const timed = ex0.measure === 'time';
      const seconds = timed ? Number(action.seconds) : null;
      if (timed) {
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600) return err(s, 'Hold time must be a whole number of seconds from 1 to 600.');
      } else if (!Number.isInteger(reps) || reps < 1 || reps > 100) return err(s, 'Reps must be a whole number from 1 to 100.');
      const loadIn = action.load === undefined || action.load === null ? (timed ? 0 : NaN) : load;
      if (!Number.isFinite(loadIn) || loadIn < 0 || loadIn > 1000) return err(s, 'Load must be 0-1000.');
      if (!UNITS.includes(unit)) return err(s, 'Unit must be kg or lb.');
      if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 5)) return err(s, 'Reps in reserve must be 0-5.');
      if (!Number.isFinite(now)) return err(s, 'now is required.');
      const ex = targets(s)[s.cursor.exercise];
      const set = { exerciseId: ex.exerciseId, muscle: ex.muscle, setNumber: s.cursor.set, measure: timed ? 'time' : 'reps',
        reps: timed ? null : reps, seconds, load: loadIn, unit, rir, at: now };
      return ok(advance({ ...s, stage: 'exercise', rest: null, sets: [...s.sets, set] }, now));
    }
    case 'REST_DONE':
    case 'SKIP_REST':
      if (s.stage !== 'rest') return err(s, 'Not resting.');
      return ok({ ...s, stage: 'exercise', rest: null });
    case 'SKIP_SET': {
      if (s.stage !== 'exercise') return err(s, 'Not on a set.');
      const ex = targets(s)[s.cursor.exercise];
      return ok(advance({ ...s, skipped: [...s.skipped, { exerciseId: ex.exerciseId, setNumber: s.cursor.set }] }, now ?? 0));
    }
    case 'SKIP_EXERCISE': {
      if (s.stage !== 'exercise' && s.stage !== 'rest') return err(s, 'Not on an exercise.');
      const exs = targets(s);
      const ex = exs[s.cursor.exercise];
      const remaining = [];
      for (let n = s.cursor.set; n <= ex.targetSets; n++) remaining.push({ exerciseId: ex.exerciseId, setNumber: n });
      const next = s.cursor.exercise + 1 < exs.length
        ? { ...s, stage: 'exercise', rest: null, cursor: { exercise: s.cursor.exercise + 1, set: 1 } }
        : { ...s, stage: 'review', rest: null };
      return ok({ ...next, skipped: [...s.skipped, ...remaining] });
    }
    case 'PAIN_STOP':
      return ok({ ...s, stage: 'stopped', status: 'stopped_safety', rest: null, endedAt: now ?? null,
        symptoms: action.severity === 'mild' ? 'mild' : 'worse',
        safety: { ...(s.safety ?? {}), level: 'stop', reasons: [...(s.safety?.reasons ?? []), 'Stopped during session for pain.'],
          message: 'Session stopped. Logged sets are kept. If pain is sharp, persists or worsens, seek assessment before training that area again.' } });
    case 'FINISH': {
      if (s.stage === 'safety') return err(s, 'Start the session first.');
      const symptoms = ['none', 'mild', 'worse'].includes(action.symptoms) ? action.symptoms : null;
      return ok({ ...s, stage: 'done', status: finalStatus(s), symptoms, endedAt: now ?? null, rest: null });
    }
    case 'ABORT':
      return ok({ ...s, stage: 'done', status: s.sets.length ? 'partial' : 'aborted', endedAt: now ?? null, rest: null });
    default:
      return err(s, `Unknown action ${action?.type}`);
  }
}

export function restRemainingSec(state, now) {
  if (state.stage !== 'rest' || !state.rest) return 0;
  return Math.max(0, Math.ceil((state.rest.endsAt - now) / 1000));
}

/** Current exercise card for the UI. */
export function currentStep(state) {
  const exs = targets(state);
  if (!['exercise', 'rest'].includes(state.stage)) return null;
  const ex = exs[state.cursor.exercise];
  return { exercise: ex, setNumber: state.cursor.set, ofSets: ex.targetSets,
    exerciseNumber: state.cursor.exercise + 1, ofExercises: exs.length,
    previousSetThisExercise: [...state.sets].reverse().find(x => x.exerciseId === ex.exerciseId) ?? null };
}

/** Immutable record stored after the session ends — the data contract shared with the UI. */
export function toRecord(state) {
  if (state.stage !== 'done' && state.stage !== 'stopped') throw new Error('Session has not ended.');
  return {
    version: 1, id: state.id, programId: state.programId, date: state.date, dayKey: state.dayKey, title: state.title,
    status: state.status, startedAt: state.startedAt, endedAt: state.endedAt,
    plannedSets: plannedSetCount(state), loggedSets: state.sets.length,
    reducedForSafety: !!state.effectivePlan, safety: state.safety, symptoms: state.symptoms,
    warmupDone: state.warmupDone,
    sets: state.sets.map(x => ({ ...x })), skipped: state.skipped.map(x => ({ ...x })),
  };
}
