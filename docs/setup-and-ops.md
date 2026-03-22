# Setup And Ops

## Local Setup

Confirmed by code and repo contents:

- there is no package manager manifest in repo
- local automation now uses `package.json` scripts for tests and smoke checks
- canonical edits should happen in `src/shared/` and `src/platform/*/`
- browser output folders are generated into `maca por chrome/` and `maca for firefox/`
- Chrome extension can be loaded unpacked from `maca por chrome/`
- Firefox extension can be loaded temporarily from `maca for firefox/manifest.json`
- Firefox packaging depends on `npx --yes web-ext`

Workspace nuance confirmed during audit:

- `scripts/` exists and is operational in the current workspace
- `git status` showed `scripts/` as untracked on `2026-03-14`

## Shared Build Step

Use the shared generator before loading or packaging variants:

1. Run `node scripts/build-extensions.mjs all`
2. Load or package the generated browser folder you need

Target a single browser if needed:

- `node scripts/build-extensions.mjs chrome`
- `node scripts/build-extensions.mjs firefox`

Generated browser folders are treated as build outputs:

- do not edit `maca por chrome/` or `maca for firefox/` directly
- generated text files include an auto-generated banner
- use `node scripts/check-generated.mjs` to detect drift/manual edits

## Chrome

Manual install confirmed by docs and manifest structure:

1. Open `chrome://extensions`
2. Enable developer mode
3. Load unpacked `maca por chrome`

Build flow confirmed by scripts:

1. Run `scripts/build-chrome.ps1`
2. Chrome output is refreshed in `maca por chrome/`
3. Packaged artifact is produced in `dist/chrome/`

## Firefox

Build flow confirmed by scripts:

1. Run `scripts/build-firefox.ps1`
2. Firefox output is refreshed in `maca for firefox/`
3. Unsigned artifact is produced in `dist/firefox/unsigned/`

Sign flow confirmed by scripts:

1. Export signing env vars in the shell
2. Run `scripts/sign-firefox.ps1`
3. Firefox output is refreshed from shared source
4. Signed artifact is produced in `dist/firefox/signed/`

## Environment Variables

Confirmed by code:

- `WEB_EXT_API_KEY`
- `WEB_EXT_API_SECRET`
- or aliases:
  - `AMO_JWT_ISSUER`
  - `AMO_JWT_SECRET`

Important operational note:

- scripts read environment variables only
- scripts do not source `.env`
- if a developer uses a local `.env`, shell bootstrap still has to happen elsewhere

## Runtime Configuration

Configured through the options page:

- provider and model
- API key placement:
  - sync
  - local
- generation mode
- validation and QA controls
- auto-upload behavior
- signatures
- history, debug, and metrics

## Diagnostics

Confirmed by code:

- `Probar configuracion`
  - provider smoke test
- `Copiar diagnostico`
  - local debug log export
- `Copiar soporte`
  - sanitized config plus debug export
- `Copiar metricas`
  - metrics export

## Packaging And Release State

Confirmed by repo contents:

- generated artifacts now have canonical script paths under `dist/chrome/` and `dist/firefox/`
- older root-level release snapshots may still exist in the workspace
