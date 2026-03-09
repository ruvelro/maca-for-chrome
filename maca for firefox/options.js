import { DEFAULT_PROMPTS } from "./prompts.js";
import { normalizeEndpoint } from "./util.js";

const els = {
  language: document.getElementById("language"),
  seoProfile: document.getElementById("seoProfile"),
  sectionStyleProfile: document.getElementById("sectionStyleProfile"),
  wpAutoApply: document.getElementById("wpAutoApply"),
  wpAutoApplyRequireMedia: document.getElementById("wpAutoApplyRequireMedia"),
  wpAutoAnalyzeOnUpload: document.getElementById("wpAutoAnalyzeOnUpload"),
  autoAnalyzeOnSelectMedia: document.getElementById("autoAnalyzeOnSelectMedia"),
  autoDeselectProcessedOnAutoFill: document.getElementById("autoDeselectProcessedOnAutoFill"),
  autoQueueModeVisible: document.getElementById("autoQueueModeVisible"),
  autoUploadSafetyFuseEnabled: document.getElementById("autoUploadSafetyFuseEnabled"),
  autoUploadSafetyFuseMaxQueued: document.getElementById("autoUploadSafetyFuseMaxQueued"),
  generateMode: document.getElementById("generateMode"),
  altMaxLength: document.getElementById("altMaxLength"),
  avoidImagePrefix: document.getElementById("avoidImagePrefix"),
  postValidationEnabled: document.getElementById("postValidationEnabled"),
  postValidationRejectGeneric: document.getElementById("postValidationRejectGeneric"),
  postValidationTitleMinWords: document.getElementById("postValidationTitleMinWords"),
  postValidationTitleMaxWords: document.getElementById("postValidationTitleMaxWords"),
  postValidationAltMinChars: document.getElementById("postValidationAltMinChars"),
  postValidationCaptionMinChars: document.getElementById("postValidationCaptionMinChars"),
  secondPassQualityEnabled: document.getElementById("secondPassQualityEnabled"),
  onCompleteAction: document.getElementById("onCompleteAction"),
  onCompleteScope: document.getElementById("onCompleteScope"),
  historyLimit: document.getElementById("historyLimit"),
  provider: document.getElementById("provider"),
  model: document.getElementById("model"),
  customModel: document.getElementById("customModel"),
  cloudModelField: document.getElementById("cloudModelField"),
  localRow: document.getElementById("localRow"),
  localEndpoint: document.getElementById("localEndpoint"),
  localModel: document.getElementById("localModel"),
  apiKey: document.getElementById("apiKey"),
  apiKeyField: document.getElementById("apiKeyField"),
  apiKeyLabel: document.getElementById("apiKeyLabel"),
  apiKeyHelp: document.getElementById("apiKeyHelp"),
  syncApiKeyRow: document.getElementById("syncApiKeyRow"),
  syncApiKey: document.getElementById("syncApiKey"),
  prompt: document.getElementById("prompt"),
  languageAutoEsEs: document.getElementById("languageAutoEsEs"),
  allowDecorativeAltEmpty: document.getElementById("allowDecorativeAltEmpty"),
  captionTemplateEnabled: document.getElementById("captionTemplateEnabled"),
  captionTemplate: document.getElementById("captionTemplate"),
  contextMenuUseSignature: document.getElementById("contextMenuUseSignature"),
  captionSignaturePreset: document.getElementById("captionSignaturePreset"),
  captionSignatureName: document.getElementById("captionSignatureName"),
  addSignature: document.getElementById("addSignature"),
  deleteSignature: document.getElementById("deleteSignature"),
  captionSignatureText: document.getElementById("captionSignatureText"),
  autoCaptionSignatureOnAutoFill: document.getElementById("autoCaptionSignatureOnAutoFill"),
  batchQaModeEnabled: document.getElementById("batchQaModeEnabled"),
  batchQaMinLevel: document.getElementById("batchQaMinLevel"),
  debugEnabled: document.getElementById("debugEnabled"),
  copyDebug: document.getElementById("copyDebug"),
  clearDebug: document.getElementById("clearDebug"),
  testConfig: document.getElementById("testConfig"),
  clearHistory: document.getElementById("clearHistory"),
  exportConfig: document.getElementById("exportConfig"),
  importConfig: document.getElementById("importConfig"),
  importConfigFile: document.getElementById("importConfigFile"),
  historyEnabled: document.getElementById("historyEnabled"),
  copySupport: document.getElementById("copySupport"),
  copyMetrics: document.getElementById("copyMetrics"),
  clearMetrics: document.getElementById("clearMetrics"),
  metricsSummary: document.getElementById("metricsSummary"),
  save: document.getElementById("save"),
  reset: document.getElementById("reset"),
  status: document.getElementById("status"),
  shortcutEnabled: document.getElementById("shortcutEnabled"),
  openShortcuts: document.getElementById("openShortcuts"),
  shortcutCurrent: document.getElementById("shortcutCurrent")
};

const LOCAL_PROVIDERS = new Set(["local_ollama", "local_openai"]);

