# FORGE training-session engine (Issue #5)

A browser-safe, dependency-free engine for a **classic six-day split**, built as pure, deterministic functions.

- It keeps **planned** work and **logged** work strictly separate.
- It never invents progress or penalises rest.
- It is a module for ChatGPT's cockpit UI (Issue #8) to integrate. It **does not change** any existing FORGE screen or stored record.

Status labels (per `AGENTS.md`): engine **TESTED** (30 Node tests; four deliberate-bug checks caught). Source template **BLOCKED**: awaiting the full primary-source tables, see §1.

## 1. Source and verification: **BLOCKED on source data**

Source: Steve Shaw, [Old School Series: 1970s Bodybuilding Routine](https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine), Muscle & Strength (published 2013-09-25, updated 2020-12-22). It is a 12-week split for intermediate lifters with **six distinct sessions**:

| Key | Day | Group |
| --- | --- | --- |
| A1 | Mon | Chest & back |
| B1 | Tue | Shoulders & arms |
| C1 | Wed | Legs |
| A2 | Thu | Chest & back (different exercises) |
| B2 | Fri | Shoulders & arms (different exercises) |
| C2 | Sat | Legs (different exercises) |
| — | Sun | Rest |

**Correction history.**
- v1 of this PR repeated three sessions built from secondary summaries, because the primary page blocks automated clients (Cloudflare check; not bypassed).
- The owner-side primary-source review on PR #9 (2026-11-09) found that model and several targets wrong.
- v2 restructures to six sessions and keeps **only confirmed values**.

| Exercise | Day | Source target | Status |
| --- | --- | --- | --- |
| Bench press | A1 | 3 × 8–10 | primary-source (reported in PR #9 review) |
| Cable crossover | A1 | 5 × 10–15 | primary-source (reported) |
| Wide-grip pull-up | A1 | 5 × 15 | primary-source (reported) |
| Barbell curl | B1 | 4 × 8–12 | primary-source (reported) |
| Leg curl | C1 | 5 × 10–15 | primary-source (reported) |
| Seated calf raise | C1 | 4 × 12–15 | primary-source (reported) |
| Standing calf raise | C1 | 4 × 12–15 | primary-source (reported) |
| Incline DB press, low rack pull, one-arm DB row, barbell ab rollout, hanging knee raise | A1 | unknown | **pending-source** |
| Seated DB press, upright row, reverse fly, cable triceps extension, skullcrusher, one-arm cable curl | B1 | unknown | **pending-source** |
| Squat, hack squat, leg extension, good morning | C1 | unknown | **pending-source** |
| Plank, dumbbell side bend (rest of list unknown) | A2 | unknown | **pending-source** |
| Full exercise lists | B2, C2 | unknown | **pending-source** |

**Rule: targets are never guessed.**
- A pending exercise has `sets: null, reps: null`.
- A day that isn't fully verified returns `blocked: 'awaiting-source'`, with no exercises. `createSession` refuses it, and `todayMission().canStart` is `false` with honest copy.
- `allowPendingSource: true` exists **only for UI testing**: it runs just the verified exercises of a day.
- `isSourceMatched(program)` is `true` only when all six lists are complete and verified.

Requested on PR #9: the complete Mon–Sat tables (exercise, sets × reps, any table notes).

**Volume** (`config.volume`):
- `'reduced'` (default) uses 60 % of source sets, rounded up, max 3. This is a `forge-default` rule.
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
| Save | `toRecord(state)`, then `addRecord(store, record)` and `save(localStorage, store)` | session record |
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
- `{exerciseId, name, muscle, sourceSets, targetSets, volume, targetReps:{min,max}, restSec, restSource:'forge-default'|'user', verification, verifiedBy, v08ExerciseId, note}`
- The day plan also carries `{sourceComplete, blocked: null | 'awaiting-source' | 'no-verified-exercises', pendingExercises:[{exerciseId,name}]}`. The UI must not offer **Start** when `blocked` is set.
- Only targets: logging never changes them.

**Session record** (stored under the **new** key `forge-training-v1`, version 1, max 500, deduplicated by `id`):

```js
{ version:1, id, programId, date:'YYYY-MM-DD', dayKey, title,
  status: 'completed' | 'partial' | 'skipped' | 'aborted' | 'stopped_safety',   // never assumed
  startedAt, endedAt, plannedSets, loggedSets, reducedForSafety, warmupDone,
  safety: {level:'go'|'reduce'|'stop', reasons:[], message} | null,
  symptoms: 'none' | 'mild' | 'worse' | null,
  sets:    [{exerciseId, muscle, setNumber, reps, load, unit:'kg'|'lb', rir:0-5|null, at}],
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
- Three template exercises map to v0.8 exercise ids: incline DB press → 2, cable triceps extension → 14, leg curl → 22. Only those can be read from, or offered to, v0.8 history.
- Untrusted stored JSON is validated, and invalid records are **dropped, not repaired** (no fake data).

## 5. Feedback rules (enforced by tests)

- Highlights come only from logged sets: "First logged session", "New best on X: reps × load (was …)", "N working sets logged". Skipped, aborted and safety-stopped sessions produce none.
- No streaks, no "missed", "behind" or "lost" copy (a test checks the rest-day text), and no make-up sessions.

## 6. Run the tests

```bash
node --test tests/training-programs/*.test.mjs
```

CI: `.github/workflows/forge-training-checks.yml`. Synthetic data only. No network, no paid services, no personal data.
