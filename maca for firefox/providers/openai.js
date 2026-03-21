/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
import { safeJson } from "./shared.js";

export async function analyzeOpenAI({ cfg, finalPrompt, dataUrl, fetchWithTimeout, abortSignal }) {
  const opts = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({
      model: cfg.model,
      input: [{ role: "user", content: [{ type: "input_text", text: finalPrompt }, { type: "input_image", image_url: dataUrl }] }]
    })
  };
  if (abortSignal) opts.signal = abortSignal;
  const res = await fetchWithTimeout("https://api.openai.com/v1/responses", opts);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error?.message || "Error OpenAI");
  return { rawOutput: json };
}

export async function testOpenAIConfig({ cfg, model, fetchWithTimeout }) {
  const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${cfg.apiKey}` }
  }, 12000);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error?.message || "Error OpenAI al validar la API key");
  const ids = Array.isArray(json?.data) ? json.data.map((x) => x?.id).filter(Boolean) : [];
  return { ids, found: !!model && ids.includes(model) };
}