// Remember the user's sync preference for cloud providers when temporarily hiding the toggle on local providers.
let lastCloudSyncApiKey = true;
let signatureState = { list: [], activeId: "" };

// Simple status helper (used by tools/debug buttons)
function setStatus(msg, { timeoutMs = 2500 } = {}) {
  if (!els.status) return;
  els.status.textContent = String(msg || "");
  els.status.style.opacity = msg ? "1" : "0";
  if (setStatus.__t) clearTimeout(setStatus.__t);
  if (msg && timeoutMs > 0) {
    setStatus.__t = setTimeout(() => {
      if (!els.status) return;
      els.status.textContent = "";
      els.status.style.opacity = "0";
    }, timeoutMs);
  }
}


// Debug (diagnÃ³stico)
els.copyDebug?.addEventListener("click", async () => {
  const { debugLog = [] } = await chrome.storage.local.get({ debugLog: [] });
  try {
    await navigator.clipboard.writeText(JSON.stringify(debugLog, null, 2));
    setStatus("DiagnÃ³stico copiado al portapapeles.");
  } catch (_) {
    setStatus("No se pudo copiar el diagnÃ³stico.");
  }
});


els.copySupport?.addEventListener("click", async () => {
  try {
    const cfgSync = await chrome.storage.sync.get(null);
    const cfgLocal = await chrome.storage.local.get(null);

    // Build a safe config snapshot without secrets.
    const cfg = { ...(cfgSync || {}) };
    // Remove potentially sensitive fields
    delete cfg.apiKey;
    delete cfg.apiKeyOpenAI;
    delete cfg.apiKeyGemini;

    // Include a hint about where the API key is stored (but never the key itself)
    cfg.apiKeyStorage = (cfg.syncApiKey === true) ? "sync" : "local";

    const debugLog = Array.isArray(cfgLocal.debugLog) ? cfgLocal.debugLog : [];
    const payload = {
      generatedAt: new Date().toISOString(),
      versionHint: (await chrome.runtime.getManifest?.())?.version || "unknown",
      config: cfg,
      debugLog
    };

    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setStatus("Soporte copiado al portapapeles.");
  } catch (err) {
    setStatus("No se pudo copiar soporte.");
  }
});

els.clearDebug?.addEventListener("click", async () => {
  await chrome.storage.local.set({ debugLog: [] });
  setStatus("DiagnÃ³stico borrado.");
});

async function renderMetricsSummary() {
  if (!els.metricsSummary) return;
  const { metrics = {} } = await chrome.storage.local.get({ metrics: {} });
  const total = metrics?.total || {};
  const lines = [];
  lines.push(`Total llamadas: ${Number(total.calls || 0)}`);
  lines.push(`Total OK: ${Number(total.ok || 0)} Â· Error: ${Number(total.error || 0)}`);
  lines.push(`Tiempo medio: ${Number(total.calls || 0) > 0 ? Math.round(Number(total.totalMs || 0) / Number(total.calls || 1)) : 0} ms`);
  if (metrics?.updatedAt) lines.push(`Actualizado: ${metrics.updatedAt}`);
  lines.push("");
  lines.push("Por proveedor/modelo:");
  const byPm = metrics?.byProviderModel || {};
  const pmItems = Object.values(byPm)
    .sort((a, b) => Number(b?.calls || 0) - Number(a?.calls || 0))
    .slice(0, 12);
  for (const it of pmItems) {
    const calls = Number(it?.calls || 0);
    const avg = calls > 0 ? Math.round(Number(it?.totalMs || 0) / calls) : 0;
    lines.push(`- ${it?.provider || "?"} / ${it?.model || "?"} => ${calls} (${Number(it?.ok || 0)} OK, ${Number(it?.error || 0)} ERR, ${avg} ms)`);
  }
  els.metricsSummary.textContent = lines.join("\n");
}

els.copyMetrics?.addEventListener("click", async () => {
  const { metrics = {} } = await chrome.storage.local.get({ metrics: {} });
  try {
    await navigator.clipboard.writeText(JSON.stringify(metrics, null, 2));
    setStatus("MÃ©tricas copiadas.");
  } catch (_) {
    setStatus("No se pudieron copiar las mÃ©tricas.");
  }
});

els.clearMetrics?.addEventListener("click", async () => {
  await chrome.storage.local.set({ metrics: {} });
  await renderMetricsSummary();
  setStatus("MÃ©tricas borradas.");
});


