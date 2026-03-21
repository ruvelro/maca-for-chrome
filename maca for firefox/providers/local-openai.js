/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
import { safeJson, pickTextFromOpenAICompat, buildOpenAICompatUrl } from "./shared.js";

export async function analyzeLocalOpenAI({ cfg, finalPrompt, dataUrl, fetchWithTimeout, abortSignal, endpoint, model }) {
  const url = buildOpenAICompatUrl(endpoint);
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const makeBody = (imageAsString = false) => ({
    model,
    stream: false,
    messages: [{ role: "user", content: [{ type: "text", text: finalPrompt }, imageAsString ? { type: "image_url", image_url: dataUrl } : { type: "image_url", image_url: { url: dataUrl } }] }],
    max_tokens: 500
  });
  const makeRequest = (body) => {
    const request = { method: "POST", headers, body: JSON.stringify(body) };
    if (abortSignal) request.signal = abortSignal;
    return request;
  };
  let res = await fetchWithTimeout(url, makeRequest(makeBody(false)));
  let json = await safeJson(res);
  if (!res.ok) {
    const errMsg = json?.error?.message || json?.error || json?.message || "";
    const shouldRetry = res.status === 400 && /image_url|content|array|object|string/i.test(errMsg);
    if (shouldRetry) {
      res = await fetchWithTimeout(url, makeRequest(makeBody(true)));
      json = await safeJson(res);
    }
    if (!res.ok) {
      throw new Error(json?.error?.message || json?.error || json?.message || `Error OpenAI-compatible (${res.status}). Asegúrate de usar un modelo con visión y un servidor que soporte imágenes.`);
    }
  }
  return { rawOutput: pickTextFromOpenAICompat(json) };
}

export async function testLocalOpenAIConfig({ cfg, endpoint, model, fetchWithTimeout }) {
  const url = buildOpenAICompatUrl(endpoint);
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, stream: false, messages: [{ role: "user", content: "ping" }], max_tokens: 1 })
  }, 12000);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error?.message || json?.error || json?.message || `Error servidor local (${res.status}).`);
  return { endpoint: url };
}
