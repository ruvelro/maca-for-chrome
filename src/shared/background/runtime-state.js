export const __lastCandidateByTab = new Map();
export const __autoUploadQueueByTab = new Map();
export const __autoUploadSeenByTab = new Map();
export const __autoUploadStatsByTab = new Map();
export const __autoUploadCancelByTab = new Map();
export const __autoUploadPausedByTab = new Map();
export const __autoUploadPendingIdsByTab = new Map();
export const __autoUploadJobsByTab = new Map();
export const __batchCancelByTab = new Map();
export const __batchAbortByTab = new Map();
export const __batchJobsByTab = new Map();
export const __manualJobsByTab = new Map();
export const __sessionContextByTab = new Map();

function toTabKey(tabId) {
  return String(Number(tabId));
}

function fromTabKey(key) {
  const num = Number(key);
  return Number.isFinite(num) ? num : null;
}

export function wasRecentlyAutoProcessed(tabId, attachmentId, ttlMs = 5 * 60 * 1000) {
  const byTab = __autoUploadSeenByTab.get(tabId);
  if (!byTab) return false;
  const now = Date.now();
  for (const [id, ts] of byTab.entries()) {
    if (now - Number(ts || 0) > ttlMs) byTab.delete(id);
  }
  if (!attachmentId) return false;
  const ts = byTab.get(String(attachmentId));
  return !!ts && (now - Number(ts || 0) <= ttlMs);
}

export function markAutoProcessed(tabId, attachmentId) {
  if (tabId == null || !attachmentId) return;
  let byTab = __autoUploadSeenByTab.get(tabId);
  if (!byTab) {
    byTab = new Map();
    __autoUploadSeenByTab.set(tabId, byTab);
  }
  byTab.set(String(attachmentId), Date.now());
}

export function unmarkAutoProcessed(tabId, attachmentId) {
  if (tabId == null || !attachmentId) return;
  const byTab = __autoUploadSeenByTab.get(tabId);
  if (!byTab) return;
  byTab.delete(String(attachmentId));
}

export function enqueueAutoUploadJob(tabId, jobFn) {
  const prev = __autoUploadQueueByTab.get(tabId) || Promise.resolve();
  const next = prev.catch(() => {}).then(jobFn);
  __autoUploadQueueByTab.set(tabId, next);
  return next;
}

export function getAutoPendingIds(tabId) {
  let list = __autoUploadPendingIdsByTab.get(tabId);
  if (!list) {
    list = [];
    __autoUploadPendingIdsByTab.set(tabId, list);
  }
  return list;
}

export function enqueueAutoPendingId(tabId, attachmentId) {
  const id = String(attachmentId || "");
  if (!id) return;
  const list = getAutoPendingIds(tabId);
  if (!list.includes(id)) list.push(id);
}

export function dequeueAutoPendingId(tabId, attachmentId) {
  const id = String(attachmentId || "");
  if (!id) return;
  const list = getAutoPendingIds(tabId);
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
}

export function queuePreviewFromTab(tabId, maxLen = 8) {
  return getAutoPendingIds(tabId).slice(0, Math.max(1, maxLen | 0));
}

export async function waitIfAutoUploadPaused(tabId) {
  while (__autoUploadPausedByTab.get(tabId) === true) {
    if (__autoUploadCancelByTab.get(tabId) === true) throw new Error("AUTO_UPLOAD_CANCELLED");
    await new Promise((r) => setTimeout(r, 150));
  }
}

export function getAutoUploadStats(tabId) {
  let s = __autoUploadStatsByTab.get(tabId);
  if (!s) {
    s = { queued: 0, done: 0, ok: 0, error: 0, startedAt: Date.now(), lastAt: Date.now() };
    __autoUploadStatsByTab.set(tabId, s);
  }
  s.lastAt = Date.now();
  return s;
}

export function resetAutoUploadStatsLater(tabId, delayMs = 12000) {
  setTimeout(() => {
    const s = __autoUploadStatsByTab.get(tabId);
    if (!s) return;
    if ((Date.now() - Number(s.lastAt || 0)) < (delayMs - 500)) return;
    __autoUploadStatsByTab.delete(tabId);
  }, delayMs);
}

