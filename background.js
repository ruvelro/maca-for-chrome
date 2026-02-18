import {
  nowIso,
  clampHistory,
  safeJsonParse,
  fetchWithTimeout,
  normalizeEndpoint,
  isAllowedImageUrl,
  normalizeAltText,
  normalizeCaptionText,
  pickOutputTextFromOpenAIResponse,
  toBase64DataUrlFromUrl,
  renderPrompt
} from "./util.js";

import { getPromptForProfile } from "./prompts.js";


// =========================
// Config cache (MV3 SW lifecycle)
// =========================
const DEFAULT_SYNC_CFG = {
  language: "es-ES",
  // If enabled, force Spanish (Spain) regardless of the page.
  languageAutoEsEs: false,
  seoProfile: "blog",
  wpAutoApply: false,
  wpAutoApplyRequireMedia: true,
  wpAutoAnalyzeOnUpload: false,
  autoAnalyzeOnSelectMedia: false,
  autoDeselectProcessedOnAutoFill: false,
  onCompleteAction: "none", // none | minimize | close
  // Where to apply the "onCompleteAction" behaviour.
  // - "wp": only in wp-admin (recommended)
  // - "all": any website
  onCompleteScope: "wp",
  historyLimit: 20, // 0 => unlimited (until Chrome storage quota)
  historyEnabled: true,
  // Generation controls
  generateMode: "both", // both | alt | caption
  altMaxLength: 125, // 0 => unlimited
  avoidImagePrefix: true,
  // Allow ALT to be empty only when the model marks the image as decorative.
  allowDecorativeAltEmpty: false,
  // Caption template
  captionTemplateEnabled: false,
  captionTemplate: "{{caption}}",
  captionSignatureText: "",
  autoCaptionSignatureOnAutoFill: false,
  autoQueueModeVisible: true,
  autoUploadSafetyFuseEnabled: true,
  autoUploadSafetyFuseMaxQueued: 24,
  postValidationEnabled: false,
  postValidationRejectGeneric: true,
  postValidationTitleMinWords: 2,
  postValidationTitleMaxWords: 8,
  postValidationAltMinChars: 0,
  postValidationCaptionMinChars: 0,
  // Debug
  debugEnabled: false,
  shortcutEnabled: false,
  // If true, store and read apiKey from chrome.storage.sync (Google account)
  // instead of chrome.storage.local (this device).
  syncApiKey: false,
  provider: "openai",
  model: "gpt-5-mini",
  prompt: "",
  localEndpoint: "",
  localModel: ""
};
const DEFAULT_LOCAL_CFG = { apiKey: "", metrics: {} };

let _cfgCache = null;
let _cfgCachePromise = null;

/** Read config from chrome.storage and merge sync+local. */
async function readConfigFromStorage() {
  // IMPORTANT: use get(null) so newly-added keys are returned.
  // Then merge with defaults for stable behaviour.
  const syncStored = await chrome.storage.sync.get(null);
  const syncCfg = { ...DEFAULT_SYNC_CFG, ...(syncStored || {}) };
  const localCfg = await chrome.storage.local.get(DEFAULT_LOCAL_CFG);

  // API key can live either in sync or local storage (user option).
  const apiKeySync = (syncStored?.apiKey || "");
  const apiKeyLocal = (localCfg?.apiKey || "");
  let apiKey = syncCfg.syncApiKey ? apiKeySync : apiKeyLocal;
  // Compatibility fallback: if the chosen store is empty but the other has a key,
  // use whichever is available. This prevents "missing key" surprises.
  if (!apiKey) apiKey = apiKeySync || apiKeyLocal || "";

  // Merge all other config keys, but force the effective apiKey.
  return { ...syncCfg, ...localCfg, apiKey };
}

/**
 * Return cached config to reduce repeated storage reads while the service worker is alive.
 * Cache is kept coherent via chrome.storage.onChanged.
 */
async function getConfigCached({ force = false } = {}) {
  if (!force && _cfgCache) return _cfgCache;
  if (_cfgCachePromise) return await _cfgCachePromise;

  _cfgCachePromise = (async () => {
    const cfg = await readConfigFromStorage();
    _cfgCache = cfg;
    return cfg;
  })();

  try {
    return await _cfgCachePromise;
  } finally {
    _cfgCachePromise = null;
  }
}

// Keep cache coherent when options change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" && area !== "local") return;

  // If cache isn't populated yet, nothing to update.
  if (!_cfgCache) return;

  const allowedKeys = new Set([
    ...Object.keys(DEFAULT_SYNC_CFG),
    ...Object.keys(DEFAULT_LOCAL_CFG)
  ]);

  for (const [key, change] of Object.entries(changes || {})) {
    // Special handling: switching where apiKey is stored affects how we should read it.
    if (key === "syncApiKey") {
      _cfgCache = null;
      return;
    }

    // Special handling: apiKey may live in sync or local depending on syncApiKey.
    if (key === "apiKey") {
      const useSync = _cfgCache.syncApiKey === true;
      const shouldApply = (area === "sync" && useSync) || (area === "local" && !useSync);
      if (shouldApply) {
        const nv = change?.newValue;
        _cfgCache.apiKey = (nv === undefined || nv === null) ? "" : String(nv);
      }
      continue;
    }

    // Avoid polluting the cache with non-config keys (history, debugLog, etc.)
    if (!allowedKeys.has(key)) continue;
    if (change && "newValue" in change) {
      const nv = change.newValue;
      if (nv === undefined) {
        // Fallback to defaults when a key is removed
        if (key in DEFAULT_SYNC_CFG) _cfgCache[key] = DEFAULT_SYNC_CFG[key];
        else if (key in DEFAULT_LOCAL_CFG) _cfgCache[key] = DEFAULT_LOCAL_CFG[key];
        else delete _cfgCache[key];
      } else {
        _cfgCache[key] = nv;
      }
    }
  }
});


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
// Local provider helpers
// =========================

