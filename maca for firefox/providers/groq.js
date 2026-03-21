/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
import { safeJson, pickTextFromOpenAICompat } from "./shared.js";

export async function analyzeGroq({ cfg, finalPrompt, dataUrl, fetchWithTimeout, abortSignal }) {
  const model = String(cfg.model || "meta-llama/llama-4-scout-17b-16e-instruct").trim();
  const request = {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: [{ type: "text", text: finalPrompt }, { type: "image_url", image_url: { url: dataUrl } }] }],
      max_tokens: 500
    })
  };
  if (abortSignal) request.signal = abortSignal;
  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", request);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error?.message || json?.error || json?.message || "Error Groq");
  return { rawOutput: pickTextFromOpenAICompat(json) };
}

export async function testGroqConfig({ cfg, model, fetchWithTimeout }) {
  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 })
  }, 12000);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error?.message || json?.error || json?.message || "Error Groq al validar.");
  return { endpoint: "https://api.groq.com/openai/v1/chat/completions" };
}
