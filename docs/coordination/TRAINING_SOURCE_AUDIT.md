# FORGE training-source audit — 2026-11-09

**Exercise-table parity: PASS against ChatGPT's direct read of the original source. Owner acceptance is STILL PENDING.**

Primary source: Steve Shaw, [Old School Series: 1970s Bodybuilding Routine](https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine), updated December 2020.

## Resolution of earlier blocking discrepancies

- The earlier A/B/C template was inaccurate. Claude restructured it into six distinct source sessions: **A1/B1/C1/A2/B2/C2**, with Sunday recovery.
- ChatGPT's [complete 44-row primary-source handoff](https://github.com/siveonfranklin25q-crypto/forge-fitness-scanner-demo/pull/9#issuecomment-6747215464) lists exact exercises, sets and reps. Claude independently parsed the posted comment and found 44/44 matches in the corrected program.
- Special cases: **plank 3 × 60 seconds, not reps**, and **leg press 5 × 20**, exact fixed reps.
- Engine source in [Claude draft PR #9](https://github.com/siveonfranklin25q-crypto/forge-fitness-scanner-demo/pull/9) at `e2af478` was imported unchanged; Claude's reviewed fixes at **`dc9aac7`** (32 passing engine tests) were subsequently synced as exact-blob copies of `schedule.js`, `storage.js` and the engine tests into draft PR #10. Fixed-week same-day duplicate starts are now blocked, and invalid legacy records are quarantined instead of silently dropped.
- The cockpit now selects the verified training days, defaults to **reduced FORGE volume** (different from the author's high-volume routine), logs actual hold seconds, and preserves local historic sessions. `todayMission().canStart` blocks a session if targets are unverified.

## Remaining release gates

1. The **owner** must review the 44 exercise rows and accept the intended training plan; matching article data is not personalized medical clearance.
2. Combined GitHub CI **passed** on [run #42719160580](https://github.com/siveonfranklin25q-crypto/forge-fitness-scanner-demo/actions/runs/42719160580): 32 engine tests and Chromium/UI/3D/strength/nutrition regressions. This is technical evidence, not deployment approval.
3. **Claude second independent review is requested** after the P1 false-set prevention (blank reps/load and explicit entry) and P2 old-active-session handling (private archive or explicit discard). Hands-on mobile/Chromebook evaluation remains.
4. No merges, releases, deployments, spending, or private model publication without separate authorization.

There is **no user GLB or personally identifiable workout record** committed to this branch.
