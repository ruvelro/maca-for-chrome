# File Map

## Root

- `README.md`
  - product-level overview
- `package.json`
  - local build and test entrypoints
- `src/shared/`
  - canonical extension source used by both browsers
- `src/platform/chrome/`
  - Chrome-specific manifest and wrapper files
- `src/platform/firefox/`
  - Firefox-specific manifest and wrapper files
- `maca por chrome/`
  - generated Chrome extension output
- `maca for firefox/`
  - generated Firefox extension output
- `scripts/`
  - shared build, packaging, and signing helpers
- `dist/firefox/`
  - generated Firefox artifacts
- `dist/chrome/`
  - generated Chrome artifacts

## Shared Source

- `src/shared/background.js`
  - central orchestration and provider pipeline
- `src/shared/context_helper.js`
  - WordPress DOM integration and upload observer
- `src/shared/overlay.js`
  - injected overlay UI
- `src/shared/options.html`
  - settings page layout
- `src/shared/options.js`
  - settings state and tools behavior
- `src/shared/popup.html`
  - popup layout
- `src/shared/popup.js`
  - popup history and quick actions
- `src/shared/prompts.js`
  - default prompt templates by profile
- `src/shared/util.js`
  - helper functions for fetch, parsing, URLs, normalization
- `src/shared/offscreen.html`
  - offscreen document shell
- `src/shared/offscreen.js`
  - clipboard helper runtime
- `src/shared/options.css`
  - options page styling
- `src/shared/popup.css`
  - popup styling
- `src/shared/icons/`
  - extension icons

## Generated Chrome Variant

- `maca por chrome/manifest.json`
  - Chrome MV3 manifest, permissions, popup, options, command, content script
- `maca por chrome/background.js`
  - central orchestration and provider pipeline
- `maca por chrome/context_helper.js`
  - WordPress DOM integration and upload observer
- `maca por chrome/overlay.js`
  - injected overlay UI
- `maca por chrome/options.html`
  - settings page layout
- `maca por chrome/options.js`
  - settings state and tools behavior
- `maca por chrome/popup.html`
  - popup layout
- `maca por chrome/popup.js`
  - popup history and quick actions
- `maca por chrome/prompts.js`
  - default prompt templates by profile
- `maca por chrome/util.js`
  - helper functions for fetch, parsing, URLs, normalization
- `maca por chrome/offscreen.html`
  - offscreen document shell
- `maca por chrome/offscreen.js`
  - clipboard helper runtime
- `maca por chrome/options.css`
  - options page styling
- `maca por chrome/popup.css`
  - popup styling
- `maca por chrome/icons/`
  - extension icons

## Generated Firefox Variant

The Firefox folder is generated from `src/shared/` plus `src/platform/firefox/`.

Additional notable file:

- `maca for firefox/.amo-upload-uuid`
  - local Mozilla signing artifact, not part of product source logic

## Scripts

- Workspace status during audit:
  - `scripts/` was present but untracked in git status on `2026-03-14`

- `scripts/build-extensions.mjs`
  - syncs shared source into browser-specific output folders
- `scripts/check-generated.mjs`
  - detects drift or manual edits in generated browser folders
- `scripts/build-chrome.ps1`
  - generates Chrome output and packages `dist/chrome/maca-for-chrome-<version>.zip`
- `scripts/build-firefox.ps1`
  - syncs Firefox output and builds unsigned Firefox zip with `web-ext build`
- `scripts/sign-firefox.ps1`
  - syncs Firefox output and signs Firefox package with `web-ext sign`
- `scripts/build-chrome.cmd`
  - convenience wrapper for the Chrome build script
- `scripts/build-firefox.cmd`
  - convenience wrapper for PowerShell build script
- `scripts/sign-firefox.cmd`
  - convenience wrapper for PowerShell sign script

## Missing But Expected In Mature Repos

Confirmed absent in this snapshot:

- `package.json`
- lockfiles
- lint config
- test config
- CI pipeline config
- automated test harness
