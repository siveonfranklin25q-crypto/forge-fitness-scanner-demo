# FORGE training-session engine (Issue #5)

A browser-safe, dependency-free engine for a **classic six-day split**, built as pure, deterministic functions.

- It keeps **planned** work and **logged** work strictly separate.
- It never invents progress or penalises rest.
- It is a module for ChatGPT's cockpit UI (Issue #8) to integrate. It **does not change** any existing FORGE screen or stored record.

Status labels (per `AGENTS.md`): engine **TESTED**: 26 Node tests, two deliberate-bug checks caught, and a real-Chromium smoke run. Source template **REVIEW_REQUIRED**: see §1.

## 1. Source and verification

The template follows Muscle & Strength's [Old School Series: 1970s Bodybuilding Routine](https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine), first published 2013 and updated 2020:
- a 12-week, six-day split for intermediate lifters;
- Mon/Thu **chest & back**, Tue/Fri **shoulders & arms**, Wed/Sat **legs**, Sun rest.

**The primary page could not be read from the build environment** (the site's bot protection blocks automated clients; it was not bypassed). Every exercise name and set/rep range therefore comes from consistent **secondary summaries** of that article, and each one carries `verification: 'secondary-summary'`.

| Item | Status |
| --- | --- |
| Weekly layout, 12 weeks, intermediate | secondary-summary (consistent across copies) |
| Day A: bench press, incline DB press, cable crossover (3–5 × 8–15); low rack pull, wide-grip pull-up, one-arm DB row (3–5 × 6–15) | secondary-summary. One copy lists deadlifts instead of rack pulls (noted in data). |
| Day B: seated DB press, upright row, reverse fly, cable triceps extension, skullcrusher (3–5 × 10–15) | secondary-summary |
| Day B: barbell curl | **unverified**: only some copies list it, so it is `optional: true` and filterable |
| Day C: squat 5 × 6–12; hack squat, leg extension, good morning, leg curl, seated calf raise (3–5 × 6–15) | secondary-summary |
| Rest timers (90 s isolation / 120 s compound), 5-min warm-up | **forge-default**, never attributed to the source |

**Owner check (2 minutes, in your own browser):** open the source page and confirm or correct each row above. Edits go only in `src/training-programs/programs/classic-six-day.js`. Only facts (names, numbers, layout) are used; no instructional prose is copied.

The engine starts conservatively at the **minimum** of each set range (`setsChoice: 'min'`). The source describes intermediate-level volume.

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
| Today's mission | `todayMission(program, config, today, records)` | `{kind:'training'|'rest'|'before-start', dayKey, plan, alreadyCompleted, programWeek, programComplete, headline, body, next}` |
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
  rotation: ['A','B','C'], restSec: null | 15..600, includeOptional: true, setsChoice: 'min' | 'max' }
```

**Planned exercise (`plan.exercises[]`):**
- `{exerciseId, name, muscle, targetSets, targetReps:{min,max}, restSec, restSource:'forge-default'|'user', verification, optional, v08ExerciseId, note}`
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
