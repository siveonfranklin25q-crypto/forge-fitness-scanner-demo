# FORGE Fitness — Public Educational Prototype (v0.7)

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
