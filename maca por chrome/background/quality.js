/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
import { normalizeAltText, normalizeCaptionText } from "../util.js";

export function normalizeTitleText(title, { minWords = 2, maxWords = 8 } = {}) {
  let s = normalizeCaptionText(title || "");
  if (!s) return "";
  const words = s.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length > Math.max(1, maxWords)) s = words.slice(0, Math.max(1, maxWords)).join(" ");
  return s.trim();
}

export function ensureTrailingPeriod(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (/[.!?…]$/.test(s)) return s;
  return `${s}.`;
}

export function ensureAltTrailingPeriodWithinLimit(text, maxLen) {
  let s = String(text || "").trim();
  if (!s) return "";
  if (/[.!?…]$/.test(s)) return s;
  const n = Number(maxLen);
  if (Number.isFinite(n) && n > 0 && (s.length + 1) > n) s = s.slice(0, Math.max(0, n - 1)).trim();
  return `${s}.`;
}

function countWords(s) {
  const t = String(s || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function isGenericText(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return true;
  return ["imagen de", "foto de", "escena principal de la imagen", "contenido multimedia", "imagen", "foto"].includes(t);
}

export function buildSeoReview({ mode, alt, title, leyenda, cfg, altAllowedEmpty }) {
  const m = String(mode || "both");
  const out = { level: "ok", badge: "OK", score: 100, issues: [], suggestions: [] };
  const pushIssue = (severity, field, message, suggestion = "") => {
    out.issues.push({ severity, field, message });
    if (suggestion) out.suggestions.push(suggestion);
    out.score -= severity === "error" ? 30 : 12;
  };
  const altTxt = String(alt || "").trim();
  const titleTxt = String(title || "").trim();
  const capTxt = String(leyenda || "").trim();
  const altMax = Number.isFinite(Number(cfg?.altMaxLength)) ? Number(cfg.altMaxLength) : 125;
  if (m !== "caption") {
    if (!altAllowedEmpty) {
      if (!altTxt) pushIssue("error", "alt", "ALT vacío.", "Describe el sujeto principal visible en la imagen.");
      else if (altTxt.length < 12) pushIssue("warning", "alt", "ALT demasiado corto.", "Añade un poco más de contexto visual.");
    }
    if (altMax > 0 && altTxt.length > altMax) pushIssue("error", "alt", `ALT supera ${altMax} caracteres.`, "Acorta el ALT manteniendo solo lo esencial.");
    if (isGenericText(altTxt)) pushIssue("error", "alt", "ALT demasiado genérico.", "Sustituye por una descripción concreta de lo visible.");
    if (/^\s*(imagen|foto)\s+de\b/i.test(altTxt)) pushIssue("warning", "alt", "ALT empieza por 'imagen/foto de'.", "Empieza directamente por el contenido visible.");
    const tw = countWords(titleTxt);
    if (!titleTxt) pushIssue("warning", "title", "Title vacío.", "Usa un title breve de 2 a 8 palabras.");
    else {
      if (tw < 2) pushIssue("warning", "title", "Title demasiado corto.", "Usa entre 2 y 8 palabras.");
      if (tw > 8) pushIssue("warning", "title", "Title demasiado largo.", "Reduce el title a 2-8 palabras.");
    }
  }
  if (m !== "alt") {
    if (!capTxt) pushIssue("error", "leyenda", "Leyenda vacía.", "Añade una frase editorial breve.");
    else {
      if (capTxt.length < 18) pushIssue("warning", "leyenda", "Leyenda muy corta.", "Añade contexto editorial mínimo.");
      if (!/[.!?…]$/.test(capTxt)) pushIssue("warning", "leyenda", "Leyenda sin cierre de frase.", "Termina la frase con puntuación final.");
      if (isGenericText(capTxt)) pushIssue("error", "leyenda", "Leyenda demasiado genérica.", "Describe la escena con más precisión.");
    }
  }
  out.score = Math.max(0, Math.min(100, out.score));
  const hasError = out.issues.some((i) => i.severity === "error");
  const hasWarning = out.issues.some((i) => i.severity === "warning");
  if (hasError) { out.level = "error"; out.badge = "Error"; }
  else if (hasWarning) { out.level = "warning"; out.badge = "Mejorable"; }
  return out;
}

export function runSecondPassQuality({ mode, alt, title, leyenda, cfg }) {
  if (!cfg?.secondPassQualityEnabled) return { alt, title, leyenda };
  const m = String(mode || "both");
  let a = normalizeAltText(String(alt || ""), Number.isFinite(Number(cfg?.altMaxLength)) ? Number(cfg.altMaxLength) : 125, cfg?.avoidImagePrefix !== false);
  let t = normalizeTitleText(String(title || "") || a, { minWords: 2, maxWords: 8 });
  let c = normalizeCaptionText(String(leyenda || ""));
  if (m !== "alt" && c && !/[.!?…]$/.test(c)) c = `${c}.`;
  if (m !== "caption" && !t && a) t = normalizeTitleText(a, { minWords: 2, maxWords: 6 });
  return { alt: a, title: t, leyenda: c };
}

function seoLevelRank(level) {
  const s = String(level || "").toLowerCase();
  if (s === "ok") return 2;
  if (s === "warning") return 1;
  return 0;
}

export function passesBatchQa(seoReview, cfg) {
  if (!cfg?.batchQaModeEnabled) return true;
  return seoLevelRank(seoReview?.level || "error") >= seoLevelRank(String(cfg?.batchQaMinLevel || "ok").toLowerCase());
}

export function applyPostValidation(cfg, { mode, alt, title, leyenda, altAllowedEmpty }) {
  if (!cfg?.postValidationEnabled) return { alt, title, leyenda };
  const rejectGeneric = !!cfg?.postValidationRejectGeneric;
  const titleMinWords = Number.isFinite(Number(cfg?.postValidationTitleMinWords)) ? Number(cfg.postValidationTitleMinWords) : 2;
  const titleMaxWords = Number.isFinite(Number(cfg?.postValidationTitleMaxWords)) ? Number(cfg.postValidationTitleMaxWords) : 8;
  const altMinChars = Number.isFinite(Number(cfg?.postValidationAltMinChars)) ? Number(cfg.postValidationAltMinChars) : 0;
  const captionMinChars = Number.isFinite(Number(cfg?.postValidationCaptionMinChars)) ? Number(cfg.postValidationCaptionMinChars) : 0;
  const m = String(mode || "both");
  const out = { alt: String(alt || ""), title: String(title || ""), leyenda: String(leyenda || "") };
  if (m !== "caption") {
    if (!altAllowedEmpty && altMinChars > 0 && out.alt.length < altMinChars) throw new Error(`Validación: ALT demasiado corto (< ${altMinChars}).`);
    if (rejectGeneric && out.alt && isGenericText(out.alt)) throw new Error("Validación: ALT demasiado genérico.");
    const tw = countWords(out.title);
    if (tw > 0 && tw < Math.max(1, titleMinWords)) throw new Error(`Validación: title demasiado corto (< ${titleMinWords} palabras).`);
    if (tw > Math.max(titleMinWords, titleMaxWords)) out.title = out.title.split(/\s+/).slice(0, Math.max(1, titleMaxWords)).join(" ");
    if (rejectGeneric && out.title && isGenericText(out.title)) throw new Error("Validación: title demasiado genérico.");
  }
  if (m !== "alt") {
    if (captionMinChars > 0 && out.leyenda.length < captionMinChars) throw new Error(`Validación: leyenda demasiado corta (< ${captionMinChars}).`);
    if (rejectGeneric && out.leyenda && isGenericText(out.leyenda)) throw new Error("Validación: leyenda demasiado genérica.");
  }
  return out;
}