export function rememberAutoUploadJob(tabId, job) {
  if (tabId == null || !job?.attachmentId) return;
  let jobs = __autoUploadJobsByTab.get(tabId);
  if (!jobs) {
    jobs = [];
    __autoUploadJobsByTab.set(tabId, jobs);
  }
  const id = String(job.attachmentId);
  const idx = jobs.findIndex((it) => String(it?.attachmentId || "") === id);
  const nextJob = {
    attachmentId: id,
    imageUrl: String(job.imageUrl || ""),
    filenameContext: String(job.filenameContext || ""),
    pageUrl: String(job.pageUrl || ""),
    trigger: String(job.trigger || "upload")
  };
  if (idx >= 0) jobs[idx] = nextJob;
  else jobs.push(nextJob);
}

export function forgetAutoUploadJob(tabId, attachmentId) {
  if (tabId == null || !attachmentId) return;
  const jobs = __autoUploadJobsByTab.get(tabId);
  if (!jobs) return;
  const id = String(attachmentId);
  const next = jobs.filter((it) => String(it?.attachmentId || "") !== id);
  if (next.length) __autoUploadJobsByTab.set(tabId, next);
  else __autoUploadJobsByTab.delete(tabId);
}

export function getPersistedAutoUploadJobs(tabId) {
  return (__autoUploadJobsByTab.get(tabId) || []).map((job) => ({ ...job }));
}

export function clearTabRuntimeState(tabId) {
  __lastCandidateByTab.delete(tabId);
  __autoUploadQueueByTab.delete(tabId);
  __autoUploadSeenByTab.delete(tabId);
  __autoUploadStatsByTab.delete(tabId);
  __autoUploadCancelByTab.delete(tabId);
  __autoUploadPausedByTab.delete(tabId);
  __autoUploadPendingIdsByTab.delete(tabId);
  __autoUploadJobsByTab.delete(tabId);
  __batchCancelByTab.delete(tabId);
  __batchAbortByTab.delete(tabId);
  __batchJobsByTab.delete(tabId);
  __manualJobsByTab.delete(tabId);
  __sessionContextByTab.delete(tabId);
}

export function rememberManualJob(tabId, job) {
  if (tabId == null || !job) return;
  __manualJobsByTab.set(tabId, {
    jobId: String(job.jobId || ""),
    source: String(job.source || "manual"),
    imageUrl: String(job.imageUrl || ""),
    filenameContext: String(job.filenameContext || ""),
    pageUrl: String(job.pageUrl || ""),
    withCaptionSignature: !!job.withCaptionSignature,
    styleOverride: String(job.styleOverride || ""),
    modeOverride: String(job.modeOverride || "")
  });
}

export function forgetManualJob(tabId) {
  __manualJobsByTab.delete(tabId);
}

export function getPersistedManualJob(tabId) {
  const job = __manualJobsByTab.get(tabId);
  return job ? { ...job } : null;
}

export function getPersistedManualJobEntries() {
  return Array.from(__manualJobsByTab.entries()).map(([tabId, job]) => [tabId, { ...job }]);
}

export function rememberBatchJob(tabId, job) {
  if (tabId == null || !job || !Array.isArray(job.items)) return;
  __batchJobsByTab.set(tabId, {
    items: job.items.map((it) => ({ id: String(it.id || ""), imageUrl: String(it.imageUrl || ""), filenameContext: String(it.filenameContext || "") })),
    pageUrl: String(job.pageUrl || ""),
    currentIndex: Math.max(0, Number(job.currentIndex || 0)),
    qaSkipped: Math.max(0, Number(job.qaSkipped || 0))
  });
}

export function updateBatchJobProgress(tabId, patch = {}) {
  const current = __batchJobsByTab.get(tabId);
  if (!current) return;
  __batchJobsByTab.set(tabId, {
    ...current,
    ...(patch || {}),
    currentIndex: patch.currentIndex == null ? current.currentIndex : Math.max(0, Number(patch.currentIndex || 0)),
    qaSkipped: patch.qaSkipped == null ? current.qaSkipped : Math.max(0, Number(patch.qaSkipped || 0))
  });
}

export function forgetBatchJob(tabId) {
  __batchJobsByTab.delete(tabId);
}

export function getPersistedBatchJob(tabId) {
  const job = __batchJobsByTab.get(tabId);
  return job ? { ...job, items: job.items.map((it) => ({ ...it })) } : null;
}

