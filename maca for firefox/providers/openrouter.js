/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
import {
  safeJson,
  pickTextFromOpenAICompat,
  isOpenRouterGlm,
  shouldFallbackOpenRouterCompatibility,
  isRetriableOpenRouterStatus,
  extractOpenRouterErrorMessage,
  sleepMs
} from "./shared.js";

function buildSchema(mode) {
  if (mode === "alt") {
    return {
      name: "maca_alt_title",
      strict: true,
      schema: {
        type: "object",
        properties: { alt: { type: "string" }, title: { type: "string" }, decorativa: { type: "boolean" } },
        required: ["alt", "title"],
        additionalProperties: false
      }
    };
  }
  if (mode === "caption") {
    return {
      name: "maca_caption",
      strict: true,
      schema: {
        type: "object",
        properties: { leyenda: { type: "string" } },
        required: ["leyenda"],
        additionalProperties: false
      }
    };
  }
  return {
    name: "maca_alt_title_caption",
    strict: true,
    schema: {
      type: "object",
      properties: { alt: { type: "string" }, title: { type: "string" }, leyenda: { type: "string" }, decorativa: { type: "boolean" } },
      required: ["alt", "title", "leyenda"],
      additionalProperties: false
    }
  };
}

export async function analyzeOpenRouter({ cfg, finalPrompt, dataUrl, mode, fetchWithTimeout, abortSignal, addDebugLog }) {
  const model = String(cfg.model || "z-ai/glm-4.6v").trim();
  const useGlmModel = isOpenRouterGlm("openrouter", model);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
    "HTTP-Referer": "https://wordpress.org",
    "X-Title": "maca"
  };
  const makeBody = ({ withDocsParams = true, withSchema = true, forceAllowFallbacks = false } = {}) => {
    const body = {
      model,
      messages: [{ role: "user", content: [{ type: "text", text: finalPrompt }, { type: "image_url", image_url: { url: dataUrl } }] }],
      max_tokens: 420,
      temperature: 0.2
    };
    if (useGlmModel && withDocsParams) {
      body.provider = { allow_fallbacks: false, require_parameters: true };
      body.reasoning = { exclude: true, effort: "none" };
    } else if (useGlmModel && forceAllowFallbacks) {
      body.provider = { allow_fallbacks: true };
    }
    if (withSchema) {
      body.response_format = { type: "json_schema", json_schema: buildSchema(mode) };
    }
    return body;
  };

  const attempts = [
    { withDocsParams: true, withSchema: true },
    { withDocsParams: true, withSchema: false },
    { withDocsParams: false, withSchema: false },
    { withDocsParams: false, withSchema: false, forceAllowFallbacks: true }
  ];
  const startedAt = Date.now();
  let res = null;
  let json = null;
  let lastErrMsg = "";
  for (let i = 0; i < attempts.length; i++) {
    if ((Date.now() - startedAt) > 90000) throw new Error("Timeout global OpenRouter (90s).");
    const attempt = attempts[i];
    const request = { method: "POST", headers, body: JSON.stringify(makeBody(attempt)) };
    if (abortSignal) request.signal = abortSignal;
    res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", request, 30000);
    try {
      json = await safeJson(res, 25000);
    } catch (err) {
      lastErrMsg = err?.message || "Timeout leyendo respuesta de OpenRouter.";
      await addDebugLog(cfg, "openrouter_response_read_error", { attempt: i + 1, attemptConfig: attempt, status: Number(res?.status || 0), error: lastErrMsg });
      if (i < attempts.length - 1) {
        await sleepMs(300 + (i * 250));
        continue;
      }
      throw new Error(lastErrMsg);
    }
    if (res.ok) break;
    lastErrMsg = extractOpenRouterErrorMessage(res.status, json);
    await addDebugLog(cfg, "openrouter_attempt_fail", { attempt: i + 1, attemptConfig: attempt, status: Number(res?.status || 0), error: lastErrMsg });
    const canFallback = shouldFallbackOpenRouterCompatibility(res.status, json);
    const retriable = isRetriableOpenRouterStatus(res.status) || /provider returned error/i.test(lastErrMsg);
    if ((!canFallback && !retriable) || i >= attempts.length - 1) break;
    await sleepMs(250 + (i * 200));
  }
  if (!res.ok) throw new Error(lastErrMsg || extractOpenRouterErrorMessage(res?.status || 0, json));
  return { rawOutput: pickTextFromOpenAICompat(json) };
}

export async function testOpenRouterConfig({ cfg, model, fetchWithTimeout }) {
  const res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      "HTTP-Referer": "https://wordpress.org",
      "X-Title": "maca"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: [{ type: "text", text: "Responde solo con: ok" }, { type: "image_url", image_url: { url: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=" } }] }],
      max_tokens: 4,
      temperature: 0
    })
  }, 12000);
  const json = await safeJson(res, 20000);
  if (!res.ok) throw new Error(extractOpenRouterErrorMessage(res.status, json));
  return { endpoint: "https://openrouter.ai/api/v1/chat/completions" };
}
