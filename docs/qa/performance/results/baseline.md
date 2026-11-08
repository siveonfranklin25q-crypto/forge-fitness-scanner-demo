# FORGE 3D performance report — baseline: bare model-viewer stage

**EMULATION — headless Chromium, software WebGL, CDP CPU throttling; not a physical device**

Chromium 153.0.8010.12; WebGL renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`; host Intel(R) Xeon(R) Processor @ 2.10GHz x4, 16 GB; runs per cell: 3. Values: median (min–max).

First-party text: 3318 B raw, 1539 B gzip-9 (est. hosted transfer).

| Profile | Model | FCP ms | LCP ms | CLS | Long-task ms | Model ready ms | Idle UI CPU % | Animating fps | Frame p95 ms | Animating CPU % | Motion-off CPU % (quiet s) | Offscreen CPU % (quiet s) | JS heap MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop | light | 28 (24–48) | 28 (24–48) | 0 (0–0) | 373 (352–420) | 628.2 (617.2–1087.4) | 0 (0–0) | 18.8 (18.8–20) | 83.3 (66.7–83.4) | 369.4 (363–370.5) | 3.3 (3–3.7) (3) | 3 (2.7–3.3) (3) | 21 (20.4–21.1) |
| desktop | typical | 24 (24–24) | 24 (24–24) | 0 (0–0) | 609 (553–617) | 1368.7 (963.5–1401.6) | 0 (0–0.3) | 8.2 (7.6–8.4) | 150 (150–233.3) | 373.6 (372.6–379.9) | 3.7 (3.7–4) (4) | 3.7 (3.3–4) (5) | 54.3 (38.7–57.8) |
| desktop | heavy | 28 (24–28) | 28 (24–28) | 0 (0–0) | 1857 (1644–1867) | 2926 (2425.7–3010.7) | 0 (0–0) | 2.6 (2.4–3.4) | 733.2 (366.7–783.3) | 385.6 (384.7–385.8) | 380.3 (375.9–381.4) (—) | 380 (379.5–381.1) (—) | 128.6 (22.7–133.2) |
| mobile-emu | light | 56 (52–76) | 56 (52–76) | 0 (0–0) | 896 (878–1120) | 1729.8 (1665.1–1907.1) | 0.3 (0–0.3) | 4.8 (4.8–5) | 266.7 (233.3–449.9) | 361.7 (359.9–362.8) | 4 (3.3–4.3) (4) | 3 (2.7–3.7) (6) | 13 (12.7–13.2) |
| mobile-emu | typical | 68 (64–76) | 68 (64–76) | 0 (0–0) | 2729 (2602–2996) | 3481.2 (3247.9–3515.7) | 0.3 (0–0.3) | 2.4 (2.4–2.4) | 516.7 (499.9–1283.4) | 381.7 (379.6–383.8) | 339.7 (317.3–374.3) (—) | 383.4 (325.5–384.1) (—) | 12.9 (12.7–28.1) |
| mobile-emu | heavy | 72 (60–72) | 72 (60–72) | 0 (0–0) | 7145 (6974–7147) | 8310.5 (8188.2–8341.7) | 0 (0–0) | 1.2 (1–1.4) | 1950 (1916.6–2783.2) | 389.5 (389–391) | 387.3 (384.3–388) (—) | 386.2 (384.8–386.6) (—) | 22.8 (22.7–23.2) |

CPU readings are taken with CDP CPU throttling OFF (throttling busy-waits the renderer); fps / timings use the profile throttle. On this 4-core host software WebGL saturates near 380 %, so animating CPU hits a ceiling — compare fps and quiet states instead.
Offscreen method: scroll; stage out of view: true. Ambient animations running at idle: none.
Motion-off / offscreen CPU = steady state (mean of the last 3 of 8 one-second windows after the action); quiet s = first window under 10 %.
CPU % = sum over all Chromium processes (100 % = one core), a battery proxy. Software WebGL inflates GPU-process CPU versus real hardware; compare rows, do not read as device numbers.

## Checks

- Reduced motion: running CSS animations 0 vs 0 normal; auto-rotate false vs true; steady CPU with model 4% vs 390.3%.
- One-tap turn: no turn buttons on this page (baseline or clip names not recognised).
- No WebGL: user told = false; marked loaded = false; status: ""; page errors 2.
- Viewer CDN unreachable: user told = true; status: "The 3D viewer could not load.".
- axe-core: 1 rule(s) violated; nodes by impact {"moderate":1}.
  - `page-has-heading-one` (moderate, 1 nodes): Page should contain a level-one heading
- Keyboard: 2 focus stops; without visible ring: 0; off-screen focus: 0; reaches model chooser: true; reaches motion toggle: true.

Blocked external requests (not pinned CDN): none.
