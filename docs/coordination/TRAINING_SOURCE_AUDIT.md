# FORGE training template verification — review gate (2026-11-09)

**Status: BLOCKED for source-accurate training release.** The interactive cockpit's technical/browser tests are green; the exercise prescriptions in Claude's Draft PR #9 are not faithful to the named primary source. The current integration PR #10 is **QA only**, not an approved exercise program.

Primary source (read directly on 2026-11-09): Steve Shaw, [Old School Series: 1970s Bodybuilding Routine](https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine), published Sept 25, 2013, updated Dec 22, 2020.

## Independently checked discrepancies

- **Different routines on the second weekly round:** Thursday, Friday and Saturday have their *own* exercises, not copies of Monday, Tuesday and Wednesday. Current code represents only A/B/C repeated.
- **Monday (chest/back):** bench 3 sets of 8–10 rather than a flexible 3–5 sets of 8–15; cable crossover 5 sets of 10–15; pullups 5 sets of 15; two abdominal exercises are absent from the draft.
- **Tuesday (shoulders/arms):** barbell curls are expressly present at 4 sets of 8–12 and one-arm cable curls are part of the table. Draft mislabels the former optional/unverified and omits the latter.
- **Wednesday (legs):** leg curls are 5 sets of 10–15; seated calf raise 4 sets of 12–15; standing calf raise 4 sets of 12–15 is omitted.
- The entire Thursday/Friday/Saturday exercise tables (and Thursday abdominal work) still need representation. Every movement needs exact source sets and reps plus an explicit source mapping.
- Rest intervals and warm-up guidance in the engine are labelled FORGE defaults, which is correct. A trainer response in the article comments mentions other rest targets; that does not automatically supersede the application default.

## Next ownership action

Claude owns `src/training-programs/` and source-content corrections in PR #9. See review comment https://github.com/siveonfranklin25q-crypto/forge-fitness-scanner-demo/pull/9#issuecomment-6744860120. Ask Claude to add six distinct day templates or a two-variant per body-part schema, correct exact exercise targets, update schedule/rolling rotation and existing deterministic tests. Keep existing saved session records intact, and plan for backwards-compatible schema migration if exercise IDs/day keys change.

ChatGPT owns only the cockpit UI. Once Claude's reviewed correction is ready, copy the verified engine files to the integration branch unchanged, rerun the session smoke, test legacy-data migration and avoid treating this technical green check as a clinical or source-content signoff.

## Evidence and release rules

- PR #10 reviewed integration: native module import, real set logging, safety/recovery, browser persistence, original v0.8 tracker untouched.
- Source parity is **not** passing; mark this as a product-release blocker.
- Device-level battery/thermal, private GLB, owner acceptance and separate merge/deployment authorization are still outstanding.
- No private character asset, client profile or personal measurements are part of this repository branch.
