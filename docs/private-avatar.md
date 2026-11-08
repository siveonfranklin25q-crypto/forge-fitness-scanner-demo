# FORGE private 3D avatar — implementation and release gates

## Purpose

Replace the generic anatomy mannequin with an **actual GLB-based user likeness** in the existing FORGE interface. The user's existing privately held rigged character is the preferred source; do not regenerate or publish it without explicit approval.

## Implemented in this review branch

- Immersive local character bay with a real glTF/GLB 2.0 viewer, camera orbit/pinch controls, optional slow rotation, studio light/shadow settings and animation selection from the actual clips in the model.
- Opt-in IndexedDB "Remember on this device": select a local file once, then restore it automatically on subsequent visits on the same browser and origin. Browser storage is **not encrypted, secured with login, or synced**; clearing site data removes it.
- "Remove model" asks for confirmation and deletes the saved copy in the browser; it never deletes the source file.
- Real seven-day momentum indicator calculated only from dated Strength Tracker working-set logs. Undated cumulative workout counts are excluded.
- Pinned @google/model-viewer 4.1.0 module, fetched from cdnjs only when a model needs displaying. The library requires network access; model data is loaded through a local blob: URL and is not uploaded.
- GLB signature, size, version, scene JSON and embedded-image/buffer checks; references to external resources are rejected. The file parser is not a complete security sandbox.
- Supports reduced-motion preference and an explicit Motion toggle, plus a usable non-model fallback if the renderer is unavailable.
- No identifying GLB, texture, personal photo, medical data, credentials or API keys are committed.

## First-use procedure

1. Open the private preview on the device holding the existing rigged .glb model.
2. Choose Load your 3D model / Choose GLB and pick the model file.
3. Rotate and zoom; check textures, movement and available animation clips. The earlier private walk-rig review did not meet the strict deformation threshold, so do not claim the walk is fully passed.
4. Optionally enable Remember on this device for future automatic startup in the same browser. This stores an unencrypted model copy locally, not in a user account.
5. Use Remove model to delete the saved browser copy. Keep the original model separately.

## Before release

- Owner separately approves any public display or distribution of the person's recognizable likeness; approval for private testing is not public-release authorization.
- Never add personal GLB files to public GitHub history, website assets, pull request artifacts, screenshots or unprotected endpoints.
- Verify the original GLB's hash and appearance against the private handoff. **The actual identifiable model bytes were unavailable to this build**, so no identity or appearance validation has yet been performed.
- Run physical Android and desktop testing for rendering, animation quality, battery, camera interaction, persistence and offline performance.
- Audit accessibility, privacy/storage language and network dependencies before release.

## Verification scope

- tests/ui_refresh_smoke.py tests the view, selectors, fake 3D event, load, local caching, removal and desktop/mobile navigation using a **mock model-viewer**. It is not a GPU/WebGL or personal-likeness test.
- tests/strength_tracker_smoke.py tests existing strength-tracker behavior.
- Real 3D rendering and the user's actual GLB must be examined in a private preview.

No paid generation, no merge and no production deployment are authorized by this branch.
