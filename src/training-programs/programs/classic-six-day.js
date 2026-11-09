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
// STATUS: all 44 rows entered from the complete tables posted on PR #9 (2026-11-09).
// Values FORGE chose itself (rest timers, warm-up length, reduced-volume rule) are 'forge-default'.
// Only facts (exercise names, set/rep numbers, weekly layout) are used; no instructional prose.
//
// HISTORY: v1 (PR #9 first draft) repeated three days built from secondary summaries; the owner's
// review (PR #9, 2026-11-09) found the primary source uses six distinct tables. v2 restructures
// and carries the complete source tables.

const VERIFIED = 'ChatGPT direct read of the primary article tables, PR #9 comment 6747215464, 2026-11-09';
const ps = (extra = {}) => ({ verification: 'primary-source', verifiedBy: VERIFIED, ...extra });

export const CLASSIC_SIX_DAY = Object.freeze({
  id: 'classic-six-day-v2',
  name: 'Classic six-day split',
  version: 2,
  durationWeeks: 12,
  level: 'intermediate',
  sessionMinutes: [45, 60],
  source: Object.freeze({
    title: 'Old School Series: 1970s Bodybuilding Routine',
    author: 'Steve Shaw',
    publisher: 'Muscle & Strength',
    url: 'https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine',
    published: '2013-09-25 (updated 2020-12-22)',
    note: 'The author describes the program as demanding and not appropriate for everyone.',
  }),
  defaultWeek: Object.freeze({ 0: 'rest', 1: 'A1', 2: 'B1', 3: 'C1', 4: 'A2', 5: 'B2', 6: 'C2' }),
  rotation: Object.freeze(['A1', 'B1', 'C1', 'A2', 'B2', 'C2']),
  // v1 records used A/B/C; read them as the first-round sessions.
  legacyDayKeys: Object.freeze({ A: 'A1', B: 'B1', C: 'C1' }),
  // Exercise order below is the source order. 44 rows in total.
  days: Object.freeze({
    A1: day('A1', 'Chest & back', 'Monday', [
      ex('bench-press', 'Bench press', 'chest', 3, [8, 10], ps({ compound: true })),
      ex('incline-db-press', 'Incline dumbbell bench press', 'chest', 3, [8, 12], ps({ v08ExerciseId: 2 })),
      ex('cable-crossover', 'Cable crossover', 'chest', 5, [10, 15], ps()),
      ex('low-rack-pull', 'Low rack pull', 'back', 3, [6, 8], ps({ compound: true })),
      ex('wide-grip-pull-up', 'Wide-grip pull-up', 'back', 5, [15, 15], ps({ compound: true })),
      ex('one-arm-db-row', 'One-arm dumbbell row', 'back', 3, [10, 15], ps()),
      ex('barbell-ab-rollout', 'Barbell ab rollout', 'abs', 3, [8, 12], ps()),
      ex('hanging-knee-raise', 'Hanging knee raise', 'abs', 3, [12, 15], ps()),
    ]),
    B1: day('B1', 'Shoulders & arms', 'Tuesday', [
      ex('seated-db-press', 'Seated dumbbell press', 'shoulders', 3, [10, 12], ps({ compound: true })),
      ex('upright-row', 'Upright row', 'shoulders', 3, [10, 15], ps()),
      ex('reverse-fly', 'Bent-over reverse fly', 'shoulders', 5, [10, 15], ps()),
      ex('cable-triceps-extension', 'Cable triceps extension', 'triceps', 4, [10, 15], ps({ v08ExerciseId: 14 })),
      ex('skullcrusher', 'Skullcrusher', 'triceps', 4, [10, 12], ps()),
      ex('barbell-curl', 'Barbell curl', 'biceps', 4, [8, 12], ps()),
      ex('one-arm-cable-curl', 'One-arm cable curl', 'biceps', 4, [10, 15], ps()),
    ]),
    C1: day('C1', 'Legs', 'Wednesday', [
      ex('squat', 'Squat', 'quadriceps', 5, [6, 12], ps({ compound: true })),
      ex('hack-squat', 'Hack squat', 'quadriceps', 3, [10, 12], ps({ compound: true })),
      ex('leg-extension', 'Leg extension', 'quadriceps', 3, [10, 15], ps()),
      ex('good-morning', 'Good morning', 'hamstrings', 3, [8, 10], ps({ compound: true })),
      ex('leg-curl', 'Leg curl', 'hamstrings', 5, [10, 15], ps({ v08ExerciseId: 22 })),
      ex('seated-calf-raise', 'Seated calf raise', 'calves', 4, [12, 15], ps()),
      ex('standing-calf-raise', 'Standing calf raise', 'calves', 4, [12, 15], ps({ v08ExerciseId: 26 })),
    ]),
    A2: day('A2', 'Chest & back', 'Thursday', [
      ex('incline-bench-press', 'Incline bench press', 'chest', 3, [8, 10], ps({ compound: true })),
      ex('chest-dip', 'Chest dip', 'chest', 3, [10, 15], ps({ compound: true })),
      ex('db-fly', 'Dumbbell fly', 'chest', 5, [10, 15], ps()),
      ex('barbell-row', 'Barbell row', 'back', 3, [8, 10], ps({ compound: true })),
      ex('lat-pulldown', 'Lat pulldown', 'back', 5, [8, 12], ps({ v08ExerciseId: 5 })),
      ex('seated-cable-row', 'Seated cable row', 'back', 3, [10, 15], ps({ v08ExerciseId: 4 })),
      ex('plank', 'Plank', 'abs', 3, null, ps({ measure: 'time', holdSec: 60 })),
      ex('db-side-bend', 'Dumbbell side bend', 'obliques', 3, [10, 12], ps()),
    ]),
    B2: day('B2', 'Shoulders & arms', 'Friday', [
      ex('military-press', 'Military press', 'shoulders', 3, [8, 10], ps({ compound: true })),
      ex('side-lateral-raise', 'Side lateral raise', 'shoulders', 5, [10, 15], ps({ v08ExerciseId: 7 })),
      ex('landmine-press', 'Landmine press', 'shoulders', 3, [10, 12], ps({ compound: true })),
      ex('seated-french-press', 'Seated French press', 'triceps', 4, [8, 10], ps()),
      ex('one-arm-db-triceps-extension', 'One-arm dumbbell triceps extension', 'triceps', 4, [10, 12], ps()),
      ex('seated-db-curl', 'Seated dumbbell curl', 'biceps', 4, [10, 12], ps()),
      ex('ez-bar-preacher-curl', 'EZ-bar preacher curl', 'biceps', 4, [10, 12], ps()),
    ]),
    C2: day('C2', 'Legs', 'Saturday', [
      ex('leg-press', 'Leg press', 'quadriceps', 5, [20, 20], ps({ compound: true, v08ExerciseId: 18 })),
      ex('walking-barbell-lunge', 'Walking barbell lunge', 'quadriceps', 3, [10, 12], ps({ compound: true })),
      ex('bulgarian-split-squat', 'Bulgarian split squat', 'quadriceps', 3, [10, 12], ps({ compound: true })),
      ex('stiff-leg-deadlift', 'Stiff-leg deadlift', 'hamstrings', 3, [8, 10], ps({ compound: true })),
      ex('single-leg-curl', 'Single-leg curl', 'hamstrings', 5, [10, 15], ps()),
      ex('floor-barbell-calf-raise', 'Floor barbell calf raise', 'calves', 4, [12, 15], ps()),
      ex('leg-press-calf-press', 'Leg press calf press', 'calves', 4, [12, 15], ps()),
    ]),
  }),
  defaults: Object.freeze({
    restSec: 90, restSecCompound: 120, warmupMinutes: 5,
    // Reduced volume (default for new users; NOT the author's prescription):
    // 60 % of source sets, rounded up, max 3.
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
    measure: 'reps',     // 'reps' | 'time' (timed hold, e.g. plank 60 s)
    holdSec: null,
    compound: false,
    verification: 'pending-source', verifiedBy: null, v08ExerciseId: null, note: null,
    ...extra,
  });
}

const hasTargets = e => e.sets && (e.measure === 'time' ? Number.isInteger(e.holdSec) : !!e.reps);

/** True only when every day's list is complete and every exercise has primary-source targets. */
export function isSourceMatched(program) {
  return Object.values(program.days).every(d => d.listComplete && d.exercises.length
    && d.exercises.every(e => e.verification === 'primary-source' && hasTargets(e)));
}

export { hasTargets };
