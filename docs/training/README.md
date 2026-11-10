# FORGE training-session engine (Issue #5)

A browser-safe, dependency-free engine for a **classic six-day split**, built as pure, deterministic functions.

- It keeps **planned** work and **logged** work strictly separate.
- It never invents progress or penalises rest.
- It is a module for ChatGPT's cockpit UI (Issue #8) to integrate. It **does not change** any existing FORGE screen or stored record.

Status labels (per `AGENTS.md`): engine **TESTED** (36 Node tests; four deliberate-bug checks caught; real-Chromium run of a full A2 session). Source template **TESTED against the posted source tables (44/44)** and **REVIEW_REQUIRED** for owner sign-off.

## 1. Source and verification: **source-matched (44/44)**, owner sign-off pending

Source: Steve Shaw, [Old School Series: 1970s Bodybuilding Routine](https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine), Muscle & Strength (published 2013-09-25, updated 2020-12-22). It is a 12-week program for intermediate lifters: 6 days a week, 45–60 min. The author describes it as demanding and not appropriate for everyone.

| Key | Day | Session (source order) |
| --- | --- | --- |
| A1 | Mon | Bench press 3×8–10 · Incline DB bench press 3×8–12 · Cable crossover 5×10–15 · Low rack pull 3×6–8 · Wide-grip pull-up 5×15 · One-arm DB row 3×10–15 · Barbell ab rollout 3×8–12 · Hanging knee raise 3×12–15 |
| B1 | Tue | Seated DB press 3×10–12 · Upright row 3×10–15 · Bent-over reverse fly 5×10–15 · Cable triceps extension 4×10–15 · Skullcrusher 4×10–12 · Barbell curl 4×8–12 · One-arm cable curl 4×10–15 |
| C1 | Wed | Squat 5×6–12 · Hack squat 3×10–12 · Leg extension 3×10–15 · Good morning 3×8–10 · Leg curl 5×10–15 · Seated calf raise 4×12–15 · Standing calf raise 4×12–15 |
| A2 | Thu | Incline bench press 3×8–10 · Chest dip 3×10–15 · DB fly 5×10–15 · Barbell row 3×8–10 · Lat pulldown 5×8–12 · Seated cable row 3×10–15 · **Plank 3×60 s (timed)** · DB side bend 3×10–12 |
| B2 | Fri | Military press 3×8–10 · Side lateral raise 5×10–15 · Landmine press 3×10–12 · Seated French press 4×8–10 · One-arm DB triceps extension 4×10–12 · Seated DB curl 4×10–12 · EZ-bar preacher curl 4×10–12 |
| C2 | Sat | **Leg press 5×20 (fixed)** · Walking barbell lunge 3×10–12 · Bulgarian split squat 3×10–12 · Stiff-leg deadlift 3×8–10 · Single-leg curl 5×10–15 · Floor barbell calf raise 4×12–15 · Leg press calf press 4×12–15 |
| — | Sun | Rest |

**How the data was verified.**
- The tables come from ChatGPT's direct read of the article ([PR #9 comment](https://github.com/siveonfranklin25q-crypto/forge-fitness-scanner-demo/pull/9#issuecomment-6747215464)). The primary page blocks this build environment's automated client, and that block was not bypassed.
- Each exercise carries `verification: 'primary-source'` and `verifiedBy`.
- Two independent checks:
  1. A golden-table unit test with all 44 rows.
  2. A machine comparison of the posted comment against the program data: 44/44 rows match in order, sets, reps and timed hold.
- **Owner sign-off** (REVIEW_REQUIRED): glance at the table above against the article.

**Correction history.**
- v1 repeated three sessions built from secondary summaries.
- The owner-side review on 2026-11-09 found this wrong.
- v2 has six distinct sessions and the complete source tables.

**Rule: targets are never guessed.**
- A `pending-source` exercise has `sets: null`, and a day that isn't fully verified returns `blocked: 'awaiting-source'`; `createSession` refuses it. This guard stays for future programs and edits, and is tested.
- `isSourceMatched(program)` is now `true`.
- `allowPendingSource: true` is for UI testing only.

