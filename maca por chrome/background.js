/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/*/ INSTEAD. */
import {
  nowIso,
  clampHistory,
  safeJsonParse,
  fetchWithTimeout,
  isAllowedImageUrl,
  normalizeAltText,
  normalizeCaptionText,
  toBase64DataUrlFromUrl,
  renderPrompt
} from "./util.js";

import { getPromptForProfile } from "./prompts.js";
import {
  DEFAULT_SYNC_CFG,
  getConfigCached,
  initConfigCache
} from "./background/config.js";
import {
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
  __sessionContextByTab,
  wasRecentlyAutoProcessed,
  markAutoProcessed,
  unmarkAutoProcessed,
  enqueueAutoUploadJob,
  getAutoPendingIds,
  enqueueAutoPendingId,
  dequeueAutoPendingId,
  queuePreviewFromTab,
  waitIfAutoUploadPaused,
  getAutoUploadStats,
  resetAutoUploadStatsLater,
  rememberAutoUploadJob,
  forgetAutoUploadJob,
  getPersistedAutoUploadJobs,
  rememberBatchJob,
  updateBatchJobProgress,
  forgetBatchJob,
  getPersistedBatchJob,
  rememberManualJob,
  forgetManualJob,
  getPersistedManualJob,
  clearTabRuntimeState,
  serializeRuntimeState,
  hydrateRuntimeState,
  normalizeRuntimeSnapshotForStorage
} from "./background/runtime-state.js";
import {
  runProviderAnalysis,
  runProviderConfigTest,
  isOpenRouterGlm,
  getOpenRouterGlmQualityPrompt
} from "./providers/index.js";
import { ensureOverlayInjected, sendOverlay } from "./background/overlay-runtime.js";
import { runOverlayAnalysisJob, resumePersistedManualJobs } from "./background/manual-jobs.js";
import {
  normalizeTitleText,
  ensureTrailingPeriod,
  ensureAltTrailingPeriodWithinLimit,
  buildSeoReview,
  runSecondPassQuality,
  passesBatchQa,
  applyPostValidation
} from "./background/quality.js";

initConfigCache();


// ===============================
// Templates, language & debug helpers
// ===============================

function getEffectiveLang(cfg) {
  if (cfg?.languageAutoEsEs) return "es-ES";
  return String(cfg?.language || "es-ES");
}

function renderSimpleTemplate(tpl, vars) {
  const s = String(tpl || "");
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : "";
    return (v === null || v === undefined) ? "" : String(v);
  });
}

function safeHost(pageUrl) {
  try { return new URL(pageUrl || "").hostname || ""; } catch (_) { return ""; }
}

function sanitizeSessionContext(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

const RUNTIME_STATE_STORAGE_KEY = "macaRuntimeState";
let __runtimeStatePersistTimer = null;

function scheduleRuntimeStatePersist(delayMs = 80) {
  if (__runtimeStatePersistTimer) clearTimeout(__runtimeStatePersistTimer);
  __runtimeStatePersistTimer = setTimeout(() => {
    __runtimeStatePersistTimer = null;
    persistRuntimeState().catch(() => {});
  }, delayMs);
}

async function persistRuntimeState() {
  const snapshot = normalizeRuntimeSnapshotForStorage(serializeRuntimeState());
  await chrome.storage.local.set({ [RUNTIME_STATE_STORAGE_KEY]: snapshot });
}

async function restoreRuntimeState() {
  try {
    const stored = await chrome.storage.local.get({ [RUNTIME_STATE_STORAGE_KEY]: null });
    hydrateRuntimeState(stored?.[RUNTIME_STATE_STORAGE_KEY] || null);
  } catch (_) {
    hydrateRuntimeState(null);
  }
}

const runtimeStateReady = restoreRuntimeState();

function setSessionContextForTab(tabId, text) {
  if (tabId == null) return;
  const clean = sanitizeSessionContext(text);
  if (!clean) __sessionContextByTab.delete(tabId);
  else __sessionContextByTab.set(tabId, clean);
  scheduleRuntimeStatePersist();
}

function getSessionContextForTab(tabId) {
  if (tabId == null) return "";
  return sanitizeSessionContext(__sessionContextByTab.get(tabId) || "");
}

function buildSessionContextBlock(sessionContext) {
  const s = sanitizeSessionContext(sessionContext);
  if (!s) return "";
  return `\nContexto editorial de sesión (solo como guía, no inventes datos): "${s}"\n`;
}

const SECTION_STYLE_PROFILES = {
  general: "",
  review: [
    "Sección editorial: review/análisis.",
    "- Prioriza precisión técnica visible.",
    "- Evita adjetivos promocionales.",
    "- Mantén tono profesional y objetivo."
  ].join("\n"),
  news: [
    "Sección editorial: noticia.",
    "- Prioriza claridad y concisión.",
    "- Tono informativo, directo y neutro.",
    "- Evita exceso de tecnicismos."
  ].join("\n"),
  comparison: [
    "Sección editorial: comparativa.",
    "- Destaca el elemento diferencial visible en la imagen.",
    "- Tono analítico, sin marketing.",
    "- Sé específico y evita frases vagas."
  ].join("\n")
};

function getSectionStyleBlock(profile) {
  const key = String(profile || "general").trim().toLowerCase();
  return SECTION_STYLE_PROFILES[key] || SECTION_STYLE_PROFILES.general;
}

function getToneOverrideBlock(styleOverride) {
  const key = String(styleOverride || "").trim().toLowerCase();
  if (key === "technical") {
    return [
      "Reescritura de estilo: más técnico.",
      "- Usa terminología técnica visible cuando aporte claridad.",
      "- No alargues innecesariamente."
    ].join("\n");
  }
  if (key === "short") {
    return [
      "Reescritura de estilo: más corto.",
      "- ALT: intenta 70-95 caracteres.",
      "- TITLE: 2-5 palabras.",
      "- LEYENDA: una frase breve."
    ].join("\n");
  }
  if (key === "editorial") {
    return [
      "Reescritura de estilo: más editorial.",
      "- Mantén tono periodístico natural.",
      "- Añade contexto visual sin promoción."
    ].join("\n");
  }
  return "";
}

function normalizeSignatureList(rawList, legacyText = "") {
  const list = Array.isArray(rawList) ? rawList : [];
  const out = [];
  for (const it of list) {
    if (!it || typeof it !== "object") continue;
    const id = String(it.id || "").trim() || crypto.randomUUID();
    const name = String(it.name || "").trim() || "Firma";
    const text = String(it.text || "").trim();
    if (!text) continue;
    out.push({ id, name, text });
  }
  if (!out.length) {
    const legacy = String(legacyText || "").trim();
    if (legacy) out.push({ id: "default", name: "Firma principal", text: legacy });
  }
  return out;
}

function getActiveSignatureText(cfg) {
  const list = normalizeSignatureList(cfg?.captionSignatures, cfg?.captionSignatureText);
  if (!list.length) return "";
  const activeId = String(cfg?.activeCaptionSignatureId || "").trim();
  const active = list.find((x) => x.id === activeId) || list[0];
  return String(active?.text || "").trim();
}

function extractFilenameFromImageUrl(imageUrl) {
  try {
    const u = new URL(String(imageUrl || ""));
    // data: URLs do not provide a meaningful filename.
    if (u.protocol === "data:") return "";
    const last = String(u.pathname || "").split("/").filter(Boolean).pop() || "";
    if (!last) return "";
    // Defensive decode for URLs like ".../mi%20imagen.jpg"
    return decodeURIComponent(last);
  } catch (_) {
    return "";
  }
}

function buildFilenameContextBlock({ filenameContext, imageUrl }) {
  const uiCtx = String(filenameContext || "").trim();
  const urlFilename = extractFilenameFromImageUrl(imageUrl);
  const parts = [];

  if (uiCtx) parts.push(`texto asociado/archivo en la UI: "${uiCtx}"`);
  if (urlFilename && urlFilename !== uiCtx) parts.push(`nombre de archivo detectado en URL: "${urlFilename}"`);

  if (!parts.length) return "";
  return `\nContexto adicional (puede ser genérico o erróneo, úsalo solo como pista): ${parts.join(" | ")}\n`;
}

function truncateStrings(obj, maxLen = 500) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.slice(0, 50).map(v => truncateStrings(v, maxLen));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase().includes("apikey") || k.toLowerCase().includes("api_key")) continue;
    if (typeof v === "string") out[k] = v.length > maxLen ? (v.slice(0, maxLen) + "...") : v;
    else if (v && typeof v === "object") out[k] = truncateStrings(v, maxLen);
    else out[k] = v;
  }
  return out;
}