function buildOpenAICompatUrl(endpoint) {
  const ep = normalizeEndpoint(endpoint);
  if (!ep) return "";

  // If user already provided a full endpoint, keep it.
  if (/(\/chat\/completions|\/responses)$/.test(ep)) return ep;

  // If endpoint ends with /v1, assume chat/completions.
  if (/\/v1$/.test(ep)) return `${ep}/chat/completions`;

  // If endpoint already contains /v1/, keep as-is (user likely provided full path).
  if (/\/v1\//.test(ep)) return ep;

  // Otherwise, assume base URL and append the OpenAI-compatible path.
  return `${ep}/v1/chat/completions`;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch (_) {
    try {
      const txt = await res.text();
      return { message: txt };
    } catch (__)
    {
      return {};
    }
  }
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
  const outLines =
    m === "alt"
      ? ["ALT: <texto final>", "TITLE: <texto final breve>"]
      : (m === "caption"
        ? ["LEYENDA: <frase final breve>"]
        : ["ALT: <texto final>", "TITLE: <texto final breve (3-6 palabras)>", "LEYENDA: <frase final breve>"]);
  return [
    "MODO CALIDAD (OpenRouter/GLM):",
    "- Describe SOLO lo visible en la imagen, sin inventar.",
    "- Evita frases genéricas como: \"pantalla encendida\", \"contenido multimedia\", \"imagen de\", \"foto de\".",
    "- ALT: 90-125 caracteres, descriptivo y concreto.",
    "- TITLE: 3-6 palabras, claro y natural.",
    "- LEYENDA: 1 frase editorial breve, con contexto visual.",
    "- No devuelvas razonamiento, pasos, ni explicaciones.",
    "- Devuelve SOLO la salida final en el formato solicitado.",
    ...outLines
  ].join("\n");
}

function ensureTrailingPeriod(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (/[.!?…]$/.test(s)) return s;
  return `${s}.`;
}

function ensureAltTrailingPeriodWithinLimit(text, maxLen) {
  let s = String(text || "").trim();
  if (!s) return "";
  if (/[.!?…]$/.test(s)) return s;
  const n = Number(maxLen);
  if (Number.isFinite(n) && n > 0 && (s.length + 1) > n) {
    s = s.slice(0, Math.max(0, n - 1)).trim();
  }
  return `${s}.`;
}

function pickTextFromOpenAICompat(json) {
  if (!json) return "";

  // Some servers implement the newer /v1/responses shape
  if (json.output) {
    try {
      return pickOutputTextFromOpenAIResponse(json);
    } catch (_) {
      // fall through
    }
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(p => p?.text || p?.content || "")
      .filter(Boolean)
      .join("\n");
  }

  return json?.choices?.[0]?.text || "";
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
// - Two entries:
//   1) Analyze normally.
//   2) Analyze and apply caption signature.
//
// IMPORTANT: We avoid removeAll/recreate cycles because they can race on MV3 wake-ups
// and cause "Cannot create item with duplicate id" in Chromium.
// =========================

const MENU_ID_NORMAL = "maca-analyze";
const MENU_ID_SIGNED = "maca-analyze-signed";

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
    chrome.contextMenus.create(
      {
        id: MENU_ID_SIGNED,
        title: "Analizar y rellenar con firma",
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

      // Show overlay immediately (loading state)
      await ensureOverlayInjected(tabId);
      await sendOverlay(tabId, {
        type: "MACA_OVERLAY_OPEN",
        jobId,
        imgUrl,
        pageUrl,
        generateMode: String(cfg.generateMode || "both"),
        wpAutoApply: !!cfg.wpAutoApply,
        wpAutoApplyRequireMedia: !!cfg.wpAutoApplyRequireMedia,
        autoCaptionSignatureOnAutoFill: !!cfg.autoCaptionSignatureOnAutoFill,
        onCompleteAction: resolveOnCompleteAction(cfg, pageUrl)
      });

      try {
        const { alt, title, leyenda, decorativa } = await analyzeImage({
          imageUrl: imgUrl,
          filenameContext,
          pageUrl,
          withCaptionSignature: !!cfg.wpAutoApply && !!cfg.autoCaptionSignatureOnAutoFill,
          source: "shortcut"
        });

        await sendOverlay(tabId, {
          type: "MACA_OVERLAY_RESULT",
          jobId,
          alt,
          title,
          leyenda
        });
      } catch (err) {
        await addMetricsSample(cfg, {
          ok: false,
          ms: 0,
          mode: String(cfg.generateMode || "both"),
          source: "shortcut",
          error: err?.message || String(err)
        });
        await sendOverlay(tabId, {
          type: "MACA_OVERLAY_ERROR",
          jobId,
          error: err?.message || String(err)
        });
      }
    })();
  });
}

// Cache of last right-click candidate per tab, pushed by the content script.
const __lastCandidateByTab = new Map();
const __autoUploadQueueByTab = new Map();
const __autoUploadSeenByTab = new Map();
const __autoUploadStatsByTab = new Map();
const __autoUploadCancelByTab = new Map();
const __autoUploadPausedByTab = new Map();
const __autoUploadPendingIdsByTab = new Map();
const __batchCancelByTab = new Map();
const __batchAbortByTab = new Map();

