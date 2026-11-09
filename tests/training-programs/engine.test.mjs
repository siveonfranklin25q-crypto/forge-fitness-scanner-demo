// Run: node --test tests/training-programs/
// Synthetic data only. Fixed timestamps; no clock reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../src/training-programs/index.js';

const P = T.CLASSIC_SIX_DAY;
const START = '2026-11-09'; // a Monday
const CFG = { startDate: START };
const T0 = Date.UTC(2026, 10, 9, 17, 0, 0);

// ---------- program template ----------
test('template: six training days, one rest day, A/B/C twice a week', () => {
  const week = Object.values(P.defaultWeek);
  assert.equal(week.filter(x => x === 'rest').length, 1);
  for (const k of ['A', 'B', 'C']) assert.equal(week.filter(x => x === k).length, 2);
  assert.equal(P.durationWeeks, 12);
  assert.match(P.source.url, /^https:\/\/www\.muscleandstrength\.com\//);
});

test('template: every exercise carries provenance; FORGE defaults are labelled', () => {
  for (const d of Object.values(P.days)) for (const e of d.exercises) {
    assert.ok(['secondary-summary', 'unverified'].includes(e.verification), e.id);
    assert.ok(e.sets[0] >= 1 && e.sets[0] <= e.sets[1] && e.reps[0] <= e.reps[1], e.id);
    if (e.verification === 'unverified') assert.equal(e.optional, true, e.id);
  }
  assert.equal(P.defaults.verification, 'forge-default');
});

// ---------- schedule ----------
test('fixed-week: Mon A, Tue B, Wed C, Thu A, Fri B, Sat C, Sun rest', () => {
  const c = { ...CFG, mode: 'fixed-week' };
  const got = T.preview(P, c, START, 7).map(x => x.kind === 'rest' ? 'rest' : x.dayKey);
  assert.deepEqual(got, ['A', 'B', 'C', 'A', 'B', 'C', 'rest']);
});

test('fixed-week with custom rest days keeps the A->B->C rotation', () => {
  const c = { ...CFG, mode: 'fixed-week', restWeekdays: [3, 0] }; // Wed + Sun off
  const got = T.preview(P, c, START, 7).map(x => x.kind === 'rest' ? 'rest' : x.dayKey);
  assert.deepEqual(got, ['A', 'B', 'rest', 'C', 'A', 'B', 'rest']);
});

test('rolling: a missed day does not skip a workout', () => {
  // Did A on Monday, missed Tuesday. Wednesday is still B, not C.
  const done = [{ date: '2026-11-09', dayKey: 'A', status: 'completed' }];
  assert.equal(T.planForDate(P, CFG, '2026-11-11', done).dayKey, 'B');
  // Skipped / aborted / safety-stopped sessions leave the same workout waiting.
  const stopped = [...done, { date: '2026-11-10', dayKey: 'B', status: 'stopped_safety' }];
  assert.equal(T.planForDate(P, CFG, '2026-11-11', stopped).dayKey, 'B');
  const partial = [...done, { date: '2026-11-10', dayKey: 'B', status: 'partial' }];
  assert.equal(T.planForDate(P, CFG, '2026-11-11', partial).dayKey, 'C');
});

test('rolling preview advances the rotation and respects rest', () => {
  const got = T.preview(P, CFG, START, 8).map(x => x.kind === 'rest' ? 'rest' : x.dayKey);
  assert.deepEqual(got, ['A', 'B', 'C', 'A', 'B', 'C', 'rest', 'A']);
});

test('before start, program week and completion flags', () => {
  assert.equal(T.planForDate(P, CFG, '2026-11-08').kind, 'before-start');
  assert.equal(T.planForDate(P, CFG, '2026-11-16').programWeek, 2);
  assert.equal(T.planForDate(P, CFG, T.addDays(START, 12 * 7)).programComplete, true);
});

test('config validation rejects bad input instead of guessing', () => {
  assert.throws(() => T.normalizeConfig(P, {}), /startDate/);
  assert.throws(() => T.normalizeConfig(P, { ...CFG, restWeekdays: [0, 1, 2, 3, 4, 5, 6] }), /training weekday/);
  assert.throws(() => T.normalizeConfig(P, { ...CFG, rotation: ['A', 'Z'] }), /rotation/);
  assert.throws(() => T.normalizeConfig(P, { ...CFG, restSec: 5 }), /restSec/);
});

test('day plan: conservative set choice, rest source labelled, optional exercises filterable', () => {
  const c = T.normalizeConfig(P, CFG);
  const b = T.buildDayPlan(P, 'B', c);
  assert.ok(b.exercises.every(e => e.targetSets === 3 && e.restSource === 'forge-default'));
  assert.ok(b.exercises.some(e => e.exerciseId === 'barbell-curl' && e.verification === 'unverified'));
  const noOpt = T.buildDayPlan(P, 'B', T.normalizeConfig(P, { ...CFG, includeOptional: false }));
  assert.ok(!noOpt.exercises.some(e => e.optional));
  const squat = T.buildDayPlan(P, 'C', c).exercises.find(e => e.exerciseId === 'squat');
  assert.deepEqual([squat.targetSets, squat.targetReps.min, squat.targetReps.max, squat.restSec], [5, 6, 12, 120]);
});

// ---------- session flow ----------
function startSession(answers = {}, dayKey = 'A', id = 's1', date = START) {
  const plan = T.buildDayPlan(P, dayKey, T.normalizeConfig(P, CFG));
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
  assert.equal(r.plannedSets, 18); // 6 exercises x 3 sets
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
  assert.ok(s.effectivePlan.exercises.every(e => e.targetSets === 2));
  assert.ok(s.plan.exercises.every(e => e.targetSets === 3));
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
  const plan = T.buildDayPlan(P, 'A', T.normalizeConfig(P, CFG));
  const sk = T.reduce(T.createSession({ id: 'x', date: START, dayPlan: plan, now: T0 }), { type: 'SKIP_SESSION', now: T0 });
  assert.equal(T.toRecord(sk).status, 'skipped');
});

test('skip set / skip exercise are recorded as skipped, not as work', () => {
  let s = T.reduce(startSession(), { type: 'SKIP_WARMUP', now: T0 });
  s = T.reduce(s, { type: 'SKIP_EXERCISE', now: T0 });
  assert.equal(T.currentStep(s).exercise.exerciseId, 'incline-db-press');
  assert.equal(s.skipped.length, 3);
  s = T.reduce(s, { type: 'SKIP_SET', now: T0 });
  assert.equal(s.skipped.length, 4);
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
  return { version: 1, id, programId: P.id, date, dayKey: 'A', title: 'Chest & back', status: 'completed',
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
  assert.equal(m.next.dayKey, 'A');
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
  const a = JSON.stringify([T.preview(P, CFG, START, 21), T.todayMission(P, CFG, START)]);
  const b = JSON.stringify([T.preview(P, CFG, START, 21), T.todayMission(P, CFG, START)]);
  assert.equal(a, b);
});
