/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
import { safeJson } from "./shared.js";

export async function analyzeAnthropic({ cfg, finalPrompt, dataUrl, mime, fetchWithTimeout, abortSignal }) {
  const model = String(cfg.model || "claude-3-5-haiku-latest").trim();
  const base64 = dataUrl.split(",")[1];
  const request = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [{ role: "user", content: [{ type: "text", text: finalPrompt }, { type: "image", source: { type: "base64", media_type: mime, data: base64 } }] }]
    })
  };
  if (abortSignal) request.signal = abortSignal;
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", request);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error?.message || json?.error?.type || json?.message || "Error Anthropic");
  return { rawOutput: Array.isArray(json?.content) ? json.content.filter((p) => p?.type === "text").map((p) => p?.text || "").join("\n") : "" };
}

export async function testAnthropicConfig({ cfg, model, fetchWithTimeout }) {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: [{ type: "text", text: "ok" }] }] })
  }, 12000);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error?.message || json?.error?.type || json?.message || "Error Anthropic al validar.");
  return { endpoint: "https://api.anthropic.com/v1/messages" };
}
