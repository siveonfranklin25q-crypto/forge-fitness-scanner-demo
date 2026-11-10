# FORGE training-source audit — 2026-11-09

**Exercise-table parity: PASS against ChatGPT's direct read of the original source. Owner acceptance is STILL PENDING.**

Primary source: Steve Shaw, [Old School Series: 1970s Bodybuilding Routine](https://www.muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine), updated December 2020.

## Resolution of earlier blocking discrepancies

- The earlier A/B/C template was inaccurate. Claude restructured it into six distinct source sessions: **A1/B1/C1/A2/B2/C2**, with Sunday recovery.
- ChatGPT's [complete 44-row primary-source handoff](https://github.com/siveonfranklin25q-crypto/forge-fitness-scanner-demo/pull/9#issuecomment-6747215464) lists exact exercises, sets and reps. Claude independently parsed the posted comment and found 44/44 matches in the corrected program.
- Special cases: **plank 3 × 60 seconds, not reps**, and **leg press 5 × 20**, exact fixed reps.
- Engine source in [Claude draft PR #9](https://github.com/siveonfranklin25q-crypto/forge-fitness-scanner-demo/pull/9) was imported unchanged, first at `e2af478` and through the reviewed fixes at `dc9aac7`. The latest storage protection at **`f842e30`** is also synced unchanged, with **36 passing engine tests**. All **10 imported engine/test/README Git blobs** match upstream. The fixed-week duplicate-start guard and invalid-record quarantine remain in place.
- The cockpit selects verified training days, defaults to **reduced FORGE volume** (different from the author's demanding high-volume routine), logs actual hold seconds, and preserves local historic sessions. `todayMission().canStart` blocks unverified targets.
- On overflow, corrupt JSON, unknown storage versions or failed writes, the cockpit fails closed with a specific reason and offers a **user-triggered local download** of the exact original stored training text (no network upload). Tests cover 201 archived entries, 500 workouts, invalid JSON, unknown schema versions and archive refusal at 200; no automatic cleanup or pruning is authorized.
- **Open edge case for upstream review:** a version-1 store with a *present but non-array* `records` or `quarantine` property might be replaced by `[]` on the next successful write. Claude was asked to make this malformed shape read-only and preserve its raw backup before claiming the invariant is universal.

## Remaining release gates

1. The **owner** must review the 44 exercise rows and accept the intended training plan; matching article data is not personalized medical clearance.
2. Combined GitHub CI **passed** on [run #42768999554](https://github.com/siveonfranklin25q-crypto/forge-fitness-scanner-demo/actions/runs/42768999554): 36 engine tests and Chromium/UI/3D/strength/nutrition regressions including local raw-backup downloads. This is technical evidence, not release approval.
3. Claude's **earlier independent re-review of PR #10 passed**, but the **new storage/export UI and malformed-shape safeguard need fresh verification**. Hands-on mobile/Chromebook evaluation remains.
4. No merges, releases, deployments, spending, or private model publication without separate authorization.

There is **no user GLB or personally identifiable workout record** committed to this branch.
