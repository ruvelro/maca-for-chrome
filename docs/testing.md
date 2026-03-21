# Testing

## Current State

Confirmed by repo inspection:

- a small automated Node-based test suite now exists under `tests/`
- `package.json` now defines `npm test`
- Playwright browser smoke coverage exists for the shared WordPress DOM/media helpers against a local `wp-admin` fixture
- Playwright also verifies that the generated Chrome extension boots its MV3 service worker and opens the options page
- no CI config is committed

## Available Verification Surfaces

Confirmed by code:

- options page config smoke test per provider
- shared-source build smoke via `node scripts/build-extensions.mjs all`
- Node unit tests for runtime-state persistence helpers
- Playwright smoke tests via `npm run test:browser`
- manual browser loading in Chrome and Firefox
- popup history rendering
- overlay manual flow
- batch processing flow
- auto-upload flow
- Firefox build/sign scripts

## Recommended Manual Smoke Suite

### Baseline

1. Load Chrome unpacked extension.
2. Open a WordPress media page inside `wp-admin`.
3. Run manual analysis from context menu.
4. Verify overlay renders preview, outputs, SEO badge, and copy actions.
5. Verify direct apply fills `alt`, `title`, and `leyenda`.

### Batch

1. Select multiple attachments in WordPress media library.
2. Trigger batch processing.
3. Verify progress updates and cancellation behavior.
4. Verify QA gating when enabled.

### Auto-upload

1. Enable auto-upload.
2. Upload multiple images.
3. Verify queue progress, pause/resume, cancel, and safety fuse behavior.

### Provider smoke

1. Test each configured provider from options page.
2. Confirm model/endpoint-specific warnings are understandable.

## Main Gaps

- no regression tests for WordPress selector drift in a real browser DOM
- no automated browser smoke tests against a live WordPress instance with real extension messaging
- no contract tests for provider response parsing
- no CI packaging verification yet

## Priority Recommendation

The next testing step should extend the current Node smoke harness into browser-level coverage for:

- manual analyze
- WordPress field apply
- batch selection fetch
- auto-upload queue start/stop
