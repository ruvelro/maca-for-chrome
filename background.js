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
const DEFAULT_LOCAL_CFG = { apiKey: "" };

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
  if (m === "alt") {
    // Remove LEYENDA block (from LEYENDA: up to Idioma:)
    s = s.replace(/\n\s*LEYENDA:[\s\S]*?(\n\s*Idioma:)/i, "\n$1");

    // Ensure JSON schema requests only alt (supports optional decorativa flag)
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*,\s*"decorativa"\s*:\s*(false|true)\s*\}/gi, '{"alt":"...","decorativa":false}');

    // Ensure JSON schema requests only alt
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/i, '{"alt":"..."}');
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/i, '{"alt":"..."}');
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/g, '{"alt":"..."}');
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/g, '{"alt":"..."}');
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/gi, '{"alt":"..."}');
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/gi, '{"alt":"..."}');
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/g, '{"alt":"..."}');
    // Fallback: replace any JSON schema line that mentions both keys
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/gi, '{"alt":"..."}');
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/gi, '{"alt":"..."}');
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/gi, '{"alt":"..."}');
    // If the template still contains a schema with both, just override at the end.
    if (!/\{\s*"alt"\s*:\s*"\.\.\."\s*\}/i.test(s)) {
      s = s.replace(/Devuelve SOLO JSON válido con:[\s\S]*$/i, (tail) => {
        if (/\{/.test(tail)) {
          return `Devuelve SOLO JSON válido con:\n{"alt":"...","decorativa":false}`;
        }
        return tail;
      });
    }
  } else if (m === "caption") {
    // Remove ALT block (from ALT: up to LEYENDA:)
    s = s.replace(/\n\s*ALT:[\s\S]*?(\n\s*LEYENDA:)/i, "\n$1");

    // Ensure JSON schema requests only leyenda (supports optional decorativa flag)
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*,\s*"decorativa"\s*:\s*(false|true)\s*\}/gi, '{"leyenda":"...","decorativa":false}');

    // Ensure JSON schema requests only leyenda
    s = s.replace(/\{\s*"alt"\s*:\s*"\.\.\."\s*,\s*"leyenda"\s*:\s*"\.\.\."\s*\}/gi, '{"leyenda":"..."}');
    if (!/\{\s*"leyenda"\s*:\s*"\.\.\."\s*\}/i.test(s)) {
      s = s.replace(/Devuelve SOLO JSON válido con:[\s\S]*$/i, () => `Devuelve SOLO JSON válido con:\n{"leyenda":"..."}`);
    }
  }

  // Reinforce strict JSON
  if (!/No incluyas backticks/i.test(s)) {
    s += "\n\nNo incluyas backticks, ni texto fuera del JSON.";
  }

  return s.trim();
}
// NOTE: fetchWithTimeout is imported from util.js. Do not re-declare it here.

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
// Context menu (single entry, smart visibility)
// - Visible on wp-admin everywhere (even inside editors/iframes).
// - Outside wp-admin, visible only on real images.
// - Title switches: "imagen" vs "miniatura".
//
// IMPORTANT: We avoid removeAll/recreate cycles because they can race on MV3 wake-ups
// and cause "Cannot create item with duplicate id" in Chromium.
// =========================

const MENU_ID_SMART = "maca-analyze";

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

function hasRealImageFromInfo(info) {
  return !!info?.srcUrl || info?.mediaType === "image";
}

