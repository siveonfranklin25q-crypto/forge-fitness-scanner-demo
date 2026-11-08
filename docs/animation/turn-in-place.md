# TurnInPlace — root-cause report, gates and private-review handoff (Issue #3)

Status labels follow `AGENTS.md`: **TESTED** = executed here with recorded results; **PROPOSED** = needs owner confirmation; **BLOCKED** = needs the private model.

## 1. Root cause: three separate things were being called "the turn"

| Layer | What it actually does | Evidence | Label |
| --- | --- | --- | --- |
| **Viewer turntable** (`auto-rotate` + `rotation-per-second`) | Rigidly spins the whole scene pivot. It is not the camera and not the skeleton, so no foot can plant or step. | model-viewer 4.1.0 source: `lib/features/staging.js:84` sets `scene.yaw`; `lib/three-components/ModelScene.js:534` sets `pivot.rotation.y`. 8°/s = **45.0 s per 360°**; 85°/s = **4.24 s**. | TESTED (source + unit test) |
| **Clip playback** (`timeScale`) | Plays the authored bone motion faster or slower. On a 0.8 s clip at 1.65× one cycle lasts **0.485 s**. | `test_pr2_settings_on_0p8s_clip` | TESTED |
| **Authored skeleton heading** | The real body turn, if any, comes from Hips or Armature-root yaw in the clip. | Measured by `tools/animation/gltf_turn_diagnose.py` over the **whole trajectory** | Tool TESTED; private clip **BLOCKED** |

Consequences, all reproduced on synthetic fixtures:

1. **Equal first and last Hips rotation does not prove "no turn".** A full 360° spin ends on the same quaternion as it started (`test_360_spin_has_equal_endpoint_rotation_but_full_heading_change`), and so does a turn-and-return. You can only tell them apart by unwrapping the heading over every frame, which is what the tool does.
2. **model-viewer cannot accumulate root motion.** It loops with three.js `LoopRepeat` (model-viewer `animation.js:170`, `ModelScene.js:581`). If the clip authors a net heading of N°, the body **snaps back N° every cycle**. With PR #2's settings on a 90° clip that happens every 0.485 s.
3. **A speed multiplier cannot fix a turn.** On a 0.8 s, 90° planted turn, 1.65× gives a mean body rate of **385.8°/s**. The PROPOSED natural band is 60–150°/s. The tool's recommended scale for that synthetic clip is **0.449×** (cycle ≈ 1.78 s). The real clip's value has to be measured privately.

The "very slow" report is explained by the original **8°/s turntable** (45 s per revolution), which is a viewer setting. Whether the private clip contains a real planted turn is **not yet known**. It needs the private run in §4.

## 2. Tool

```bash
python3 tools/animation/gltf_turn_diagnose.py MODEL.glb --list
```

```bash
python3 tools/animation/gltf_turn_diagnose.py MODEL.glb --clip TurnInPlace --time-scale 1.65 --turntable-deg-per-sec 85 --expect-angle 90 --json
```

- Uses only the Python standard library and runs offline. Output is deterministic: identical bytes on repeat runs (tested).
- Reads GLB/glTF 2.0: embedded, data-URI or sibling `.bin` buffers; STEP, LINEAR (slerp) and CUBICSPLINE sampling; normalized integer rotations. Sparse accessors are rejected with a clear error.
- Finds joints by Mixamo, Blender (`.L`/`.R`) and `_L`/`_R` naming. Use `--joint Lfoot=<node>` (keys: `hips`, `L|R` + `upleg|knee|foot|toe|arm`) for other rigs.
- **Privacy:** the report never contains the input path or a file hash (tested). It contains node names, the clip name and numbers only.
- Exit code 0 means every applicable gate passed; 1 means a gate failed.

Reported values: duration; unwrapped pelvis heading (net, peak, 5–95 % turn window); shoulder heading; per-node attribution (Armature root vs Hips); hips drift; per-foot contact segments with slide in metres and as a ratio of leg length; pivot foot; knee interior angle range and fastest knee angular speed (informational); loop-seam pose difference; playback cycle, body turn rate, turntable rate, loop pop; recommended `timeScale`.

### Independent cross-check

`tests/animation/test_three_crosscheck.py` samples every fixture with **three.js 0.172.0 AnimationMixer** (the engine model-viewer 4.1.0 pins). It compared 7 fixtures × 41 samples × 6 joints; the largest differences were **0.0001 mm** in position and **0.0000°** in heading. This rules out the Python sampler simply agreeing with itself.

