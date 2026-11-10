// Run: node --test tests/training-programs/*.test.mjs
// Synthetic data only. Fixed timestamps; no clock reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../src/training-programs/index.js';

const REAL = T.CLASSIC_SIX_DAY;
const START = '2026-11-09'; // a Monday
const CFG = { startDate: START };
const T0 = Date.UTC(2026, 10, 9, 17, 0, 0);

// Synthetic, fully specified program for ENGINE mechanics (not a training prescription).
const fx = (id, muscle, sets, reps, compound = false) => ({ id, name: id, muscle, sets, reps, compound,
  verification: 'primary-source', verifiedBy: 'test-fixture', v08ExerciseId: id === 'incline-db-press' ? 2 : null, note: null });
const fday = (key, title, exercises) => ({ key, title, weekdayName: key, listComplete: true, exercises });
const P = {
  ...REAL, id: 'synthetic-test-program',
  days: {
    A1: fday('A1', 'Chest & back', [fx('bench-press', 'chest', 3, [8, 10], true), fx('cable-crossover', 'chest', 5, [10, 15]), fx('incline-db-press', 'chest', 3, [8, 12])]),
    B1: fday('B1', 'Shoulders & arms', [fx('barbell-curl', 'biceps', 4, [8, 12])]),
    C1: fday('C1', 'Legs', [fx('squat', 'quadriceps', 5, [6, 12], true)]),
    A2: fday('A2', 'Chest & back 2', [fx('one-arm-db-row', 'back', 4, [8, 12])]),
    B2: fday('B2', 'Shoulders & arms 2', [fx('upright-row', 'shoulders', 4, [10, 12])]),
    C2: fday('C2', 'Legs 2', [fx('leg-curl', 'hamstrings', 5, [10, 15])]),
  },
};

// ---------- real template: faithful to the source ----------
// Golden table: transcribed independently from the PR #9 source comment (6747215464), in source order.
// Format: id sets×min-max   (or  id sets×Ns  for timed holds)
const GOLDEN = {
  A1: 'bench-press 3x8-10|incline-db-press 3x8-12|cable-crossover 5x10-15|low-rack-pull 3x6-8|wide-grip-pull-up 5x15-15|one-arm-db-row 3x10-15|barbell-ab-rollout 3x8-12|hanging-knee-raise 3x12-15',
  B1: 'seated-db-press 3x10-12|upright-row 3x10-15|reverse-fly 5x10-15|cable-triceps-extension 4x10-15|skullcrusher 4x10-12|barbell-curl 4x8-12|one-arm-cable-curl 4x10-15',
  C1: 'squat 5x6-12|hack-squat 3x10-12|leg-extension 3x10-15|good-morning 3x8-10|leg-curl 5x10-15|seated-calf-raise 4x12-15|standing-calf-raise 4x12-15',
  A2: 'incline-bench-press 3x8-10|chest-dip 3x10-15|db-fly 5x10-15|barbell-row 3x8-10|lat-pulldown 5x8-12|seated-cable-row 3x10-15|plank 3x60s|db-side-bend 3x10-12',
  B2: 'military-press 3x8-10|side-lateral-raise 5x10-15|landmine-press 3x10-12|seated-french-press 4x8-10|one-arm-db-triceps-extension 4x10-12|seated-db-curl 4x10-12|ez-bar-preacher-curl 4x10-12',
  C2: 'leg-press 5x20-20|walking-barbell-lunge 3x10-12|bulgarian-split-squat 3x10-12|stiff-leg-deadlift 3x8-10|single-leg-curl 5x10-15|floor-barbell-calf-raise 4x12-15|leg-press-calf-press 4x12-15',
};

test('real template: all 44 source rows match the golden table (names, order, sets, reps)', () => {
  let n = 0;
  for (const [k, spec] of Object.entries(GOLDEN)) {
    const got = REAL.days[k].exercises.map(e => e.measure === 'time' ? `${e.id} ${e.sets}x${e.holdSec}s` : `${e.id} ${e.sets}x${e.reps[0]}-${e.reps[1]}`).join('|');
    assert.equal(got, spec, k);
    n += REAL.days[k].exercises.length;
  }
  assert.equal(n, 44);
});