function wasRecentlyAutoProcessed(tabId, attachmentId, ttlMs = 5 * 60 * 1000) {
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

function markAutoProcessed(tabId, attachmentId) {
  if (tabId == null || !attachmentId) return;
  let byTab = __autoUploadSeenByTab.get(tabId);
  if (!byTab) {
    byTab = new Map();
    __autoUploadSeenByTab.set(tabId, byTab);
  }
  byTab.set(String(attachmentId), Date.now());
}

function unmarkAutoProcessed(tabId, attachmentId) {
  if (tabId == null || !attachmentId) return;
  const byTab = __autoUploadSeenByTab.get(tabId);
  if (!byTab) return;
  byTab.delete(String(attachmentId));
}

function enqueueAutoUploadJob(tabId, jobFn) {
  const prev = __autoUploadQueueByTab.get(tabId) || Promise.resolve();
  const next = prev.catch(() => {}).then(jobFn);
  __autoUploadQueueByTab.set(tabId, next);
  return next;
}

function getAutoPendingIds(tabId) {
  let list = __autoUploadPendingIdsByTab.get(tabId);
  if (!list) {
    list = [];
    __autoUploadPendingIdsByTab.set(tabId, list);
  }
  return list;
}

function enqueueAutoPendingId(tabId, attachmentId) {
  const id = String(attachmentId || "");
  if (!id) return;
  const list = getAutoPendingIds(tabId);
  if (!list.includes(id)) list.push(id);
}

function dequeueAutoPendingId(tabId, attachmentId) {
  const id = String(attachmentId || "");
  if (!id) return;
  const list = getAutoPendingIds(tabId);
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
}

function queuePreviewFromTab(tabId, maxLen = 8) {
  const list = getAutoPendingIds(tabId);
  return list.slice(0, Math.max(1, maxLen | 0));
}

async function waitIfAutoUploadPaused(tabId) {
  while (__autoUploadPausedByTab.get(tabId) === true) {
    if (__autoUploadCancelByTab.get(tabId) === true) throw new Error("AUTO_UPLOAD_CANCELLED");
    await new Promise((r) => setTimeout(r, 150));
  }
}

function getAutoUploadStats(tabId) {
  let s = __autoUploadStatsByTab.get(tabId);
  if (!s) {
    s = { queued: 0, done: 0, ok: 0, error: 0, startedAt: Date.now(), lastAt: Date.now() };
    __autoUploadStatsByTab.set(tabId, s);
  }
  s.lastAt = Date.now();
  return s;
}

function resetAutoUploadStatsLater(tabId, delayMs = 12000) {
  setTimeout(() => {
    const s = __autoUploadStatsByTab.get(tabId);
    if (!s) return;
    // Keep stats if there was recent activity.
    if ((Date.now() - Number(s.lastAt || 0)) < (delayMs - 500)) return;
    __autoUploadStatsByTab.delete(tabId);
  }, delayMs);
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

function shouldFallbackOpenRouterCompatibility(status, json) {
  if (status !== 400 && status !== 422) return false;
  const msg = String(
    json?.error?.message ||
    json?.error ||
    json?.message ||
    ""
  ).toLowerCase();
  return (
    msg.includes("response_format") ||
    msg.includes("json_schema") ||
    msg.includes("reasoning") ||
    msg.includes("provider") ||
    msg.includes("unsupported parameter") ||
    msg.includes("invalid parameter")
  );
}

function countWords(s) {
  const t = String(s || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function isGenericText(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return true;
  const banned = [
    "imagen de",
    "foto de",
    "escena principal de la imagen",
    "contenido multimedia",
    "imagen",
    "foto"
  ];
  return banned.includes(t);
}

function applyPostValidation(cfg, { mode, alt, title, leyenda, decorative, altAllowedEmpty }) {
  const enabled = !!cfg?.postValidationEnabled;
  if (!enabled) return { alt, title, leyenda };

  const rejectGeneric = !!cfg?.postValidationRejectGeneric;
  const titleMinWords = Number.isFinite(Number(cfg?.postValidationTitleMinWords)) ? Number(cfg.postValidationTitleMinWords) : 2;
  const titleMaxWords = Number.isFinite(Number(cfg?.postValidationTitleMaxWords)) ? Number(cfg.postValidationTitleMaxWords) : 8;
  const altMinChars = Number.isFinite(Number(cfg?.postValidationAltMinChars)) ? Number(cfg.postValidationAltMinChars) : 0;
  const captionMinChars = Number.isFinite(Number(cfg?.postValidationCaptionMinChars)) ? Number(cfg.postValidationCaptionMinChars) : 0;

  const m = String(mode || "both");
  const out = {
    alt: String(alt || ""),
    title: String(title || ""),
    leyenda: String(leyenda || "")
  };

  if (m !== "caption") {
    if (!altAllowedEmpty && altMinChars > 0 && out.alt.length < altMinChars) {
      throw new Error(`Validación: ALT demasiado corto (< ${altMinChars}).`);
    }
    if (rejectGeneric && out.alt && isGenericText(out.alt)) {
      throw new Error("Validación: ALT demasiado genérico.");
    }
    const tw = countWords(out.title);
    if (tw > 0 && tw < Math.max(1, titleMinWords)) {
      throw new Error(`Validación: title demasiado corto (< ${titleMinWords} palabras).`);
    }
    if (tw > Math.max(titleMinWords, titleMaxWords)) {
      out.title = out.title.split(/\s+/).slice(0, Math.max(1, titleMaxWords)).join(" ");
    }
    if (rejectGeneric && out.title && isGenericText(out.title)) {
      throw new Error("Validación: title demasiado genérico.");
    }
  }

  if (m !== "alt") {
    if (captionMinChars > 0 && out.leyenda.length < captionMinChars) {
      throw new Error(`Validación: leyenda demasiado corta (< ${captionMinChars}).`);
    }
    if (rejectGeneric && out.leyenda && isGenericText(out.leyenda)) {
      throw new Error("Validación: leyenda demasiado genérica.");
    }
  }

  return out;
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
      const ok = !!(applied.alt || applied.title || applied.leyenda);
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
    } else {
      __lastCandidateByTab.delete(tabId);
    }
  });
}

// Keep menu visibility in sync right before showing.
if (chrome?.contextMenus?.onShown?.addListener) {
  chrome.contextMenus.onShown.addListener((info, tab) => {
    try {
      ensureMenu();
      const pageUrl = info?.pageUrl || tab?.url || "";
      const inWp = isWpAdminUrl(pageUrl);
      chrome.contextMenus.update(MENU_ID_NORMAL, { visible: inWp }, () => {
        void chrome.runtime.lastError;
      });
      chrome.contextMenus.update(MENU_ID_SIGNED, { visible: inWp }, () => {
        void chrome.runtime.lastError;
        chrome.contextMenus.refresh?.();
      });
    } catch (_) {
      // ignore
    }
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
    __lastCandidateByTab.delete(tabId);
    __autoUploadQueueByTab.delete(tabId);
    __autoUploadSeenByTab.delete(tabId);
    __autoUploadStatsByTab.delete(tabId);
    __autoUploadCancelByTab.delete(tabId);
    __autoUploadPausedByTab.delete(tabId);
    __autoUploadPendingIdsByTab.delete(tabId);
    __batchCancelByTab.delete(tabId);
    __batchAbortByTab.delete(tabId);
  });
}

if (chrome?.runtime?.onStartup?.addListener) {
  chrome.runtime.onStartup.addListener(() => ensureMenu());
}

// Nota: usamos chrome.contextMenus.onShown *solo si existe* (en algunos forks no está).

async function ensureOverlayInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["overlay.js"]
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function sendOverlay(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch (e) {
    // If content script isn't ready yet, try injecting again once.
    const injected = await ensureOverlayInjected(tabId);
    if (!injected) throw e;
    await chrome.tabs.sendMessage(tabId, payload);
  }
}

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


    if (info.menuItemId === MENU_ID_NORMAL || info.menuItemId === MENU_ID_SIGNED) {
      const inWp = isWpAdminUrl(t.url || info?.pageUrl || "");
      const useCaptionSignature = info.menuItemId === MENU_ID_SIGNED;

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

      // Show overlay immediately (loading state)
      const cfg = await getConfigCached();
      await ensureOverlayInjected(tabId);
      await sendOverlay(tabId, {
        type: "MACA_OVERLAY_OPEN",
        jobId,
        imgUrl,
        pageUrl,
        generateMode: String(cfg.generateMode || "both"),
        wpAutoApply: !!cfg.wpAutoApply,
        wpAutoApplyRequireMedia: !!cfg.wpAutoApplyRequireMedia,
        autoCaptionSignatureOnAutoFill: !!cfg.autoCaptionSignatureOnAutoFill,
        onCompleteAction: resolveOnCompleteAction(cfg, pageUrl)
      });

      // Run analysis and update overlay when ready
      try {
        const { alt, title, leyenda, decorativa } = await analyzeImage({
          imageUrl: imgUrl,
          filenameContext,
          pageUrl,
          withCaptionSignature: useCaptionSignature || (!!cfg.wpAutoApply && !!cfg.autoCaptionSignatureOnAutoFill),
          source: "contextmenu"
        });

        await sendOverlay(tabId, {
          type: "MACA_OVERLAY_RESULT",
          jobId,
          alt,
          title,
          leyenda
        });
      } catch (err) {
        await addMetricsSample(cfg, {
          ok: false,
          ms: 0,
          mode: String(cfg.generateMode || "both"),
          source: "contextmenu",
          error: err?.message || String(err)
        });
        await sendOverlay(tabId, {
          type: "MACA_OVERLAY_ERROR",
          jobId,
          error: err?.message || String(err)
        });
      }
      return;
    }
  })();
});

