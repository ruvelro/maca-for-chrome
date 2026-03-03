// offscreen.js
// Performs clipboard writes in an extension offscreen document.
// Uses execCommand('copy') to produce OS-level clipboard update events.

function execCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  // Prevent page scroll/jump
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.left = '-1000px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (_) {
    ok = false;
  }

  document.body.removeChild(ta);
  return ok;
}

async function copySequence(texts, delayMs) {
  const delay = Math.max(0, int(delayMs, 250));
  let allOk = true;
  for (let i = 0; i < texts.length; i++) {
    const t = String(texts[i] ?? '');
    if (!t) continue;
    const ok = execCopy(t);
    allOk = allOk && ok;
    if (i < texts.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return allOk;
}

function int(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'MACA_OFFSCREEN_COPY_SEQ') return;

  (async () => {
    try {
      const texts = Array.isArray(msg.texts) ? msg.texts : [];
      const ok = await copySequence(texts, msg.delayMs);
      sendResponse({ ok });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();

  return true;
});