const PROVIDERS = {
  openai: {
    defaultModel: "gpt-5-mini",
    models: [
      "gpt-5.2-pro",
      "gpt-5.2",
      "gpt-5.1",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4o-mini",
      "gpt-4o"
    ]
  },
  gemini: {
    defaultModel: "gemini-2.5-flash",
    models: [
      "gemini-3-pro-image-preview",
      "gemini-3-pro-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite"
    ]
  },
  anthropic: {
    defaultModel: "claude-3-5-haiku-latest",
    models: [
      "claude-3-5-haiku-latest",
      "claude-sonnet-4-0"
    ]
  },
  groq: {
    defaultModel: "meta-llama/llama-4-scout-17b-16e-instruct",
    models: [
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "meta-llama/llama-4-maverick-17b-128e-instruct"
    ]
  },
  openrouter: {
    defaultModel: "z-ai/glm-4.6v",
    models: [
      "z-ai/glm-4.6v",
      "qwen/qwen2.5-vl-32b-instruct",
      "meta-llama/llama-4-scout",
      "meta-llama/llama-4-maverick",
      "google/gemini-2.5-flash-lite",
      "google/gemini-2.5-flash",
      "google/gemini-3-flash-preview",
      "google/gemini-3-pro-preview",
      "google/gemini-3-pro-image-preview",
      "openai/gpt-4o-mini",
      "openai/gpt-5-mini",
      "openai/gpt-5"
    ]
  }
};

function loadModels(provider, selected) {
  els.model.innerHTML = "";
  (PROVIDERS[provider]?.models || []).forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    if (m === selected) opt.selected = true;
    els.model.appendChild(opt);
  });
}


// normalizeEndpoint is imported from util.js to avoid duplication.


function updateCaptionTemplateUi() {
  if (!els.captionTemplate || !els.captionTemplateEnabled) return;
  const on = !!els.captionTemplateEnabled.checked;
  els.captionTemplate.disabled = !on;
  els.captionTemplate.style.opacity = on ? "1" : "0.65";
}

function updateAutoFuseUi() {
  if (!els.autoUploadSafetyFuseMaxQueued || !els.autoUploadSafetyFuseEnabled) return;
  const on = !!els.autoUploadSafetyFuseEnabled.checked;
  els.autoUploadSafetyFuseMaxQueued.disabled = !on;
  els.autoUploadSafetyFuseMaxQueued.style.opacity = on ? "1" : "0.65";
}

function updateBatchQaUi() {
  if (!els.batchQaModeEnabled || !els.batchQaMinLevel) return;
  const on = !!els.batchQaModeEnabled.checked;
  els.batchQaMinLevel.disabled = !on;
  els.batchQaMinLevel.style.opacity = on ? "1" : "0.65";
}