test('real template: six distinct Mon–Sat sessions, Sunday rest, 12 weeks, source cited, fully verified', () => {
  assert.deepEqual([...REAL.rotation], ['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  assert.deepEqual(Object.values(REAL.defaultWeek), ['rest', 'A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  assert.equal(REAL.durationWeeks, 12);
  assert.match(REAL.source.url, /^https:\/\/www\.muscleandstrength\.com\//);
  assert.equal(REAL.source.author, 'Steve Shaw');
  const ids = Object.values(REAL.days).flatMap(d => d.exercises.map(e => e.id));
  assert.equal(new Set(ids).size, ids.length, 'exercise ids unique');
  for (const d of Object.values(REAL.days)) for (const e of d.exercises) {
    assert.equal(e.verification, 'primary-source', e.id);
    assert.ok(e.verifiedBy, e.id);
  }
  assert.equal(T.isSourceMatched(REAL), true);
  assert.equal(REAL.defaults.verification, 'forge-default');
});

test('real template: plank is a 60 s timed hold, leg press is a fixed 20 reps', () => {
  const c = T.normalizeConfig(REAL, { ...CFG, volume: 'source' });
  const plank = T.buildDayPlan(REAL, 'A2', c).exercises.find(e => e.exerciseId === 'plank');
  assert.deepEqual([plank.measure, plank.targetHoldSec, plank.targetReps, plank.targetSets], ['time', 60, null, 3]);
  const lp = T.buildDayPlan(REAL, 'C2', c).exercises.find(e => e.exerciseId === 'leg-press');
  assert.deepEqual([lp.measure, lp.targetReps.min, lp.targetReps.max, lp.targetSets], ['reps', 20, 20, 5]);
});

test('real template: every day is runnable; reduced volume by default, source opt-in', () => {
  for (const k of REAL.rotation) {
    const r = T.buildDayPlan(REAL, k, T.normalizeConfig(REAL, CFG));
    const f = T.buildDayPlan(REAL, k, T.normalizeConfig(REAL, { ...CFG, volume: 'source' }));
    assert.equal(r.blocked, null, k);
    assert.equal(r.sourceComplete, true, k);
    assert.ok(r.exercises.every((e, i) => e.targetSets === Math.min(3, Math.ceil(f.exercises[i].targetSets * 0.6))), k);
    assert.ok(f.exercises.every(e => e.targetSets === e.sourceSets), k);
  }
  const m = T.todayMission(REAL, CFG, START);
  assert.equal(m.canStart, true);
  assert.match(m.body, /reduced volume/);
});

test('never-guess guard: a pending exercise or incomplete list blocks the day', () => {
  const pend = { ...REAL, days: { ...REAL.days, A1: { ...REAL.days.A1, exercises: [...REAL.days.A1.exercises.slice(0, 7),
    { ...REAL.days.A1.exercises[7], verification: 'pending-source', sets: null, reps: null }] } } };
  const d = T.buildDayPlan(pend, 'A1', T.normalizeConfig(pend, CFG));
  assert.equal(d.blocked, 'awaiting-source');
  assert.equal(d.exercises.length, 0);
  assert.deepEqual(d.pendingExercises.map(e => e.exerciseId), ['hanging-knee-raise']);
  assert.throws(() => T.createSession({ id: 'x', date: START, dayPlan: d, now: T0 }), /never guessed/);
  assert.equal(T.isSourceMatched(pend), false);
  const dev = T.buildDayPlan(pend, 'A1', T.normalizeConfig(pend, { ...CFG, allowPendingSource: true }));
  assert.equal(dev.blocked, null);
  assert.equal(dev.exercises.length, 7);
  const partial = { ...REAL, days: { ...REAL.days, B2: { ...REAL.days.B2, listComplete: false } } };
  assert.equal(T.buildDayPlan(partial, 'B2', T.normalizeConfig(partial, CFG)).blocked, 'awaiting-source');
});

test('timed hold: logs seconds (not reps), validates, stores, and is never auto-progressed', () => {
  const plan = T.buildDayPlan(REAL, 'A2', T.normalizeConfig(REAL, CFG));
  let s = T.createSession({ id: 'p1', date: START, programId: REAL.id, dayPlan: plan, now: T0 });
  s = T.reduce(T.reduce(s, { type: 'SAFETY_CHECK', answers: {}, now: T0 }), { type: 'SKIP_WARMUP', now: T0 });
  while (T.currentStep(s).exercise.exerciseId !== 'plank') s = T.reduce(s, { type: 'SKIP_EXERCISE', now: T0 });
  assert.match(T.reduce(s, { type: 'LOG_SET', reps: 60, load: 0, unit: 'kg', now: T0 }).error, /Hold time/);
  assert.match(T.reduce(s, { type: 'LOG_SET', seconds: 0, unit: 'kg', now: T0 }).error, /Hold time/);
  s = T.reduce(s, { type: 'LOG_SET', seconds: 45, unit: 'kg', now: T0 + 1 });
  assert.equal(s.error, null);
  assert.deepEqual([s.sets[0].measure, s.sets[0].seconds, s.sets[0].reps, s.sets[0].load], ['time', 45, null, 0]);
  const rec = T.toRecord(T.reduce(s, { type: 'FINISH', symptoms: 'none', now: T0 + 2 }));
  const store = T.addRecord(T.emptyStore(), rec);
  assert.equal(T.parseStore(T.serializeStore(store)).store.records.length, 1);
  assert.deepEqual(T.personalBests([rec]), {});
  assert.equal(T.recommendNext([rec, { ...rec, id: 'p2', date: '2026-11-12' }], 'plank', null).action, 'repeat');
});

// ---------- schedule (synthetic program) ----------
test('fixed-week: Mon A1 … Sat C2, Sun rest', () => {
  const got = T.preview(P, { ...CFG, mode: 'fixed-week' }, START, 7).map(x => x.kind === 'rest' ? 'rest' : x.dayKey);
  assert.deepEqual(got, ['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'rest']);
});

test('fixed-week with custom rest days keeps the six-session order', () => {
  const got = T.preview(P, { ...CFG, mode: 'fixed-week', restWeekdays: [3, 0] }, START, 8).map(x => x.kind === 'rest' ? 'rest' : x.dayKey);
  assert.deepEqual(got, ['A1', 'B1', 'rest', 'C1', 'A2', 'B2', 'rest', 'C2']);
});

test('rolling: a missed day does not skip a workout; only real sessions advance', () => {
  const done = [{ date: '2026-11-09', dayKey: 'A1', status: 'completed' }];
  assert.equal(T.planForDate(P, CFG, '2026-11-11', done).dayKey, 'B1');
  assert.equal(T.planForDate(P, CFG, '2026-11-11', [...done, { date: '2026-11-10', dayKey: 'B1', status: 'stopped_safety' }]).dayKey, 'B1');
  assert.equal(T.planForDate(P, CFG, '2026-11-11', [...done, { date: '2026-11-10', dayKey: 'B1', status: 'partial' }]).dayKey, 'C1');
});

test('rolling preview runs the full six-session rotation and wraps', () => {
  const got = T.preview(P, CFG, START, 8).map(x => x.kind === 'rest' ? 'rest' : x.dayKey);
  assert.deepEqual(got, ['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'rest', 'A1']);
});

test('migration: legacy v1 day keys A/B/C are read as A1/B1/C1', () => {
  assert.equal(T.migrateDayKey(REAL, 'B'), 'B1');
  assert.equal(T.migrateDayKey(REAL, 'C2'), 'C2');
  const legacy = [{ date: '2026-11-09', dayKey: 'A', status: 'completed' }, { date: '2026-11-10', dayKey: 'B', status: 'completed' }];
  assert.equal(T.planForDate(P, CFG, '2026-11-11', legacy).dayKey, 'C1');
  const today = T.planForDate(P, CFG, '2026-11-10', legacy);
  assert.equal(today.dayKey, 'B1');
  assert.equal(today.alreadyCompleted, true);
});

test('no duplicate completion: a session already done today is never offered again, in BOTH modes', () => {
  const done = [{ date: '2026-11-12', dayKey: 'A2', status: 'partial' }];
  for (const mode of ['rolling', 'fixed-week']) {
    const p = T.planForDate(P, { ...CFG, mode }, '2026-11-12', done);
    assert.equal(p.alreadyCompleted, true, mode);
    assert.equal(p.dayKey, 'A2', mode);
    assert.equal(T.todayMission(P, { ...CFG, mode }, '2026-11-12', done).canStart, false, mode);
  }
  // A safety stop today does not count as done: the user may come back later.
  const stopped = [{ date: '2026-11-12', dayKey: 'A2', status: 'stopped_safety' }];
  assert.equal(T.todayMission(P, { ...CFG, mode: 'fixed-week' }, '2026-11-12', stopped).canStart, true);
});

test('before start, program week and completion flags', () => {
  assert.equal(T.planForDate(P, CFG, '2026-11-08').kind, 'before-start');
  assert.equal(T.planForDate(P, CFG, '2026-11-16').programWeek, 2);
  assert.equal(T.planForDate(P, CFG, T.addDays(START, 12 * 7)).programComplete, true);
});

test('config validation rejects bad input instead of guessing', () => {
  assert.throws(() => T.normalizeConfig(P, {}), /startDate/);
  assert.throws(() => T.normalizeConfig(P, { ...CFG, restWeekdays: [0, 1, 2, 3, 4, 5, 6] }), /training weekday/);
  assert.throws(() => T.normalizeConfig(P, { ...CFG, rotation: ['A1', 'Z'] }), /rotation/);
  assert.throws(() => T.normalizeConfig(P, { ...CFG, restSec: 5 }), /restSec/);
  assert.throws(() => T.normalizeConfig(P, { ...CFG, volume: 'max' }), /volume/);
});

test('volume: reduced by default (60 % rounded up, max 3); source is opt-in', () => {
  const r = T.buildDayPlan(P, 'A1', T.normalizeConfig(P, CFG));
  assert.deepEqual(r.exercises.map(e => e.targetSets), [2, 3, 2]);
  assert.ok(r.exercises.every(e => e.restSource === 'forge-default' && e.volume === 'reduced'));
  const f = T.buildDayPlan(P, 'A1', T.normalizeConfig(P, { ...CFG, volume: 'source' }));
  assert.deepEqual(f.exercises.map(e => e.targetSets), [3, 5, 3]);
  assert.equal(T.buildDayPlan(P, 'C1', T.normalizeConfig(P, CFG)).exercises[0].restSec, 120);
});

// ---------- session flow ----------
function startSession(answers = {}, dayKey = 'A1', id = 's1', date = START, cfg = CFG) {
  const plan = T.buildDayPlan(P, dayKey, T.normalizeConfig(P, cfg));
  let s = T.createSession({ id, date, programId: P.id, dayPlan: plan, now: T0 });
  s = T.reduce(s, { type: 'SAFETY_CHECK', answers, now: T0 });
  return s;
}

function logAll(s, { reps = 10, load = 40, unit = 'kg', rir = 2 } = {}, now = T0) {
  let t = now;
  while (s.stage === 'exercise' || s.stage === 'rest') {
    t += 60000;
    if (s.stage === 'rest') s = T.reduce(s, { type: 'REST_DONE', now: t });
    s = T.reduce(s, { type: 'LOG_SET', reps, load, unit, rir, now: t });
    assert.equal(s.error, null);
  }
  return s;
}

test('full flow: safety -> warm-up -> sets with rest timer -> review -> completed record', () => {
  let s = startSession();
  assert.equal(s.stage, 'warmup');
  s = T.reduce(s, { type: 'WARMUP_DONE', now: T0 + 300000 });
  assert.equal(T.currentStep(s).exercise.exerciseId, 'bench-press');
  s = T.reduce(s, { type: 'LOG_SET', reps: 10, load: 60, unit: 'kg', rir: 2, now: T0 + 360000 });
  assert.equal(s.stage, 'rest');
  assert.equal(T.restRemainingSec(s, T0 + 360000), 120); // compound -> forge-default 120 s
  assert.equal(T.restRemainingSec(s, T0 + 360000 + 90500), 30);
  s = logAll(s);
  assert.equal(s.stage, 'review');
  s = T.reduce(s, { type: 'FINISH', symptoms: 'none', now: T0 + 3600000 });
  const r = T.toRecord(s);
  assert.equal(r.status, 'completed');
  assert.equal(r.loggedSets, r.plannedSets);
  assert.equal(r.plannedSets, 7); // reduced volume: 2 + 3 + 2
  assert.ok(r.warmupDone);
});

test('planned targets are never changed by logging', () => {
  let s = T.reduce(startSession(), { type: 'SKIP_WARMUP', now: T0 });
  const before = JSON.stringify(s.plan);
  s = T.reduce(s, { type: 'LOG_SET', reps: 3, load: 200, unit: 'kg', rir: 0, now: T0 });
  assert.equal(JSON.stringify(s.plan), before);
  assert.equal(s.sets.length, 1);
});

test('safety: stop answers end the session before any exercise; nothing is logged', () => {
  for (const answers of [{ chestPainOrDizziness: true }, { pain: 'sharp' }, { feelingUnwell: true }]) {
    const s = startSession(answers);
    assert.equal(s.stage, 'stopped');
    assert.equal(T.toRecord(s).status, 'stopped_safety');
    assert.equal(T.toRecord(s).loggedSets, 0);
    assert.match(s.safety.message, /Rest is not a failure/);
  }
});

test('safety: reduce lowers target sets by one (min 1) without touching the plan snapshot', () => {
  const s = startSession({ pain: 'mild', sleepHours: 5 });
  assert.equal(s.safety.level, 'reduce');
  assert.deepEqual(s.effectivePlan.exercises.map(e => e.targetSets), [1, 2, 1]);
  assert.deepEqual(s.plan.exercises.map(e => e.targetSets), [2, 3, 2]);
});

test('pain stop mid-session keeps logged sets and records stopped_safety', () => {
  let s = T.reduce(startSession(), { type: 'SKIP_WARMUP', now: T0 });
  s = T.reduce(s, { type: 'LOG_SET', reps: 8, load: 50, unit: 'kg', rir: 2, now: T0 + 1 });
  s = T.reduce(s, { type: 'PAIN_STOP', severity: 'sharp', now: T0 + 2 });
  const r = T.toRecord(s);
  assert.equal(r.status, 'stopped_safety');
  assert.equal(r.loggedSets, 1);
  assert.equal(r.symptoms, 'worse');
  assert.equal(T.reduce(s, { type: 'LOG_SET', reps: 8, load: 50, now: T0 + 3 }).error, 'Session already ended.');
});

test('partial, aborted, skipped are explicit — completion is never assumed', () => {
  let s = T.reduce(startSession(), { type: 'SKIP_WARMUP', now: T0 });
  s = T.reduce(s, { type: 'LOG_SET', reps: 8, load: 50, unit: 'kg', rir: 2, now: T0 + 1 });
  assert.equal(T.toRecord(T.reduce(s, { type: 'FINISH', symptoms: 'none', now: T0 + 2 })).status, 'partial');
  const a = T.reduce(T.reduce(startSession(), { type: 'SKIP_WARMUP', now: T0 }), { type: 'ABORT', now: T0 + 1 });
  assert.equal(T.toRecord(a).status, 'aborted');
  const plan = T.buildDayPlan(P, 'A1', T.normalizeConfig(P, CFG));
  const sk = T.reduce(T.createSession({ id: 'x', date: START, dayPlan: plan, now: T0 }), { type: 'SKIP_SESSION', now: T0 });
  assert.equal(T.toRecord(sk).status, 'skipped');
});

test('skip set / skip exercise are recorded as skipped, not as work', () => {
  let s = T.reduce(startSession(), { type: 'SKIP_WARMUP', now: T0 });
  s = T.reduce(s, { type: 'SKIP_EXERCISE', now: T0 });
  assert.equal(T.currentStep(s).exercise.exerciseId, 'cable-crossover');
  assert.equal(s.skipped.length, 2);
  s = T.reduce(s, { type: 'SKIP_SET', now: T0 });
  assert.equal(s.skipped.length, 3);
  assert.equal(s.sets.length, 0);
});

test('invalid set input is rejected with a reason and changes nothing', () => {
  const s = T.reduce(startSession(), { type: 'SKIP_WARMUP', now: T0 });
  for (const bad of [{ reps: 0 }, { reps: 2.5 }, { reps: 8, load: -1 }, { reps: 8, load: 10, unit: 'stone' }, { reps: 8, load: 10, rir: 9 }]) {
    const n = T.reduce(s, { type: 'LOG_SET', load: 10, unit: 'kg', now: T0, ...bad });
    assert.ok(n.error, JSON.stringify(bad));
    assert.equal(n.sets.length, 0);
  }
});

// ---------- progress ----------
function record(id, date, sets, extra = {}) {
  return { version: 1, id, programId: P.id, date, dayKey: 'A1', title: 'Chest & back', status: 'completed',
    plannedSets: sets.length, loggedSets: sets.length, reducedForSafety: false, symptoms: 'none', sets, skipped: [], ...extra };
}
const set = (exerciseId, reps, load, unit = 'kg', rir = 2, muscle = 'chest') => ({ exerciseId, muscle, setNumber: 1, reps, load, unit, rir, at: null });
const R = { min: 8, max: 15 };

test('progression: needs two separate-day sessions at the top of the range', () => {
  assert.equal(T.recommendNext([], 'bench-press', R).action, 'baseline');
  const one = [record('a', '2026-11-09', [set('bench-press', 15, 60), set('bench-press', 15, 60)])];
  assert.equal(T.recommendNext(one, 'bench-press', R).action, 'repeat');
  const two = [...one, record('b', '2026-11-12', [set('bench-press', 15, 60), set('bench-press', 15, 60)])];
  const rec = T.recommendNext(two, 'bench-press', R);
  assert.equal(rec.action, 'increase');
  assert.equal(rec.nextLoad, 62.5);
  assert.equal(rec.nextReps, 8);
  assert.deepEqual(rec.basis.map(b => b.sessionId), ['a', 'b']);
});

test('progression holds or backs off on symptoms, low RIR, missed reps, same-day or stale logs', () => {
  const a = record('a', '2026-11-09', [set('bench-press', 15, 60)]);
  const top = d => record(d, d, [set('bench-press', 15, 60)]);
  assert.equal(T.recommendNext([a, { ...top('2026-11-12'), symptoms: 'mild' }], 'bench-press', R).action, 'hold');
  assert.equal(T.recommendNext([a, { ...top('2026-11-12'), symptoms: 'worse' }], 'bench-press', R).action, 'reduce');
  assert.equal(T.recommendNext([a, record('b', '2026-11-12', [set('bench-press', 15, 60, 'kg', 1)])], 'bench-press', R).action, 'hold');
  assert.equal(T.recommendNext([a, record('b', '2026-11-12', [set('bench-press', 12, 60)])], 'bench-press', R).action, 'repeat');
  assert.equal(T.recommendNext([a, record('b', '2026-11-09', [set('bench-press', 15, 60)])], 'bench-press', R).action, 'repeat');
  assert.equal(T.recommendNext([a, top('2026-12-20')], 'bench-press', R).action, 'baseline');
  assert.equal(T.recommendNext([a, { ...top('2026-11-12'), reducedForSafety: true }], 'bench-press', R).action, 'hold');
});

test('progression in lb uses lb increments', () => {
  const recs = [record('a', '2026-11-09', [set('squat', 12, 135, 'lb')]), record('b', '2026-11-11', [set('squat', 12, 135, 'lb')])];
  const r = T.recommendNext(recs, 'squat', { min: 6, max: 12 });
  assert.deepEqual([r.action, r.nextLoad, r.unit], ['increase', 140, 'lb']);
});

test('highlights come only from logs: first session, first log, real bests; nothing for skipped', () => {
  const a = record('a', '2026-11-09', [set('bench-press', 10, 60)]);
  assert.deepEqual(T.sessionHighlights(a, [a]).map(h => h.kind), ['first-session', 'volume']);
  const b = record('b', '2026-11-12', [set('bench-press', 10, 62.5), set('one-arm-db-row', 10, 30, 'kg', 2, 'back')]);
  const hb = T.sessionHighlights(b, [a, b]);
  assert.ok(hb.some(h => h.kind === 'best' && /62.5/.test(h.text)));
  assert.ok(hb.some(h => h.kind === 'first-log' && h.exerciseId === 'one-arm-db-row'));
  const c = record('c', '2026-11-15', [set('bench-press', 8, 60)]);
  assert.ok(!T.sessionHighlights(c, [a, b, c]).some(h => h.kind === 'best'));
  assert.deepEqual(T.sessionHighlights({ ...c, status: 'skipped' }, [a, b, c]), []);
});

test('weekly summary: planned vs logged, per-muscle sets, safety stops counted separately', () => {
  const recs = [
    record('a', '2026-11-09', [set('bench-press', 10, 60), set('one-arm-db-row', 10, 30, 'kg', 2, 'back')], { plannedSets: 4 }),
    record('b', '2026-11-10', [], { status: 'stopped_safety', plannedSets: 18, loggedSets: 0 }),
  ];
  const w = T.weeklySummary(P, CFG, recs, '2026-11-12');
  assert.equal(w.weekStart, '2026-11-09');
  assert.equal(w.plannedTrainingDays, 6);
  assert.equal(w.sessionsDone, 1);
  assert.equal(w.sessionsStoppedForSafety, 1);
  assert.equal(w.setCompletionRatio, 0.5);
  assert.deepEqual(w.setsByMuscle, { chest: 1, back: 1 });
});

test('today mission: rest day copy is neutral and has no make-up demand', () => {
  const m = T.todayMission(P, CFG, '2026-11-15');
  assert.equal(m.kind, 'rest');
  assert.doesNotMatch(m.body + m.headline, /miss|lost|streak|fail|behind/i);
  assert.equal(m.next.dayKey, 'A1');
});

// ---------- v0.8 bridge ----------
test('v0.8 bridge: reads mapped exercises only, never writes, round-trips mapped sets', () => {
  const v08 = [{ id: 'x1', date: '2026-11-01', symptoms: 'none', counted: true, sets: [
    { exerciseId: 2, reps: 10, kg: 20, rir: 2, type: 'working' },
    { exerciseId: 2, reps: 12, kg: 10, rir: 4, type: 'warmup' },
    { exerciseId: 18, reps: 10, kg: 100, rir: 2, type: 'working' }, // leg press: not in this program
  ] }, { id: 'bad', date: 'yesterday', sets: [] }];
  const frozen = JSON.stringify(v08);
  const recs = T.fromV08Sessions(v08, P);
  assert.equal(JSON.stringify(v08), frozen);
  assert.equal(recs.length, 1);
  assert.deepEqual(recs[0].sets.map(s => [s.exerciseId, s.reps, s.load]), [['incline-db-press', 10, 20]]);
  const out = T.toV08Session(record('r', '2026-11-12', [set('incline-db-press', 10, 50, 'lb'), set('bench-press', 10, 60)]), P);
  assert.deepEqual(out.sets, [{ exerciseId: 2, reps: 10, kg: 22.68, rir: 2, type: 'working' }]);
  assert.equal(out.counted, false);
  assert.equal(T.toV08Session(record('r2', '2026-11-12', [set('bench-press', 10, 60)]), P), null);
});

// ---------- storage ----------
function fakeStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; }

test('storage: new key only, round-trip, idempotent add; junk and duplicates quarantined, never dropped or repaired', () => {
  const st = fakeStorage();
  st.setItem('forge-strength-v08-sessions', '[1,2,3]');
  let store = T.emptyStore();
  const r = record('a', '2026-11-09', [set('bench-press', 10, 60)]);
  store = T.addRecord(T.addRecord(store, r), r);
  assert.equal(store.records.length, 1);
  assert.ok(T.save(st, store));
  assert.equal(st.getItem('forge-strength-v08-sessions'), '[1,2,3]');
  assert.deepEqual([...st.m.keys()].sort(), ['forge-strength-v08-sessions', T.STORAGE_KEY].sort());
  assert.deepEqual(T.load(st).store.records, [r]);
  const bad = { id: 'z', date: 'nope', status: 'completed', sets: [] };
  const dup = { ...r, title: 'second copy with the same id' };
  const junk = JSON.stringify({ version: 1, records: [r, bad, dup] });
  const parsed = T.parseStore(junk);
  assert.equal(parsed.store.records.length, 1);
  assert.equal(parsed.dropped, 0);
  assert.equal(parsed.quarantined, 2);
  assert.deepEqual(parsed.store.quarantine, [bad, dup]);
  // Quarantined records are excluded from logic but survive load -> add -> save, without duplication.
  const st2 = fakeStorage();
  st2.setItem(T.STORAGE_KEY, junk);
  let s2 = T.load(st2).store;
  s2 = T.addRecord(s2, record('b', '2026-11-10', [set('bench-press', 8, 60)]));
  assert.ok(T.save(st2, s2));
  const raw = JSON.parse(st2.getItem(T.STORAGE_KEY));
  assert.deepEqual(raw.records.map(x => x.id), ['a', 'b']);
  assert.deepEqual(raw.quarantine, [bad, dup]);
  assert.equal(T.load(st2).store.quarantine.length, 2, 'not duplicated on re-load');
});

const rec = i => record('r' + String(i).padStart(4, '0'), '2026-11-09', [set('bench-press', 8, 60)]);
const junkRec = i => ({ id: 'junk' + i, note: 'unsupported shape ' + i });
const seeded = obj => { const st = fakeStorage(); const raw = JSON.stringify(obj); st.setItem(T.STORAGE_KEY, raw); return { st, raw }; };

test('quarantine cap: 199 and 200 stay writable; 201 fails closed with nothing lost or changed', () => {
  for (const [prior, invalid, expectError] of [[198, 1, null], [199, 1, null], [200, 0, null], [200, 1, 'quarantine-overflow'], [150, 75, 'quarantine-overflow'], [0, 260, 'quarantine-overflow'], [230, 0, 'quarantine-overflow']]) {
    const original = { version: 1, records: [rec(1), ...Array.from({ length: invalid }, (_, i) => junkRec(i))],
      quarantine: Array.from({ length: prior }, (_, i) => ({ kind: 'old', n: i })), active: null };
    const { st, raw } = seeded(original);
    const res = T.load(st);
    const label = `${prior}+${invalid}`;
    assert.equal(res.error, expectError, label);
    // Every original entry is still present, in order, untrimmed.
    assert.equal(res.store.quarantine.length, prior + invalid, label);
    assert.deepEqual(res.store.quarantine, [...original.quarantine, ...original.records.slice(1)], label);
    assert.equal(res.store.records.length, 1, label);
    const next = T.addRecord(res.store, rec(2));
    const out = T.trySave(st, next);
    if (expectError) {
      assert.deepEqual(out, { ok: false, error: 'quarantine-overflow' }, label);
      assert.equal(T.save(st, next), false, label);
      assert.throws(() => T.serializeStore(next), /quarantine-overflow/, label);
      assert.equal(st.getItem(T.STORAGE_KEY), raw, label + ': original bytes untouched');
      assert.equal(T.exportRaw(st), raw, label);
    } else {
      assert.deepEqual(out, { ok: true, error: null }, label);
      const back = JSON.parse(st.getItem(T.STORAGE_KEY));
      assert.equal(back.quarantine.length, prior + invalid, label);
      assert.deepEqual(back.records.map(x => x.id), ['r0001', 'r0002'], label);
    }
  }
});

test('record cap: 500 saved workouts stay; the 501st is refused, not traded for the oldest', () => {
  const full = { version: 1, records: Array.from({ length: 500 }, (_, i) => rec(i)), quarantine: [], active: null };
  const { st, raw } = seeded(full);
  const res = T.load(st);
  assert.equal(res.error, null);
  assert.ok(T.save(st, res.store), 'exactly at the cap is writable');
  const over = T.addRecord(res.store, rec(9999));
  assert.equal(over.records.length, 501);
  assert.deepEqual(T.trySave(st, over), { ok: false, error: 'records-overflow' });
  assert.equal(JSON.parse(st.getItem(T.STORAGE_KEY)).records[0].id, 'r0000', 'oldest workout still stored');
  const already = seeded({ ...full, records: [...full.records, rec(9999)] });
  const res2 = T.load(already.st);
  assert.equal(res2.error, 'records-overflow');
  assert.equal(res2.store.records.length, 501);
  assert.equal(T.save(already.st, res2.store), false);
  assert.equal(already.st.getItem(T.STORAGE_KEY), already.raw);
  assert.equal(raw.length > 0, true);
});

test('unreadable, unknown-version and unavailable storage are read-only: a later save cannot overwrite them', () => {
  for (const [raw, error] of [['{oops', 'unreadable'], ['{"version":99,"records":[{"id":"future"}]}', 'unknown-version'], ['[1,2]', 'unknown-version']]) {
    const st = fakeStorage();
    st.setItem(T.STORAGE_KEY, raw);
    const res = T.load(st);
    assert.equal(res.error, error);
    const attempt = T.addRecord({ ...res.store, config: { startDate: START } }, rec(1));
    assert.deepEqual(T.trySave(st, attempt), { ok: false, error });
    assert.equal(st.getItem(T.STORAGE_KEY), raw, error + ': bytes untouched');
    assert.equal(T.exportRaw(st), raw);
  }
  const denied = T.load({ getItem() { throw new Error('denied'); } });
  assert.equal(denied.error, 'storage-unavailable');
  assert.equal(T.save(fakeStorage(), denied.store), false);
  assert.equal(T.exportRaw({ getItem() { throw new Error('denied'); } }), null);
  // A genuinely empty browser is writable.
  const fresh = fakeStorage();
  assert.equal(T.load(fresh).error, 'empty');
  assert.ok(T.save(fresh, T.load(fresh).store));
  assert.deepEqual(T.trySave({ setItem() { throw new Error('quota'); } }, T.emptyStore()), { ok: false, error: 'storage-write-failed' });
});

test('malformed store: present non-list records/quarantine is read-only, never treated as empty', () => {
  const cases = [
    ['{"version":1,"records":{"unrecognized":"keep"},"quarantine":[]}', ['records']],
    ['{"version":1,"records":[],"quarantine":{"private":"keep"}}', ['quarantine']],
    ['{"version":1,"records":"damaged","quarantine":7}', ['records', 'quarantine']],
    ['{"version":1,"records":0}', ['records']],
    ['{"version":1,"quarantine":false}', ['quarantine']],
  ];
  for (const [raw, fields] of cases) {
    const st = fakeStorage();
    st.setItem(T.STORAGE_KEY, raw);
    const res = T.load(st);
    assert.equal(res.error, 'malformed-store', raw);
    assert.deepEqual(res.malformedFields, fields, raw);
    const attempt = T.addRecord({ ...res.store, config: { startDate: START } }, rec(1));
    assert.deepEqual(T.trySave(st, attempt), { ok: false, error: 'malformed-store' }, raw);
    assert.equal(T.save(st, attempt), false, raw);
    assert.equal(st.getItem(T.STORAGE_KEY), raw, raw + ': bytes untouched');
    assert.equal(T.exportRaw(st), raw);
  }
  // Missing or null lists are just empty, and stay writable.
  for (const raw of ['{"version":1}', '{"version":1,"records":null,"quarantine":null}']) {
    const st = fakeStorage();
    st.setItem(T.STORAGE_KEY, raw);
    const res = T.load(st);
    assert.equal(res.error, null, raw);
    assert.ok(T.save(st, T.addRecord(res.store, rec(1))), raw);
  }
});

test('nothing else is lost on a read-then-save: unreadable active session and unknown fields are kept', () => {
  const original = { version: 1, programId: 'p', config: { startDate: START }, records: [rec(1)], quarantine: [{ kind: 'old' }],
    active: { version: 7, stage: 'exercise', sets: [{ reps: 5 }] }, futureField: { keep: ['me'] } };
  const { st } = seeded(original);
  const res = T.load(st);
  assert.equal(res.store.active, null);
  assert.equal(res.quarantined, 1);
  assert.ok(T.save(st, res.store));
  const back = JSON.parse(st.getItem(T.STORAGE_KEY));
  assert.deepEqual(back.futureField, original.futureField);
  assert.deepEqual(back.quarantine, [{ kind: 'old' }, { kind: 'unreadable-active', original: original.active }]);
  assert.deepEqual(back.records, original.records);
  assert.equal('readOnly' in back, false);
});

test('determinism: same inputs give identical outputs', () => {
  const a = JSON.stringify([T.preview(P, CFG, START, 21), T.todayMission(P, CFG, START), T.todayMission(REAL, CFG, START)]);
  const b = JSON.stringify([T.preview(P, CFG, START, 21), T.todayMission(P, CFG, START), T.todayMission(REAL, CFG, START)]);
  assert.equal(a, b);
});
