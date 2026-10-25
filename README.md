# FORGE Fitness — Public Educational Prototype (v0.8)

A free HTTPS proof-of-concept for fitness education and food planning. The original FORGE project is independent of The Brain.

**Live demo:** https://siveonfranklin25q-crypto.github.io/forge-fitness-scanner-demo/

## Implemented prototype functionality

- Adult profile with starting calorie and macro estimates.
- Live barcode recognition on supported HTTPS browsers, product lookup through Open Food Facts and user-entered label corrections.
- Food comparison by equal weight; homemade recipe builder with tracked ingredient provenance.
- Seven-day meal planner and manually priced, aggregated grocery list.
- Beginner home/gym training plan, recovery check-in and basic progress tracking.
- **New in v0.7:** separate **Exercise & body-part lab** and **Cardio & health lab** tabs.
- 36 educational exercise entries covering 15 body regions, with form cues and substitutions, and recovery-aware workout generation.
- Deep-core education separating fat, core control, posture and digestion, with a visible-doming/possible-hernia warning.
- Tendon-loading education with next-day response safeguards.
- Aerobic, higher-intensity, VO₂ max and fat-zone education; RPE/talk-test and approximate age-based heart-rate ranges.
- Mobility versus flexibility guidance, sleep/shift-work education, hydration, electrolyte and evidence-quality supplement topics.
- Lab workouts logged to the same training-completion counter used by the foundation view.

## Verify before relying on data

Food labels take priority over crowd-sourced entries. Generic nutrition, meal templates, calorie targets and grocery prices are estimates, not verified store inventory or nutritional prescriptions. Check package labels, allergens and raw-versus-cooked portions.

The app stores entered profiles, progress records, meal drafts and training-lab settings **in the local browser on the user's device**. It does not provide an account, server-side synchronization, a clinical record, or secure backups. In private browsing or restricted storage contexts these records may not persist. This repository and its source code are public. Do not store sensitive data or publish personal test photos.

## Not yet implemented or validated

- Extensive strength progression tracking, professional exercise demonstrations, adaptive long-term programming, and individualized injury rehabilitation.
- Comprehensive medical condition support, minors, pregnancy/postpartum pathways, and clinical review of exercise/supplement logic.
- Wearable integrations, measured VO₂ max, verified store prices/inventory, allergy guarantees, secure accounts/sync, accessibility audit and production security testing.

## v0.7 smoke test

Manual: launch in a mobile/desktop browser; open **Exercise & body-part lab**, change equipment/muscle, generate and log a session, then use **Recovery** to select an urgent warning symptom and confirm lab training pauses. Open **Cardio & health lab** and review zone and hydration guidance. Return to **Nutrition & meals** and verify the existing barcode scanning and weekly planner still operate.

Automated (development only): run `node --check` on the extracted inline module and run browser interaction checks across desktop and 390px width. This is a prototype and has not passed production-level clinical, accessibility, security or real-device regression suites.


## v0.8 — Strength Tracker and progressive overload

Open **Strength tracker** from the navigation. This new local-only tracker covers 25 resistance-training candidates in the existing exercise library; slow control, breathing and similar drills remain in the educational finder rather than being scored for maximum weight.

- Record each actual working or warm-up set by exercise, date, repetitions (1–40), estimated reps in reserve (0–5), and external weight (lb/kg). Added external weight of 0 is valid for bodyweight movements.
- Save multi-exercise sessions in local browser storage. Review the last 20 sessions, delete erroneous entries and see a rolling seven-calendar-day count of direct working sets by the listed primary body region.
- Review an exercise's recent top externally loaded set, working-set count, and progression recommendation.
- A modest resistance increase is merely an option after **two separate days** at the same top externally loaded weight, all working sets at 12 controlled reps, two or more working sets, at least 2 reps in reserve and no logged worsening symptoms. The recommendation also respects the global recovery check-in; no weight is added automatically.
- No estimated one-rep maximum, no guaranteed hypertrophy or automatic injury treatment. Training-load comparisons for bodyweight exercises don't capture body-mass resistance.
- The original workout counter is cumulative; it does not automatically reset each week. Detailed sessions are date-stamped, but the prior basic completion button has no dates. Avoid logging the same completed workout using both mechanisms.

**Local regression smoke test:** `python tests/strength_tracker_smoke.py` after `pip install playwright` and installing Chromium (system Chromium or Playwright-managed Chromium). It uses an isolated in-browser storage mock and disables the external scanner library, so it does **not** prove live camera operation, nutritional lookup uptime or medical safety.

### Remaining work after v0.8

More detailed exercise videos and form analysis, personally adaptive weekly programming, robust muscle-target programming, structured physiotherapy pathways, measured performance changes, secure cross-device accounts, fully reconciled weekly adherence, accessibility/clinical review, end-to-end tests and launch privacy/security controls. This remains an **educational prototype**, not a production medical or fitness service.