function makeSignatureId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `sig_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function normalizeSignatures(list, legacyText = "") {
  const out = [];
  const src = Array.isArray(list) ? list : [];
  for (const it of src) {
    if (!it || typeof it !== "object") continue;
    const id = String(it.id || "").trim() || makeSignatureId();
    const name = String(it.name || "").trim() || "Firma";
    const text = String(it.text || "").trim();
    out.push({ id, name, text });
  }
  if (!out.length) {
    const legacy = String(legacyText || "").trim();
    if (legacy) out.push({ id: "default", name: "Firma principal", text: legacy });
  }
  return out;
}

function getActiveSignature() {
  const list = Array.isArray(signatureState.list) ? signatureState.list : [];
  if (!list.length) return null;
  const active = list.find((x) => x.id === signatureState.activeId) || list[0];
  return active || null;
}

function renderSignatureUi() {
  if (!els.captionSignaturePreset) return;
  const list = Array.isArray(signatureState.list) ? signatureState.list : [];
  if (!list.length) {
    els.captionSignaturePreset.innerHTML = "";
    els.captionSignatureName.value = "";
    els.captionSignatureText.value = "";
    els.captionSignatureName.disabled = true;
    els.captionSignatureText.disabled = true;
    if (els.deleteSignature) els.deleteSignature.disabled = true;
    return;
  }
  const active = getActiveSignature() || list[0];
  signatureState.activeId = active.id;
  els.captionSignaturePreset.innerHTML = "";
  for (const it of list) {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = `${it.name}${it.text ? "" : " (vacÃ­a)"}`;
    if (it.id === active.id) opt.selected = true;
    els.captionSignaturePreset.appendChild(opt);
  }
  els.captionSignatureName.disabled = false;
  els.captionSignatureText.disabled = false;
  els.captionSignatureName.value = active.name || "";
  els.captionSignatureText.value = active.text || "";
  if (els.deleteSignature) els.deleteSignature.disabled = list.length <= 1;
}

function applyProviderUi(provider, cfg = {}) {
  const isLocal = LOCAL_PROVIDERS.has(provider);

  // Show/hide model selector vs local fields
  if (els.cloudModelField) els.cloudModelField.style.display = isLocal ? "none" : "";
  if (els.localRow) els.localRow.style.display = isLocal ? "" : "none";

  // API key field behavior
  // Local Ollama does not require an API key.
  if (provider === "local_ollama") {
    if (els.apiKeyField) els.apiKeyField.style.display = "none";
  } else {
    if (els.apiKeyField) els.apiKeyField.style.display = "";
    if (provider === "local_openai") {
      if (els.apiKeyLabel) els.apiKeyLabel.textContent = "API key (opcional)";
      if (els.apiKeyHelp)
        els.apiKeyHelp.textContent =
          "Solo si tu servidor local requiere autenticaciÃ³n (normalmente se deja vacÃ­o).";
      if (els.apiKey) els.apiKey.placeholder = "(opcional)";
    } else if (provider === "openrouter") {
      if (els.apiKeyLabel) els.apiKeyLabel.textContent = "API key (OpenRouter)";
      if (els.apiKeyHelp) els.apiKeyHelp.textContent = "Usa una API key de OpenRouter.";
      if (els.apiKey) els.apiKey.placeholder = "Pega aquÃ­ tu API key de OpenRouter";
    } else if (provider === "anthropic") {
      if (els.apiKeyLabel) els.apiKeyLabel.textContent = "API key (Anthropic)";
      if (els.apiKeyHelp) els.apiKeyHelp.textContent = "Usa una API key de Anthropic.";
      if (els.apiKey) els.apiKey.placeholder = "Pega aquÃ­ tu API key de Anthropic";
    } else if (provider === "groq") {
      if (els.apiKeyLabel) els.apiKeyLabel.textContent = "API key (Groq)";
      if (els.apiKeyHelp) els.apiKeyHelp.textContent = "Usa una API key de Groq.";
      if (els.apiKey) els.apiKey.placeholder = "Pega aquÃ­ tu API key de Groq";
    } else {
      if (els.apiKeyLabel) els.apiKeyLabel.textContent = "API key";
      if (els.apiKey) els.apiKey.placeholder = "Pega aquÃ­ tu API key";
    }
  }

  // Sync toggle only applies to cloud providers (OpenAI/Gemini). Hide it for local providers.
  if (isLocal) {
    if (els.syncApiKeyRow) els.syncApiKeyRow.style.display = "none";
    if (els.syncApiKey) {
      // Remember the last cloud preference so switching back restores the UI state.
      if (!els.syncApiKey.disabled) lastCloudSyncApiKey = !!els.syncApiKey.checked;
      els.syncApiKey.disabled = true;
    }
  } else {
    if (els.syncApiKeyRow) els.syncApiKeyRow.style.display = "";
    if (els.syncApiKey) {
      els.syncApiKey.disabled = false;
      if (typeof cfg.syncApiKey === "boolean") {
        els.syncApiKey.checked = !!cfg.syncApiKey;
      } else {
        els.syncApiKey.checked = !!lastCloudSyncApiKey;
      }
    }
  }

  // Defaults for local
  if (isLocal) {
    const defaultEndpoint =
      provider === "local_ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234/v1";
    const defaultModel = provider === "local_ollama" ? "llava:7b" : "llava";

    if (els.localEndpoint) {
      const val = cfg.localEndpoint ? cfg.localEndpoint : defaultEndpoint;
      els.localEndpoint.value = normalizeEndpoint(val);
    }
    if (els.localModel) {
      const val = cfg.localModel ? cfg.localModel : defaultModel;
      els.localModel.value = val;
    }
  }
}

function updateApiKeyHelpText() {
  if (!els.apiKeyHelp) return;
  const provider = els.provider?.value || "openai";
  if (provider === "local_openai") {
    els.apiKeyHelp.textContent =
      "Solo si tu servidor local requiere autenticaciÃ³n (normalmente se deja vacÃ­o).";
    return;
  }
  if (provider === "local_ollama") {
    els.apiKeyHelp.textContent = "";
    return;
  }
  if (provider === "openrouter") {
    els.apiKeyHelp.textContent = "API key de OpenRouter. Puedes sincronizarla con Firefox si quieres.";
    return;
  }
  if (provider === "anthropic") {
    els.apiKeyHelp.textContent = "API key de Anthropic. Puedes sincronizarla con Firefox si quieres.";
    return;
  }
  if (provider === "groq") {
    els.apiKeyHelp.textContent = "API key de Groq. Puedes sincronizarla con Firefox si quieres.";
    return;
  }
  const syncOn = !!els.syncApiKey?.checked;
  els.apiKeyHelp.textContent = syncOn
    ? "La clave se sincroniza con tu cuenta de Firefox."
    : "La clave se guarda solo en este dispositivo.";
}

function getEffectiveModel(provider) {
  const custom = (els.customModel?.value || "").trim();
  if (custom) return custom;
  return (els.model?.value || (PROVIDERS[provider]?.defaultModel || "")).trim();
}

(async () => {
  // Read sync first (may include apiKey if user chose to sync it)
  const syncCfg = await chrome.storage.sync.get({
    language: "es-ES",
    seoProfile: "blog",
    sectionStyleProfile: "general",
    wpAutoApply: false,
    wpAutoApplyRequireMedia: true,
    wpAutoAnalyzeOnUpload: false,
    autoAnalyzeOnSelectMedia: false,
    autoDeselectProcessedOnAutoFill: false,
    autoQueueModeVisible: true,
    autoUploadSafetyFuseEnabled: true,
    autoUploadSafetyFuseMaxQueued: 24,
    generateMode: "both",
    altMaxLength: 125,
    avoidImagePrefix: true,
    postValidationEnabled: false,
    postValidationRejectGeneric: true,
    postValidationTitleMinWords: 2,
    postValidationTitleMaxWords: 8,
    postValidationAltMinChars: 0,
    postValidationCaptionMinChars: 0,
    secondPassQualityEnabled: false,
    onCompleteAction: "none",
    onCompleteScope: "wp",
    historyLimit: 20,
    provider: "openai",
    model: "",
    prompt: "",
    localEndpoint: "",
    localModel: "",
    shortcutEnabled: false,
    languageAutoEsEs: false,
    allowDecorativeAltEmpty: false,
    captionTemplateEnabled: false,
    captionTemplate: "{{caption}}",
    captionSignatureText: "",
    captionSignatures: [],
    activeCaptionSignatureId: "",
    contextMenuUseSignature: false,
    autoCaptionSignatureOnAutoFill: false,
    batchQaModeEnabled: false,
    batchQaMinLevel: "ok",
    debugEnabled: false,
    extensionEnabled: true,
    syncApiKey: false,
    apiKey: ""
  });
  const localCfg = await chrome.storage.local.get({ apiKey: "" });
  // Choose where to read the API key from
  const apiKeySync = (syncCfg.apiKey || "");
  const apiKeyLocal = (localCfg.apiKey || "");
  let chosenApiKey = syncCfg.syncApiKey ? apiKeySync : apiKeyLocal;
  // Compatibility fallback: if the chosen store is empty but the other has a key, use it.
  if (!chosenApiKey) chosenApiKey = apiKeySync || apiKeyLocal || "";
  const cfg = { ...syncCfg, ...localCfg, apiKey: chosenApiKey };
    els.language.value = cfg.language;
    els.seoProfile.value = cfg.seoProfile;
    if (els.sectionStyleProfile) els.sectionStyleProfile.value = String(cfg.sectionStyleProfile || "general");
    if (els.wpAutoApply) els.wpAutoApply.checked = !!cfg.wpAutoApply;
    if (els.wpAutoApplyRequireMedia) els.wpAutoApplyRequireMedia.checked = (cfg.wpAutoApplyRequireMedia !== undefined) ? !!cfg.wpAutoApplyRequireMedia : true;
    if (els.wpAutoAnalyzeOnUpload) els.wpAutoAnalyzeOnUpload.checked = !!cfg.wpAutoAnalyzeOnUpload;
    if (els.autoAnalyzeOnSelectMedia) els.autoAnalyzeOnSelectMedia.checked = !!cfg.autoAnalyzeOnSelectMedia;
    if (els.autoDeselectProcessedOnAutoFill) els.autoDeselectProcessedOnAutoFill.checked = !!cfg.autoDeselectProcessedOnAutoFill;
    if (els.autoQueueModeVisible) els.autoQueueModeVisible.checked = cfg.autoQueueModeVisible !== false;
    if (els.autoUploadSafetyFuseEnabled) els.autoUploadSafetyFuseEnabled.checked = cfg.autoUploadSafetyFuseEnabled !== false;
    if (els.autoUploadSafetyFuseMaxQueued) els.autoUploadSafetyFuseMaxQueued.value = String(Number.isFinite(Number(cfg.autoUploadSafetyFuseMaxQueued)) ? Number(cfg.autoUploadSafetyFuseMaxQueued) : 24);
    if (els.shortcutEnabled) els.shortcutEnabled.checked = !!cfg.shortcutEnabled;
    if (els.languageAutoEsEs) els.languageAutoEsEs.checked = !!cfg.languageAutoEsEs;
    if (els.allowDecorativeAltEmpty) els.allowDecorativeAltEmpty.checked = !!cfg.allowDecorativeAltEmpty;
    if (els.captionTemplateEnabled) els.captionTemplateEnabled.checked = !!cfg.captionTemplateEnabled;
    if (els.captionTemplate) els.captionTemplate.value = String(cfg.captionTemplate || "{{caption}}");
    signatureState.list = normalizeSignatures(cfg.captionSignatures, cfg.captionSignatureText);
    signatureState.activeId = String(cfg.activeCaptionSignatureId || "").trim();
    if (!signatureState.list.length) {
      signatureState.list = [{ id: "default", name: "Firma principal", text: "" }];
      signatureState.activeId = "default";
    }
    if (els.contextMenuUseSignature) els.contextMenuUseSignature.checked = !!cfg.contextMenuUseSignature;
    renderSignatureUi();
    if (els.autoCaptionSignatureOnAutoFill) els.autoCaptionSignatureOnAutoFill.checked = !!cfg.autoCaptionSignatureOnAutoFill;
    if (els.batchQaModeEnabled) els.batchQaModeEnabled.checked = !!cfg.batchQaModeEnabled;
    if (els.batchQaMinLevel) els.batchQaMinLevel.value = String(cfg.batchQaMinLevel || "ok");
    if (els.debugEnabled) els.debugEnabled.checked = !!cfg.debugEnabled;
    if (els.syncApiKey) els.syncApiKey.checked = !!cfg.syncApiKey;

    if (els.generateMode) els.generateMode.value = String(cfg.generateMode || "both");
    if (els.altMaxLength) els.altMaxLength.value = String(Number.isFinite(Number(cfg.altMaxLength)) ? Number(cfg.altMaxLength) : 125);
    if (els.avoidImagePrefix) els.avoidImagePrefix.checked = (cfg.avoidImagePrefix !== undefined) ? !!cfg.avoidImagePrefix : true;
    if (els.postValidationEnabled) els.postValidationEnabled.checked = !!cfg.postValidationEnabled;
    if (els.postValidationRejectGeneric) els.postValidationRejectGeneric.checked = (cfg.postValidationRejectGeneric !== undefined) ? !!cfg.postValidationRejectGeneric : true;
    if (els.postValidationTitleMinWords) els.postValidationTitleMinWords.value = String(Number.isFinite(Number(cfg.postValidationTitleMinWords)) ? Number(cfg.postValidationTitleMinWords) : 2);
    if (els.postValidationTitleMaxWords) els.postValidationTitleMaxWords.value = String(Number.isFinite(Number(cfg.postValidationTitleMaxWords)) ? Number(cfg.postValidationTitleMaxWords) : 8);
    if (els.postValidationAltMinChars) els.postValidationAltMinChars.value = String(Number.isFinite(Number(cfg.postValidationAltMinChars)) ? Number(cfg.postValidationAltMinChars) : 0);
    if (els.postValidationCaptionMinChars) els.postValidationCaptionMinChars.value = String(Number.isFinite(Number(cfg.postValidationCaptionMinChars)) ? Number(cfg.postValidationCaptionMinChars) : 0);
    if (els.secondPassQualityEnabled) els.secondPassQualityEnabled.checked = !!cfg.secondPassQualityEnabled;
    if (els.onCompleteAction) els.onCompleteAction.value = String(cfg.onCompleteAction || "none");
    if (els.onCompleteScope) els.onCompleteScope.value = String(cfg.onCompleteScope || "wp");
    if (els.historyLimit) els.historyLimit.value = String(Number.isFinite(Number(cfg.historyLimit)) ? Number(cfg.historyLimit) : 20);
    if (els.historyEnabled) els.historyEnabled.checked = cfg.historyEnabled !== false;
    els.provider.value = cfg.provider;

    applyProviderUi(cfg.provider, cfg);
    updateApiKeyHelpText();
    updateCaptionTemplateUi();
    updateAutoFuseUi();
    updateBatchQaUi();

    if (!LOCAL_PROVIDERS.has(cfg.provider)) {
      const providerCfg = PROVIDERS[cfg.provider] || PROVIDERS.openai;
      const inList = providerCfg.models.includes(cfg.model);
      loadModels(cfg.provider, inList ? cfg.model : providerCfg.defaultModel);
      if (els.customModel) els.customModel.value = inList ? "" : (cfg.model || "");
    } else {
      // keep cloud model select populated for later convenience
      loadModels("openai", (PROVIDERS.openai || {}).defaultModel);
      if (els.customModel) els.customModel.value = "";
    }

    els.apiKey.value = cfg.apiKey || "";

    const defaultPrompt =
      DEFAULT_PROMPTS[cfg.seoProfile] || DEFAULT_PROMPTS.blog;

    if (!cfg.prompt) {
      els.prompt.value = "";
      els.prompt.placeholder = defaultPrompt;
    } else {
      els.prompt.value = cfg.prompt;
      els.prompt.placeholder = defaultPrompt;
    }

})();
renderMetricsSummary();


els.captionTemplateEnabled?.addEventListener("change", updateCaptionTemplateUi);
els.autoUploadSafetyFuseEnabled?.addEventListener("change", updateAutoFuseUi);
els.batchQaModeEnabled?.addEventListener("change", updateBatchQaUi);

els.captionSignaturePreset?.addEventListener("change", () => {
  signatureState.activeId = String(els.captionSignaturePreset.value || "");
  renderSignatureUi();
});

els.captionSignatureName?.addEventListener("input", () => {
  const active = getActiveSignature();
  if (!active) return;
  active.name = String(els.captionSignatureName.value || "").trim() || "Firma";
  renderSignatureUi();
});

els.captionSignatureText?.addEventListener("input", () => {
  const active = getActiveSignature();
  if (!active) return;
  active.text = String(els.captionSignatureText.value || "").trim();
});

els.addSignature?.addEventListener("click", () => {
  signatureState.list = Array.isArray(signatureState.list) ? signatureState.list : [];
  const idx = signatureState.list.length + 1;
  const id = makeSignatureId();
  signatureState.list.push({ id, name: `Firma ${idx}`, text: "" });
  signatureState.activeId = id;
  renderSignatureUi();
  els.captionSignatureName?.focus();
});

els.deleteSignature?.addEventListener("click", () => {
  const list = Array.isArray(signatureState.list) ? signatureState.list : [];
  if (list.length <= 1) {
    setStatus("Debe existir al menos una firma.");
    return;
  }
  const activeId = String(signatureState.activeId || "");
  signatureState.list = list.filter((it) => it.id !== activeId);
  signatureState.activeId = signatureState.list[0]?.id || "";
  renderSignatureUi();
});

els.provider.addEventListener("change", () => {
  const p = els.provider.value;
  applyProviderUi(p);
  updateApiKeyHelpText();
  if (!LOCAL_PROVIDERS.has(p)) {
    loadModels(p, PROVIDERS[p].defaultModel);
    if (els.customModel) els.customModel.value = "";
  }
});

els.syncApiKey?.addEventListener("change", () => {
  updateApiKeyHelpText();
});

els.seoProfile.addEventListener("change", () => {
  const profile = els.seoProfile.value;
  const defaultPrompt =
    DEFAULT_PROMPTS[profile] || DEFAULT_PROMPTS.blog;

  if (!els.prompt.value.trim()) {
    els.prompt.placeholder = defaultPrompt;
  }
});


async function updateShortcutInfo() {
  if (!els.shortcutCurrent) return;
  try {
    chrome.commands.getAll((cmds) => {
      const list = Array.isArray(cmds) ? cmds : [];
      const cmd = list.find((c) => c && c.name === "maca-run");
      els.shortcutCurrent.textContent = cmd?.shortcut ? cmd.shortcut : "Sin asignar";
    });
  } catch (_) {
    els.shortcutCurrent.textContent = "-";
  }
}

els.openShortcuts?.addEventListener("click", () => {
  try {
    chrome.tabs.create({ url: "about:addons" });
  } catch (_) {}
});

// Refresh shown shortcut on load
updateShortcutInfo();


function pSet(area, payload) {
  return new Promise((resolve) => {
    chrome.storage[area].set(payload, () => resolve());
  });
}

function pRemove(area, keys) {
  return new Promise((resolve) => {
    chrome.storage[area].remove(keys, () => resolve());
  });
}

els.save.addEventListener("click", async () => {
  const provider = els.provider.value;
  const apiKeyVal = (els.apiKey?.value || "").trim();
  const syncApiKey = !!els.syncApiKey?.checked;
  const normalizedSignatures = normalizeSignatures(signatureState.list);
  const activeSig =
    normalizedSignatures.find((x) => x.id === String(signatureState.activeId || "")) ||
    normalizedSignatures[0] ||
    { id: "", name: "Firma", text: "" };

  const syncPayload = {
    language: els.language.value,
    seoProfile: els.seoProfile.value,
    sectionStyleProfile: String(els.sectionStyleProfile?.value || "general"),
    wpAutoApply: !!els.wpAutoApply?.checked,
    wpAutoApplyRequireMedia: !!els.wpAutoApplyRequireMedia?.checked,
    wpAutoAnalyzeOnUpload: !!els.wpAutoAnalyzeOnUpload?.checked,
    autoAnalyzeOnSelectMedia: !!els.autoAnalyzeOnSelectMedia?.checked,
    autoDeselectProcessedOnAutoFill: !!els.autoDeselectProcessedOnAutoFill?.checked,
    autoQueueModeVisible: !!els.autoQueueModeVisible?.checked,
    autoUploadSafetyFuseEnabled: !!els.autoUploadSafetyFuseEnabled?.checked,
    autoUploadSafetyFuseMaxQueued: Number.isFinite(Number(els.autoUploadSafetyFuseMaxQueued?.value)) ? Number(els.autoUploadSafetyFuseMaxQueued.value) : 24,
    shortcutEnabled: !!els.shortcutEnabled?.checked,
    languageAutoEsEs: !!els.languageAutoEsEs?.checked,
    allowDecorativeAltEmpty: !!els.allowDecorativeAltEmpty?.checked,
    captionTemplateEnabled: !!els.captionTemplateEnabled?.checked,
    captionTemplate: (els.captionTemplate?.value || "{{caption}}").trim() || "{{caption}}",
    contextMenuUseSignature: !!els.contextMenuUseSignature?.checked,
    captionSignatures: normalizedSignatures,
    activeCaptionSignatureId: activeSig.id || "",
    captionSignatureText: String(activeSig.text || "").trim(),
    autoCaptionSignatureOnAutoFill: !!els.autoCaptionSignatureOnAutoFill?.checked,
    debugEnabled: !!els.debugEnabled?.checked,
    syncApiKey,
    generateMode: String(els.generateMode?.value || "both"),
    altMaxLength: Number.isFinite(Number(els.altMaxLength?.value)) ? Number(els.altMaxLength.value) : 125,
    avoidImagePrefix: !!els.avoidImagePrefix?.checked,
    postValidationEnabled: !!els.postValidationEnabled?.checked,
    postValidationRejectGeneric: !!els.postValidationRejectGeneric?.checked,
    postValidationTitleMinWords: Number.isFinite(Number(els.postValidationTitleMinWords?.value)) ? Number(els.postValidationTitleMinWords.value) : 2,
    postValidationTitleMaxWords: Number.isFinite(Number(els.postValidationTitleMaxWords?.value)) ? Number(els.postValidationTitleMaxWords.value) : 8,
    postValidationAltMinChars: Number.isFinite(Number(els.postValidationAltMinChars?.value)) ? Number(els.postValidationAltMinChars.value) : 0,
    postValidationCaptionMinChars: Number.isFinite(Number(els.postValidationCaptionMinChars?.value)) ? Number(els.postValidationCaptionMinChars.value) : 0,
    secondPassQualityEnabled: !!els.secondPassQualityEnabled?.checked,
    batchQaModeEnabled: !!els.batchQaModeEnabled?.checked,
    batchQaMinLevel: String(els.batchQaMinLevel?.value || "ok"),
    onCompleteAction: String(els.onCompleteAction?.value || "none"),
    onCompleteScope: String(els.onCompleteScope?.value || "wp"),
    historyLimit: Number.isFinite(Number(els.historyLimit?.value)) ? Number(els.historyLimit.value) : 20,
    historyEnabled: !!els.historyEnabled?.checked,
    provider,
    model: getEffectiveModel(provider),
    prompt: els.prompt.value.trim(),
    localEndpoint: LOCAL_PROVIDERS.has(provider)
      ? normalizeEndpoint(els.localEndpoint?.value)
      : "",
    localModel: LOCAL_PROVIDERS.has(provider)
      ? (els.localModel?.value || "").trim()
      : ""
  };

  // Persist API key either in sync (Google) or locally.
  // Keep the other storage clean to avoid ambiguity.
  if (syncApiKey) {
    syncPayload.apiKey = apiKeyVal;
  }

  await pSet("sync", syncPayload);

  if (syncApiKey) {
    await pRemove("local", ["apiKey"]);
  } else {
    await pSet("local", { apiKey: apiKeyVal });
    await pRemove("sync", ["apiKey"]);
  }

  els.status.textContent = "âœ” ConfiguraciÃ³n guardada";
  setTimeout(() => (els.status.textContent = ""), 2000);
});

// Tools
els.testConfig?.addEventListener("click", async () => {
  els.status.textContent = "Probando configuraciÃ³n...";
  els.testConfig.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: "MACA_TEST_CONFIG" });
    if (res?.ok) {
      const warn = Array.isArray(res.warnings) && res.warnings.length ? `  Â·  Avisos: ${res.warnings.join(" | ")}` : "";
      els.status.textContent = `âœ” OK (${res.provider}${res.model ? ` Â· ${res.model}` : ""})${warn}`;
    } else {
      els.status.textContent = `âœ– ${res?.error || "Error al probar la configuraciÃ³n"}`;
    }
  } catch (e) {
    els.status.textContent = `âœ– ${e?.message || String(e)}`;
  } finally {
    setTimeout(() => (els.status.textContent = ""), 6000);
    els.testConfig.disabled = false;
  }
});

els.clearHistory?.addEventListener("click", () => {
  if (!confirm("Â¿Vaciar el historial guardado por maca?")) return;
  chrome.storage.local.remove(["history", "lastJob"], () => {
    els.status.textContent = "âœ” Historial vaciado";
    setTimeout(() => (els.status.textContent = ""), 2000);
  });
});

els.exportConfig?.addEventListener("click", async () => {
  try {
    const syncCfg = await chrome.storage.sync.get(null);
    const localCfg = await chrome.storage.local.get({ apiKey: "" });
    const payload = {
      version: (chrome.runtime.getManifest?.().version || "unknown"),
      exportedAt: new Date().toISOString(),
      sync: syncCfg || {},
      local: {
        apiKey: String(localCfg?.apiKey || "")
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maca-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("ConfiguraciÃ³n exportada.");
  } catch (_) {
    setStatus("No se pudo exportar la configuraciÃ³n.");
  }
});

els.importConfig?.addEventListener("click", () => {
  els.importConfigFile?.click();
});

els.importConfigFile?.addEventListener("change", async () => {
  const file = els.importConfigFile?.files?.[0];
  if (!file) return;
  try {
    const txt = await file.text();
    const parsed = JSON.parse(txt);
    if (!parsed || typeof parsed !== "object" || typeof parsed.sync !== "object") {
      throw new Error("Formato invÃ¡lido");
    }
    await pSet("sync", parsed.sync || {});
    if (parsed.local && typeof parsed.local === "object" && typeof parsed.local.apiKey === "string") {
      await pSet("local", { apiKey: parsed.local.apiKey });
    }
    setStatus("ConfiguraciÃ³n importada. Recargando...", { timeoutMs: 1200 });
    setTimeout(() => location.reload(), 1300);
  } catch (_) {
    setStatus("No se pudo importar el JSON.");
  } finally {
    if (els.importConfigFile) els.importConfigFile.value = "";
  }
});

els.reset.addEventListener("click", () => {
  if (!confirm("Â¿Restablecer configuraciÃ³n?")) return;
  chrome.storage.sync.clear(() => {
    chrome.storage.local.remove(["apiKey", "history", "lastJob", "metrics"], () => location.reload());
  });
});

// If the options page is opened with an anchor (e.g. from the popup), scroll to that section.
try {
  if (location.hash === "#privacy") {
    setTimeout(() => document.getElementById("privacy")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
} catch (_) {}

