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

// ---------- real template: honesty about the source ----------
test('real template: six distinct Mon–Sat sessions, Sunday rest, 12 weeks, source cited', () => {
  assert.deepEqual([...REAL.rotation], ['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  assert.deepEqual(Object.values(REAL.defaultWeek), ['rest', 'A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  assert.equal(REAL.durationWeeks, 12);
  assert.match(REAL.source.url, /^https:\/\/www\.muscleandstrength\.com\//);
  assert.equal(REAL.source.author, 'Steve Shaw');
});

test('real template: no guessed targets — pending exercises have null sets/reps', () => {
  for (const d of Object.values(REAL.days)) for (const e of d.exercises) {
    if (e.verification === 'pending-source') assert.ok(e.sets === null && e.reps === null, e.id);
    else { assert.equal(e.verification, 'primary-source', e.id); assert.ok(e.verifiedBy, e.id); assert.ok(Number.isInteger(e.sets) && e.reps[0] <= e.reps[1], e.id); }
  }
  assert.equal(REAL.defaults.verification, 'forge-default');
});

test('real template: values confirmed in the PR #9 review are present', () => {
  const get = (d, id) => REAL.days[d].exercises.find(e => e.id === id);
  const t = (d, id) => { const e = get(d, id); return [e.sets, ...e.reps]; };
  assert.deepEqual(t('A1', 'bench-press'), [3, 8, 10]);
  assert.deepEqual(t('A1', 'cable-crossover'), [5, 10, 15]);
  assert.deepEqual(t('A1', 'wide-grip-pull-up'), [5, 15, 15]);
  assert.deepEqual(t('B1', 'barbell-curl'), [4, 8, 12]);
  assert.deepEqual(t('C1', 'leg-curl'), [5, 10, 15]);
  assert.deepEqual(t('C1', 'seated-calf-raise'), [4, 12, 15]);
  assert.deepEqual(t('C1', 'standing-calf-raise'), [4, 12, 15]);
  for (const id of ['barbell-ab-rollout', 'hanging-knee-raise']) assert.ok(get('A1', id), id);
  assert.ok(get('B1', 'one-arm-cable-curl'));
  assert.ok(get('A2', 'plank') && get('A2', 'db-side-bend'));
});

test('real template: until fully verified every day is blocked and cannot start', () => {
  assert.equal(T.isSourceMatched(REAL), false);
  const c = T.normalizeConfig(REAL, CFG);
  for (const k of REAL.rotation) {
    const d = T.buildDayPlan(REAL, k, c);
    assert.equal(d.blocked, 'awaiting-source', k);
    assert.equal(d.exercises.length, 0, k);
    assert.throws(() => T.createSession({ id: 'x', date: START, dayPlan: d, now: T0 }), /never guessed/);
  }
  const m = T.todayMission(REAL, CFG, START);
  assert.equal(m.canStart, false);
  assert.match(m.body, /awaiting verification/);
});

test('real template, dev mode: only verified exercises run, reduced volume by default', () => {
  const d = T.buildDayPlan(REAL, 'A1', T.normalizeConfig(REAL, { ...CFG, allowPendingSource: true }));
  assert.equal(d.blocked, null);
  assert.equal(d.sourceComplete, false);
  assert.deepEqual(d.exercises.map(e => [e.exerciseId, e.sourceSets, e.targetSets]), [['bench-press', 3, 2], ['cable-crossover', 5, 3], ['wide-grip-pull-up', 5, 3]]);
  assert.ok(d.pendingExercises.some(e => e.exerciseId === 'incline-db-press'));
  const b2 = T.buildDayPlan(REAL, 'B2', T.normalizeConfig(REAL, { ...CFG, allowPendingSource: true }));
  assert.equal(b2.blocked, 'no-verified-exercises');
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

test('storage: new key only, round-trip, idempotent add, junk dropped not repaired', () => {
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
  const junk = JSON.stringify({ version: 1, records: [r, { id: 'z', date: 'nope', status: 'completed', sets: [] }, { ...r }] });
  const parsed = T.parseStore(junk);
  assert.equal(parsed.store.records.length, 1);
  assert.equal(parsed.dropped, 2);
  assert.equal(T.parseStore('{oops').error, 'unreadable');
  assert.equal(T.parseStore('{"version":99}').error, 'unknown-version');
  assert.equal(T.load({ getItem() { throw new Error('denied'); } }).error, 'storage-unavailable');
});

test('determinism: same inputs give identical outputs', () => {
  const a = JSON.stringify([T.preview(P, CFG, START, 21), T.todayMission(P, CFG, START), T.todayMission(REAL, CFG, START)]);
  const b = JSON.stringify([T.preview(P, CFG, START, 21), T.todayMission(P, CFG, START), T.todayMission(REAL, CFG, START)]);
  assert.equal(a, b);
});
