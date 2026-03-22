# Backlog

## P0

- `OPS-001` Standardize packaging and release flow.
  - Add a canonical Chrome build path and normalize artifact locations.

- `QA-001` Add automated smoke coverage for core WordPress flows.
  - Focus first on manual analyze, apply, batch, and auto-upload start/stop.

## P1

- `DOC-001` Align root and browser READMEs with actual feature and provider support.

- `OPS-002` Make Firefox signing bootstrap reproducible.
  - Either load env vars from a documented bootstrap step or add a safe helper.

- `OPS-003` Formalize local release helpers under version control.
  - Decide whether `scripts/` is part of the committed release workflow and align the repo accordingly.

- `BUG-001` Investigate Firefox text-encoding drift.
  - Confirm whether mojibake/BOM differences are source-level, tooling-level, or terminal-only.

- `BUG-002` Verify Firefox clipboard fallback behavior.
  - Chrome has offscreen support; Firefox path needs explicit smoke validation.

- `ARCH-003` Extract WordPress selector maps from content and overlay scripts.

- `ARCH-004` Persist in-flight job state across Chrome MV3 worker restarts.

- `QA-002` Add smoke coverage for shared-source build generation.
  - Verify `src/shared/` sync into both browser outputs before browser-level tests run.

## P2

- `OBS-001` Define a small release checklist using debug log and metrics outputs.

- `DOC-002` Expand feature docs with screenshots or UI-state references once flows are validated.