// =========================
// Shared analysis pipeline (WP button + context menu)
// =========================

async function analyzeImage({ imageUrl, filenameContext, pageUrl, withCaptionSignature = false, modeOverride = "", abortSignal = null, source = "manual" }) {
  if (!isWpAdminUrl(pageUrl || "")) {
    throw new Error("maca está limitada a WordPress (wp-admin).");
  }
  if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
    throw new Error("URL de imagen no soportada por seguridad.");
  }

  const startedAt = Date.now();
  const cfg = await getConfigCached();
  const selectedModel = (cfg.provider === "local_ollama" || cfg.provider === "local_openai")
    ? (cfg.localModel || cfg.model || "")
    : cfg.model;
  const mode = String(modeOverride || cfg.generateMode || "both"); // both | alt | caption
  await addDebugLog(cfg, "analyze_start", { provider: cfg.provider, model: cfg.model, mode: String(modeOverride || cfg.generateMode || "both"), pageHost: safeHost(pageUrl), imageUrl });

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
  const captionSignatureText = String(cfg.captionSignatureText || "").trim();

  const usingCustomPrompt = !!(cfg.prompt && cfg.prompt.trim());
  let basePrompt = usingCustomPrompt ? cfg.prompt : getPromptForProfile(cfg.seoProfile);
  const useOpenRouterGlm = isOpenRouterGlm(cfg.provider, selectedModel);
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
    renderPrompt(basePrompt, {
      LANG: getEffectiveLang(cfg),
      PAGE_URL: pageUrl || "",
      IMG_URL: imageUrl
    });

  let rawOutput = "";

  if (cfg.provider === "openai") {
    const res = await fetchWithTimeout("https://api.openai.com/v1/responses", requestOptions({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: finalPrompt },
              { type: "input_image", image_url: dataUrl }
            ]
          }
        ]
      })
    }));

    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json?.error?.message || "Error OpenAI");
    }

    rawOutput = pickOutputTextFromOpenAIResponse(json);
  } else if (cfg.provider === "gemini") {
    const base64 = dataUrl.split(",")[1];
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`,
      requestOptions({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": cfg.apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mime, data: base64 } },
                { text: finalPrompt }
              ]
            }
          ]
        })
      })
    );

    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json?.error?.message || "Error Gemini");
    }

    rawOutput =
      json?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "";
  } else if (cfg.provider === "openrouter") {
    const model = String(cfg.model || "z-ai/glm-4.6v").trim();
    const useGlmModel = isOpenRouterGlm("openrouter", model);
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
      "HTTP-Referer": "https://wordpress.org",
      "X-Title": "maca for Chrome"
    };

    const makeBody = (withDocsParams = true, withSchema = true) => {
      const body = {
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: finalPrompt },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }
        ],
        max_tokens: 500
      };
      if (useGlmModel && withDocsParams) {
        body.provider = { allow_fallbacks: false, require_parameters: true };
        body.reasoning = { exclude: true, effort: "none" };
      }
      if (withSchema) {
        if (mode === "alt") {
          body.response_format = {
            type: "json_schema",
            json_schema: {
              name: "maca_alt_title",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  alt: { type: "string" },
                  title: { type: "string" },
                  decorativa: { type: "boolean" }
                },
                required: ["alt", "title"],
                additionalProperties: false
              }
            }
          };
        } else if (mode === "caption") {
          body.response_format = {
            type: "json_schema",
            json_schema: {
              name: "maca_caption",
              strict: true,
              schema: {
                type: "object",
                properties: { leyenda: { type: "string" } },
                required: ["leyenda"],
                additionalProperties: false
              }
            }
          };
        } else {
          body.response_format = {
            type: "json_schema",
            json_schema: {
              name: "maca_alt_title_caption",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  alt: { type: "string" },
                  title: { type: "string" },
                  leyenda: { type: "string" },
                  decorativa: { type: "boolean" }
                },
                required: ["alt", "title", "leyenda"],
                additionalProperties: false
              }
            }
          };
        }
      }
      return body;
    };

    let res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", requestOptions({
      method: "POST",
      headers,
      body: JSON.stringify(makeBody(true, true))
    }));
    let json = await safeJson(res);
    if (!res.ok && shouldFallbackOpenRouterCompatibility(res.status, json)) {
      // Fallback compatibility: remove strict docs params/schema if provider rejects them.
      res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", requestOptions({
        method: "POST",
        headers,
        body: JSON.stringify(makeBody(false, false))
      }));
      json = await safeJson(res);
    }
    if (!res.ok) {
      throw new Error(json?.error?.message || json?.error || json?.message || "Error OpenRouter");
    }
    rawOutput = pickTextFromOpenAICompat(json);
  } else if (cfg.provider === "anthropic") {
    const model = String(cfg.model || "claude-3-5-haiku-latest").trim();
    const base64 = dataUrl.split(",")[1];

    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", requestOptions({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        // Needed for direct browser calls from extensions.
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: finalPrompt },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mime,
                  data: base64
                }
              }
            ]
          }
        ]
      })
    }));

    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json?.error?.message || json?.error?.type || json?.message || "Error Anthropic");
    }
    rawOutput = Array.isArray(json?.content)
      ? json.content.filter(p => p?.type === "text").map(p => p?.text || "").join("\n")
      : "";
  } else if (cfg.provider === "groq") {
    const model = String(cfg.model || "meta-llama/llama-4-scout-17b-16e-instruct").trim();
    const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", requestOptions({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: finalPrompt },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }
        ],
        max_tokens: 500
      })
    }));

    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json?.error?.message || json?.error || json?.message || "Error Groq");
    }
    rawOutput = pickTextFromOpenAICompat(json);
  } else if (cfg.provider === "local_ollama") {
    const endpoint = normalizeEndpoint(cfg.localEndpoint || "http://127.0.0.1:11434");
    const model = (cfg.localModel || cfg.model || "llava:7b").trim();
    if (!endpoint) throw new Error("Falta el endpoint local (Ollama). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo local (Ollama). Ve a Opciones.");

    const base64 = dataUrl.split(",")[1];
    const url = `${endpoint}/api/chat`;

    const res = await fetchWithTimeout(url, requestOptions({
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: "user",
            content: finalPrompt,
            images: [base64]
          }
        ]
      })
    }));

    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json?.error || json?.message || `Error Ollama (${res.status})`);
    }

    rawOutput = json?.message?.content || json?.response || "";
  } else if (cfg.provider === "local_openai") {
    const endpoint = normalizeEndpoint(cfg.localEndpoint || "http://127.0.0.1:1234/v1");
    const model = (cfg.localModel || cfg.model || "llava").trim();
    if (!endpoint) throw new Error("Falta el endpoint local (OpenAI-compatible). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo local (OpenAI-compatible). Ve a Opciones.");

    const url = buildOpenAICompatUrl(endpoint);
    const headers = {
      "Content-Type": "application/json"
    };
    if (cfg.apiKey) {
      headers["Authorization"] = `Bearer ${cfg.apiKey}`;
    }

    const makeBody = (imageAsString = false) => ({
      model,
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: finalPrompt },
            imageAsString
              ? { type: "image_url", image_url: dataUrl }
              : { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      max_tokens: 500
    });

    // Try the official OpenAI message format first, then fall back to the simpler
    // "image_url": "data:..." variant used by some local servers.
    let res = await fetchWithTimeout(url, requestOptions({
      method: "POST",
      headers,
      body: JSON.stringify(makeBody(false))
    }));

    let json = await safeJson(res);
    if (!res.ok) {
      const errMsg =
        json?.error?.message ||
        json?.error ||
        json?.message ||
        "";

      const shouldRetry =
        res.status === 400 &&
        /image_url|content|array|object|string/i.test(errMsg);

      if (shouldRetry) {
        res = await fetchWithTimeout(url, requestOptions({
          method: "POST",
          headers,
          body: JSON.stringify(makeBody(true))
        }));
        json = await safeJson(res);
      }

      if (!res.ok) {
        const msg =
          json?.error?.message ||
          json?.error ||
          json?.message ||
          `Error OpenAI-compatible (${res.status}). Asegúrate de usar un modelo con visión y un servidor que soporte imágenes.`;
        throw new Error(msg);
      }
    }

    rawOutput = pickTextFromOpenAICompat(json);
  } else {
    throw new Error("Proveedor de IA no soportado");
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
  const titleFinal = normalizeCaptionText(
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
    if (leyendaFinal) leyendaFinal = ensureTrailingPeriod(leyendaFinal);
  }

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

  const record = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    time: nowIso(),
    mode: mode,
    site: safeHost(pageUrl),
    alt: altFinal,
    title: titleValidated,
    leyenda: leyendaFinal,
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
  await addMetricsSample(cfg, {
    ok: true,
    ms,
    mode,
    source,
    provider: cfg.provider,
    model: selectedModel
  });
  return { alt: record.alt, title: record.title, leyenda: record.leyenda, decorativa: record.decorativa };
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

  // Helpers
  const okRes = (details = {}) => ({ ok: true, provider, model, warnings, details });

  // Cloud: OpenAI
  if (provider === "openai") {
    if (!cfg.apiKey) throw new Error("Falta la API key (OpenAI). Ve a Opciones.");
    const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { "Authorization": `Bearer ${cfg.apiKey}` }
    }, 12000);
    const json = await safeJson(res);
    if (!res.ok) throw new Error(json?.error?.message || "Error OpenAI al validar la API key");
    const ids = Array.isArray(json?.data) ? json.data.map(x => x?.id).filter(Boolean) : [];
    const found = !!model && ids.includes(model);
    if (model && ids.length && !found) warnings.push("El modelo seleccionado no aparece en /v1/models. Aun así podría funcionar si es un alias o un modelo restringido.");
    return okRes({ modelsListed: ids.length, modelFound: found });
  }

  // Cloud: Gemini
  if (provider === "gemini") {
    if (!cfg.apiKey) throw new Error("Falta la API key (Gemini). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo (Gemini). Ve a Opciones.");
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": cfg.apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Respond only with: ok" }] }]
        })
      },
      12000
    );
    const json = await safeJson(res);
    if (!res.ok) throw new Error(json?.error?.message || "Error Gemini al validar la API key/modelo");
    return okRes({ testedEndpoint: "generateContent" });
  }

  // Cloud: OpenRouter
  if (provider === "openrouter") {
    if (!cfg.apiKey) throw new Error("Falta la API key (OpenRouter). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo (OpenRouter). Ve a Opciones.");
    const res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`,
        "HTTP-Referer": "https://wordpress.org",
        "X-Title": "maca for Chrome"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1
      })
    }, 12000);
    const json = await safeJson(res);
    if (!res.ok) throw new Error(json?.error?.message || json?.error || json?.message || "Error OpenRouter al validar.");
    return okRes({ endpoint: "https://openrouter.ai/api/v1/chat/completions" });
  }

  // Cloud: Anthropic
  if (provider === "anthropic") {
    if (!cfg.apiKey) throw new Error("Falta la API key (Anthropic). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo (Anthropic). Ve a Opciones.");
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: [{ type: "text", text: "ok" }] }]
      })
    }, 12000);
    const json = await safeJson(res);
    if (!res.ok) throw new Error(json?.error?.message || json?.error?.type || json?.message || "Error Anthropic al validar.");
    return okRes({ endpoint: "https://api.anthropic.com/v1/messages" });
  }

  // Cloud: Groq
  if (provider === "groq") {
    if (!cfg.apiKey) throw new Error("Falta la API key (Groq). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo (Groq). Ve a Opciones.");
    const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1
      })
    }, 12000);
    const json = await safeJson(res);
    if (!res.ok) throw new Error(json?.error?.message || json?.error || json?.message || "Error Groq al validar.");
    return okRes({ endpoint: "https://api.groq.com/openai/v1/chat/completions" });
  }

  // Local: Ollama
  if (provider === "local_ollama") {
    const endpoint = normalizeEndpoint(cfg.localEndpoint || "http://127.0.0.1:11434");
    if (!endpoint) throw new Error("Falta el endpoint local (Ollama). Ve a Opciones.");
    // /api/tags is a lightweight availability check.
    const res = await fetchWithTimeout(`${endpoint}/api/tags`, { method: "GET" }, 8000);
    const json = await safeJson(res);
    if (!res.ok) throw new Error(json?.error || json?.message || `No se pudo contactar con Ollama (${res.status}).`);
    // Optionally check if the chosen model exists in tags.
    const names = Array.isArray(json?.models) ? json.models.map(m => m?.name).filter(Boolean) : [];
    const found = !!model && names.some(n => n === model || n.startsWith(model + ":"));
    if (model && names.length && !found) warnings.push("El modelo local no aparece en /api/tags. Aun así podría funcionar si Ollama lo descarga bajo demanda.");
    return okRes({ tagsListed: names.length, modelFound: found, endpoint });
  }

  // Local: OpenAI-compatible
  if (provider === "local_openai") {
    const endpoint = normalizeEndpoint(cfg.localEndpoint || "http://127.0.0.1:1234/v1");
    if (!endpoint) throw new Error("Falta el endpoint local (OpenAI-compatible). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo local (OpenAI-compatible). Ve a Opciones.");
    const url = buildOpenAICompatUrl(endpoint);
    const headers = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1
      })
    }, 12000);

    const json = await safeJson(res);
    if (!res.ok) {
      const msg = json?.error?.message || json?.error || json?.message || `Error servidor local (${res.status}).`;
      throw new Error(msg);
    }
    return okRes({ endpoint: url });
  }

  throw new Error("Proveedor no soportado");
}

