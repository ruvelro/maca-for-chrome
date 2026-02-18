export function nowIso() {
  return new Date().toISOString();
}

export function clampHistory(items, maxLen) {
  if (!Array.isArray(items)) return [];
  const n = Number(maxLen);
  // maxLen === 0 => unlimited (until Chrome storage quota)
  if (!Number.isFinite(n) || n < 0 || n === 0) return items;
  return items.slice(0, Math.max(0, n | 0));
}

export function safeJsonParse(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

export function normalizeEndpoint(url) {
  let s = String(url || "").trim();
  if (!s) return "";
  // If user omitted scheme, assume http://
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(s)) s = `http://${s}`;
  s = s.replace(/\/+$/, "");
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href.replace(/\/+$/, "");
  } catch (_) {
    return "";
  }
}

export function isAllowedImageUrl(u) {
  // Only allow http(s) and data: for safety.
  try {
    const url = new URL(String(u || ""));
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "data:";
  } catch (_) {
    return false;
  }
}

function parseDataUrlMeta(dataUrl) {
  // data:[<mime>][;base64],<data>
  const m = String(dataUrl || "").match(/^data:([^;,]*)(;base64)?,/i);
  const mime = (m?.[1] || "application/octet-stream").toLowerCase();
  const isBase64 = !!m?.[2];
  const comma = String(dataUrl || "").indexOf(",");
  const payload = comma >= 0 ? String(dataUrl).slice(comma + 1) : "";
  return { mime, isBase64, payload };
}

// Normalize ALT text for accessibility/SEO.
// - Collapses whitespace
// - Optionally removes common "imagen/foto de..." prefixes
// - Optionally enforces a max length (0 => unlimited)
export function normalizeAltText(alt, maxLen = 125, avoidPrefix = true) {
  let s = String(alt || "").trim();
  // Remove common prefixes that hurt accessibility/SEO.
  if (avoidPrefix) s = s.replace(/^\s*(imagen|foto)\s+de\s+/i, "");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ");
  const n = Number(maxLen);
  if (Number.isFinite(n) && n > 0 && s.length > n) s = s.slice(0, n).trim();
  return s;
}

export function normalizeCaptionText(caption) {
  return String(caption || "").trim().replace(/\s+/g, " ");
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const externalSignal = options?.signal;
  let removeExternalAbort = null;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else {
      const onAbort = () => controller.abort();
      externalSignal.addEventListener("abort", onAbort, { once: true });
      removeExternalAbort = () => externalSignal.removeEventListener("abort", onAbort);
    }
  }
  const id = setTimeout(() => controller.abort(), Math.max(1, timeoutMs | 0));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
    try { removeExternalAbort?.(); } catch (_) {}
  }
}

export function pickOutputTextFromOpenAIResponse(respJson) {
  if (typeof respJson?.output_text === "string" && respJson.output_text.trim()) {
    return respJson.output_text.trim();
  }

  const out = respJson?.output;
  if (Array.isArray(out)) {
    const texts = [];
    for (const item of out) {
      if (item?.type === "message" && Array.isArray(item?.content)) {
        for (const part of item.content) {
          if (part?.type === "output_text" && typeof part?.text === "string") texts.push(part.text);
          if (part?.type === "text" && typeof part?.text === "string") texts.push(part.text);
        }
      }
    }
    const joined = texts.join("\n").trim();
    if (joined) return joined;
  }
  return "";
}

export async function toBase64DataUrlFromUrl(imageUrl, signal = null) {
  if (!isAllowedImageUrl(imageUrl)) {
    throw new Error("URL de imagen no soportada por seguridad.");
  }

  const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB

  // data: URLs: avoid network fetch and validate size defensively.
  if (String(imageUrl).startsWith("data:")) {
    const { mime, isBase64, payload } = parseDataUrlMeta(imageUrl);
    if (isBase64) {
      // Approx bytes = 3/4 of b64 length (ignore padding)
      const cleaned = payload.replace(/\s+/g, "");
      const approxBytes = Math.floor((cleaned.length * 3) / 4);
      if (approxBytes > MAX_IMAGE_BYTES) {
        throw new Error("La imagen es demasiado grande para analizarla (máx. 25MB).");
      }
    } else {
      // Percent-encoded text; approximate conservatively as UTF-8 length
      if (payload.length > MAX_IMAGE_BYTES) {
        throw new Error("La imagen es demasiado grande para analizarla (máx. 25MB).");
      }
    }
    if (!mime.startsWith("image/")) {
      throw new Error("La URL no parece ser una imagen válida.");
    }
    return { dataUrl: String(imageUrl), mime };
  }

  const res = await fetchWithTimeout(
    imageUrl,
    { credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: signal || undefined },
    25000
  );
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status}).`);
  const blob = await res.blob();
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("La imagen es demasiado grande para analizarla (máx. 25MB).");
  }
  const mime = (blob.type || "application/octet-stream").toLowerCase();
  if (mime && mime !== "application/octet-stream" && !mime.startsWith("image/")) {
    throw new Error("La URL no parece ser una imagen válida.");
  }

  // Convert to base64 safely (avoid spread/apply argument limits that can throw
  // "Maximum call stack size exceeded" on large chunks).
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x2000; // 8192 chars per chunk stays well under arg limits
  for (let i = 0; i < bytes.length; i += chunkSize) {
    // eslint-disable-next-line prefer-spread
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  const b64 = btoa(binary);
  return { dataUrl: `data:${mime};base64,${b64}`, mime };
}

export function renderPrompt(tpl, vars) {
  return String(tpl || "")
    .replaceAll("{{LANG}}", vars.LANG || "es-ES")
    .replaceAll("{{PAGE_URL}}", vars.PAGE_URL || "")
    .replaceAll("{{IMG_URL}}", vars.IMG_URL || "");
}