async function addDebugLog(cfg, event, data) {
  try {
    if (!cfg?.debugEnabled) return;
    const stored = await chrome.storage.local.get({ debugLog: [] });
    const log = Array.isArray(stored.debugLog) ? stored.debugLog : [];
    log.unshift({ ts: nowIso(), event: String(event || ""), data: truncateStrings(data || {}) });
    if (log.length > 50) log.length = 50;
    await chrome.storage.local.set({ debugLog: log });
  } catch (_) {}
}


// =========================
// Prompt controls (mode + SEO limits)
// =========================

function adjustDefaultPromptForModeAndSeo(tpl, { mode, altMaxLength, avoidImagePrefix }) {
  let s = String(tpl || "");

  // ALT length line
  const n = Number(altMaxLength);
  if (Number.isFinite(n) && n > 0) {
    s = s.replace(/Máx\.\s*\d+\s*caracteres/gi, `Máx. ${n} caracteres`);
  } else {
    // Remove the max-length bullet if user opted out
    s = s.replace(/^\s*-\s*Máx\.[^\n]*\n?/gmi, "");
  }

  // Avoid "imagen/foto de" line
  if (!avoidImagePrefix) {
    s = s.replace(/^\s*-\s*No empieces con[^\n]*\n?/gmi, "");
  }

  // Mode-specific trimming to save tokens.
  const m = String(mode || "both");
  const schema =
    m === "alt"
      ? '{"alt":"...","title":"...","decorativa":false}'
      : (m === "caption"
        ? '{"leyenda":"..."}'
        : '{"alt":"...","title":"...","leyenda":"...","decorativa":false}');

  if (m === "alt") {
    // Remove LEYENDA block (from LEYENDA: up to Idioma:)
    s = s.replace(/\n\s*LEYENDA:[\s\S]*?(\n\s*Idioma:)/i, "\n$1");
  } else if (m === "caption") {
    // Remove ALT/TITLE block (from ALT: up to LEYENDA:)
    s = s.replace(/\n\s*ALT:[\s\S]*?(\n\s*LEYENDA:)/i, "\n$1");
    s = s.replace(/\n\s*TITLE:[\s\S]*?(\n\s*LEYENDA:)/i, "\n$1");
  }

  if (/Devuelve SOLO JSON válido con:/i.test(s)) {
    s = s.replace(/Devuelve SOLO JSON válido con:[\s\S]*$/i, `Devuelve SOLO JSON válido con:\n${schema}`);
  } else {
    s += `\n\nDevuelve SOLO JSON válido con:\n${schema}`;
  }

  // Reinforce strict JSON
  if (!/No incluyas backticks/i.test(s)) {
    s += "\n\nNo incluyas backticks, ni texto fuera del JSON.";
  }

  return s.trim();
}
// NOTE: fetchWithTimeout is imported from util.js. Do not re-declare it here.

function isOpenRouterGlm(provider, model) {
  return String(provider || "") === "openrouter" && /glm/i.test(String(model || ""));
}

function getOpenRouterGlmQualityPrompt(mode) {
  const m = String(mode || "both");
  const schema =
    m === "alt"
      ? '{"alt":"...","title":"...","decorativa":false}'
      : (m === "caption"
        ? '{"leyenda":"..."}'
        : '{"alt":"...","title":"...","leyenda":"...","decorativa":false}');
  return [
    "MODO CALIDAD (OpenRouter/GLM):",
    "- Usa español de España (es-ES). Evita latinismos y regionalismos de Latinoamérica.",
    "- Describe SOLO lo visible, sin inventar datos técnicos o marcas no legibles.",
    "- ALT: concreto, natural y útil para accesibilidad.",
    "- TITLE: 2-8 palabras, nunca repitas el ALT completo.",
    "- LEYENDA: 1 frase editorial breve; evita relleno.",
    "- Prohibido devolver razonamiento, explicaciones o texto fuera del JSON.",
    "- Salida obligatoria: JSON válido y nada más.",
    schema
  ].join("\n");
}

function getSpanishLocaleGuard(lang) {
  const s = String(lang || "").toLowerCase();
  if (!s.startsWith("es")) return "";
  return "\nIdioma obligatorio: español de España (es-ES). Usa terminología de España y evita variantes regionales latinoamericanas.\n";
}


// =========================
// Clipboard helper (offscreen document)
// =========================

let __macaOffscreenReady = false;

async function ensureOffscreenDocument() {
  // offscreen API available in newer Chrome
  if (!chrome?.offscreen?.createDocument) return false;

  try {
    // Some Chrome versions expose hasDocument()
    if (chrome.offscreen.hasDocument) {
      const has = await chrome.offscreen.hasDocument();
      if (has) {
        __macaOffscreenReady = true;
        return true;
      }
    } else if (__macaOffscreenReady) {
      return true;
    }

    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen.html'),
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Copy ALT and caption to clipboard (two entries)'
    });
    __macaOffscreenReady = true;
    return true;
  } catch (_) {
    return false;
  }
}

async function copySequenceToClipboard(texts, delayMs = 260) {
  const ready = await ensureOffscreenDocument();
  if (!ready) return { ok: false, reason: 'no_offscreen' };

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'MACA_OFFSCREEN_COPY_SEQ',
      texts,
      delayMs
    });
    return res || { ok: false };
  } catch (_) {
    return { ok: false };
  }
}

// =========================
// Context menu (WordPress-only)
// - Single entry. Signature behavior is controlled via settings.
//
// IMPORTANT: We avoid removeAll/recreate cycles because they can race on MV3 wake-ups
// and cause "Cannot create item with duplicate id" in Chromium.
// =========================

const MENU_ID_NORMAL = "maca-analyze";

function isWpAdminUrl(u) {
  const s = String(u || "");
  return /\/wp-admin\//.test(s);
}

function resolveOnCompleteAction(cfg, pageUrl) {
  const action = String(cfg?.onCompleteAction || "none");
  const scope = String(cfg?.onCompleteScope || "wp"); // wp | all
  if (scope === "all") return action;
  return isWpAdminUrl(pageUrl) ? action : "none";
}

let __menuEnsured = false;
function ensureMenu() {
  if (__menuEnsured) return;
  __menuEnsured = true;
  if (!chrome?.contextMenus?.create) return;
  try {
    // Cleanup legacy menu id from previous versions.
    chrome.contextMenus.remove("maca-analyze-signed", () => {
      void chrome.runtime.lastError;
    });
    chrome.contextMenus.create(
      {
        id: MENU_ID_NORMAL,
        title: "Analizar imagen con maca",
        contexts: ["all"],
        documentUrlPatterns: ["*://*/*wp-admin/*"]
      },
      () => {
        // Always read lastError to prevent "Unchecked runtime.lastError" noise.
        void chrome.runtime.lastError;
      }
    );
  } catch (_) {
    // ignore
  }
}

ensureMenu();

