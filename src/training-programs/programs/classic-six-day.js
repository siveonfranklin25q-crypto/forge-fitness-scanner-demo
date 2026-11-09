// Classic 1970s-style six-day split: chest/back · shoulders/arms · legs, twice a week, one rest day.
//
// SOURCE: Muscle & Strength, "Old School Series: 1970s Bodybuilding Routine" (first published 2013,
// updated 2020), https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine
// VERIFICATION STATUS: the primary page could not be opened from the build environment (bot
// protection). Exercise names and set/rep RANGES below come from consistent secondary summaries of
// that article and are marked `secondary-summary`. Items that appear in only some copies are
// marked `unverified` and are optional. Values FORGE chose itself (rest timer defaults, warm-up
// prompts) are marked `forge-default` and are never attributed to the source.
// Only facts (exercise names, set/rep numbers, weekly layout) are used; no instructional prose.

export const CLASSIC_SIX_DAY = Object.freeze({
  id: 'classic-six-day-v1',
  name: 'Classic six-day split',
  version: 1,
  durationWeeks: 12,
  level: 'intermediate',
  source: Object.freeze({
    title: 'Old School Series: 1970s Bodybuilding Routine',
    publisher: 'Muscle & Strength',
    url: 'https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine',
    published: '2013 (updated 2020)',
    verification: 'secondary-summary', // owner to confirm against the primary page
  }),
  // Default weekly layout (0 = Sunday ... 6 = Saturday). Adjustable via config.
  defaultWeek: Object.freeze({ 0: 'rest', 1: 'A', 2: 'B', 3: 'C', 4: 'A', 5: 'B', 6: 'C' }),
  days: Object.freeze({
    A: day('A', 'Chest & back', ['chest', 'back'], [
      ex('bench-press', 'Bench press', 'chest', [3, 5], [8, 15]),
      ex('incline-db-press', 'Incline dumbbell press', 'chest', [3, 5], [8, 15], { v08ExerciseId: 2 }),
      ex('cable-crossover', 'Cable crossover', 'chest', [3, 5], [8, 15]),
      ex('low-rack-pull', 'Low rack pull', 'back', [3, 5], [6, 15], { note: 'Some copies list deadlifts here.' }),
      ex('wide-grip-pull-up', 'Wide-grip pull-up', 'back', [3, 5], [6, 15]),
      ex('one-arm-db-row', 'One-arm dumbbell row', 'back', [3, 5], [6, 15]),
    ]),
    B: day('B', 'Shoulders & arms', ['shoulders', 'triceps', 'biceps'], [
      ex('seated-db-press', 'Seated dumbbell press', 'shoulders', [3, 5], [10, 15]),
      ex('upright-row', 'Upright row', 'shoulders', [3, 5], [10, 15]),
      ex('reverse-fly', 'Bent-over reverse fly', 'shoulders', [3, 5], [10, 15]),
      ex('cable-triceps-extension', 'Cable triceps extension', 'triceps', [3, 5], [10, 15], { v08ExerciseId: 14 }),
      ex('skullcrusher', 'Skullcrusher', 'triceps', [3, 5], [10, 15]),
      ex('barbell-curl', 'Barbell curl', 'biceps', [3, 5], [10, 15],
        { verification: 'unverified', optional: true, note: 'Listed in only some copies of the article.' }),
    ]),
    C: day('C', 'Legs', ['quadriceps', 'hamstrings', 'calves'], [
      ex('squat', 'Squat', 'quadriceps', [5, 5], [6, 12]),
      ex('hack-squat', 'Hack squat', 'quadriceps', [3, 5], [6, 15]),
      ex('leg-extension', 'Leg extension', 'quadriceps', [3, 5], [6, 15]),
      ex('good-morning', 'Good morning', 'hamstrings', [3, 5], [6, 15]),
      ex('leg-curl', 'Leg curl', 'hamstrings', [3, 5], [6, 15], { v08ExerciseId: 22 }),
      ex('seated-calf-raise', 'Seated calf raise', 'calves', [3, 5], [6, 15]),
    ]),
  }),
  // FORGE defaults (not from the source).
  defaults: Object.freeze({ restSec: 90, restSecCompound: 120, warmupMinutes: 5, verification: 'forge-default' }),
});

function day(key, title, muscles, exercises) {
  return Object.freeze({ key, title, muscles: Object.freeze(muscles), exercises: Object.freeze(exercises) });
}

function ex(id, name, muscle, sets, reps, extra = {}) {
  return Object.freeze({
    id, name, muscle,
    sets: Object.freeze(sets), reps: Object.freeze(reps),
    compound: ['bench-press', 'low-rack-pull', 'wide-grip-pull-up', 'squat', 'hack-squat', 'good-morning', 'seated-db-press'].includes(id),
    verification: 'secondary-summary', optional: false, v08ExerciseId: null, note: null,
    ...extra,
  });
}
