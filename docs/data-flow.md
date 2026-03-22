# Data Flow

## 1. Manual Analysis Flow

Confirmed by code:

1. User right-clicks an image in `wp-admin` or uses the keyboard shortcut.
2. `context_helper.js` resolves the most relevant image candidate and pushes recent candidate state to background.
3. `background.js` validates scope and config, injects overlay, and opens loading UI.
4. `background.js` converts the image to a data URL and calls the selected AI provider.
5. Provider output is parsed into JSON and normalized into:
   - `alt`
   - `title`
   - `leyenda`
   - optional `decorativa`
6. Post-validation, SEO review, history, metrics, and debug data are persisted.
7. Overlay receives result and enables copy/apply/regenerate actions.

## 2. Regenerate Flow

Confirmed by code:

1. User clicks a style action in the overlay.
2. Overlay sends `MACA_REGENERATE`.
3. Background reruns `analyzeImage` with a style override such as:
   - `technical`
   - `short`
   - `editorial`
4. Updated result is sent back to the same overlay instance.

## 3. Direct Apply To WordPress

There are two apply paths confirmed by code:

- overlay-level apply to currently visible WordPress fields
- attachment-targeted apply from background through `context_helper.js`

Both depend on DOM selectors for WordPress media fields.

## 4. Batch Flow

Confirmed by code:

1. Overlay requests `MACA_BATCH_PROCESS_SELECTED`.
2. Background asks the content script for selected attachments.
3. For each attachment:
   - analyze image
   - compute SEO review
   - optionally skip auto-apply when QA threshold fails
   - attempt field application with retries
4. Overlay receives progress updates.
5. User can cancel via `MACA_BATCH_CANCEL`.

## 5. Auto-Upload Flow

Confirmed by code:

1. `context_helper.js` detects upload signals from file input, drop, paste, and WordPress DOM mutations.
2. Newly visible uploaded attachments are tracked by attachment id.
3. Content script sends `MACA_AUTO_PROCESS_ATTACHMENT` to background.
4. Background serializes jobs per tab using an in-memory queue.
5. For each attachment:
   - analyze image
   - optionally append signature
   - apply fields with retries
   - optionally deselect processed item
   - emit progress stats
6. User can pause, resume, or cancel.
7. Safety fuse can stop overly large queues.

## 6. Options And Popup Flow

Confirmed by code:

- options page reads and writes settings from `storage.sync` and `storage.local`
- popup reads history from `storage.local`
- popup quick toggles patch selected sync settings directly
- options page can export/import config and query runtime test status

## 7. State Stores

### Persistent state

- `storage.sync`
  - settings and optional API key
- `storage.local`
  - API key when not synced
  - history
  - last job
  - metrics
  - debug log

### Transient runtime state

In `background.js`:

- last candidate by tab
- auto-upload queue by tab
- auto-upload seen items by tab
- auto-upload stats by tab
- batch abort controller by tab
- session context by tab

In `context_helper.js`:

- recent DOM candidate
- upload session tracking
- attachment metadata cache

In `overlay.js`:

- active job state
- pending result
- auto-apply timers
- UI mode and batch/auto status
