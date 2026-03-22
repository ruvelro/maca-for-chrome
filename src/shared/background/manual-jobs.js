export async function runOverlayAnalysisJob({
  jobId,
  tabId,
  pageUrl,
  imgUrl,
  filenameContext,
  source,
  withCaptionSignature = false,
  styleOverride = "",
  modeOverride = "",
  restored = false,
  rememberManualJob,
  forgetManualJob,
  scheduleRuntimeStatePersist,
  getConfigCached,
  getSessionContextForTab,
  resolveOnCompleteAction,
  ensureOverlayInjected,
  sendOverlay,
  analyzeImage,
  addMetricsSample,
  logJobEvent
}) {
  const cfg = await getConfigCached();
  if (cfg?.extensionEnabled === false) {
    await ensureOverlayInjected(tabId);
    await sendOverlay(tabId, { type: "MACA_OVERLAY_ERROR", jobId, error: "maca está desactivada en ajustes rápidos." });
    return;
  }

  rememberManualJob(tabId, {
    jobId,
    source,
    imageUrl: imgUrl,
    filenameContext,
    pageUrl,
    withCaptionSignature,
    styleOverride,
    modeOverride
  });
  scheduleRuntimeStatePersist();
  await logJobEvent?.(cfg, "manual_job_open", { jobId, phase: "open", source, restored, pageUrl, imageUrl: imgUrl });

  await ensureOverlayInjected(tabId);
  await sendOverlay(tabId, {
    type: "MACA_OVERLAY_OPEN",
    jobId,
    imgUrl,
    filenameContext: String(filenameContext || ""),
    pageUrl,
    sessionContext: getSessionContextForTab(tabId),
    generateMode: String(modeOverride || cfg.generateMode || "both"),
    wpAutoApply: !!cfg.wpAutoApply,
    wpAutoApplyRequireMedia: !!cfg.wpAutoApplyRequireMedia,
    autoCaptionSignatureOnAutoFill: !!cfg.autoCaptionSignatureOnAutoFill,
    onCompleteAction: resolveOnCompleteAction(cfg, pageUrl),
    restored
  });

  try {
    const { alt, title, leyenda, seoReview } = await analyzeImage({
      imageUrl: imgUrl,
      filenameContext,
      pageUrl,
      tabId,
      withCaptionSignature,
      styleOverride,
      modeOverride,
      source,
      jobId
    });

    await sendOverlay(tabId, {
      type: "MACA_OVERLAY_RESULT",
      jobId,
      alt,
      title,
      leyenda,
      seoReview,
      restored
    });
    await logJobEvent?.(cfg, "manual_job_result", { jobId, phase: "result", source, restored, pageUrl });
  } catch (err) {
    await addMetricsSample(cfg, {
      ok: false,
      ms: 0,
      mode: String(modeOverride || cfg.generateMode || "both"),
      source,
      error: err?.message || String(err)
    });
    await logJobEvent?.(cfg, "manual_job_error", { jobId, phase: "error", source, restored, error: err?.message || String(err) });
    await sendOverlay(tabId, { type: "MACA_OVERLAY_ERROR", jobId, error: err?.message || String(err), restored });
  } finally {
    forgetManualJob(tabId);
    scheduleRuntimeStatePersist();
  }
}

export async function resumePersistedManualJobs({ getPersistedManualJobEntries, clearTabRuntimeState, scheduleRuntimeStatePersist, runOverlayAnalysisJob }) {
  const tabs = await chrome.tabs.query({});
  const liveTabIds = new Set(tabs.map((tab) => tab.id).filter((id) => id != null));
  for (const [tabId, job] of getPersistedManualJobEntries()) {
    if (!job) continue;
    if (!liveTabIds.has(tabId)) {
      clearTabRuntimeState(tabId);
      continue;
    }
    await runOverlayAnalysisJob({ ...job, tabId, restored: true });
  }
  scheduleRuntimeStatePersist();
}
