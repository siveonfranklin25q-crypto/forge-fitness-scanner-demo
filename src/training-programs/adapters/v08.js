// Bridge to the existing v0.8 Strength Tracker ('forge-strength-v08-sessions').
// READ-ONLY by design: these functions never touch storage. The UI may choose to show v0.8
// history in progress views, or (with the user's action) append a converted record itself.
// v0.8 set: {exerciseId:number, reps:1-40, kg:0-1000, rir:0-5, type:'working'|'warmup'}
// v0.8 session: {id, date:'YYYY-MM-DD', sets, symptoms:'none'|'mild'|'worse', counted:boolean}

import { isISODate } from '../dates.js';
import { toKg } from '../session.js';

/** Map program exercise id -> v0.8 numeric exerciseId, from the program template. */
export function v08Map(program) {
  const map = {};
  for (const d of Object.values(program.days)) for (const e of d.exercises) if (Number.isInteger(e.v08ExerciseId)) map[e.id] = e.v08ExerciseId;
  return map;
}

/** v0.8 history -> read-only program-style records for mapped exercises (working sets only). */
export function fromV08Sessions(v08Sessions, program) {
  if (!Array.isArray(v08Sessions)) return [];
  const reverse = Object.fromEntries(Object.entries(v08Map(program)).map(([k, v]) => [v, k]));
  const muscleOf = {};
  for (const d of Object.values(program.days)) for (const e of d.exercises) muscleOf[e.id] = e.muscle;
  const out = [];
  for (const s of v08Sessions) {
    if (!s || !isISODate(s.date) || !Array.isArray(s.sets)) continue;
    const sets = s.sets
      .filter(x => x && x.type === 'working' && reverse[x.exerciseId] && Number.isInteger(x.reps) && Number.isFinite(x.kg))
      .map((x, i) => ({ exerciseId: reverse[x.exerciseId], muscle: muscleOf[reverse[x.exerciseId]], setNumber: i + 1,
        reps: x.reps, load: x.kg, unit: 'kg', rir: Number.isInteger(x.rir) ? x.rir : null, at: null }));
    if (!sets.length) continue;
    out.push({ version: 1, id: 'v08:' + String(s.id || s.date), programId: null, source: 'v0.8', date: s.date, dayKey: null,
      status: 'completed', plannedSets: sets.length, loggedSets: sets.length, reducedForSafety: false,
      symptoms: ['none', 'mild', 'worse'].includes(s.symptoms) ? s.symptoms : 'mild', sets, skipped: [] });
  }
  return out;
}

/** A finished program record -> v0.8 session shape (mapped exercises only), or null. Never saved here. */
export function toV08Session(record, program) {
  const map = v08Map(program);
  const sets = (record?.sets || [])
    .filter(s => map[s.exerciseId] !== undefined && s.reps >= 1 && s.reps <= 40)
    .map(s => ({ exerciseId: map[s.exerciseId], reps: s.reps, kg: Math.round(toKg(s.load, s.unit) * 100) / 100,
      rir: Number.isInteger(s.rir) ? s.rir : 2, type: 'working' }));
  if (!sets.length || !isISODate(record.date)) return null;
  return { id: 'forge-training:' + record.id, date: record.date, sets,
    symptoms: ['none', 'mild', 'worse'].includes(record.symptoms) ? record.symptoms : 'mild', counted: false };
}
