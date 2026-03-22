# Browser Variants

## Chrome

Confirmed by code:

- MV3 service worker background
- offscreen clipboard helper path
- unpacked loading flow documented

## Firefox

Confirmed by code:

- MV3-compatible background script setup
- Gecko id in manifest
- scripted unsigned build and signed packaging flow

## Shared Reality

- canonical product code now lives in `src/shared/`
- browser-specific wrappers live in `src/platform/chrome/` and `src/platform/firefox/`
- `maca por chrome/` and `maca for firefox/` are generated outputs for loading, packaging, and signing
- the remaining browser-specific surface is mostly manifest shape, Firefox Gecko metadata, and browser UI entrypoints like shortcut pages
