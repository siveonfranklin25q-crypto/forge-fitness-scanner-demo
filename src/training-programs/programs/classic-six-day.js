// Classic 1970s-style six-day split: SIX distinct sessions (Mon–Sat), Sunday rest.
//   A1 Mon chest & back · B1 Tue shoulders & arms · C1 Wed legs
//   A2 Thu chest & back · B2 Fri shoulders & arms · C2 Sat legs   (different exercise tables)
//
// SOURCE: Steve Shaw, "Old School Series: 1970s Bodybuilding Routine", Muscle & Strength
// (published 2013-09-25, updated 2020-12-22),
// https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine
//
// PROVENANCE PER EXERCISE
//   'primary-source'  targets confirmed against the primary page (`verifiedBy` says by whom)
//   'pending-source'  exercise or targets not yet confirmed: targets are null and the engine will
//                     NOT run them with guessed numbers (see schedule.buildDayPlan).
// Values FORGE chose itself (rest timers, warm-up length, reduced-volume rule) are 'forge-default'.
// Only facts (exercise names, set/rep numbers, weekly layout) are used; no instructional prose.
//
// HISTORY: v1 (PR #9 first draft) repeated three days built from secondary summaries; the owner's
// review (PR #9, 2026-11-09) found the primary source uses six distinct tables. v2 restructures.

const REVIEW = 'ChatGPT primary-source review, PR #9, 2026-11-09';

export const CLASSIC_SIX_DAY = Object.freeze({
  id: 'classic-six-day-v2',
  name: 'Classic six-day split',
  version: 2,
  durationWeeks: 12,
  level: 'intermediate',
  source: Object.freeze({
    title: 'Old School Series: 1970s Bodybuilding Routine',
    author: 'Steve Shaw',
    publisher: 'Muscle & Strength',
    url: 'https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine',
    published: '2013-09-25 (updated 2020-12-22)',
  }),
  defaultWeek: Object.freeze({ 0: 'rest', 1: 'A1', 2: 'B1', 3: 'C1', 4: 'A2', 5: 'B2', 6: 'C2' }),
  rotation: Object.freeze(['A1', 'B1', 'C1', 'A2', 'B2', 'C2']),
  // v1 records used A/B/C; read them as the first-round sessions.
  legacyDayKeys: Object.freeze({ A: 'A1', B: 'B1', C: 'C1' }),
  days: Object.freeze({
    A1: day('A1', 'Chest & back', 'Monday', [
      ex('bench-press', 'Bench press', 'chest', 3, [8, 10], { verification: 'primary-source', verifiedBy: REVIEW }),
      ex('incline-db-press', 'Incline dumbbell press', 'chest', null, null, { v08ExerciseId: 2 }),
      ex('cable-crossover', 'Cable crossover', 'chest', 5, [10, 15], { verification: 'primary-source', verifiedBy: REVIEW }),
      ex('low-rack-pull', 'Low rack pull', 'back', null, null),
      ex('wide-grip-pull-up', 'Wide-grip pull-up', 'back', 5, [15, 15], { verification: 'primary-source', verifiedBy: REVIEW }),
      ex('one-arm-db-row', 'One-arm dumbbell row', 'back', null, null),
      ex('barbell-ab-rollout', 'Barbell ab rollout', 'abs', null, null),
      ex('hanging-knee-raise', 'Hanging knee raise', 'abs', null, null),
    ]),
    B1: day('B1', 'Shoulders & arms', 'Tuesday', [
      ex('seated-db-press', 'Seated dumbbell press', 'shoulders', null, null),
      ex('upright-row', 'Upright row', 'shoulders', null, null),
      ex('reverse-fly', 'Bent-over reverse fly', 'shoulders', null, null),
      ex('cable-triceps-extension', 'Cable triceps extension', 'triceps', null, null, { v08ExerciseId: 14 }),
      ex('skullcrusher', 'Skullcrusher', 'triceps', null, null),
      ex('barbell-curl', 'Barbell curl', 'biceps', 4, [8, 12], { verification: 'primary-source', verifiedBy: REVIEW }),
      ex('one-arm-cable-curl', 'One-arm cable curl', 'biceps', null, null),
    ]),
    C1: day('C1', 'Legs', 'Wednesday', [
      ex('squat', 'Squat', 'quadriceps', null, null),
      ex('hack-squat', 'Hack squat', 'quadriceps', null, null),
      ex('leg-extension', 'Leg extension', 'quadriceps', null, null),
      ex('good-morning', 'Good morning', 'hamstrings', null, null),
      ex('leg-curl', 'Leg curl', 'hamstrings', 5, [10, 15], { verification: 'primary-source', verifiedBy: REVIEW, v08ExerciseId: 22 }),
      ex('seated-calf-raise', 'Seated calf raise', 'calves', 4, [12, 15], { verification: 'primary-source', verifiedBy: REVIEW }),
      ex('standing-calf-raise', 'Standing calf raise', 'calves', 4, [12, 15], { verification: 'primary-source', verifiedBy: REVIEW }),
    ]),
    // Second-round tables: exercise lists not yet transcribed from the primary source.
    A2: day('A2', 'Chest & back', 'Thursday', [
      ex('plank', 'Plank', 'abs', null, null),
      ex('db-side-bend', 'Dumbbell side bend', 'obliques', null, null),
    ], { listComplete: false }),
    B2: day('B2', 'Shoulders & arms', 'Friday', [], { listComplete: false }),
    C2: day('C2', 'Legs', 'Saturday', [], { listComplete: false }),
  }),
  defaults: Object.freeze({
    restSec: 90, restSecCompound: 120, warmupMinutes: 5,
    // Reduced volume (default for new users): 60 % of source sets, rounded up, max 3.
    reducedSetsFactor: 0.6, reducedSetsCap: 3,
    verification: 'forge-default',
  }),
});

function day(key, title, weekdayName, exercises, extra = {}) {
  return Object.freeze({ key, title, weekdayName, listComplete: true, exercises: Object.freeze(exercises), ...extra });
}

function ex(id, name, muscle, sets, reps, extra = {}) {
  return Object.freeze({
    id, name, muscle,
    sets: Number.isInteger(sets) ? sets : null,
    reps: Array.isArray(reps) ? Object.freeze([...reps]) : null,
    compound: ['bench-press', 'low-rack-pull', 'wide-grip-pull-up', 'squat', 'hack-squat', 'good-morning', 'seated-db-press'].includes(id),
    verification: 'pending-source', verifiedBy: null, v08ExerciseId: null, note: null,
    ...extra,
  });
}

/** True only when every day's list is complete and every exercise has primary-source targets. */
export function isSourceMatched(program) {
  return Object.values(program.days).every(d => d.listComplete && d.exercises.length
    && d.exercises.every(e => e.verification === 'primary-source' && e.sets && e.reps));
}