export function serializeRuntimeState() {
  return {
    version: 1,
    lastCandidates: Array.from(__lastCandidateByTab.entries()),
    autoUploadSeen: Array.from(__autoUploadSeenByTab.entries()).map(([tabId, byTab]) => [tabId, Array.from(byTab.entries())]),
    autoUploadStats: Array.from(__autoUploadStatsByTab.entries()),
    autoUploadCancel: Array.from(__autoUploadCancelByTab.entries()),
    autoUploadPaused: Array.from(__autoUploadPausedByTab.entries()),
    autoUploadPendingIds: Array.from(__autoUploadPendingIdsByTab.entries()),
    autoUploadJobs: Array.from(__autoUploadJobsByTab.entries()),
    batchCancel: Array.from(__batchCancelByTab.entries()),
    batchJobs: Array.from(__batchJobsByTab.entries()),
    manualJobs: Array.from(__manualJobsByTab.entries()),
    sessionContext: Array.from(__sessionContextByTab.entries())
  };
}

export function hydrateRuntimeState(snapshot) {
  for (const map of [
    __lastCandidateByTab,
    __autoUploadQueueByTab,
    __autoUploadSeenByTab,
    __autoUploadStatsByTab,
    __autoUploadCancelByTab,
    __autoUploadPausedByTab,
    __autoUploadPendingIdsByTab,
    __autoUploadJobsByTab,
    __batchCancelByTab,
    __batchAbortByTab,
    __batchJobsByTab,
    __manualJobsByTab,
    __sessionContextByTab
  ]) map.clear();

  if (!snapshot || typeof snapshot !== "object") return;

  for (const [tabId, candidate] of snapshot.lastCandidates || []) {
    __lastCandidateByTab.set(fromTabKey(tabId), candidate);
  }
  for (const [tabId, rows] of snapshot.autoUploadSeen || []) {
    __autoUploadSeenByTab.set(fromTabKey(tabId), new Map(rows || []));
  }
  for (const [tabId, stats] of snapshot.autoUploadStats || []) {
    __autoUploadStatsByTab.set(fromTabKey(tabId), stats);
  }
  for (const [tabId, value] of snapshot.autoUploadCancel || []) {
    __autoUploadCancelByTab.set(fromTabKey(tabId), value === true);
  }
  for (const [tabId, value] of snapshot.autoUploadPaused || []) {
    __autoUploadPausedByTab.set(fromTabKey(tabId), value === true);
  }
  for (const [tabId, ids] of snapshot.autoUploadPendingIds || []) {
    __autoUploadPendingIdsByTab.set(fromTabKey(tabId), Array.isArray(ids) ? ids.map(String) : []);
  }
  for (const [tabId, jobs] of snapshot.autoUploadJobs || []) {
    __autoUploadJobsByTab.set(fromTabKey(tabId), Array.isArray(jobs) ? jobs.map((job) => ({ ...job })) : []);
  }
  for (const [tabId, value] of snapshot.batchCancel || []) {
    __batchCancelByTab.set(fromTabKey(tabId), value === true);
  }
  for (const [tabId, job] of snapshot.batchJobs || []) {
    if (job && Array.isArray(job.items)) __batchJobsByTab.set(fromTabKey(tabId), { ...job, items: job.items.map((it) => ({ ...it })) });
  }
  for (const [tabId, job] of snapshot.manualJobs || []) {
    if (job && typeof job === "object") __manualJobsByTab.set(fromTabKey(tabId), { ...job });
  }
  for (const [tabId, text] of snapshot.sessionContext || []) {
    __sessionContextByTab.set(fromTabKey(tabId), String(text || ""));
  }
}

export function normalizeRuntimeSnapshotForStorage(snapshot = serializeRuntimeState()) {
  const encodeTabMap = (entries) => entries.map(([tabId, value]) => [toTabKey(tabId), value]);
  return {
    version: Number(snapshot.version || 1),
    lastCandidates: encodeTabMap(snapshot.lastCandidates || []),
    autoUploadSeen: encodeTabMap((snapshot.autoUploadSeen || []).map(([tabId, rows]) => [tabId, rows])),
    autoUploadStats: encodeTabMap(snapshot.autoUploadStats || []),
    autoUploadCancel: encodeTabMap(snapshot.autoUploadCancel || []),
    autoUploadPaused: encodeTabMap(snapshot.autoUploadPaused || []),
    autoUploadPendingIds: encodeTabMap(snapshot.autoUploadPendingIds || []),
    autoUploadJobs: encodeTabMap(snapshot.autoUploadJobs || []),
    batchCancel: encodeTabMap(snapshot.batchCancel || []),
    batchJobs: encodeTabMap(snapshot.batchJobs || []),
    manualJobs: encodeTabMap(snapshot.manualJobs || []),
    sessionContext: encodeTabMap(snapshot.sessionContext || [])
  };
}
