# Integrations

## WordPress

Confirmed by code:

- host permissions are limited to paths matching:
  - `*://*/*wp-admin/*`
  - `*://*/*wp-content/*`
- runtime checks reject non-WordPress pages
- integration depends on WordPress media-library selectors for:
  - selected attachments
  - attachment detail fields
  - upload states

Main dependency surface:

- media modal
- media frame
- attachment details panel
- attachment list items with `data-id`

## Browser APIs

Confirmed by code:

- `chrome.storage`
- `chrome.contextMenus`
- `chrome.scripting`
- `chrome.tabs`
- `chrome.runtime`
- `chrome.commands`
- `chrome.clipboardWrite`
- Chrome-only offscreen document flow where available

## AI Providers

Confirmed by code:

- OpenAI
  - `https://api.openai.com/v1/responses`
- Gemini
  - `https://generativelanguage.googleapis.com/v1beta/models/...:generateContent`
- OpenRouter
  - `https://openrouter.ai/api/v1/chat/completions`
- Anthropic
  - `https://api.anthropic.com/v1/messages`
- Groq
  - `https://api.groq.com/openai/v1/chat/completions`
- local Ollama
  - default `http://127.0.0.1:11434/api/chat`
- local OpenAI-compatible
  - default `http://127.0.0.1:1234/v1/...`

Special handling confirmed by code:

- OpenRouter GLM compatibility and retry logic
- local OpenAI-compatible request-format fallback
- image conversion to base64 data URL before provider call

## Mozilla Signing

Confirmed by code:

- Firefox signing uses `web-ext sign --channel unlisted`
- accepted env vars:
  - `WEB_EXT_API_KEY`
  - `WEB_EXT_API_SECRET`
  - aliases:
    - `AMO_JWT_ISSUER`
    - `AMO_JWT_SECRET`

Operational caveat confirmed by code:

- PowerShell scripts expect env vars to already exist
- scripts do not load `.env` automatically

## Operational Artifacts

Confirmed by repo contents:

- `dist/firefox/unsigned/`
- `dist/firefox/signed/`
- `maca for firefox/.amo-upload-uuid`

Reasonable inference:

- release handling is partly manual and partly script-assisted