// =========================
// Keyboard shortcut (commands)
// =========================
if (chrome?.commands?.onCommand?.addListener) {
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== "maca-run") return;

    (async () => {
      const cfg = await getConfigCached();
      if (!cfg?.shortcutEnabled) return;
      if (cfg?.extensionEnabled === false) return;

      // Some Chromium variants don't pass `tab` to onCommand.
      let activeTab = tab;
      try {
        if (!activeTab?.id) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          activeTab = (tabs && tabs[0]) ? tabs[0] : null;
        }
      } catch (_) {
        activeTab = null;
      }

      if (!activeTab?.id) return;

      const tabId = activeTab.id;
      const pageUrl = activeTab.url || "";
      const jobId = crypto.randomUUID();

      // Keep this shortcut safe and predictable: WP admin only.
      if (!isWpAdminUrl(pageUrl)) {
        try {
          await ensureOverlayInjected(tabId);
          await sendOverlay(tabId, {
            type: "MACA_OVERLAY_ERROR",
            jobId,
            error: "El atajo de maca está pensado para WordPress (wp-admin). Abre la Biblioteca de medios o Detalles de la imagen y vuelve a intentarlo."
          });
        } catch (_) {}
        return;
      }

      // Resolve selected/open candidate in WP UI
      let imgUrl = "";
      let filenameContext = "";

      try {
        const c = await chrome.tabs.sendMessage(tabId, { type: "MACA_GET_SELECTED_CANDIDATE" });
        if (c?.ok && c.imageUrl) {
          imgUrl = c.imageUrl;
          filenameContext = c.filenameContext || "";
        }
      } catch (_) {}

      if (!imgUrl) {
        const pushed = __lastCandidateByTab.get(tabId);
        if (pushed?.imageUrl) {
          imgUrl = pushed.imageUrl;
          filenameContext = pushed.filenameContext || "";
        } else {
          try {
            const c2 = await chrome.tabs.sendMessage(tabId, { type: "MACA_GET_LAST_CANDIDATE" });
            if (c2?.ok && c2.imageUrl) {
              imgUrl = c2.imageUrl;
              filenameContext = c2.filenameContext || "";
            }
          } catch (_) {}
        }
      }

      if (!imgUrl) {
        await ensureOverlayInjected(tabId);
        await sendOverlay(tabId, {
          type: "MACA_OVERLAY_ERROR",
          jobId,
          error: "No he encontrado una imagen seleccionada o abierta. Selecciona una imagen en la Biblioteca de medios o abre 'Detalles de la imagen'."
        });
        return;
      }
      await runOverlayAnalysisJob({
        jobId,
        tabId,
        pageUrl,
        imgUrl,
        filenameContext,
        source: "shortcut",
        withCaptionSignature: !!cfg.contextMenuUseSignature,
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
      });
    })();
  });
}

async function sendAutoUploadProgress(tabId, payload) {
  try {
    const base = payload || {};
    await chrome.tabs.sendMessage(tabId, {
      type: "MACA_AUTO_UPLOAD_PROGRESS",
      queue: queuePreviewFromTab(tabId),
      paused: __autoUploadPausedByTab.get(tabId) === true,
      ...(base || {})
    });
  } catch (_) {}
}

async function logJobEvent(cfg, event, data = {}) {
  await addDebugLog(cfg, event, data);
}

function finalizeAutoUploadTabState(tabId) {
  __autoUploadPausedByTab.delete(tabId);
  __autoUploadPendingIdsByTab.delete(tabId);
  scheduleRuntimeStatePersist();
}

async function processAutoUploadAttachmentRequest({
  tabId,
  pageUrl,
  attachmentId,
  imageUrl,
  filenameContext,
  trigger = "upload",
  sendResponse,
  restored = false
}) {
  await runtimeStateReady;
  let markedSeen = false;
  try {
    if (tabId == null) throw new Error("No hay pestaña activa.");
    if (!attachmentId || !imageUrl) throw new Error("Faltan datos del adjunto recién subido.");
    if (!isWpAdminUrl(pageUrl)) {
      sendResponse?.({ ok: false, skipped: true, reason: "non_wp" });
      return;
    }

    const cfg = await getConfigCached();
    if (cfg?.extensionEnabled === false) {
      sendResponse?.({ ok: false, skipped: true, reason: "extension_disabled" });
      return;
    }
    if (!cfg?.wpAutoAnalyzeOnUpload) {
      sendResponse?.({ ok: false, skipped: true, reason: "disabled" });
      return;
    }
    if (trigger !== "upload" && !cfg?.autoAnalyzeOnSelectMedia) {
      sendResponse?.({ ok: false, skipped: true, reason: "not_upload_trigger" });
      return;
    }

    const st = getAutoUploadStats(tabId);
    if (__autoUploadCancelByTab.get(tabId) === true) {
      const settled = Number(st.done || 0) >= Number(st.queued || 0);
      const stale = (Date.now() - Number(st.lastAt || 0)) > 30000;
      if (settled || stale) {
        __autoUploadCancelByTab.delete(tabId);
        scheduleRuntimeStatePersist();
      } else {
        sendResponse?.({ ok: false, skipped: true, reason: "cancelled" });
        return;
      }
    }

    if (wasRecentlyAutoProcessed(tabId, attachmentId) && !restored) {
      sendResponse?.({ ok: true, skipped: true, reason: "duplicate" });
      return;
    }

    const fuseEnabled = cfg.autoUploadSafetyFuseEnabled !== false;
    const fuseMax = Number.isFinite(Number(cfg.autoUploadSafetyFuseMaxQueued))
      ? Math.max(5, Number(cfg.autoUploadSafetyFuseMaxQueued))
      : 24;
    const hardEmergencyMax = 80;
    if (Number(st.queued || 0) >= hardEmergencyMax) {
      __autoUploadCancelByTab.set(tabId, true);
      finalizeAutoUploadTabState(tabId);
      await sendAutoUploadProgress(tabId, {
        phase: "safety_stop",
        attachmentId,
        queued: st.queued,
        done: st.done,
        ok: st.ok,
        error: st.error,
        fuseMax: hardEmergencyMax
      });
      await addDebugLog(cfg, "auto_upload_hard_safety_stop", { tabId, attachmentId, queued: st.queued, hardEmergencyMax });
      sendResponse?.({ ok: false, skipped: true, reason: "hard_safety_fuse", fuseMax: hardEmergencyMax });
      return;
    }
    if (fuseEnabled && Number(st.queued || 0) >= fuseMax) {
      __autoUploadCancelByTab.set(tabId, true);
      finalizeAutoUploadTabState(tabId);
      await sendAutoUploadProgress(tabId, {
        phase: "safety_stop",
        attachmentId,
        queued: st.queued,
        done: st.done,
        ok: st.ok,
        error: st.error,
        fuseMax
      });
      await addDebugLog(cfg, "auto_upload_safety_fuse", { tabId, attachmentId, queued: st.queued, fuseMax });
      sendResponse?.({ ok: false, skipped: true, reason: "safety_fuse", fuseMax });
      return;
    }

    if (!restored) {
      st.queued += 1;
      enqueueAutoPendingId(tabId, attachmentId);
      rememberAutoUploadJob(tabId, { attachmentId, imageUrl, filenameContext, pageUrl, trigger });
      scheduleRuntimeStatePersist();
      await sendAutoUploadProgress(tabId, {
        phase: "queued",
        attachmentId,
        queued: st.queued,
        done: st.done,
        ok: st.ok,
        error: st.error
      });
    }

    markAutoProcessed(tabId, attachmentId);
    markedSeen = true;
    scheduleRuntimeStatePersist();

    await enqueueAutoUploadJob(tabId, async () => {
      if (__autoUploadCancelByTab.get(tabId) === true) throw new Error("AUTO_UPLOAD_CANCELLED");
      await waitIfAutoUploadPaused(tabId);
      if (__autoUploadCancelByTab.get(tabId) === true) throw new Error("AUTO_UPLOAD_CANCELLED");

      await addDebugLog(cfg, "auto_upload_start", { tabId, attachmentId, restored });
      await sendAutoUploadProgress(tabId, {
        phase: "processing",
        attachmentId,
        queued: st.queued,
        done: st.done,
        ok: st.ok,
        error: st.error,
        restored
      });

          const out = await analyzeImage({
            imageUrl,
            filenameContext,
            pageUrl,
            tabId,
            modeOverride: "both",
            withCaptionSignature: !!cfg.autoCaptionSignatureOnAutoFill,
            source: restored ? "auto_upload_resume" : "auto_upload",
            jobId: `auto:${attachmentId}`
          });

      if (__autoUploadCancelByTab.get(tabId) === true) throw new Error("AUTO_UPLOAD_CANCELLED");

      const applyPayload = {
        type: "MACA_APPLY_TO_ATTACHMENT",
        attachmentId,
        alt: out.alt || "",
        title: out.title || "",
        leyenda: out.leyenda || "",
        generateMode: "both",
        requireMedia: true
      };
      const applied = await autoApplyAttachmentWithRetry(tabId, applyPayload, { attempts: 12, delayMs: 220 });
      await logJobEvent(cfg, "auto_upload_apply_result", {
        jobId: `auto:${attachmentId}`,
        phase: "apply",
        attachmentId,
        ok: applied.ok,
        applyDetails: applied.response?.applyDetails || null,
        missing: applied.response?.missing || []
      });
      if (!applied.ok) throw new Error("No se pudo aplicar el resultado en los campos de Medios.");

      if (cfg.autoDeselectProcessedOnAutoFill) {
        try {
          await chrome.tabs.sendMessage(tabId, { type: "MACA_DESELECT_ATTACHMENT", attachmentId });
        } catch (_) {}
      }

      st.done += 1;
      st.ok += 1;
      st.lastAt = Date.now();
      dequeueAutoPendingId(tabId, attachmentId);
      forgetAutoUploadJob(tabId, attachmentId);
      scheduleRuntimeStatePersist();
      await sendAutoUploadProgress(tabId, {
        phase: "done_item",
        attachmentId,
        queued: st.queued,
        done: st.done,
        ok: st.ok,
        error: st.error
      });
      if (st.done >= st.queued) {
        finalizeAutoUploadTabState(tabId);
        await sendAutoUploadProgress(tabId, {
          phase: "done_all",
          attachmentId,
          queued: st.queued,
          done: st.done,
          ok: st.ok,
          error: st.error
        });
        resetAutoUploadStatsLater(tabId, 14000);
      }

      await addDebugLog(cfg, "auto_upload_done", { tabId, attachmentId, attempts: applied.attempts, restored });
    });

    sendResponse?.({ ok: true, attachmentId, restored });
  } catch (err) {
    forgetAutoUploadJob(tabId, attachmentId);
    if (err?.message === "AUTO_UPLOAD_CANCELLED") {
      if (markedSeen) unmarkAutoProcessed(tabId, attachmentId);
      dequeueAutoPendingId(tabId, attachmentId);
      const st = getAutoUploadStats(tabId);
      st.done += 1;
      st.lastAt = Date.now();
      scheduleRuntimeStatePersist();
      await sendAutoUploadProgress(tabId, {
        phase: "cancelled_item",
        attachmentId,
        queued: st.queued,
        done: st.done,
        ok: st.ok,
        error: st.error
      });
      if (st.done >= st.queued) {
        finalizeAutoUploadTabState(tabId);
        await sendAutoUploadProgress(tabId, {
          phase: "cancelled",
          attachmentId,
          queued: st.queued,
          done: st.done,
          ok: st.ok,
          error: st.error
        });
        __autoUploadCancelByTab.delete(tabId);
        scheduleRuntimeStatePersist();
        resetAutoUploadStatsLater(tabId, 12000);
      }
      sendResponse?.({ ok: false, skipped: true, reason: "cancelled" });
      return;
    }

    if (markedSeen) unmarkAutoProcessed(tabId, attachmentId);
    dequeueAutoPendingId(tabId, attachmentId);
    const st = getAutoUploadStats(tabId);
    st.done += 1;
    st.error += 1;
    st.lastAt = Date.now();
    scheduleRuntimeStatePersist();
    await sendAutoUploadProgress(tabId, {
      phase: "error_item",
      attachmentId,
      queued: st.queued,
      done: st.done,
      ok: st.ok,
      error: st.error,
      errorMessage: err?.message || String(err)
    });
    if (st.done >= st.queued) {
      finalizeAutoUploadTabState(tabId);
      await sendAutoUploadProgress(tabId, {
        phase: "done_all",
        attachmentId,
        queued: st.queued,
        done: st.done,
        ok: st.ok,
        error: st.error
      });
      resetAutoUploadStatsLater(tabId, 16000);
    }
    const cfg = await getConfigCached().catch(() => ({}));
    await addDebugLog(cfg, restored ? "auto_upload_resume_error" : "auto_upload_error", { attachmentId, error: err?.message || String(err) });
    await addMetricsSample(cfg, {
      ok: false,
      ms: 0,
      mode: "both",
      source: restored ? "auto_upload_resume" : "auto_upload",
      error: err?.message || String(err)
    });
    sendResponse?.({ ok: false, error: err?.message || String(err) });
  }
}

