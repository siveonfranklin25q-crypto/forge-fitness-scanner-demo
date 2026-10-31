# FORGE Fitness Scanner — Agent quality instructions

## Research-first verification policy (all meaningful work)

1. **Define success.** Preserve the user's exact requirements, original source assets, target device, constraints, privacy, and budget. Use known context; avoid repetitive questions.
2. **Research technique.** Consult up-to-date official docs, original sources and standards first. If a practical skill is uncertain, seek a relevant instructional video, transcript, or worked example, note the source/version/date, and reproduce a small test. Never claim to have watched a video when only its listing or description was accessible. Verify external tips against primary documentation.
3. **Reproduce and build.** Test a baseline on the available execution host before modifying the real project. Do not install arbitrary scripts from a tutorial, invent provider access, or confuse a named tool with a working integration.
4. **Inspect actual output.** Test in the medium users will consume: listen to audio, view video frames, inspect rendered UI, execute code on the target device, verify employer listings, or recalculate measurements. Include negative/edge cases and a concrete expected/observed comparison.
5. **Repair and retest.** Record defects, fix root causes, re-run tests, and preserve user invariants. Separate implemented, tested, inspected, reviewed, and live.
6. **Report proof.** Link verified artifacts or commits, exact commands/results and sources, failures, open issues, approval required, and any real cost. Do not claim perfection or misrepresent unrun tests.
7. **Protect the user.** No paid calls, production deployment, publication, outside contact, data sharing, credential access, cloud upgrades, or irreversible modifications without appropriate authorization. No secret content in commits, output, examples, or logs. Keep this repository independent of other user projects.

For trivial tasks, perform the smallest appropriate subset; do not create research theater. Existing project-specific guards are additive and stricter where applicable.

## Domain-specific acceptance checks

Verify product barcode against actual product nutrition labeling and serving size, support focus/camera permissions on real devices, test overrides/unknown products, compute macros with units. Include food safety, injury precautions, and uncertainty. Avoid diagnosis and avoid fabricated product data.

## Release labels

PROPOSED = plan; IMPLEMENTED_NOT_RUN = files exist; TESTED = executed with recorded results; INSPECTED = native output reviewed; REVIEW_REQUIRED = user must approve; BLOCKED = unresolved gate; LIVE = independently verified active deployment. Never upgrade a label based solely on a written claim.
