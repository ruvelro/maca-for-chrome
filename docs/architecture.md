# Architecture

## System Shape

The product is a browser extension with a shared source tree plus thin browser-specific wrappers.

Confirmed by code:

- shared code now lives under `src/shared/`
- browser-specific files live under `src/platform/chrome/` and `src/platform/firefox/`
- build scripts generate `maca por chrome/` and `maca for firefox/` from the shared base
- the runtime is centered on a background script plus content/UI scripts
- there is no compile step, bundler, or transpiler in the repo

## Functional Architecture

### 1. Background runtime

Primary file:

- canonical source: `src/shared/background.js`
- generated outputs: `maca por chrome/background.js`, `maca for firefox/background.js`

Responsibilities confirmed by code:

- load and cache config from browser storage
- build prompts and provider requests
- convert image URLs to data URLs
- call AI providers
- normalize and validate model output
- maintain tab-scoped state:
  - last image candidate
  - session context
  - auto-upload queue and stats
  - batch cancellation state
- inject and message the overlay
- handle context-menu, shortcut, batch, and auto-upload workflows
- persist history, metrics, and debug logs

### 2. WordPress integration content script

Primary file:

- canonical source: `src/shared/context_helper.js`

Responsibilities confirmed by code:

- detect right-clicked or selected image candidates
- discover selected WordPress media attachments
- observe upload-related DOM mutations
- trigger auto-processing for uploaded/selected items
- apply generated fields to WordPress forms for a specific attachment
- render compact progress UI and per-attachment badges

### 3. Overlay UI

Primary file:

- canonical source: `src/shared/overlay.js`

Responsibilities confirmed by code:

- render the floating panel and mini bar
- expose copy, regenerate, apply, batch, and auto-upload controls
- debounce session context updates
- attempt auto-apply to visible WordPress fields
- receive state updates from background messages

### 4. Options UI

Primary files:

- `options.html`
- `options.js`

Responsibilities confirmed by code:

- manage provider and model configuration
- manage sync/local API key behavior
- manage generation and QA settings
- manage signature presets
- run configuration smoke tests
- export/import config
- expose diagnostics and metrics

### 5. Popup UI

Primary files:

- `popup.html`
- `popup.js`

Responsibilities confirmed by code:

- show history preview
- offer quick toggles for extension, signature, and auto-upload
- switch active signature
- deep-link to options/privacy

### 6. Shared helpers

Primary files:

- `src/shared/prompts.js`
- `src/shared/util.js`
- `src/shared/offscreen.js`

Responsibilities confirmed by code:

- prompt templates by SEO profile
- endpoint normalization
- image fetch and conversion
- response parsing
- clipboard write sequence through offscreen document in Chrome-capable environments

## Technical Architecture

### Browser platform

Confirmed by code:

- Manifest V3 in both variants
- Chrome uses service worker background and offscreen permission
- Firefox uses background scripts and Gecko-specific manifest settings

### Storage model

Confirmed by code:

- `storage.sync`
  - most settings
  - optional API key when sync is enabled
- `storage.local`
  - API key when sync is disabled
  - history
  - last job
  - metrics
  - debug log
- in-memory runtime maps
  - tab-local transient state in background.js

### Integration style

Confirmed by code:

- WordPress integration is DOM-selector driven
- provider integration is direct HTTP from the extension
- no backend service exists in this repo

## Browser Variant Differences

Confirmed by code:

- Chrome manifest uses:
  - `background.service_worker`
  - `offscreen` permission
- Firefox manifest uses:
  - `background.scripts`
  - `browser_specific_settings.gecko`
- Firefox has build/sign scripts and signed artifact flow
- Chrome packaging flow is not scripted in repo

## Architectural Constraints

Confirmed by code:

- the product is intentionally limited to `wp-admin`
- success depends on WordPress DOM structure remaining compatible
- generated browser folders still exist, but canonical edits should happen in `src/shared/` or `src/platform/*/`

Reasonable inference:

- maintenance cost will keep rising unless the shared source is followed by deeper modular extraction from the current monolith files