async function resumePersistedAutoUploadJobs() {
  await runtimeStateReady;
  const tabs = await chrome.tabs.query({});
  const liveTabIds = new Set(tabs.map((tab) => tab.id).filter((id) => id != null));
  for (const [tabId] of __autoUploadJobsByTab.entries()) {
    if (!liveTabIds.has(tabId)) {
      clearTabRuntimeState(tabId);
    }
  }
  scheduleRuntimeStatePersist();

  for (const [tabId] of __autoUploadJobsByTab.entries()) {
    const jobs = getPersistedAutoUploadJobs(tabId);
    for (const job of jobs) {
      await processAutoUploadAttachmentRequest({ tabId, restored: true, ...job });
    }
  }
}

async function processBatchJob({ tabId, pageUrl, items, startIndex = 0, qaSkipped = 0, sendResponse = null, restored = false }) {
  await runtimeStateReady;
  let currentIndex = Math.max(0, Number(startIndex || 0));
  try {
    if (tabId == null) throw new Error("No hay pestaña activa.");
    const cfg = await getConfigCached();
    if (cfg?.extensionEnabled === false) throw new Error("maca está desactivada en ajustes rápidos.");
    if (!Array.isArray(items) || !items.length) throw new Error("No se detectaron imágenes seleccionadas.");

    if (!restored) {
      rememberBatchJob(tabId, { items, pageUrl, currentIndex: 0, qaSkipped: 0 });
      scheduleRuntimeStatePersist();
      await addDebugLog(cfg, "batch_start", { tabId });
      await sendOverlay(tabId, { type: "MACA_OVERLAY_PROGRESS", phase: "start", current: 0, total: items.length });
    } else {
      await addDebugLog(cfg, "batch_resume", { tabId, currentIndex, total: items.length });
      await sendOverlay(tabId, { type: "MACA_OVERLAY_PROGRESS", phase: "start", current: currentIndex, total: items.length, restored: true });
    }

    const results = [];
    for (let i = currentIndex; i < items.length; i++) {
      if (__batchCancelByTab.get(tabId) === true) {
        await sendOverlay(tabId, { type: "MACA_OVERLAY_PROGRESS", phase: "cancelled", current: i, total: items.length });
        await addDebugLog(cfg, "batch_cancelled", { done: i, total: items.length });
        sendResponse?.({ ok: true, cancelled: true, total: items.length, done: i, results });
        return;
      }

      const it = items[i] || {};
      const attachmentId = String(it.id || "");
      const imageUrl = it.imageUrl;
      const filenameContext = it.filenameContext || "";
      updateBatchJobProgress(tabId, { currentIndex: i, qaSkipped });
      scheduleRuntimeStatePersist();

      await sendOverlay(tabId, {
        type: "MACA_OVERLAY_PROGRESS",
        phase: "item",
        current: i + 1,
        total: items.length,
        attachmentId,
        filenameContext,
        restored
      });

      let out;
      try {
        out = await analyzeImage({
          imageUrl,
          filenameContext,
          pageUrl,
          tabId,
          withCaptionSignature: !!cfg.autoCaptionSignatureOnAutoFill || !!cfg.contextMenuUseSignature,
          abortSignal: __batchAbortByTab.get(tabId)?.signal || null,
          source: restored ? "batch_resume" : "batch",
          jobId: `batch:${attachmentId}`
        });
        results.push({ attachmentId, ...out, imageUrl });

        const canApply = passesBatchQa(out?.seoReview, cfg);
        if (!canApply) {
          qaSkipped += 1;
          updateBatchJobProgress(tabId, { currentIndex: i + 1, qaSkipped });
          scheduleRuntimeStatePersist();
          await sendOverlay(tabId, {
            type: "MACA_OVERLAY_PROGRESS",
            phase: "qa_skip_item",
            current: i + 1,
            total: items.length,
            attachmentId,
            qaSkipped,
            seoReview: out?.seoReview || null
          });
        } else {
          const applyPayload = {
            type: "MACA_APPLY_TO_ATTACHMENT",
            attachmentId,
            alt: out.alt || "",
            title: out.title || "",
            leyenda: out.leyenda || "",
            generateMode: String(cfg.generateMode || "both"),
            requireMedia: (cfg.wpAutoApplyRequireMedia !== undefined) ? !!cfg.wpAutoApplyRequireMedia : true
          };
          const applied = await autoApplyAttachmentWithRetry(tabId, applyPayload, { attempts: 12, delayMs: 220 });
          await logJobEvent(cfg, "batch_apply_result", {
            jobId: `batch:${attachmentId}`,
            phase: "apply",
            attachmentId,
            ok: applied.ok,
            applyDetails: applied.response?.applyDetails || null,
            missing: applied.response?.missing || []
          });
          if (!applied.ok) throw new Error("No se pudo aplicar el resultado en los campos de Medios.");
          updateBatchJobProgress(tabId, { currentIndex: i + 1, qaSkipped });
          scheduleRuntimeStatePersist();
        }

        await addDebugLog(cfg, "batch_item_ok", { i: i + 1, total: items.length, attachmentId, qaSkipped, qaMode: !!cfg.batchQaModeEnabled, restored });
      } catch (errItem) {
        if (__batchCancelByTab.get(tabId) === true || errItem?.name === "AbortError") {
          await sendOverlay(tabId, { type: "MACA_OVERLAY_PROGRESS", phase: "cancelled", current: i, total: items.length });
          await addDebugLog(cfg, "batch_cancelled", { done: i, total: items.length });
          sendResponse?.({ ok: true, cancelled: true, total: items.length, done: i, results });
          return;
        }
        const msgErr = errItem?.message || String(errItem);
        results.push({ attachmentId, error: msgErr, imageUrl });
        updateBatchJobProgress(tabId, { currentIndex: i + 1, qaSkipped });
        scheduleRuntimeStatePersist();
        await addMetricsSample(cfg, { ok: false, ms: 0, mode: String(cfg.generateMode || "both"), source: restored ? "batch_resume" : "batch", error: msgErr });
        await addDebugLog(cfg, restored ? "batch_resume_item_error" : "batch_item_error", { i: i + 1, total: items.length, attachmentId, error: msgErr });
      }
    }

    await sendOverlay(tabId, { type: "MACA_OVERLAY_PROGRESS", phase: "done", current: items.length, total: items.length, qaSkipped });
    await addDebugLog(cfg, restored ? "batch_resume_done" : "batch_done", { total: items.length, qaSkipped, qaMode: !!cfg.batchQaModeEnabled });
    sendResponse?.({ ok: true, total: items.length, qaSkipped, results, restored });
  } finally {
    if (tabId != null) {
      forgetBatchJob(tabId);
      __batchCancelByTab.delete(tabId);
      __batchAbortByTab.delete(tabId);
      scheduleRuntimeStatePersist();
    }
  }
}