let __menuEnsured = false;
function ensureMenu() {
  if (__menuEnsured) return;
  __menuEnsured = true;
  if (!chrome?.contextMenus?.create) return;
  try {
    chrome.contextMenus.create(
      {
        id: MENU_ID_SMART,
        title: "Analizar con maca (ALT + leyenda)",
        contexts: ["all"]
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
        onCompleteAction: resolveOnCompleteAction(cfg, pageUrl)
      });

      try {
        const { alt, leyenda, decorativa } = await analyzeImage({
          imageUrl: imgUrl,
          filenameContext,
          pageUrl
        });

        await sendOverlay(tabId, {
          type: "MACA_OVERLAY_RESULT",
          jobId,
          alt,
          leyenda
        });
      } catch (err) {
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

// Keep menu title/visibility in sync right before showing.
if (chrome?.contextMenus?.onShown?.addListener) {
  chrome.contextMenus.onShown.addListener((info, tab) => {
    try {
      ensureMenu();
      const tabId = tab?.id;
      const pageUrl = info?.pageUrl || tab?.url || "";
      const inWp = isWpAdminUrl(pageUrl);
      const hasRealImage = hasRealImageFromInfo(info) || (tabId != null && __lastCandidateByTab.has(tabId));

      const visible = inWp || hasRealImage;
      const title = hasRealImage
        ? "Analizar imagen con maca (ALT + leyenda)"
        : (inWp ? "Analizar con maca (miniatura: ALT + leyenda)" : "Analizar imagen con maca (ALT + leyenda)");

      chrome.contextMenus.update(MENU_ID_SMART, { visible, title }, () => {
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


    if (info.menuItemId === MENU_ID_SMART) {
      const inWp = isWpAdminUrl(t.url || info?.pageUrl || "");

      // Outside wp-admin, this menu only appears on real images.
      // Inside wp-admin, it appears everywhere, so we must resolve candidates.
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
        onCompleteAction: resolveOnCompleteAction(cfg, pageUrl)
      });

      // Run analysis and update overlay when ready
      try {
        const { alt, leyenda, decorativa } = await analyzeImage({
          imageUrl: imgUrl,
          filenameContext,
          pageUrl
        });

        await sendOverlay(tabId, {
          type: "MACA_OVERLAY_RESULT",
          jobId,
          alt,
          leyenda
        });
      } catch (err) {
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

async function analyzeImage({ imageUrl, filenameContext, pageUrl }) {
  if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
    throw new Error("URL de imagen no soportada por seguridad.");
  }

  const cfg = await getConfigCached();
  await addDebugLog(cfg, "analyze_start", { provider: cfg.provider, model: cfg.model, mode: String(cfg.generateMode||"both"), pageHost: safeHost(pageUrl), imageUrl });

  const isLocal = cfg.provider === "local_ollama" || cfg.provider === "local_openai";
  if (!isLocal && !cfg.apiKey) {
    throw new Error("Falta la API key. Ve a Opciones.");
  }

  const { dataUrl, mime } = await toBase64DataUrlFromUrl(imageUrl);

  const contextBlock = filenameContext
    ? `\nContexto adicional (nombre de archivo, no fiable): "${filenameContext}"\n`
    : "";

  const mode = String(cfg.generateMode || "both"); // both | alt | caption
  const altMaxLength = Number.isFinite(Number(cfg.altMaxLength)) ? Number(cfg.altMaxLength) : 125;
  const avoidImagePrefix = (cfg.avoidImagePrefix !== undefined) ? !!cfg.avoidImagePrefix : true;

  const allowDecorativeAltEmpty = (cfg.allowDecorativeAltEmpty !== undefined) ? !!cfg.allowDecorativeAltEmpty : false;
  const captionTemplateEnabled = (cfg.captionTemplateEnabled !== undefined) ? !!cfg.captionTemplateEnabled : false;
  const captionTemplate = String(cfg.captionTemplate || "{{caption}}");

  const usingCustomPrompt = !!(cfg.prompt && cfg.prompt.trim());
  let basePrompt = usingCustomPrompt ? cfg.prompt : getPromptForProfile(cfg.seoProfile);

  // Only rewrite the *default* prompt. If the user wrote a custom prompt, respect it.
  if (!usingCustomPrompt) {
    basePrompt = adjustDefaultPromptForModeAndSeo(basePrompt, { mode, altMaxLength, avoidImagePrefix });
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
    const res = await fetchWithTimeout("https://api.openai.com/v1/responses", {
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
    });

    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json?.error?.message || "Error OpenAI");
    }

    rawOutput = pickOutputTextFromOpenAIResponse(json);
  } else if (cfg.provider === "gemini") {
    const base64 = dataUrl.split(",")[1];
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`,
      {
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
      }
    );

    const json = await safeJson(res);
    if (!res.ok) {
      throw new Error(json?.error?.message || "Error Gemini");
    }

    rawOutput =
      json?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || "";
  } else if (cfg.provider === "local_ollama") {
    const endpoint = normalizeEndpoint(cfg.localEndpoint || "http://127.0.0.1:11434");
    const model = (cfg.localModel || cfg.model || "llava:7b").trim();
    if (!endpoint) throw new Error("Falta el endpoint local (Ollama). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo local (Ollama). Ve a Opciones.");

    const base64 = dataUrl.split(",")[1];
    const url = `${endpoint}/api/chat`;

    const res = await fetchWithTimeout(url, {
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
    });

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
    let res = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify(makeBody(false))
    });

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
        res = await fetchWithTimeout(url, {
          method: "POST",
          headers,
          body: JSON.stringify(makeBody(true))
        });
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

  const altFinal = altProvided ? normalizeAltText(parsed.alt, altMaxLength, avoidImagePrefix) : "";
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

  if (mode === "alt" && !altFinal && !altAllowedEmpty) throw new Error("La IA no devolvió un ALT válido.");
  if (mode === "caption" && !leyendaFinal) throw new Error("La IA no devolvió una leyenda válida.");
  if (mode === "both" && ((!altFinal && !altAllowedEmpty) || !leyendaFinal)) {
    throw new Error("La IA no devolvió un ALT/leyenda válidos.");
  }

  const record = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    time: nowIso(),
    mode: mode,
    site: safeHost(pageUrl),
    alt: altFinal,
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

  return { alt: record.alt, leyenda: record.leyenda, decorativa: record.decorativa };
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
      try {
        const imageUrl = msg.imageUrl;
        const filenameContext = msg.filenameContext || "";
        const pageUrl = sender.tab?.url || "";

        const { alt, leyenda, decorativa } = await analyzeImage({
          imageUrl,
          filenameContext,
          pageUrl
        });

        sendResponse({ alt, leyenda, decorativa });
      } catch (err) {
        sendResponse({ error: err.message || String(err) });
      }
    })();

    return true;
  }

  // 1b) Regenerate from overlay (same image)
  if (msg.type === "MACA_REGENERATE") {
    (async () => {
      try {
        const imageUrl = msg.imageUrl;
        const filenameContext = msg.filenameContext || "";
        const pageUrl = msg.pageUrl || sender.tab?.url || "";
        const { alt, leyenda, decorativa } = await analyzeImage({ imageUrl, filenameContext, pageUrl });
        sendResponse({ alt, leyenda, decorativa });
      } catch (err) {
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


  // 2c) Batch process selected WP media items (overlay button)
  if (msg.type === "MACA_BATCH_PROCESS_SELECTED") {
    (async () => {
      const tabId = sender?.tab?.id;
      try {
        if (tabId == null) throw new Error("No hay pestaña activa.");
        const cfg = await getConfigCached();

        await addDebugLog(cfg, "batch_start", { tabId });

        // Ask content script for selected attachments in WP Media Library
        const sel = await chrome.tabs.sendMessage(tabId, { type: "MACA_GET_SELECTED_ATTACHMENTS" });
        const items = Array.isArray(sel?.items) ? sel.items : [];
        if (!items.length) throw new Error("No se detectaron imágenes seleccionadas.");

        await sendOverlay(tabId, { type: "MACA_OVERLAY_PROGRESS", phase: "start", current: 0, total: items.length });

        const results = [];

        for (let i = 0; i < items.length; i++) {
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
            out = await analyzeImage({ imageUrl, filenameContext, pageUrl: sender.tab?.url || "" });
            results.push({ attachmentId, ...out, imageUrl });

            // Auto-apply if enabled
            if (cfg.wpAutoApply) {
              await chrome.tabs.sendMessage(tabId, {
                type: "MACA_APPLY_TO_ATTACHMENT",
                attachmentId,
                alt: out.alt || "",
                leyenda: out.leyenda || "",
                generateMode: String(cfg.generateMode || "both"),
                requireMedia: (cfg.wpAutoApplyRequireMedia !== undefined) ? !!cfg.wpAutoApplyRequireMedia : true
              });
            }

            await addDebugLog(cfg, "batch_item_ok", { i: i + 1, total: items.length, attachmentId });
          } catch (errItem) {
            const msgErr = errItem?.message || String(errItem);
            results.push({ attachmentId, error: msgErr, imageUrl });
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
      }
    })();
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
  if (obj && (obj.alt != null || obj.leyenda != null)) {
    return {
      alt: obj.alt != null ? String(obj.alt) : "",
      leyenda: obj.leyenda != null ? String(obj.leyenda) : "",
      decorativa: toDecorativeBool(obj.decorativa)
    };
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    obj = safeJsonParse(fenced[1].trim());
    if (obj && (obj.alt != null || obj.leyenda != null)) {
      return {
        alt: obj.alt != null ? String(obj.alt) : "",
        leyenda: obj.leyenda != null ? String(obj.leyenda) : "",
        decorativa: toDecorativeBool(obj.decorativa)
      };
    }
  }

  const brace = raw.match(/\{[\s\S]*?\}/);
  if (brace?.[0]) {
    obj = safeJsonParse(brace[0]);
    if (obj && (obj.alt != null || obj.leyenda != null)) {
      return {
        alt: obj.alt != null ? String(obj.alt) : "",
        leyenda: obj.leyenda != null ? String(obj.leyenda) : "",
        decorativa: toDecorativeBool(obj.decorativa)
      };
    }
  }

  return null;
}
