import { DEFAULT_PROMPTS } from "./prompts.js";
import { normalizeEndpoint } from "./util.js";

const els = {
  language: document.getElementById("language"),
  seoProfile: document.getElementById("seoProfile"),
  wpAutoApply: document.getElementById("wpAutoApply"),
  wpAutoApplyRequireMedia: document.getElementById("wpAutoApplyRequireMedia"),
  generateMode: document.getElementById("generateMode"),
  altMaxLength: document.getElementById("altMaxLength"),
  avoidImagePrefix: document.getElementById("avoidImagePrefix"),
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
  debugEnabled: document.getElementById("debugEnabled"),
  copyDebug: document.getElementById("copyDebug"),
  clearDebug: document.getElementById("clearDebug"),
  testConfig: document.getElementById("testConfig"),
  clearHistory: document.getElementById("clearHistory"),
  historyEnabled: document.getElementById("historyEnabled"),
  copySupport: document.getElementById("copySupport"),
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


// Debug (diagnóstico)
els.copyDebug?.addEventListener("click", async () => {
  const { debugLog = [] } = await chrome.storage.local.get({ debugLog: [] });
  try {
    await navigator.clipboard.writeText(JSON.stringify(debugLog, null, 2));
    setStatus("Diagnóstico copiado al portapapeles.");
  } catch (_) {
    setStatus("No se pudo copiar el diagnóstico.");
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
  setStatus("Diagnóstico borrado.");
});


const PROVIDERS = {
  openai: {
    defaultModel: "gpt-5-mini",
    models: [
      "gpt-5.2",
      "gpt-5.2-pro",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4o"
    ]
  },
  gemini: {
    defaultModel: "gemini-2.5-flash",
    models: [
      "gemini-3-pro-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite"
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
          "Solo si tu servidor local requiere autenticación (normalmente se deja vacío).";
      if (els.apiKey) els.apiKey.placeholder = "(opcional)";
    } else {
      if (els.apiKeyLabel) els.apiKeyLabel.textContent = "API key";
      if (els.apiKey) els.apiKey.placeholder = "Pega aquí tu API key";
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
      "Solo si tu servidor local requiere autenticación (normalmente se deja vacío).";
    return;
  }
  if (provider === "local_ollama") {
    els.apiKeyHelp.textContent = "";
    return;
  }
  const syncOn = !!els.syncApiKey?.checked;
  els.apiKeyHelp.textContent = syncOn
    ? "La clave se sincroniza con tu cuenta de Chrome."
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
    wpAutoApply: false,
    wpAutoApplyRequireMedia: true,
    generateMode: "both",
    altMaxLength: 125,
    avoidImagePrefix: true,
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
    debugEnabled: false,
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
    if (els.wpAutoApply) els.wpAutoApply.checked = !!cfg.wpAutoApply;
    if (els.wpAutoApplyRequireMedia) els.wpAutoApplyRequireMedia.checked = (cfg.wpAutoApplyRequireMedia !== undefined) ? !!cfg.wpAutoApplyRequireMedia : true;
    if (els.shortcutEnabled) els.shortcutEnabled.checked = !!cfg.shortcutEnabled;
    if (els.languageAutoEsEs) els.languageAutoEsEs.checked = !!cfg.languageAutoEsEs;
    if (els.allowDecorativeAltEmpty) els.allowDecorativeAltEmpty.checked = !!cfg.allowDecorativeAltEmpty;
    if (els.captionTemplateEnabled) els.captionTemplateEnabled.checked = !!cfg.captionTemplateEnabled;
    if (els.captionTemplate) els.captionTemplate.value = String(cfg.captionTemplate || "{{caption}}");
    if (els.debugEnabled) els.debugEnabled.checked = !!cfg.debugEnabled;
    if (els.syncApiKey) els.syncApiKey.checked = !!cfg.syncApiKey;

    if (els.generateMode) els.generateMode.value = String(cfg.generateMode || "both");
    if (els.altMaxLength) els.altMaxLength.value = String(Number.isFinite(Number(cfg.altMaxLength)) ? Number(cfg.altMaxLength) : 125);
    if (els.avoidImagePrefix) els.avoidImagePrefix.checked = (cfg.avoidImagePrefix !== undefined) ? !!cfg.avoidImagePrefix : true;
    if (els.onCompleteAction) els.onCompleteAction.value = String(cfg.onCompleteAction || "none");
    if (els.onCompleteScope) els.onCompleteScope.value = String(cfg.onCompleteScope || "wp");
    if (els.historyLimit) els.historyLimit.value = String(Number.isFinite(Number(cfg.historyLimit)) ? Number(cfg.historyLimit) : 20);
    if (els.historyEnabled) els.historyEnabled.checked = cfg.historyEnabled !== false;
    els.provider.value = cfg.provider;

    applyProviderUi(cfg.provider, cfg);
    updateApiKeyHelpText();
    updateCaptionTemplateUi();

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


els.captionTemplateEnabled?.addEventListener("change", updateCaptionTemplateUi);

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
    els.shortcutCurrent.textContent = "—";
  }
}

els.openShortcuts?.addEventListener("click", () => {
  try {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
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

  const syncPayload = {
    language: els.language.value,
    seoProfile: els.seoProfile.value,
    wpAutoApply: !!els.wpAutoApply?.checked,
    wpAutoApplyRequireMedia: !!els.wpAutoApplyRequireMedia?.checked,
    shortcutEnabled: !!els.shortcutEnabled?.checked,
    languageAutoEsEs: !!els.languageAutoEsEs?.checked,
    allowDecorativeAltEmpty: !!els.allowDecorativeAltEmpty?.checked,
    captionTemplateEnabled: !!els.captionTemplateEnabled?.checked,
    captionTemplate: (els.captionTemplate?.value || "{{caption}}").trim() || "{{caption}}",
    debugEnabled: !!els.debugEnabled?.checked,
    syncApiKey,
    generateMode: String(els.generateMode?.value || "both"),
    altMaxLength: Number.isFinite(Number(els.altMaxLength?.value)) ? Number(els.altMaxLength.value) : 125,
    avoidImagePrefix: !!els.avoidImagePrefix?.checked,
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

  els.status.textContent = "✔ Configuración guardada";
  setTimeout(() => (els.status.textContent = ""), 2000);
});

// Tools
els.testConfig?.addEventListener("click", async () => {
  els.status.textContent = "Probando configuración...";
  els.testConfig.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: "MACA_TEST_CONFIG" });
    if (res?.ok) {
      const warn = Array.isArray(res.warnings) && res.warnings.length ? `  ·  Avisos: ${res.warnings.join(" | ")}` : "";
      els.status.textContent = `✔ OK (${res.provider}${res.model ? ` · ${res.model}` : ""})${warn}`;
    } else {
      els.status.textContent = `✖ ${res?.error || "Error al probar la configuración"}`;
    }
  } catch (e) {
    els.status.textContent = `✖ ${e?.message || String(e)}`;
  } finally {
    setTimeout(() => (els.status.textContent = ""), 6000);
    els.testConfig.disabled = false;
  }
});

els.clearHistory?.addEventListener("click", () => {
  if (!confirm("¿Vaciar el historial guardado por maca?")) return;
  chrome.storage.local.remove(["history", "lastJob"], () => {
    els.status.textContent = "✔ Historial vaciado";
    setTimeout(() => (els.status.textContent = ""), 2000);
  });
});

els.reset.addEventListener("click", () => {
  if (!confirm("¿Restablecer configuración?")) return;
  chrome.storage.sync.clear(() => {
    chrome.storage.local.remove(["apiKey", "history", "lastJob"], () => location.reload());
  });
});

// If the options page is opened with an anchor (e.g. from the popup), scroll to that section.
try {
  if (location.hash === "#privacy") {
    setTimeout(() => document.getElementById("privacy")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
} catch (_) {}