async function resumePersistedBatchJobs() {
  await runtimeStateReady;
  const tabs = await chrome.tabs.query({});
  const liveTabIds = new Set(tabs.map((tab) => tab.id).filter((id) => id != null));
  for (const [tabId] of __batchJobsByTab.entries()) {
    if (!liveTabIds.has(tabId)) {
      clearTabRuntimeState(tabId);
      continue;
    }
    const job = getPersistedBatchJob(tabId);
    if (!job || !job.items?.length) continue;
    __batchCancelByTab.set(tabId, false);
    __batchAbortByTab.set(tabId, new AbortController());
    await processBatchJob({ tabId, restored: true, ...job });
  }
}

async function addMetricsSample(cfg, sample) {
  try {
    const local = await chrome.storage.local.get({ metrics: {} });
    const metrics = (local && typeof local.metrics === "object" && local.metrics) ? local.metrics : {};
    const now = Date.now();
    const provider = String(sample?.provider || cfg?.provider || "unknown");
    const model = String(
      sample?.model ||
      ((provider === "local_ollama" || provider === "local_openai")
        ? (cfg?.localModel || cfg?.model || "")
        : (cfg?.model || ""))
    );
    const ok = !!sample?.ok;
    const ms = Math.max(0, Number(sample?.ms || 0));
    const mode = String(sample?.mode || "both");
    const source = String(sample?.source || "manual");
    const key = `${provider}::${model}`;

    metrics.total = metrics.total || { calls: 0, ok: 0, error: 0, totalMs: 0 };
    metrics.total.calls += 1;
    metrics.total.totalMs += ms;
    if (ok) metrics.total.ok += 1; else metrics.total.error += 1;

    metrics.byProviderModel = metrics.byProviderModel || {};
    const pm = metrics.byProviderModel[key] || { provider, model, calls: 0, ok: 0, error: 0, totalMs: 0, lastAt: 0, lastError: "" };
    pm.calls += 1;
    pm.totalMs += ms;
    pm.lastAt = now;
    if (ok) pm.ok += 1;
    else {
      pm.error += 1;
      pm.lastError = String(sample?.error || "");
    }
    metrics.byProviderModel[key] = pm;

    metrics.bySource = metrics.bySource || {};
    const src = metrics.bySource[source] || { calls: 0, ok: 0, error: 0 };
    src.calls += 1;
    if (ok) src.ok += 1; else src.error += 1;
    metrics.bySource[source] = src;

    metrics.byMode = metrics.byMode || {};
    const md = metrics.byMode[mode] || { calls: 0, ok: 0, error: 0 };
    md.calls += 1;
    if (ok) md.ok += 1; else md.error += 1;
    metrics.byMode[mode] = md;

    metrics.updatedAt = nowIso();
    await chrome.storage.local.set({ metrics });
  } catch (_) {}
}

async function autoApplyAttachmentWithRetry(tabId, payload, { attempts = 10, delayMs = 220 } = {}) {
  let lastRes = null;
  for (let i = 0; i < attempts; i++) {
    try {
      lastRes = await chrome.tabs.sendMessage(tabId, payload);
      const applied = lastRes?.applied || {};
      const mode = String(payload?.generateMode || "both");
      const expected = mode === "caption"
        ? ["leyenda"]
        : mode === "alt"
          ? ["alt", "title"]
          : ["alt", "title", "leyenda"];
      const ok = !!lastRes?.ok && expected.every((key) => applied[key] === true);
      if (ok) return { ok: true, attempts: i + 1, response: lastRes };
    } catch (err) {
      lastRes = { ok: false, error: err?.message || String(err) };
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { ok: false, attempts, response: lastRes };
}

if (chrome?.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== "MACA_SET_LAST_CANDIDATE") return;
    const tabId = sender?.tab?.id;
    if (tabId == null) return;
    if (msg.candidate && msg.candidate.imageUrl) {
      __lastCandidateByTab.set(tabId, {
        imageUrl: msg.candidate.imageUrl,
        filenameContext: msg.candidate.filenameContext || "",
        at: Number(msg.at) || Date.now()
      });
      scheduleRuntimeStatePersist();
    } else {
      __lastCandidateByTab.delete(tabId);
      scheduleRuntimeStatePersist();
    }
  });
}

// Keep menu visibility in sync right before showing.
if (chrome?.contextMenus?.onShown?.addListener) {
  chrome.contextMenus.onShown.addListener((info, tab) => {
    (async () => {
      try {
        ensureMenu();
        const pageUrl = info?.pageUrl || tab?.url || "";
        const inWp = isWpAdminUrl(pageUrl);
        const cfg = await getConfigCached().catch(() => DEFAULT_SYNC_CFG);
        const visible = inWp && cfg?.extensionEnabled !== false;
        chrome.contextMenus.update(MENU_ID_NORMAL, { visible }, () => {
          void chrome.runtime.lastError;
        });
        chrome.contextMenus.refresh?.();
      } catch (_) {
        // ignore
      }
    })();
  });
}

// Some Chromium forks / older versions may not expose certain runtime events.
// Guard all event wiring to avoid crashing the service worker on startup.
if (chrome?.runtime?.onInstalled?.addListener) {
  chrome.runtime.onInstalled.addListener(() => {
    __menuEnsured = false;
    ensureMenu();
  });
}

if (chrome?.tabs?.onRemoved?.addListener) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    clearTabRuntimeState(tabId);
    scheduleRuntimeStatePersist();
  });
}

if (chrome?.runtime?.onStartup?.addListener) {
  chrome.runtime.onStartup.addListener(() => ensureMenu());
}

runtimeStateReady.then(async () => {
  await resumePersistedAutoUploadJobs();
  await resumePersistedBatchJobs();
  await resumePersistedManualJobs({
    getPersistedManualJob,
    clearTabRuntimeState,
    scheduleRuntimeStatePersist,
    runOverlayAnalysisJob: (job) => runOverlayAnalysisJob({
      ...job,
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
    })
  });
}).catch(() => {});

// Nota: usamos chrome.contextMenus.onShown *solo si existe* (en algunos forks no está).

