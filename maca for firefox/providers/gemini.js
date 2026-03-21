/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
import { safeJson } from "./shared.js";

export async function analyzeGemini({ cfg, finalPrompt, dataUrl, mime, fetchWithTimeout, abortSignal }) {
  const base64 = dataUrl.split(",")[1];
  const opts = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cfg.apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: finalPrompt }] }]
    })
  };
  if (abortSignal) opts.signal = abortSignal;
  const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`, opts);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error?.message || "Error Gemini");
  return { rawOutput: json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "" };
}

export async function testGeminiConfig({ cfg, model, fetchWithTimeout }) {
  const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cfg.apiKey
    },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Respond only with: ok" }] }] })
  }, 12000);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error?.message || "Error Gemini al validar la API key/modelo");
  return { testedEndpoint: "generateContent" };
}
