const HISTORY_PREVIEW_LIMIT = 8;

const els = {
  q: document.getElementById("q"),
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  toast: document.getElementById("toast"),
  openOptions: document.getElementById("openOptions"),
  openOptionsAdvanced: document.getElementById("openOptionsAdvanced"),
  openPrivacy: document.getElementById("openPrivacy"),
  clearHistory: document.getElementById("clearHistory"),
  historyInfo: document.getElementById("historyInfo"),
  quickEnabled: document.getElementById("quickEnabled"),
  quickUseSignature: document.getElementById("quickUseSignature"),
  quickAutoUpload: document.getElementById("quickAutoUpload"),
  quickSignaturePreset: document.getElementById("quickSignaturePreset")
};

let quickState = {
  extensionEnabled: true,
  contextMenuUseSignature: false,
  wpAutoAnalyzeOnUpload: false,
  captionSignatures: [],
  activeCaptionSignatureId: ""
};

function normalizeSignatures(list, legacyText = "") {
  const out = [];
  const src = Array.isArray(list) ? list : [];
  for (const it of src) {
    if (!it || typeof it !== "object") continue;
    const id = String(it.id || "").trim();
    const name = String(it.name || "").trim() || "Firma";
    const text = String(it.text || "").trim();
    if (!id) continue;
    out.push({ id, name, text });
  }
  if (!out.length) {
    const legacy = String(legacyText || "").trim();
    if (legacy) out.push({ id: "default", name: "Firma principal", text: legacy });
  }
  return out;
}

function getActiveSignature() {
  const list = Array.isArray(quickState.captionSignatures) ? quickState.captionSignatures : [];
  if (!list.length) return null;
  const activeId = String(quickState.activeCaptionSignatureId || "");
  return list.find((x) => x.id === activeId) || list[0] || null;
}

function fmtTimeFromItem(item) {
  try {
    const ts =
      (typeof item?.ts === "number" && Number.isFinite(item.ts)) ? item.ts :
        (typeof item?.ts === "string" && item.ts.trim() ? Number(item.ts) : NaN);
    const t2 = Number.isFinite(ts) ? ts :
      (item?.time ? Date.parse(item.time) : NaN);
    const d = new Date(Number.isFinite(t2) ? t2 : 0);
    return d.toLocaleString("es-ES", { hour12: false });
  } catch (_) {
    return "";
  }
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return "";
  }
}

function toast(msg) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (els.toast.hidden = true), 1400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado");
  } catch (_) {
    toast("No se pudo copiar");
  }
}

function renderQuickUi() {
  if (els.quickEnabled) els.quickEnabled.checked = !!quickState.extensionEnabled;
  if (els.quickUseSignature) els.quickUseSignature.checked = !!quickState.contextMenuUseSignature;
  if (els.quickAutoUpload) els.quickAutoUpload.checked = !!quickState.wpAutoAnalyzeOnUpload;

  if (!els.quickSignaturePreset) return;
  const list = Array.isArray(quickState.captionSignatures) ? quickState.captionSignatures : [];
  els.quickSignaturePreset.innerHTML = "";
  if (!list.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sin firmas";
    els.quickSignaturePreset.appendChild(opt);
    els.quickSignaturePreset.disabled = true;
    return;
  }
  const active = getActiveSignature() || list[0];
  quickState.activeCaptionSignatureId = active.id;
  for (const it of list) {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.name;
    if (it.id === active.id) opt.selected = true;
    els.quickSignaturePreset.appendChild(opt);
  }
  els.quickSignaturePreset.disabled = false;
}

function renderItem(item) {
  const card = document.createElement("div");
  card.className = "card";

  const meta = document.createElement("div");
  meta.className = "meta";
  const chips = [];
  chips.push(fmtTimeFromItem(item));
  const site = item.site || safeHost(item.pageUrl);
  if (site) chips.push(site);
  if (item.mode) chips.push(String(item.mode));
  for (const text of chips) {
    const s = String(text || "").trim();
    if (!s) continue;
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = s;
    meta.appendChild(chip);
  }

  const altK = document.createElement("div");
  altK.className = "k";
  altK.textContent = "ALT";
  const altV = document.createElement("div");
  altV.className = "v";
  altV.textContent = item.alt || "";

  const titleK = document.createElement("div");
  titleK.className = "k";
  titleK.textContent = "Title";
  const titleV = document.createElement("div");
  titleV.className = "v";
  titleV.textContent = item.title || "";

  const capK = document.createElement("div");
  capK.className = "k";
  capK.textContent = "Leyenda";
  const capV = document.createElement("div");
  capV.className = "v";
  capV.textContent = item.leyenda || "";

  const row = document.createElement("div");
  row.className = "rowbtn";

  const bAlt = document.createElement("button");
  bAlt.className = "btn";
  bAlt.textContent = "Copiar ALT";
  bAlt.addEventListener("click", () => copyText(item.alt || ""));

  const bCap = document.createElement("button");
  bCap.className = "btn";
  bCap.textContent = "Copiar leyenda";
  bCap.addEventListener("click", () => copyText(item.leyenda || ""));

  const bBoth = document.createElement("button");
  bBoth.className = "btn primary";
  bBoth.textContent = "Copiar todo";
  bBoth.addEventListener("click", async () => {
    const a = (item.alt || "").trim();
    const t = (item.title || "").trim();
    const c = (item.leyenda || "").trim();
    const parts = [];
    if (a) parts.push(`ALT: ${a}`);
    if (t) parts.push(`Title: ${t}`);
    if (c) parts.push(`Leyenda: ${c}`);
    await copyText(parts.join("\n\n") || (a || t || c));
  });

  row.appendChild(bAlt);
  row.appendChild(bCap);
  row.appendChild(bBoth);

  card.appendChild(meta);
  card.appendChild(altK);
  card.appendChild(altV);
  card.appendChild(titleK);
  card.appendChild(titleV);
  card.appendChild(capK);
  card.appendChild(capV);
  card.appendChild(row);

  return card;
}