if (chrome?.contextMenus?.onClicked?.addListener) chrome.contextMenus.onClicked.addListener((info, tab) => {
  (async () => {
    // Some Chromium variants may omit `tab` here; fallback to active tab.
    let t = tab;
    if (!t?.id) {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        t = (tabs && tabs[0]) ? tabs[0] : t;
      } catch (_) {}
    }
    if (!t?.id) return;

    const tabId = t.id;
    const pageUrl = t.url || info?.pageUrl || "";
    const jobId = crypto.randomUUID();


    if (info.menuItemId === MENU_ID_NORMAL) {
      const inWp = isWpAdminUrl(t.url || info?.pageUrl || "");

      if (!inWp) {
        await ensureOverlayInjected(tabId);
        await sendOverlay(tabId, {
          type: "MACA_OVERLAY_ERROR",
          jobId,
          error: "maca está limitada a WordPress (wp-admin)."
        });
        return;
      }

      let imgUrl = info.srcUrl || "";
      let filenameContext = "";

      if (inWp && !imgUrl) {
        // Prefer the candidate pushed by the content script (works reliably inside iframes).
        const pushed = __lastCandidateByTab.get(tabId);
        if (pushed?.imageUrl) {
          imgUrl = pushed.imageUrl;
          filenameContext = pushed.filenameContext || "";
        } else {
          // Fallback to polling the content script (older builds / edge cases).
          let candidate = null;
          try {
            candidate = await chrome.tabs.sendMessage(tabId, { type: "MACA_GET_LAST_CANDIDATE" });
          } catch (_) {
            candidate = null;
          }
          imgUrl = candidate?.ok ? candidate.imageUrl : "";
          filenameContext = candidate?.ok ? (candidate.filenameContext || "") : "";
        }
      }

      if (!imgUrl) {
        // Should not happen outside wp-admin (menu won't show), but be safe.
        await ensureOverlayInjected(tabId);
        await sendOverlay(tabId, {
          type: "MACA_OVERLAY_ERROR",
          jobId,
          error: "No he encontrado una imagen en ese elemento."
        });
        return;
      }
      const cfg = await getConfigCached();
      await runOverlayAnalysisJob({
        jobId,
        tabId,
        pageUrl,
        imgUrl,
        filenameContext,
        source: "contextmenu",
        withCaptionSignature: !!cfg.contextMenuUseSignature,
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
      });
      return;
    }
  })();
});

// =========================
// Shared analysis pipeline (WP button + context menu)
// =========================

async function analyzeImage({
  imageUrl,
  filenameContext,
  pageUrl,
  withCaptionSignature = false,
  modeOverride = "",
  styleOverride = "",
  tabId = null,
  abortSignal = null,
  source = "manual",
  jobId = ""
}) {
  if (!isWpAdminUrl(pageUrl || "")) {
    throw new Error("maca está limitada a WordPress (wp-admin).");
  }
  if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
    throw new Error("URL de imagen no soportada por seguridad.");
  }

  const startedAt = Date.now();
  const cfg = await getConfigCached();
  if (cfg?.extensionEnabled === false) {
    throw new Error("maca está desactivada en ajustes rápidos.");
  }
  const selectedModel = (cfg.provider === "local_ollama" || cfg.provider === "local_openai")
    ? (cfg.localModel || cfg.model || "")
    : cfg.model;
  const mode = String(modeOverride || cfg.generateMode || "both"); // both | alt | caption
  const sessionContext = getSessionContextForTab(tabId);
  await logJobEvent(cfg, "analyze_start", {
    jobId,
    phase: "start",
    provider: cfg.provider,
    model: cfg.model,
    mode: String(modeOverride || cfg.generateMode || "both"),
    styleOverride: String(styleOverride || ""),
    pageHost: safeHost(pageUrl),
    imageUrl,
    filenameContext: String(filenameContext || ""),
    sessionContext
  });

  const isLocal = cfg.provider === "local_ollama" || cfg.provider === "local_openai";
  if (!isLocal && !cfg.apiKey) {
    throw new Error("Falta la API key. Ve a Opciones.");
  }

  const { dataUrl, mime } = await toBase64DataUrlFromUrl(imageUrl, abortSignal);

  const contextBlock = buildFilenameContextBlock({ filenameContext, imageUrl });

  const altMaxLength = Number.isFinite(Number(cfg.altMaxLength)) ? Number(cfg.altMaxLength) : 125;
  const avoidImagePrefix = (cfg.avoidImagePrefix !== undefined) ? !!cfg.avoidImagePrefix : true;

  const allowDecorativeAltEmpty = (cfg.allowDecorativeAltEmpty !== undefined) ? !!cfg.allowDecorativeAltEmpty : false;
  const captionTemplateEnabled = (cfg.captionTemplateEnabled !== undefined) ? !!cfg.captionTemplateEnabled : false;
  const captionTemplate = String(cfg.captionTemplate || "{{caption}}");
  const captionSignatureText = getActiveSignatureText(cfg);

  const usingCustomPrompt = !!(cfg.prompt && cfg.prompt.trim());
  let basePrompt = usingCustomPrompt ? cfg.prompt : getPromptForProfile(cfg.seoProfile);
  const useOpenRouterGlm = isOpenRouterGlm(cfg.provider, selectedModel);
  const sectionStyleBlock = getSectionStyleBlock(cfg?.sectionStyleProfile);
  const toneOverrideBlock = getToneOverrideBlock(styleOverride);
  const requestOptions = (opts) => {
    if (!abortSignal) return opts;
    return { ...(opts || {}), signal: abortSignal };
  };

  // Only rewrite the *default* prompt. If the user wrote a custom prompt, respect it.
  if (!usingCustomPrompt) {
    basePrompt = adjustDefaultPromptForModeAndSeo(basePrompt, { mode, altMaxLength, avoidImagePrefix });
    if (useOpenRouterGlm) {
      basePrompt = `${basePrompt}\n\n${getOpenRouterGlmQualityPrompt(mode)}`;
    }
  }

  const finalPrompt =
    contextBlock +
    buildSessionContextBlock(sessionContext) +
    (sectionStyleBlock ? `\n${sectionStyleBlock}\n` : "") +
    (toneOverrideBlock ? `\n${toneOverrideBlock}\n` : "") +
    getSpanishLocaleGuard(getEffectiveLang(cfg)) +
    renderPrompt(basePrompt, {
      LANG: getEffectiveLang(cfg),
      PAGE_URL: pageUrl || "",
      IMG_URL: imageUrl
    });

  const rawOutput = await runProviderAnalysis({
    cfg,
    finalPrompt,
    dataUrl,
    mime,
    mode,
    fetchWithTimeout,
    abortSignal,
    addDebugLog
  });

  if (!String(rawOutput || "").trim()) {
    throw new Error("La IA devolvió una respuesta vacía.");
  }

  const parsed = normalizeModelJson(rawOutput);
  if (!parsed) {
    throw new Error("La IA no devolvió JSON válido.");
  }


  const decorative = !!parsed?.decorativa;

  // Validate based on selected mode
  const altProvided = typeof parsed?.alt === "string" && parsed.alt.trim().length > 0;
  const titleProvided = typeof parsed?.title === "string" && parsed.title.trim().length > 0;
  const captionProvided = typeof parsed?.leyenda === "string" && parsed.leyenda.trim().length > 0;

  const altAllowedEmpty = allowDecorativeAltEmpty && decorative;

  if (mode === "alt") {
    if (!altProvided && !altAllowedEmpty) throw new Error("La IA no devolvió un ALT válido.");
  } else if (mode === "caption") {
    if (!captionProvided) throw new Error("La IA no devolvió una leyenda válida.");
  } else {
    if ((!altProvided && !altAllowedEmpty) || !captionProvided) {
      throw new Error("La IA no devolvió JSON válido con {alt, leyenda}.");
    }
  }

  let altFinal = altProvided ? normalizeAltText(parsed.alt, altMaxLength, avoidImagePrefix) : "";
  let titleFinal = normalizeTitleText(
    titleProvided
      ? parsed.title
      : (altFinal || "")
  );
  let leyendaFinal = captionProvided ? normalizeCaptionText(parsed.leyenda) : "";

  // Apply caption template if enabled and we have a caption
  if (leyendaFinal && captionTemplateEnabled) {
    const vars = {
      caption: leyendaFinal,
      alt: altFinal,
      filename: String(filenameContext || ""),
      site: safeHost(pageUrl),
      date: new Date().toISOString().slice(0, 10)
    };
    leyendaFinal = normalizeCaptionText(renderSimpleTemplate(captionTemplate, vars));
  }

  if (withCaptionSignature && leyendaFinal && captionSignatureText) {
    leyendaFinal = normalizeCaptionText(`${leyendaFinal} ${captionSignatureText}`);
  }

  if (cfg.provider === "openrouter") {
    if (altFinal) {
      // Keep user's explicit preference to avoid generic image prefix.
      const noPrefixAlt = normalizeAltText(altFinal, altMaxLength, avoidImagePrefix);
      if (noPrefixAlt) {
        // eslint-disable-next-line no-param-reassign
        altFinal = ensureAltTrailingPeriodWithinLimit(noPrefixAlt, altMaxLength);
      }
    }
    if (!titleFinal && altFinal) {
      titleFinal = normalizeTitleText(altFinal, { minWords: 2, maxWords: 6 });
    } else {
      titleFinal = normalizeTitleText(titleFinal, { minWords: 2, maxWords: 8 });
    }
    if (leyendaFinal) leyendaFinal = ensureTrailingPeriod(leyendaFinal);
  }

  const secondPass = runSecondPassQuality({
    mode,
    alt: altFinal,
    title: titleFinal,
    leyenda: leyendaFinal,
    cfg
  });
  altFinal = secondPass.alt;
  titleFinal = secondPass.title;
  leyendaFinal = secondPass.leyenda;

  if (mode === "alt" && !altFinal && !altAllowedEmpty) throw new Error("La IA no devolvió un ALT válido.");
  if (mode === "caption" && !leyendaFinal) throw new Error("La IA no devolvió una leyenda válida.");
  if (mode === "both" && ((!altFinal && !altAllowedEmpty) || !leyendaFinal)) {
    throw new Error("La IA no devolvió un ALT/leyenda válidos.");
  }

  const validated = applyPostValidation(cfg, {
    mode,
    alt: altFinal,
    title: titleFinal,
    leyenda: leyendaFinal,
    decorative,
    altAllowedEmpty
  });
  altFinal = validated.alt;
  const titleValidated = validated.title;
  leyendaFinal = validated.leyenda;
  const seoReview = buildSeoReview({
    mode,
    alt: altFinal,
    title: titleValidated,
    leyenda: leyendaFinal,
    cfg,
    altAllowedEmpty
  });

  const record = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    time: nowIso(),
    mode: mode,
    site: safeHost(pageUrl),
    alt: altFinal,
    title: titleValidated,
    leyenda: leyendaFinal,
    seoReview,
    decorativa: decorative,
    source: "contextmenu",
    provider: cfg.provider,
    model: (cfg.provider === "local_ollama" || cfg.provider === "local_openai")
      ? (cfg.localModel || cfg.model || "")
      : cfg.model,
    imgUrl: imageUrl,
    pageUrl: pageUrl || ""
  };

  if (cfg.historyEnabled === false) {
    // User disabled history: keep lastJob for convenience, but do not grow the history array.
    await chrome.storage.local.set({ lastJob: record });
  } else {
    const stored = await chrome.storage.local.get({ history: [] });
    const limit = Number.isFinite(Number(cfg.historyLimit)) ? Number(cfg.historyLimit) : 20;
    const history = clampHistory([record, ...(stored.history || [])], limit);

    // Persist defensively: if the user selected "unlimited" and the quota is exceeded,
    // fall back to a smaller history rather than failing the whole flow.
    await new Promise((resolve) => {
      chrome.storage.local.set({ history, lastJob: record }, () => {
        if (!chrome.runtime.lastError) return resolve();
        // Quota exceeded or other storage issue: retry with a smaller cap.
        const fallback = clampHistory(history, 50);
        chrome.storage.local.set({ history: fallback, lastJob: record }, () => resolve());
      });
    });
  }

  const ms = Date.now() - startedAt;
  await logJobEvent(cfg, "analyze_done", {
    jobId,
    phase: "done",
    source,
    provider: cfg.provider,
    model: selectedModel,
    ms
  });
  await addMetricsSample(cfg, {
    ok: true,
    ms,
    mode,
    source,
    provider: cfg.provider,
    model: selectedModel
  });
  return {
    alt: record.alt,
    title: record.title,
    leyenda: record.leyenda,
    seoReview: record.seoReview,
    decorativa: record.decorativa
  };
}

