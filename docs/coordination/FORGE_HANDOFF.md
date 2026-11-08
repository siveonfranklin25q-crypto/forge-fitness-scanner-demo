# FORGE — Parallel AI Workstreams
Updated 2026-11-08. Shared coordination plan. The repository is PUBLIC: no personal assets/data belong in issues, branches, logs or CI.

## Responsibilities and code ownership

| Owner | Issue / PR | Owns | Must NOT edit |
| --- | --- | --- | --- |
| ChatGPT | [Draft PR #2](../../pull/2) | Cinematic UI, 3D character stage, local-only optional avatar caching, HUD/mobile navigation, integration review | Private model files; other agents' isolated modules |
| Claude: Motion | [Issue #3](../../issues/3) | glTF turn diagnosis, root rotation vs viewer orbit, foot locks, reproducible animation tests and QA | `index.html`, `forge-avatar.*`, `forge-immersive.*`, `forge-ui.*` |
| Claude: 3D Performance | [Issue #4](../../issues/4) | Benchmarks, safe synthetic assets, FPS/startup/battery/accessibility report | All active UI and avatar integration source |
| Claude: Training Sessions | [Issue #5](../../issues/5) | Additive classic six-day training data model, session flow and tests | All active UI and avatar integration source |
| Owner | Private preview review | Confirms look, motion, UX and release gates | No action is required for code-only investigations |

## Immediate user report

"The Turn in Place is very very very slow."

Verified from the privately inspected original glTF:
- `TurnInPlace` is a **0.8-second** clip; `Walk` is ~0.867 s; `Idle` is 4 s.
- The *initial private HTML preview* used the viewer's `rotation-per-second="8deg"`, taking **45 seconds per full revolution**.
- ChatGPT produced a corrected *owner-private HTML* preview: Turn defaults to **85°/sec orbit**, **1.65x clip playback**, with a 30–180°/sec slider; Idle/Walk use 22°/sec orbit. This is **viewer tuning, not proof of body turn/foot-lock quality**.
- Claude owns skeletal and animation validation in Issue #3. Do not publish the privately held likeness or its reference photos.

## Branch and PR rules

1. Claude uses one isolated topic branch and a **draft PR** per issue. Start from `main` for additive modules. If dependencies on PR #2 arise, document exact handoff/interface instead of editing the same files; propose a stacked PR only after ChatGPT coordinates.
2. ChatGPT owns the integration branch `design/forge-command-ui-20261108` / [PR #2](../../pull/2).
3. Before modifying any source, check open PRs, issues and this coordination document. Cross-lane requests are made in a GitHub issue comment with the source commit and expected input/output.
4. Every completion comment: **DONE** / **BLOCKED** / **NEEDS OWNER**, changed files, test commands/results, costs, PR URL, what remains.
5. Human approval is required for **merging, deploying, spending, public likeness distribution, private uploads, or modifying stored personal records**.
6. Do not call browser emulation a physical-device test. Do not claim the user's appearance or real animation has passed without private inspection and owner approval.

## Shared target

Make the visual experience compelling *and* goal-serving: launch to character and meaningful daily objective, complete a workout, track real sets, review measurable growth, return because progress is visible. Animations may never misrepresent real progress or penalize rest and recovery.
