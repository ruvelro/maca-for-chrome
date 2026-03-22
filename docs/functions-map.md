# Functions Map

This file maps the main responsibility clusters instead of documenting every helper one by one.

## background.js

### Config and storage

- `background/config.js`
  - `readConfigFromStorage`
  - `getConfigCached`
  - `initConfigCache`
  - owns merged config caching for the service worker lifetime

### Prompt and output shaping

- `getEffectiveLang`
- `buildSessionContextBlock`
- `getSectionStyleBlock`
- `getToneOverrideBlock`
- `buildFilenameContextBlock`
- `adjustDefaultPromptForModeAndSeo`
- `getOpenRouterGlmQualityPrompt`
- `normalizeTitleText`
- `applyPostValidation`
- `buildSeoReview`
- `runSecondPassQuality`

### Provider and transport helpers

- `buildOpenAICompatUrl`
- `safeJson`
- `pickTextFromOpenAICompat`
- `shouldFallbackOpenRouterCompatibility`
- `extractOpenRouterErrorMessage`

### Clipboard helpers

- `ensureOffscreenDocument`
- `copySequenceToClipboard`

### Runtime orchestration

- `ensureMenu`
- `ensureOverlayInjected`
- `sendOverlay`
- `analyzeImage`
  - main AI pipeline
- `testCurrentConfig`
  - provider smoke test entrypoint

### Queue and batch control

- `background/runtime-state.js`
  - runtime maps for candidates, queues, pending jobs, pause/cancel state, and session context
  - snapshot serialize/hydrate helpers for MV3 restart recovery
- `enqueueAutoUploadJob`
- `sendAutoUploadProgress`
- `autoApplyAttachmentWithRetry`
- `processAutoUploadAttachmentRequest`
- `resumePersistedAutoUploadJobs`

### Message handlers

Confirmed message responsibilities:

- session context get/set
- active signature query
- manual analyze
- regenerate
- clipboard sequence
- auto-upload item processing
- auto-upload pause/resume/cancel
- batch process/cancel
- config test

## context_helper.js

### Candidate detection

- `findCandidate`
- `extractCandidateFromAttachmentEl`
- `findSelectedWpAttachments`
- `MACA_GET_LAST_CANDIDATE`
- `MACA_GET_SELECTED_CANDIDATE`
- `MACA_GET_SELECTED_ATTACHMENTS`

### WordPress field application

- `getAltFieldForAttachment`
- `getTitleFieldForAttachment`
- `getCaptionFieldForAttachment`
- `applyToAttachment`
- `MACA_APPLY_TO_ATTACHMENT`
- shared DOM helpers come from `wp_dom_shared.js`

### Auto-upload observer

- `installUploadSignalHooks`
- `noteAttachmentMeta`
- `maybeAutoProcessUploadedAttachment`
- `initAutoUploadObserver`
- `updateAutoProgressUi`
- `setAttachmentStatusBadge`

## overlay.js

### UI lifecycle

- `injectStyles`
- `showOverlay`
- `showMini`
- `removeOverlay`
- `closeAll`

### WordPress apply and copy

- `applyToWordPressFields`
- `copyText`
- `copyAllAsEntries`
- `scheduleAutoApply`
- shared DOM helpers come from `wp_dom_shared.js`

## wp_dom_shared.js

- `isVisibleField`
- `pickFieldFromSelectors`
- `pickBestField`
- `findFieldNearLabel`
- `setWpFormValue`

## background modules

### `background/config.js`

- `DEFAULT_SYNC_CFG`
- `DEFAULT_LOCAL_CFG`
- `readConfigFromStorage`
- `getConfigCached`
- `initConfigCache`

### `background/runtime-state.js`

- runtime maps for tab-scoped state
- `serializeRuntimeState`
- `hydrateRuntimeState`
- `rememberAutoUploadJob`
- `forgetAutoUploadJob`
- `clearTabRuntimeState`

### User actions

- `triggerRegenerate`
- `persistSessionContextDebounced`
- `handleOpen`
- `handleResult`
- `handleProgress`
- `handleAutoUploadProgress`
- runtime message listener

## options.js

### Settings UI

- `applyProviderUi`
- `updateApiKeyHelpText`
- `loadModels`
- `renderSignatureUi`
- `updateCaptionTemplateUi`
- `updateBatchQaUi`
- `updateAutoFuseUi`

### Tools and diagnostics

- `renderMetricsSummary`
- config export/import handlers
- history/debug/metrics clear and copy handlers
- `MACA_TEST_CONFIG` button handler

### Persistence

- `pSet`
- `pRemove`
- save handler
- reset handler

## popup.js

### Quick state

- `renderQuickUi`
- `saveQuickPatch`

### History

- `loadHistory`
- `applyFilter`
- `renderItem`
- `render`

## util.js

- `normalizeEndpoint`
- `isAllowedImageUrl`
- `normalizeAltText`
- `normalizeCaptionText`
- `fetchWithTimeout`
- `pickOutputTextFromOpenAIResponse`
- `toBase64DataUrlFromUrl`
- `renderPrompt`

## prompts.js

- `DEFAULT_PROMPTS`
- `getPromptForProfile`
