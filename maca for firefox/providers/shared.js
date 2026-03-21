/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
import {
  safeJsonParse,
  pickOutputTextFromOpenAIResponse,
  normalizeEndpoint
} from "../util.js";

export function buildOpenAICompatUrl(endpoint) {
  const base = normalizeEndpoint(endpoint || "");
  if (!base) return "";
  return /\/chat\/completions$/i.test(base) ? base : `${base.replace(/\/+$/, "")}/chat/completions`;
}

export async function safeJson(res, timeoutMs = 30000) {
  try {
    const textPromise = res.text();
    const text = await Promise.race([
      textPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout leyendo respuesta JSON.")), timeoutMs))
    ]);
    return safeJsonParse(text) || {};
  } catch (_) {
    return {};
  }
}

export function isOpenRouterGlm(provider, model) {
  return String(provider || "") === "openrouter" && /glm/i.test(String(model || ""));
}

export function getOpenRouterGlmQualityPrompt(mode) {
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

export function pickTextFromOpenAICompat(json) {
  if (!json) return "";
  if (json.output) {
    try {
      return pickOutputTextFromOpenAIResponse(json);
    } catch (_) {}
  }
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => p?.text || p?.content || "").filter(Boolean).join("\n");
  }
  return json?.choices?.[0]?.text || "";
}

export function shouldFallbackOpenRouterCompatibility(status, json) {
  if (status !== 400 && status !== 422) return false;
  const msg = String(json?.error?.message || json?.error || json?.message || "").toLowerCase();
  return (
    msg.includes("response_format") ||
    msg.includes("json_schema") ||
    msg.includes("reasoning") ||
    msg.includes("provider") ||
    msg.includes("unsupported parameter") ||
    msg.includes("invalid parameter")
  );
}

export function isRetriableOpenRouterStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function trimErrorText(v, maxLen = 260) {
  const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s;
}

export function extractOpenRouterErrorMessage(status, json) {
  const parts = [];
  const base = trimErrorText(json?.error?.message || json?.error || json?.message || "");
  if (base) parts.push(base);
  const code = trimErrorText(json?.error?.code || json?.code || "");
  if (code) parts.push(`code=${code}`);
  const provider = trimErrorText(json?.error?.metadata?.provider_name || json?.provider || json?.error?.provider || "");
  if (provider) parts.push(`provider=${provider}`);
  const upstream = trimErrorText(json?.error?.metadata?.raw || json?.error?.metadata?.upstream_error || json?.error?.metadata?.cause || "");
  if (upstream) parts.push(`upstream=${upstream}`);
  if (parts.length) return parts.join(" | ");
  return `Error OpenRouter (${status})`;
}

export async function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
