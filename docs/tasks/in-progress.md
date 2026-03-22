# In Progress

- `ARCH-001` Shared-source migration started on `2026-03-21`.
  - Added `src/shared/` as the canonical codebase.
  - Added `src/platform/chrome/` and `src/platform/firefox/` for browser-specific wrappers.
  - Added `scripts/build-extensions.mjs` and normalized browser build entrypoints.
  - Extracted shared background modules into `src/shared/background/`.
  - Extracted provider adapters into `src/shared/providers/`.
  - Remaining work:
    - harden MV3 state persistence for in-flight jobs
    - extend coverage from Node smoke tests to browser-level smoke tests

- `BUG-003` Harden WordPress media selection and apply flows.
  - Selection-triggered auto-analysis is now constrained to the explicitly selected attachment in shared source.
  - Attachment apply now reports partial-field failures instead of treating any single field as success.
  - Caption apply now supports `contenteditable` fields in the attachment-targeted flow.
  - Shared WordPress DOM helpers now live in `src/shared/wp_dom_shared.js` and shared selector/media maps live in `src/shared/wp_selectors_shared.js` and `src/shared/wp_media_shared.js`.
  - Remaining work:
    - validate the new selectors against multiple WordPress media surfaces
    - surface per-field apply outcomes in the overlay UI

- `QA-002` Automated smoke coverage is partially landed.
  - Added `npm test` with shared-build smoke and runtime-state unit coverage.
  - Added `npm run test:browser` with Playwright smoke coverage on a WordPress-like test surface.
  - Remaining work:
    - run browser-level smoke tests against a real WordPress media flow
    - add provider response parsing tests