## 3. Gates

| Gate | Threshold | Label |
| --- | --- | --- |
| `heading_authored` | \|net heading\| ≥ 10° | TESTED |
| `angle_matches_expected` | \|net − expected\| ≤ 10° (90° / 180° targets) | TESTED |
| `foot_slide` | every grounded segment slides ≤ **2.5 % of leg length** (≈ 2.2 cm on a 0.87 m leg). Grounded means within 3 % of leg length of the lowest foot point. | TESTED on fixtures; PROPOSED value |
| `pivot_foot_present` | one foot grounded for ≥ 50 % of the turn window **and** within the slide limit | TESTED |
| `turn_rate_in_band_PROPOSED` | mean body rate over the 5–95 % window between 60 and 150°/s (target 105°/s) | **PROPOSED** — see note |

Note on the rate band: I could not find a primary source for standing in-place turn durations in healthy adults. The closest data found are Timed-Up-and-Go turns after walking (≈0.8–2.0 s per 180°), plus standing-turn studies showing duration rises with amplitude. The band brackets that range, but it is a product decision, not a biomechanics fact. The owner may tune it; it must not be loosened just to get a green result.

Synthetic fixtures (all with analytic ground truth, all TESTED):

| Fixture | Net heading | Classification | Pivot | Verdict |
| --- | --- | --- | --- | --- |
| planted_turn_90 (1.6 s) | +90.0° | PLANTED_TURN | left, slide 0.0 mm | PASS |
| planted_turn_180_right (3.0 s) | −180.0° | PLANTED_TURN | right | PASS |
| root_driven_cm_units_90 (Armature yaw, 0.01 scale, cm) | +90.0°, attributed to `Root` | PLANTED_TURN | left | PASS |
| skating_turn_90 | +90.0° | TURN_WITH_FOOT_SLIDE (feet slide 141.4 mm) | none | FAIL |
| turn_and_return_30 | 0.0° (peak 30°) | TURN_AND_RETURN | — | FAIL |
| full_spin_360 | +360.0° (endpoint quaternions equal) | PLANTED_TURN | left | rate FAIL |
| fast_turn_90_0p8s @1.65× | +90.0°, 385.8°/s | PLANTED_TURN | left | rate FAIL → PASS at recommended 0.449× |

## 4. Private-model handoff (owner or ChatGPT, private machine only)

Nothing in this branch loads, references or needs the private likeness. On the device that holds the model:

1. Check out this branch. Do not copy the GLB into the repo.
2. Run `--list` and note the clip names and durations.
3. Run the full command from §2 twice: once with `--time-scale 1 --turntable-deg-per-sec 0` (the clip alone) and once with the PR #2 settings.
4. If the joints are not detected, add `--joint` overrides. Node names only, no paths.
5. You may post to Issue #3: `classification`, `heading`, `feet.*.max_slide_m`, `pivot_foot`, `knees`, `playback` and `gates`. **Do not post** the file path, checksum, screenshots, textures or anything showing the face or body.
6. Visual checklist (private viewing only, turntable OFF):
   - Does the body visibly change facing during one cycle? It should match `net_deg`.
   - Which foot stays planted? It should match `pivot_foot`. Watch for heel/toe skating.
   - Do the knees snap or hyperextend? Compare against `knees.max_angular_speed_deg_s`.
   - At the loop point, does the body pop back to the start facing?
   - At the recommended `timeScale`, does the turn read as natural?

## 5. Integration proposal for ChatGPT (PR #2 owns these files; not edited here)

Decide by the private result:

- **`classification` = PLANTED_TURN**
  - Turn auto-rotate **off** while TurnInPlace plays.
  - Call `play({repetitions: 1})`. On `finished`, add `net_deg` to the `orientation` yaw (third value; `ModelScene.js:328-333` builds Euler `YXZ` from roll/pitch/yaw), then replay.
  - Set `timeScale` to the measured `recommended_time_scale`, not a fixed 1.65.
  - **To verify in PR #2:** `orientation` rotates the model about its own origin, which may not be the pivot foot. The tool reports `hips_horizontal_drift_m` to help.
- **`classification` = TURN_WITH_FOOT_SLIDE**
  - The clip needs re-authoring or foot-lock IK. Speed changes will not fix it.
  - This needs an owner decision (tooling and any cost).
