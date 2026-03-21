/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
export const DEFAULT_SYNC_CFG = {
  language: "es-ES",
  languageAutoEsEs: false,
  seoProfile: "blog",
  wpAutoApply: false,
  wpAutoApplyRequireMedia: true,
  wpAutoAnalyzeOnUpload: false,
  autoAnalyzeOnSelectMedia: false,
  autoDeselectProcessedOnAutoFill: false,
  onCompleteAction: "none",
  onCompleteScope: "wp",
  historyLimit: 20,
  historyEnabled: true,
  generateMode: "both",
  sectionStyleProfile: "general",
  altMaxLength: 125,
  avoidImagePrefix: true,
  secondPassQualityEnabled: false,
  allowDecorativeAltEmpty: false,
  captionTemplateEnabled: false,
  captionTemplate: "{{caption}}",
  captionSignatureText: "",
  captionSignatures: [],
  activeCaptionSignatureId: "",
  contextMenuUseSignature: false,
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
  batchQaModeEnabled: false,
  batchQaMinLevel: "ok",
  debugEnabled: false,
  shortcutEnabled: false,
  syncApiKey: false,
  extensionEnabled: true,
  provider: "openai",
  model: "gpt-5-mini",
  prompt: "",
  localEndpoint: "",
  localModel: ""
};

export const DEFAULT_LOCAL_CFG = { apiKey: "", metrics: {} };

let cfgCache = null;
let cfgCachePromise = null;
let configCacheInitialized = false;

export async function readConfigFromStorage(chromeApi = chrome) {
  const syncStored = await chromeApi.storage.sync.get(null);
  const syncCfg = { ...DEFAULT_SYNC_CFG, ...(syncStored || {}) };
  const localCfg = await chromeApi.storage.local.get(DEFAULT_LOCAL_CFG);

  const apiKeySync = syncStored?.apiKey || "";
  const apiKeyLocal = localCfg?.apiKey || "";
  let apiKey = syncCfg.syncApiKey ? apiKeySync : apiKeyLocal;
  if (!apiKey) apiKey = apiKeySync || apiKeyLocal || "";

  return { ...syncCfg, ...localCfg, apiKey };
}

export async function getConfigCached({ force = false } = {}, chromeApi = chrome) {
  if (!force && cfgCache) return cfgCache;
  if (cfgCachePromise) return await cfgCachePromise;

  cfgCachePromise = (async () => {
    const cfg = await readConfigFromStorage(chromeApi);
    cfgCache = cfg;
    return cfg;
  })();

  try {
    return await cfgCachePromise;
  } finally {
    cfgCachePromise = null;
  }
}

export function initConfigCache(chromeApi = chrome) {
  if (configCacheInitialized) return;
  configCacheInitialized = true;
  chromeApi.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    if (!cfgCache) return;

    const allowedKeys = new Set([
      ...Object.keys(DEFAULT_SYNC_CFG),
      ...Object.keys(DEFAULT_LOCAL_CFG)
    ]);

    for (const [key, change] of Object.entries(changes || {})) {
      if (key === "syncApiKey") {
        cfgCache = null;
        return;
      }
      if (key === "apiKey") {
        const useSync = cfgCache.syncApiKey === true;
        const shouldApply = (area === "sync" && useSync) || (area === "local" && !useSync);
        if (shouldApply) {
          const nv = change?.newValue;
          cfgCache.apiKey = (nv === undefined || nv === null) ? "" : String(nv);
        }
        continue;
      }
      if (!allowedKeys.has(key)) continue;
      if (change && "newValue" in change) {
        const nv = change.newValue;
        if (nv === undefined) {
          if (key in DEFAULT_SYNC_CFG) cfgCache[key] = DEFAULT_SYNC_CFG[key];
          else if (key in DEFAULT_LOCAL_CFG) cfgCache[key] = DEFAULT_LOCAL_CFG[key];
          else delete cfgCache[key];
        } else {
          cfgCache[key] = nv;
        }
      }
    }
  });
}
