import test from "node:test";
import assert from "node:assert/strict";

import {
  __autoUploadCancelByTab,
  __autoUploadJobsByTab,
  __autoUploadPendingIdsByTab,
  __autoUploadSeenByTab,
  __autoUploadStatsByTab,
  __manualJobsByTab,
  __sessionContextByTab,
  clearTabRuntimeState,
  dequeueAutoPendingId,
  enqueueAutoPendingId,
  forgetAutoUploadJob,
  forgetManualJob,
  getAutoUploadStats,
  getPersistedManualJob,
  hydrateRuntimeState,
  markAutoProcessed,
  normalizeRuntimeSnapshotForStorage,
  rememberAutoUploadJob,
  rememberManualJob,
  serializeRuntimeState,
  wasRecentlyAutoProcessed
} from "../src/shared/background/runtime-state.js";

test.afterEach(() => {
  hydrateRuntimeState(null);
});

test("runtime state stores and restores manual jobs", () => {
  const tabId = 77;
  rememberManualJob(tabId, {
    jobId: "manual-1",
    source: "overlay_manual",
    imageUrl: "https://example.com/manual.jpg",
    filenameContext: "manual.jpg",
    pageUrl: "https://site.test/wp-admin/upload.php",
    withCaptionSignature: true,
    styleOverride: "technical"
  });

  const snapshot = normalizeRuntimeSnapshotForStorage(serializeRuntimeState());
  hydrateRuntimeState(null);
  hydrateRuntimeState(snapshot);

  const restored = getPersistedManualJob(tabId);
  assert.equal(restored.jobId, "manual-1");
  assert.equal(restored.source, "overlay_manual");
  assert.equal(restored.withCaptionSignature, true);

  forgetManualJob(tabId);
  assert.equal(__manualJobsByTab.has(tabId), false);
});

test("runtime state serializes and hydrates auto-upload data", () => {
  const tabId = 44;
  markAutoProcessed(tabId, "100");
  enqueueAutoPendingId(tabId, "100");
  rememberAutoUploadJob(tabId, {
    attachmentId: "100",
    imageUrl: "https://example.com/a.jpg",
    filenameContext: "a.jpg",
    pageUrl: "https://site.test/wp-admin/upload.php",
    trigger: "upload"
  });
  __autoUploadCancelByTab.set(tabId, true);
  __sessionContextByTab.set(tabId, "contexto");
  const stats = getAutoUploadStats(tabId);
  stats.queued = 1;
  stats.done = 0;

  const snapshot = normalizeRuntimeSnapshotForStorage(serializeRuntimeState());
  hydrateRuntimeState(null);
  hydrateRuntimeState(snapshot);

  assert.equal(wasRecentlyAutoProcessed(tabId, "100"), true);
  assert.deepEqual(__autoUploadPendingIdsByTab.get(tabId), ["100"]);
  assert.equal(__autoUploadJobsByTab.get(tabId).length, 1);
  assert.equal(__autoUploadCancelByTab.get(tabId), true);
  assert.equal(__sessionContextByTab.get(tabId), "contexto");
  assert.equal(__autoUploadStatsByTab.get(tabId).queued, 1);
});

test("runtime state removes pending ids and jobs cleanly", () => {
  const tabId = 11;
  enqueueAutoPendingId(tabId, "1");
  enqueueAutoPendingId(tabId, "2");
  rememberAutoUploadJob(tabId, { attachmentId: "1", imageUrl: "a", filenameContext: "", pageUrl: "", trigger: "upload" });
  rememberAutoUploadJob(tabId, { attachmentId: "2", imageUrl: "b", filenameContext: "", pageUrl: "", trigger: "upload" });

  dequeueAutoPendingId(tabId, "1");
  forgetAutoUploadJob(tabId, "1");

  assert.deepEqual(__autoUploadPendingIdsByTab.get(tabId), ["2"]);
  assert.deepEqual(__autoUploadJobsByTab.get(tabId).map((job) => job.attachmentId), ["2"]);

  clearTabRuntimeState(tabId);
  assert.equal(__autoUploadPendingIdsByTab.has(tabId), false);
  assert.equal(__autoUploadJobsByTab.has(tabId), false);
  assert.equal(__autoUploadSeenByTab.has(tabId), false);
});