- **`classification` = NO_NET_HEADING or TURN_AND_RETURN** (ChatGPT's private track inspection found this for the real clip)
  - The clip is not a turn. Never present the turntable as body motion.
  - **Owner chose Option A**: derive a planted turn from the footwork. See §7.
- **In every case**, label the 30–180°/s slider as **turntable speed**, not turn speed.

## 7. Option A — derived planted turn (owner-approved prototype)

`tools/animation/procedural_turn.py` makes a **new** clip from in-place footwork and leaves the original clip untouched (tested):

- The original tracks repeat for N cycles.
- The armature root gets extra yaw about the **inside pivot foot**. Yaw is applied only while that foot is grounded **and** the other foot is in the air, so the pivot cannot slide and the swing foot lands at its rotated spot.
- With a 360° total, the clip loops with no visible snap-back, because 360° ≡ 0°. The viewer needs no root-motion support.

**Why not animate `orientation` in model-viewer instead?** The public API only rotates the model about its own origin (`ModelScene.js:323-336`), so the planted foot would slide by its distance from the origin times the angle. Each change also re-runs `applyTransform` + `updateBoundingBox` + `updateShadow` (`scene-graph.js:118-128`). That is per-frame work on a skinned mesh; it was read from the source, not benchmarked.

Results on the synthetic stepping rig (0.8 s cycle; Hips constant, the same structure ChatGPT reported for the real clip):

| Derived clip | Steps | Duration | Net | Mean rate | Peak rate (in-step) | Max foot slide | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 360°, 30°/step | 12 | 9.6 s | 360° | 37.0°/s | 201°/s | 10.4 mm | rate FAIL |
| 360°, 45°/step | 8 | 6.4 s | 360° | 57.6°/s | 302°/s | 10.6 mm | rate FAIL |
| **360°, 60°/step (default)** | 6 | 4.8 s | 360° | 79.8°/s | 402°/s | 10.1 mm | **PASS** |
| 360°, 90°/step | 4 | 3.2 s | 360° | 129.9°/s | 603°/s | 14.0 mm | PASS |
| +90° / −90° | 2 | 1.6 s | ±90° | 86.5°/s | — | 10.0 mm | PASS (inside foot pivots) |

- The pivot ankle moves **< 1 mm** while yaw is applied (tested).
- The three.js 0.172 cross-check of the derived clip has a largest difference of 0.0001 mm.
- In **real model-viewer 4.1.0 (Chromium, SwiftShader WebGL)** the derived GLB loads with no errors. It lists `TurnInPlace` and `TurnInPlace (planted +360 deg)` and plays the new 6.4 s clip.
- The rendered frames at t = 0, 0.8, 1.6, 2.4, 3.2 and 6.4 s show facing 0°, 45°, 90°, 135°, 180° and 0°: [derived-turn-synthetic-render.png](derived-turn-synthetic-render.png) (synthetic joint boxes only).

**Known limitation:** yaw is confined to single-support, so the in-step peak rate is high even when the mean is natural. Spreading the yaw into double-support would make the other grounded foot slide. Whether the result reads as natural on the real character is an **owner visual check**. The private clip's single-support share is unknown, and a longer share lowers the peak. Use `--max-step-deg`, or a lower `timeScale`, to tune it.

Private use (owner device only; the tool **refuses to write inside any git work tree**):

```bash
python3 tools/animation/gltf_turn_diagnose.py /private/model.glb --clip TurnInPlace --json
```

```bash
python3 tools/animation/procedural_turn.py /private/model.glb /private/out/model-planted.glb --clip TurnInPlace --total-deg 360
```

Load `model-planted.glb` in the private preview and pick `TurnInPlace (planted +360 deg)`.

PR #2 needs only two things:
1. Turntable auto-rotate **off** while a clip whose name contains `planted` is playing.
2. No forced `timeScale`.

An in-browser JavaScript port, so derivation happens on load and no second file is needed, is a possible follow-up. The derived copy must never be written to IndexedDB in place of the original without owner approval.

## 6. Not done / not claimed

- The private GLB has not been analysed here. It is not reachable from this environment.
- No physical-device test, browser-render visual review of the real character, or owner motion approval.
- No foot-lock IK or clip re-authoring. That would modify the private asset and needs separate owner approval.
- Option A has not been run on the real model, and the owner has not reviewed it visually. The in-browser JavaScript port is not written.