// =========================
// Config test (Options page)
// =========================

async function testCurrentConfig() {
  const cfg = await getConfigCached({ force: true });
  const provider = String(cfg.provider || "openai");
  const model = (provider === "local_ollama" || provider === "local_openai")
    ? (cfg.localModel || cfg.model || "").trim()
    : String(cfg.model || "").trim();

  const warnings = [];

  if (!provider) throw new Error("Proveedor no configurado");
  if (!model && provider !== "local_ollama") warnings.push("No hay modelo configurado.");

  const okRes = (details = {}) => ({ ok: true, provider, model, warnings, details });
  if (["openai", "gemini", "openrouter", "anthropic", "groq"].includes(provider) && !cfg.apiKey) {
    throw new Error(`Falta la API key (${provider === "openai" ? "OpenAI" : provider}). Ve a Opciones.`);
  }

  const details = await runProviderConfigTest({ cfg, provider, model, fetchWithTimeout });
  if (provider === "openai") {
    if (model && details.ids?.length && !details.found) {
      warnings.push("El modelo seleccionado no aparece en /v1/models. Aun así podría funcionar si es un alias o un modelo restringido.");
    }
    return okRes({ modelsListed: details.ids?.length || 0, modelFound: !!details.found });
  }
  if (provider === "local_ollama") {
    if (model && details.tagsListed && !details.modelFound) {
      warnings.push("El modelo local no aparece en /api/tags. Aun así podría funcionar si Ollama lo descarga bajo demanda.");
    }
  }
  return okRes(details);
}