**Timed holds.** An exercise with `measure: 'time'` has `targetHoldSec`; its sets log `seconds`, with `reps: null`. Timed holds never count toward load/rep bests and are never auto-progressed.

**Volume** (`config.volume`):
- `'reduced'` (default) uses 60 % of source sets, rounded up, max 3. This is a `forge-default` rule and **not the author's prescription**.
- `'source'` gives the full prescription and is opt-in, so the high-volume routine is never applied silently.

Rest timers (90 s isolation / 120 s compound) and the 5-min warm-up are **forge-default**, not source values.

## 2. Flow (pure reducer `reduce(state, action)`)

```
safety ──stop──▶ stopped (stopped_safety)          any stage ──PAIN_STOP──▶ stopped (logged sets kept)
  │ go / reduce (−1 set per exercise)               any stage ──ABORT──▶ done (partial | aborted)
  ▼                                                 safety/warmup ──SKIP_SESSION──▶ done (skipped)
warmup ──WARMUP_DONE | SKIP_WARMUP──▶ exercise ──LOG_SET──▶ rest ──REST_DONE | SKIP_REST | LOG_SET──▶ exercise …
                                         └─SKIP_SET / SKIP_EXERCISE (recorded as skipped, never as work)
last set ──▶ review ──FINISH {symptoms}──▶ done (completed | partial)
```

- Time is always passed in as `now` (epoch ms). Nothing reads the clock, so the UI drives the timer with `restRemainingSec(state, now)`.
- Invalid input returns the **same state** with `error` set. It never throws mid-workout and never logs bad data.
- **Safety check:**
  - chest pain or dizziness, sharp pain, or feeling unwell → **stop** ("Rest is not a failure");
  - mild discomfort or under 6 h of sleep → **reduce** (one fewer set each, progression held).

  This is educational, not a diagnosis.

## 3. Data contract for the UI (Issue #8)

All imports come from `src/training-programs/index.js`:

| Need | Function | Returns |
| --- | --- | --- |
| Today's mission | `todayMission(program, config, today, records)` | `{kind:'training'|'rest'|'before-start', dayKey, plan, alreadyCompleted, canStart, programWeek, programComplete, headline, body, next}` |
| Schedule / preview | `planForDate(...)`, `preview(program, config, from, days, records)` | per-day `{date, kind, dayKey, title}` |
| Start / run session | `createSession({id, date, programId, dayPlan, now})`, `reduce(state, action)`, `currentStep(state)`, `restRemainingSec(state, now)` | session state (below) |
| Save | `toRecord(state)`, then `addRecord(store, record)` and `save(localStorage, store)` or `trySave(...)` → `{ok, error}`; `capacityError(store)`; `exportRaw(localStorage)` | session record |
| Progress | `weeklySummary`, `personalBests`, `sessionHighlights(record, history)`, `recommendNext(records, exerciseId, {min,max})` | log-derived facts with `basis` (session ids/dates) |
| v0.8 history | `fromV08Sessions(v08Array, program)` (read-only), `toV08Session(record, program)` (returns an object; the UI decides whether to append) | |

**Config** (`normalizeConfig` rejects invalid values with reasons):

```js
{ startDate: 'YYYY-MM-DD',          // required
  mode: 'rolling' | 'fixed-week',   // rolling (default): a missed day never skips a workout
  restWeekdays: [0],                 // 0=Sun..6=Sat, any set leaving ≥1 training day
  rotation: null /* = A1 B1 C1 A2 B2 C2 */, restSec: null | 15..600,
  volume: 'reduced' | 'source', allowPendingSource: false /* UI testing only */ }
```

**Planned exercise (`plan.exercises[]`):**
- `{exerciseId, name, muscle, sourceSets, targetSets, volume, measure:'reps'|'time', targetReps:{min,max}|null, targetHoldSec:number|null, restSec, restSource:'forge-default'|'user', verification, verifiedBy, v08ExerciseId, note}`
- The day plan also carries `{sourceComplete, blocked: null | 'awaiting-source' | 'no-verified-exercises', pendingExercises:[{exerciseId,name}]}`. The UI must not offer **Start** when `blocked` is set.
- Only targets: logging never changes them.

