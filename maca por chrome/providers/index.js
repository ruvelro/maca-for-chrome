/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
import { normalizeEndpoint, pickOutputTextFromOpenAIResponse } from "../util.js";
import { analyzeOpenAI, testOpenAIConfig } from "./openai.js";
import { analyzeGemini, testGeminiConfig } from "./gemini.js";
import { analyzeOpenRouter, testOpenRouterConfig } from "./openrouter.js";
import { analyzeAnthropic, testAnthropicConfig } from "./anthropic.js";
import { analyzeGroq, testGroqConfig } from "./groq.js";
import { analyzeLocalOllama, testLocalOllamaConfig } from "./local-ollama.js";
import { analyzeLocalOpenAI, testLocalOpenAIConfig } from "./local-openai.js";
import { isOpenRouterGlm, getOpenRouterGlmQualityPrompt } from "./shared.js";

export { isOpenRouterGlm, getOpenRouterGlmQualityPrompt } from "./shared.js";

export async function runProviderAnalysis({ cfg, finalPrompt, dataUrl, mime, mode, fetchWithTimeout, abortSignal, addDebugLog }) {
  if (cfg.provider === "openai") {
    const { rawOutput } = await analyzeOpenAI({ cfg, finalPrompt, dataUrl, fetchWithTimeout, abortSignal });
    return pickOutputTextFromOpenAIResponse(rawOutput);
  }
  if (cfg.provider === "gemini") {
    return (await analyzeGemini({ cfg, finalPrompt, dataUrl, mime, fetchWithTimeout, abortSignal })).rawOutput;
  }
  if (cfg.provider === "openrouter") {
    return (await analyzeOpenRouter({ cfg, finalPrompt, dataUrl, mode, fetchWithTimeout, abortSignal, addDebugLog })).rawOutput;
  }
  if (cfg.provider === "anthropic") {
    return (await analyzeAnthropic({ cfg, finalPrompt, dataUrl, mime, fetchWithTimeout, abortSignal })).rawOutput;
  }
  if (cfg.provider === "groq") {
    return (await analyzeGroq({ cfg, finalPrompt, dataUrl, fetchWithTimeout, abortSignal })).rawOutput;
  }
  if (cfg.provider === "local_ollama") {
    const endpoint = normalizeEndpoint(cfg.localEndpoint || "http://127.0.0.1:11434");
    const model = (cfg.localModel || cfg.model || "llava:7b").trim();
    if (!endpoint) throw new Error("Falta el endpoint local (Ollama). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo local (Ollama). Ve a Opciones.");
    return (await analyzeLocalOllama({ cfg, finalPrompt, dataUrl, fetchWithTimeout, abortSignal, endpoint, model })).rawOutput;
  }
  if (cfg.provider === "local_openai") {
    const endpoint = normalizeEndpoint(cfg.localEndpoint || "http://127.0.0.1:1234/v1");
    const model = (cfg.localModel || cfg.model || "llava").trim();
    if (!endpoint) throw new Error("Falta el endpoint local (OpenAI-compatible). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo local (OpenAI-compatible). Ve a Opciones.");
    return (await analyzeLocalOpenAI({ cfg, finalPrompt, dataUrl, fetchWithTimeout, abortSignal, endpoint, model })).rawOutput;
  }
  throw new Error("Proveedor de IA no soportado");
}

export async function runProviderConfigTest({ cfg, provider, model, fetchWithTimeout }) {
  if (provider === "openai") return testOpenAIConfig({ cfg, model, fetchWithTimeout });
  if (provider === "gemini") return testGeminiConfig({ cfg, model, fetchWithTimeout });
  if (provider === "openrouter") return testOpenRouterConfig({ cfg, model, fetchWithTimeout });
  if (provider === "anthropic") return testAnthropicConfig({ cfg, model, fetchWithTimeout });
  if (provider === "groq") return testGroqConfig({ cfg, model, fetchWithTimeout });
  if (provider === "local_ollama") {
    const endpoint = normalizeEndpoint(cfg.localEndpoint || "http://127.0.0.1:11434");
    if (!endpoint) throw new Error("Falta el endpoint local (Ollama). Ve a Opciones.");
    return testLocalOllamaConfig({ endpoint, model, fetchWithTimeout });
  }
  if (provider === "local_openai") {
    const endpoint = normalizeEndpoint(cfg.localEndpoint || "http://127.0.0.1:1234/v1");
    if (!endpoint) throw new Error("Falta el endpoint local (OpenAI-compatible). Ve a Opciones.");
    if (!model) throw new Error("Falta el modelo local (OpenAI-compatible). Ve a Opciones.");
    return testLocalOpenAIConfig({ cfg, endpoint, model, fetchWithTimeout });
  }
  throw new Error("Proveedor no soportado");
}
