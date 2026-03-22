# Technical Debt

## High Priority

### TD-001: Browser source duplication

Confirmed by code:

- a shared source tree now exists under `src/shared/`
- generated browser outputs still duplicate the built files into `maca por chrome/` and `maca for firefox/`
- deeper modular extraction is still pending inside the large shared runtime files

Impact:

- drift risk is reduced, but generated outputs can still hide accidental direct edits
- review and release cost remains higher than necessary until the shared code is split into smaller modules and backed by tests

### TD-002: No automated tests or CI

Confirmed by repo inspection.

Impact:

- regressions in WordPress selectors or provider parsing can ship unnoticed
- batch and auto-upload flows are hard to verify safely

### TD-003: Monolithic runtime files

Confirmed by file sizes:

- `background.js` ~2617 lines
- `overlay.js` ~1560 lines
- `context_helper.js` ~1051 lines
- `options.js` ~791 lines

Impact:

- high cognitive load
- hard to isolate failures
- refactoring cost increases

### TD-004: Packaging flow is not normalized

Confirmed by repo contents:

- Firefox has scripts
- Chrome has no equivalent script
- artifacts are split between root and `dist/`

Impact:

- unclear release procedure
- harder reproducibility

## Medium Priority

### TD-005: WordPress DOM coupling

Confirmed by code:

- the extension relies on many CSS selectors and DOM heuristics

Impact:

- WordPress UI changes can break selection, apply, and auto-upload flows

### TD-006: Env bootstrap gap for Firefox signing

Confirmed by code:

- signing scripts require env vars
- scripts do not load `.env`

Impact:

- reproducibility depends on shell state
- onboarding friction

### TD-007: Encoding drift risk in Firefox-facing files

Confirmed partly by repo diff output, pending browser-level confirmation:

- Firefox-specific files show apparent text encoding inconsistencies and BOM drift relative to Chrome copies

Impact:

- possible UI copy corruption
- noisy diffs and maintenance friction

### TD-008: No shared ops conventions documented before this audit

Resolved partially by this documentation baseline, but still impacts release discipline until adopted.

## Lower Priority

### TD-009: Release artifacts stored in repo workspace

Confirmed by repo contents.

Impact:

- extra workspace noise
- possible confusion between source and output
