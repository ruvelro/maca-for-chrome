# Change Log

## 2026-03-14

- Added initial operational documentation baseline.
- Added task system files under `docs/tasks/`.
- Recorded architecture, data flow, integrations, setup, testing state, debt, and roadmap from code audit.

## 2026-03-21

- Added `src/shared/` as the canonical shared extension source.
- Added `src/platform/chrome/` and `src/platform/firefox/` wrappers plus `scripts/build-extensions.mjs`.
- Added `scripts/build-chrome.ps1` and updated Firefox build/sign scripts to regenerate browser outputs from shared source.
- Hardened WordPress auto-selection and attachment-apply flows in shared code:
  - selection auto-analysis now targets the explicitly selected attachment
  - attachment apply now fails on partial field writes
  - targeted caption apply now supports `contenteditable` fields
- Extracted provider adapters into dedicated modules under `src/shared/providers/`.
- Extracted shared WordPress selector/media modules and added browser smoke coverage with Playwright fixtures.
- Added generated-output drift checks and auto-generated banners for browser build folders.

## 2026-03-22

- Continued splitting `src/shared/background.js` with dedicated overlay-runtime, manual-job, and quality modules.
- Added persisted manual-job recovery state for overlay/manual and regenerate flows.
- Improved apply visibility and observability with per-field apply outcomes and richer apply debug data.
- Expanded browser smoke coverage to include overlay open/result rendering in addition to shared WordPress DOM/media helpers.

## Recent Git History Snapshot

From local `git log --oneline -5` during audit:

- `1ec7bd3` docs: add root readme and simplify browser docs
- `98b1008` docs: expand readmes and add packaged builds
- `e2ed98b` merge: bring firefox v1.0.7 into main
- `1f3cd66` release: v1.0.7 align chrome and firefox overlays
- `4d118ae` Merge branch 'main' into firefox