**Session record** (stored under the **new** key `forge-training-v1`, version 1; at most 500, and writes are refused beyond that rather than trimming; unique by `id`):

```js
{ version:1, id, programId, date:'YYYY-MM-DD', dayKey, title,
  status: 'completed' | 'partial' | 'skipped' | 'aborted' | 'stopped_safety',   // never assumed
  startedAt, endedAt, plannedSets, loggedSets, reducedForSafety, warmupDone,
  safety: {level:'go'|'reduce'|'stop', reasons:[], message} | null,
  symptoms: 'none' | 'mild' | 'worse' | null,
  sets:    [{exerciseId, muscle, setNumber, measure:'reps'|'time', reps|null, seconds|null, load, unit:'kg'|'lb', rir:0-5|null, at}],
  skipped: [{exerciseId, setNumber}] }
```

- Only `completed` and `partial` advance the rolling rotation or count as training.
- **Migration:** records saved with v1 day keys `A/B/C` are read as `A1/B1/C1` (`migrateDayKey`). Stored data is never rewritten or dropped for this.
- `stopped_safety` is reported separately and is never framed as a miss.

**Progression** (`recommendNext`):
- `increase` happens only when the last **two separate-day** sessions, at most 30 days apart, both reach the **top of the rep range** on every top-load set, with no symptoms, no reduced volume, and RIR ≥ 2 when recorded. The step is +2.5 kg or +5 lb, and reps restart at the bottom of the range.
- Otherwise the result is `repeat`, `hold`, `reduce` or `baseline`, each with a plain reason and the `basis` sessions.

## 4. Existing data is protected

- `forge-strength-v08-sessions` and all other FORGE keys are **never written** (tested with a fake storage).
- Eight template exercises map to v0.8 exercise ids: incline DB press → 2, seated cable row → 4, lat pulldown → 5, side lateral raise → 7, cable triceps extension → 14, leg press → 18, leg curl → 22, standing calf raise → 26. Only those can be read from, or offered to, v0.8 history.
- Untrusted stored JSON is validated. Invalid records are **never repaired** into fake data and never used for schedule or progress.
- **Nothing is dropped or trimmed, ever.** On load:
  - invalid or duplicate-id records and an unreadable in-progress session move to `store.quarantine`, verbatim;
  - unknown top-level fields are kept and written back.
- **Caps fail closed.** Limits are `MAX_RECORDS = 500` and `MAX_QUARANTINE = 200`. If loaded or about-to-be-saved data exceeds a cap, or the stored data is unreadable or from an unknown version, the store is marked `readOnly` and:
  - `load()` / `parseStore()` return `error`: `'records-overflow' | 'quarantine-overflow' | 'unreadable' | 'unknown-version' | 'storage-unavailable'` (`'empty'` is the only non-blocking value), plus `counts`;
  - `save()` returns `false`, `trySave()` returns `{ok:false, error}`, and `serializeStore()` throws. The original browser bytes are left untouched.
  - `exportRaw(storage)` returns the original string so the UI can offer a backup before any owner decision.
- UI contract: when `load().error` is set and not `'empty'`, block writes, show a truthful message, and offer the export. Never claim a session was saved when `save()` returned `false`.

## 5. Feedback rules (enforced by tests)

- Highlights come only from logged sets: "First logged session", "New best on X: reps × load (was …)", "N working sets logged". Skipped, aborted and safety-stopped sessions produce none.
- No streaks, no "missed", "behind" or "lost" copy (a test checks the rest-day text), and no make-up sessions.

## 6. Run the tests

```bash
node --test tests/training-programs/*.test.mjs
```

CI: `.github/workflows/forge-training-checks.yml`. Synthetic data only. No network, no paid services, no personal data.