function applyFilter(items, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return items;
  return items.filter((it) => {
    const hay = `${it.alt || ""}\n${it.title || ""}\n${it.leyenda || ""}\n${it.site || ""}`.toLowerCase();
    return hay.includes(s);
  });
}

async function loadCfg() {
  const cfg = await chrome.storage.sync.get({
    historyEnabled: true,
    extensionEnabled: true,
    contextMenuUseSignature: false,
    wpAutoAnalyzeOnUpload: false,
    captionSignatures: [],
    activeCaptionSignatureId: "",
    captionSignatureText: ""
  });
  return cfg || {
    historyEnabled: true,
    extensionEnabled: true,
    contextMenuUseSignature: false,
    wpAutoAnalyzeOnUpload: false,
    captionSignatures: [],
    activeCaptionSignatureId: "",
    captionSignatureText: ""
  };
}

async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  return Array.isArray(history) ? history : [];
}

async function render() {
  const items = await loadHistory();
  const filtered = applyFilter(items, els.q?.value);
  const cfg = await loadCfg();

  quickState.extensionEnabled = cfg.extensionEnabled !== false;
  quickState.contextMenuUseSignature = !!cfg.contextMenuUseSignature;
  quickState.wpAutoAnalyzeOnUpload = !!cfg.wpAutoAnalyzeOnUpload;
  quickState.captionSignatures = normalizeSignatures(cfg.captionSignatures, cfg.captionSignatureText);
  quickState.activeCaptionSignatureId = String(cfg.activeCaptionSignatureId || "");
  renderQuickUi();

  const hasQuery = !!String(els.q?.value || "").trim();
  const shown = hasQuery ? filtered : filtered.slice(0, HISTORY_PREVIEW_LIMIT);
  if (els.historyInfo) {
    if (hasQuery) els.historyInfo.textContent = `${filtered.length} resultado(s) filtrados.`;
    else if (filtered.length > HISTORY_PREVIEW_LIMIT) els.historyInfo.textContent = `Mostrando ${HISTORY_PREVIEW_LIMIT} de ${filtered.length} elementos recientes.`;
    else els.historyInfo.textContent = `${filtered.length} elemento(s) en historial.`;
  }

  els.list.innerHTML = "";
  els.empty.hidden = shown.length !== 0;
  if (!els.empty.hidden) {
    els.empty.textContent = (cfg.historyEnabled === false)
      ? "El historial está desactivado en Ajustes."
      : "No hay elementos en el historial.";
  }

  for (const it of shown) {
    els.list.appendChild(renderItem(it));
  }
}

async function saveQuickPatch(patch) {
  await chrome.storage.sync.set(patch);
}

els.q?.addEventListener("input", () => void render());

els.openOptions?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage?.();
});

els.openOptionsAdvanced?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage?.();
});

els.openPrivacy?.addEventListener("click", (e) => {
  e.preventDefault();
  try {
    const url = chrome.runtime.getURL("options.html#privacy");
    chrome.tabs?.create?.({ url });
  } catch (_) {
    chrome.runtime.openOptionsPage?.();
  }
});

els.clearHistory?.addEventListener("click", async () => {
  await chrome.storage.local.set({ history: [] });
  toast("Historial vaciado");
  await render();
});

els.quickEnabled?.addEventListener("change", async () => {
  const on = !!els.quickEnabled.checked;
  quickState.extensionEnabled = on;
  await saveQuickPatch({ extensionEnabled: on });
  toast(on ? "Extensión activada" : "Extensión desactivada");
});

els.quickUseSignature?.addEventListener("change", async () => {
  const on = !!els.quickUseSignature.checked;
  quickState.contextMenuUseSignature = on;
  await saveQuickPatch({ contextMenuUseSignature: on });
  toast(on ? "Firma manual activada" : "Firma manual desactivada");
});

els.quickAutoUpload?.addEventListener("change", async () => {
  const on = !!els.quickAutoUpload.checked;
  quickState.wpAutoAnalyzeOnUpload = on;
  await saveQuickPatch({ wpAutoAnalyzeOnUpload: on });
  toast(on ? "Auto-subida activada" : "Auto-subida desactivada");
});

els.quickSignaturePreset?.addEventListener("change", async () => {
  const id = String(els.quickSignaturePreset.value || "");
  quickState.activeCaptionSignatureId = id;
  const active = getActiveSignature();
  await saveQuickPatch({
    activeCaptionSignatureId: id,
    captionSignatureText: String(active?.text || "")
  });
  toast("Firma activa actualizada");
});

render().catch(() => {});
