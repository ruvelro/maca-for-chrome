/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
import { safeJson } from "./shared.js";

export async function analyzeLocalOllama({ cfg, finalPrompt, dataUrl, fetchWithTimeout, abortSignal, endpoint, model }) {
  const base64 = dataUrl.split(",")[1];
  const url = `${endpoint}/api/chat`;
  const request = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false, messages: [{ role: "user", content: finalPrompt, images: [base64] }] })
  };
  if (abortSignal) request.signal = abortSignal;
  const res = await fetchWithTimeout(url, request);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error || json?.message || `Error Ollama (${res.status})`);
  return { rawOutput: json?.message?.content || json?.response || "" };
}

export async function testLocalOllamaConfig({ endpoint, model, fetchWithTimeout }) {
  const res = await fetchWithTimeout(`${endpoint}/api/tags`, { method: "GET" }, 8000);
  const json = await safeJson(res);
  if (!res.ok) throw new Error(json?.error || json?.message || `No se pudo contactar con Ollama (${res.status}).`);
  const names = Array.isArray(json?.models) ? json.models.map((m) => m?.name).filter(Boolean) : [];
  const found = !!model && names.some((n) => n === model || n.startsWith(model + ":"));
  return { tagsListed: names.length, modelFound: found, endpoint };
}