if (chrome?.runtime?.onMessage?.addListener) chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return;

  if (msg.type === "MACA_SET_SESSION_CONTEXT") {
    const tabId = sender?.tab?.id;
    setSessionContextForTab(tabId, msg?.context || "");
    sendResponse({ ok: true, context: getSessionContextForTab(tabId) });
    return true;
  }

  if (msg.type === "MACA_GET_SESSION_CONTEXT") {
    const tabId = sender?.tab?.id;
    sendResponse({ ok: true, context: getSessionContextForTab(tabId) });
    return true;
  }

  if (msg.type === "MACA_GET_ACTIVE_SIGNATURE") {
    (async () => {
      try {
        const cfg = await getConfigCached();
        const list = normalizeSignatureList(cfg?.captionSignatures, cfg?.captionSignatureText);
        if (!list.length) {
          sendResponse({ ok: true, text: "", id: "", name: "" });
          return;
        }
        const activeId = String(cfg?.activeCaptionSignatureId || "").trim();
        const active = list.find((x) => x.id === activeId) || list[0];
        sendResponse({
          ok: true,
          text: String(active?.text || "").trim(),
          id: String(active?.id || ""),
          name: String(active?.name || "")
        });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err), text: "", id: "", name: "" });
      }
    })();
    return true;
  }

  // 1) Analysis (used by WP button)
  if (msg.type === "MACA_ANALYZE_IMAGE") {
    (async () => {
      const startedAt = Date.now();
      const tabId = sender?.tab?.id ?? null;
      const pageUrl = sender.tab?.url || "";
      const jobId = String(msg?.jobId || crypto.randomUUID());
      try {
        const cfg = await getConfigCached();
        const imageUrl = msg.imageUrl;
        const filenameContext = msg.filenameContext || "";
        rememberManualJob(tabId, {
          jobId,
          source: "overlay_manual",
          imageUrl,
          filenameContext,
          pageUrl,
          withCaptionSignature: !!cfg.contextMenuUseSignature,
          styleOverride: String(msg?.styleOverride || "")
        });
        scheduleRuntimeStatePersist();

        const { alt, title, leyenda, seoReview, decorativa } = await analyzeImage({
          imageUrl,
          filenameContext,
          pageUrl,
          tabId,
          withCaptionSignature: !!cfg.contextMenuUseSignature,
          styleOverride: String(msg?.styleOverride || ""),
          source: "overlay_manual",
          jobId
        });

        sendResponse({ alt, title, leyenda, seoReview, decorativa });
      } catch (err) {
        const cfg = await getConfigCached().catch(() => ({}));
        await addMetricsSample(cfg, {
          ok: false,
          ms: Date.now() - startedAt,
          mode: String(cfg?.generateMode || "both"),
          source: "overlay_manual",
          error: err?.message || String(err)
        });
        sendResponse({ error: err.message || String(err) });
      } finally {
        forgetManualJob(tabId);
        scheduleRuntimeStatePersist();
      }
    })();

    return true;
  }

  // 1b) Regenerate from overlay (same image)
  if (msg.type === "MACA_REGENERATE") {
    (async () => {
      const startedAt = Date.now();
      const tabId = sender?.tab?.id ?? null;
      const jobId = String(msg?.jobId || crypto.randomUUID());
      try {
        const cfg = await getConfigCached();
        const imageUrl = msg.imageUrl;
        const filenameContext = msg.filenameContext || "";
        const pageUrl = msg.pageUrl || sender.tab?.url || "";
        rememberManualJob(tabId, {
          jobId,
          source: "overlay_regenerate",
          imageUrl,
          filenameContext,
          pageUrl,
          withCaptionSignature: !!cfg.contextMenuUseSignature,
          styleOverride: String(msg?.styleOverride || "")
        });
        scheduleRuntimeStatePersist();
        const { alt, title, leyenda, seoReview, decorativa } = await analyzeImage({
          imageUrl,
          filenameContext,
          pageUrl,
          tabId,
          withCaptionSignature: !!cfg.contextMenuUseSignature,
          styleOverride: String(msg?.styleOverride || ""),
          source: "overlay_regenerate",
          jobId
        });
        sendResponse({ alt, title, leyenda, seoReview, decorativa });
      } catch (err) {
        const cfg = await getConfigCached().catch(() => ({}));
        await addMetricsSample(cfg, {
          ok: false,
          ms: Date.now() - startedAt,
          mode: String(cfg?.generateMode || "both"),
          source: "overlay_regenerate",
          error: err?.message || String(err)
        });
        sendResponse({ error: err?.message || String(err) });
      } finally {
        forgetManualJob(tabId);
        scheduleRuntimeStatePersist();
      }
    })();
    return true;
  }

  // 2) Clipboard sequence (ALT then caption) - makes two OS clipboard entries
  if (msg.type === "MACA_COPY_SEQUENCE") {
    (async () => {
      try {
        const texts = Array.isArray(msg.texts) ? msg.texts : [];
        const delayMs = Number.isFinite(msg.delayMs) ? msg.delayMs : 260;
        const res = await copySequenceToClipboard(texts, delayMs);
        sendResponse(res);
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();

    return true;
  }

  // 2b) Auto-process a just-uploaded attachment in WP (experimental)
  if (msg.type === "MACA_AUTO_PROCESS_ATTACHMENT") {
    (async () => {
      await processAutoUploadAttachmentRequest({
        tabId: sender?.tab?.id,
        pageUrl: sender?.tab?.url || msg?.pageUrl || "",
        attachmentId: String(msg?.attachmentId || ""),
        imageUrl: String(msg?.imageUrl || ""),
        filenameContext: String(msg?.filenameContext || ""),
        trigger: String(msg?.trigger || "upload"),
        sendResponse
      });
    })();
    return true;
  }

  if (msg.type === "MACA_AUTO_UPLOAD_CANCEL") {
    const tabId = sender?.tab?.id;
    if (tabId != null) {
      __autoUploadCancelByTab.set(tabId, true);
      __autoUploadPausedByTab.delete(tabId);
      scheduleRuntimeStatePersist();
      const st = getAutoUploadStats(tabId);
      if (Number(st.done || 0) >= Number(st.queued || 0)) {
        __autoUploadCancelByTab.delete(tabId);
        scheduleRuntimeStatePersist();
      }
      sendAutoUploadProgress(tabId, {
        phase: (Number(st.done || 0) >= Number(st.queued || 0)) ? "cancelled" : "cancel_request",
        queued: st.queued,
        done: st.done,
        ok: st.ok,
        error: st.error
      }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "MACA_AUTO_UPLOAD_PAUSE") {
    const tabId = sender?.tab?.id;
    if (tabId != null) {
      __autoUploadPausedByTab.set(tabId, true);
      scheduleRuntimeStatePersist();
      const st = getAutoUploadStats(tabId);
      sendAutoUploadProgress(tabId, {
        phase: "paused",
        queued: st.queued,
        done: st.done,
        ok: st.ok,
        error: st.error
      }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "MACA_AUTO_UPLOAD_RESUME") {
    const tabId = sender?.tab?.id;
    if (tabId != null) {
      __autoUploadPausedByTab.delete(tabId);
      scheduleRuntimeStatePersist();
      const st = getAutoUploadStats(tabId);
      sendAutoUploadProgress(tabId, {
        phase: "resumed",
        queued: st.queued,
        done: st.done,
        ok: st.ok,
        error: st.error
      }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }


  // 2c) Batch process selected WP media items (overlay button)
  if (msg.type === "MACA_BATCH_PROCESS_SELECTED") {
    (async () => {
      const tabId = sender?.tab?.id;
      try {
        if (tabId == null) throw new Error("No hay pestaña activa.");
        __batchCancelByTab.set(tabId, false);
        const batchAbort = new AbortController();
        __batchAbortByTab.set(tabId, batchAbort);
        scheduleRuntimeStatePersist();
        const sel = await chrome.tabs.sendMessage(tabId, { type: "MACA_GET_SELECTED_ATTACHMENTS" });
        const items = Array.isArray(sel?.items) ? sel.items : [];
        if (!items.length) throw new Error("No se detectaron imágenes seleccionadas.");
        await processBatchJob({ tabId, pageUrl: sender.tab?.url || "", items, sendResponse });
      } catch (err) {
        const cfg = await getConfigCached().catch(() => ({}));
        await addDebugLog(cfg, "batch_error", { error: err?.message || String(err) });
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (msg.type === "MACA_BATCH_CANCEL") {
    const tabId = sender?.tab?.id;
    if (tabId != null) {
      __batchCancelByTab.set(tabId, true);
      scheduleRuntimeStatePersist();
    }
    const ctl = tabId != null ? __batchAbortByTab.get(tabId) : null;
    try { ctl?.abort(); } catch (_) {}
    sendResponse({ ok: true });
    return true;
  }


  // 3) Test configuration (Options page)
  if (msg.type === "MACA_TEST_CONFIG") {
    (async () => {
      try {
        const res = await testCurrentConfig();
        sendResponse(res);
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }
});

function normalizeModelJson(text) {
  if (!text) return null;
  const raw = String(text).trim();
  const toDecorativeBool = (v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "true") return true;
      if (s === "false") return false;
    }
    return false;
  };

  let obj = safeJsonParse(raw);
  const pickTitle = (o) => {
    if (!o || typeof o !== "object") return "";
    if (o.title != null) return String(o.title);
    if (o.titulo != null) return String(o.titulo);
    return "";
  };
  if (obj && (obj.alt != null || obj.leyenda != null || obj.title != null || obj.titulo != null)) {
    return {
      alt: obj.alt != null ? String(obj.alt) : "",
      title: pickTitle(obj),
      leyenda: obj.leyenda != null ? String(obj.leyenda) : "",
      decorativa: toDecorativeBool(obj.decorativa)
    };
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    obj = safeJsonParse(fenced[1].trim());
    if (obj && (obj.alt != null || obj.leyenda != null || obj.title != null || obj.titulo != null)) {
      return {
        alt: obj.alt != null ? String(obj.alt) : "",
        title: pickTitle(obj),
        leyenda: obj.leyenda != null ? String(obj.leyenda) : "",
        decorativa: toDecorativeBool(obj.decorativa)
      };
    }
  }

  const brace = raw.match(/\{[\s\S]*?\}/);
  if (brace?.[0]) {
    obj = safeJsonParse(brace[0]);
    if (obj && (obj.alt != null || obj.leyenda != null || obj.title != null || obj.titulo != null)) {
      return {
        alt: obj.alt != null ? String(obj.alt) : "",
        title: pickTitle(obj),
        leyenda: obj.leyenda != null ? String(obj.leyenda) : "",
        decorativa: toDecorativeBool(obj.decorativa)
      };
    }
  }

  return null;
}