if (chrome?.runtime?.onMessage?.addListener) chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return;

  // 1) Analysis (used by WP button)
  if (msg.type === "MACA_ANALYZE_IMAGE") {
    (async () => {
      const startedAt = Date.now();
      try {
        const cfg = await getConfigCached();
        const imageUrl = msg.imageUrl;
        const filenameContext = msg.filenameContext || "";
        const pageUrl = sender.tab?.url || "";

        const { alt, title, leyenda, decorativa } = await analyzeImage({
          imageUrl,
          filenameContext,
          pageUrl,
          withCaptionSignature: !!cfg.wpAutoApply && !!cfg.autoCaptionSignatureOnAutoFill,
          source: "overlay_manual"
        });

        sendResponse({ alt, title, leyenda, decorativa });
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
      }
    })();

    return true;
  }

  // 1b) Regenerate from overlay (same image)
  if (msg.type === "MACA_REGENERATE") {
    (async () => {
      const startedAt = Date.now();
      try {
        const cfg = await getConfigCached();
        const imageUrl = msg.imageUrl;
        const filenameContext = msg.filenameContext || "";
        const pageUrl = msg.pageUrl || sender.tab?.url || "";
        const { alt, title, leyenda, decorativa } = await analyzeImage({
          imageUrl,
          filenameContext,
          pageUrl,
          withCaptionSignature: !!cfg.wpAutoApply && !!cfg.autoCaptionSignatureOnAutoFill,
          source: "overlay_regenerate"
        });
        sendResponse({ alt, title, leyenda, decorativa });
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
      const tabId = sender?.tab?.id;
      const pageUrl = sender?.tab?.url || msg?.pageUrl || "";
      const attachmentId = String(msg?.attachmentId || "");
      const imageUrl = String(msg?.imageUrl || "");
      const filenameContext = String(msg?.filenameContext || "");
      let markedSeen = false;
      try {
        if (tabId == null) throw new Error("No hay pestaña activa.");
        if (!attachmentId || !imageUrl) throw new Error("Faltan datos del adjunto recién subido.");
        if (!isWpAdminUrl(pageUrl)) {
          sendResponse({ ok: false, skipped: true, reason: "non_wp" });
          return;
        }

        const cfg = await getConfigCached();
        if (!cfg?.wpAutoAnalyzeOnUpload) {
          sendResponse({ ok: false, skipped: true, reason: "disabled" });
          return;
        }
        const st = getAutoUploadStats(tabId);
        if (__autoUploadCancelByTab.get(tabId) === true) {
          const settled = Number(st.done || 0) >= Number(st.queued || 0);
          const stale = (Date.now() - Number(st.lastAt || 0)) > 30000;
          if (settled || stale) __autoUploadCancelByTab.delete(tabId);
          else {
            sendResponse({ ok: false, skipped: true, reason: "cancelled" });
            return;
          }
        }

        if (wasRecentlyAutoProcessed(tabId, attachmentId)) {
          sendResponse({ ok: true, skipped: true, reason: "duplicate" });
          return;
        }
        const fuseEnabled = cfg.autoUploadSafetyFuseEnabled !== false;
        const fuseMax = Number.isFinite(Number(cfg.autoUploadSafetyFuseMaxQueued))
          ? Math.max(5, Number(cfg.autoUploadSafetyFuseMaxQueued))
          : 24;
        if (fuseEnabled && Number(st.queued || 0) >= fuseMax) {
          __autoUploadCancelByTab.set(tabId, true);
          __autoUploadPausedByTab.delete(tabId);
          __autoUploadPendingIdsByTab.delete(tabId);
          await sendAutoUploadProgress(tabId, {
            phase: "safety_stop",
            attachmentId,
            queued: st.queued,
            done: st.done,
            ok: st.ok,
            error: st.error,
            fuseMax
          });
          await addDebugLog(cfg, "auto_upload_safety_fuse", {
            tabId,
            attachmentId,
            queued: st.queued,
            fuseMax
          });
          sendResponse({ ok: false, skipped: true, reason: "safety_fuse", fuseMax });
          return;
        }
        st.queued += 1;
        enqueueAutoPendingId(tabId, attachmentId);
        await sendAutoUploadProgress(tabId, {
          phase: "queued",
          attachmentId,
          queued: st.queued,
          done: st.done,
          ok: st.ok,
          error: st.error
        });

        markAutoProcessed(tabId, attachmentId);
        markedSeen = true;

        await enqueueAutoUploadJob(tabId, async () => {
          if (__autoUploadCancelByTab.get(tabId) === true) {
            throw new Error("AUTO_UPLOAD_CANCELLED");
          }
          await waitIfAutoUploadPaused(tabId);
          if (__autoUploadCancelByTab.get(tabId) === true) {
            throw new Error("AUTO_UPLOAD_CANCELLED");
          }
          await addDebugLog(cfg, "auto_upload_start", { tabId, attachmentId });
          await sendAutoUploadProgress(tabId, {
            phase: "processing",
            attachmentId,
            queued: st.queued,
            done: st.done,
            ok: st.ok,
            error: st.error
          });

          const out = await analyzeImage({
            imageUrl,
            filenameContext,
            pageUrl,
            modeOverride: "both",
            withCaptionSignature: !!cfg.autoCaptionSignatureOnAutoFill,
            source: "auto_upload"
          });
          if (__autoUploadCancelByTab.get(tabId) === true) {
            throw new Error("AUTO_UPLOAD_CANCELLED");
          }

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
          if (!applied.ok) {
            throw new Error("No se pudo aplicar el resultado en los campos de Medios.");
          }

          // Optional UX helper for bulk uploads: unselect item once completed.
          if (cfg.autoDeselectProcessedOnAutoFill) {
            try {
              await chrome.tabs.sendMessage(tabId, { type: "MACA_DESELECT_ATTACHMENT", attachmentId });
            } catch (_) {}
          }

          st.done += 1;
          st.ok += 1;
          st.lastAt = Date.now();
          dequeueAutoPendingId(tabId, attachmentId);
          await sendAutoUploadProgress(tabId, {
            phase: "done_item",
            attachmentId,
            queued: st.queued,
            done: st.done,
            ok: st.ok,
            error: st.error
          });
          if (st.done >= st.queued) {
            __autoUploadPausedByTab.delete(tabId);
            __autoUploadPendingIdsByTab.delete(tabId);
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

          await addDebugLog(cfg, "auto_upload_done", { tabId, attachmentId, attempts: applied.attempts });
        });

        sendResponse({ ok: true, attachmentId });
      } catch (err) {
        if (err?.message === "AUTO_UPLOAD_CANCELLED") {
          if (markedSeen) unmarkAutoProcessed(tabId, attachmentId);
          dequeueAutoPendingId(tabId, attachmentId);
          const st = getAutoUploadStats(tabId);
          st.done += 1;
          st.lastAt = Date.now();
          await sendAutoUploadProgress(tabId, {
            phase: "cancelled_item",
            attachmentId,
            queued: st.queued,
            done: st.done,
            ok: st.ok,
            error: st.error
          });
          if (st.done >= st.queued) {
            __autoUploadPausedByTab.delete(tabId);
            __autoUploadPendingIdsByTab.delete(tabId);
            await sendAutoUploadProgress(tabId, {
              phase: "cancelled",
              attachmentId,
              queued: st.queued,
              done: st.done,
              ok: st.ok,
              error: st.error
            });
            __autoUploadCancelByTab.delete(tabId);
            resetAutoUploadStatsLater(tabId, 12000);
          }
          sendResponse({ ok: false, skipped: true, reason: "cancelled" });
          return;
        }

        if (markedSeen) unmarkAutoProcessed(tabId, attachmentId);
        dequeueAutoPendingId(tabId, attachmentId);
        const st = getAutoUploadStats(tabId);
        st.done += 1;
        st.error += 1;
        st.lastAt = Date.now();
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
          __autoUploadPausedByTab.delete(tabId);
          __autoUploadPendingIdsByTab.delete(tabId);
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
        await addDebugLog(cfg, "auto_upload_error", { attachmentId, error: err?.message || String(err) });
        await addMetricsSample(cfg, {
          ok: false,
          ms: 0,
          mode: "both",
          source: "auto_upload",
          error: err?.message || String(err)
        });
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (msg.type === "MACA_AUTO_UPLOAD_CANCEL") {
    const tabId = sender?.tab?.id;
    if (tabId != null) {
      __autoUploadCancelByTab.set(tabId, true);
      __autoUploadPausedByTab.delete(tabId);
      const st = getAutoUploadStats(tabId);
      if (Number(st.done || 0) >= Number(st.queued || 0)) {
        __autoUploadCancelByTab.delete(tabId);
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
        const cfg = await getConfigCached();

        await addDebugLog(cfg, "batch_start", { tabId });

        // Ask content script for selected attachments in WP Media Library
        const sel = await chrome.tabs.sendMessage(tabId, { type: "MACA_GET_SELECTED_ATTACHMENTS" });
        const items = Array.isArray(sel?.items) ? sel.items : [];
        if (!items.length) throw new Error("No se detectaron imágenes seleccionadas.");

        await sendOverlay(tabId, { type: "MACA_OVERLAY_PROGRESS", phase: "start", current: 0, total: items.length });

        const results = [];

        for (let i = 0; i < items.length; i++) {
          if (__batchCancelByTab.get(tabId) === true) {
            await sendOverlay(tabId, {
              type: "MACA_OVERLAY_PROGRESS",
              phase: "cancelled",
              current: i,
              total: items.length
            });
            await addDebugLog(cfg, "batch_cancelled", { done: i, total: items.length });
            sendResponse({ ok: true, cancelled: true, total: items.length, done: i, results });
            return;
          }

          const it = items[i] || {};
          const attachmentId = String(it.id || "");
          const imageUrl = it.imageUrl;
          const filenameContext = it.filenameContext || "";

          await sendOverlay(tabId, {
            type: "MACA_OVERLAY_PROGRESS",
            phase: "item",
            current: i + 1,
            total: items.length,
            attachmentId,
            filenameContext
          });

          let out;
          try {
            out = await analyzeImage({
              imageUrl,
              filenameContext,
              pageUrl: sender.tab?.url || "",
              withCaptionSignature: !!cfg.autoCaptionSignatureOnAutoFill,
              abortSignal: batchAbort.signal,
              source: "batch"
            });
            results.push({ attachmentId, ...out, imageUrl });

            // In batch mode, always try to apply results into WP fields.
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
            if (!applied.ok) {
              throw new Error("No se pudo aplicar el resultado en los campos de Medios.");
            }

            await addDebugLog(cfg, "batch_item_ok", { i: i + 1, total: items.length, attachmentId });
          } catch (errItem) {
            if (__batchCancelByTab.get(tabId) === true || errItem?.name === "AbortError") {
              await sendOverlay(tabId, {
                type: "MACA_OVERLAY_PROGRESS",
                phase: "cancelled",
                current: i,
                total: items.length
              });
              await addDebugLog(cfg, "batch_cancelled", { done: i, total: items.length });
              sendResponse({ ok: true, cancelled: true, total: items.length, done: i, results });
              return;
            }
            const msgErr = errItem?.message || String(errItem);
            results.push({ attachmentId, error: msgErr, imageUrl });
            await addMetricsSample(cfg, {
              ok: false,
              ms: 0,
              mode: String(cfg.generateMode || "both"),
              source: "batch",
              error: msgErr
            });
            await addDebugLog(cfg, "batch_item_error", { i: i + 1, total: items.length, attachmentId, error: msgErr });
          }
        }

        await sendOverlay(tabId, { type: "MACA_OVERLAY_PROGRESS", phase: "done", current: items.length, total: items.length });
        await addDebugLog(cfg, "batch_done", { total: items.length });

        sendResponse({ ok: true, total: items.length, results });
      } catch (err) {
        const cfg = await getConfigCached().catch(() => ({}));
        await addDebugLog(cfg, "batch_error", { error: err?.message || String(err) });
        sendResponse({ ok: false, error: err?.message || String(err) });
      } finally {
        if (tabId != null) __batchCancelByTab.delete(tabId);
        if (tabId != null) __batchAbortByTab.delete(tabId);
      }
    })();
    return true;
  }

  if (msg.type === "MACA_BATCH_CANCEL") {
    const tabId = sender?.tab?.id;
    if (tabId != null) __batchCancelByTab.set(tabId, true);
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
