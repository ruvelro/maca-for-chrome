// overlay.js - maca floating overlay (universal)
// Fixes: spinner always visible (even if result arrives instantly), copy feedback always shown.
// Safe reinjection: overwrites styles + replaces message listener.
// WP fix: avoid class name collision with wp-admin ".spinner" by using ".maca-spinner".

(function () {
  const STYLE_ID = "maca-overlay-styles";
  const FEEDBACK_MS = 900;
  const MIN_LOADING_MS = 350; // ensures at least a visible loading phase (especially in WordPress)

  // Remove previous listener if any (avoid mixed versions in same tab)
  try {
    if (window.__macaOverlayListener) {
      chrome.runtime.onMessage.removeListener(window.__macaOverlayListener);
      window.__macaOverlayListener = null;
    }
  } catch (_) {}
  try {
    if (window.__macaOverlayDocClickListener) {
      document.removeEventListener("click", window.__macaOverlayDocClickListener, true);
      window.__macaOverlayDocClickListener = null;
    }
  } catch (_) {}

  const UI = {
    overlay: null,
    panel: null,
    mini: null,
    imgEl: null,
    statusBox: null,
    altArea: null,
    titleArea: null,
    capArea: null,
    batchBtn: null,
    batchCancelBtn: null,
    autoUploadPauseBtn: null,
    autoUploadCancelBtn: null
  };

  const STATE = {
    jobId: null,
    imgUrl: "",
    pageUrl: "",
	    generateMode: "both", // both | alt | caption
    alt: "",
    title: "",
    leyenda: "",
    wpAutoApply: false,
    wpAutoApplyRequireMedia: true,
    onCompleteAction: "none", // none | minimize | close
    status: "idle", // idle | loading | ready | error
    error: "",
    loadingSince: 0,
    firstPaintDone: false,
    pendingResult: null,
    autoApplyAttempts: 0,
    autoApplyTimer: null,
    applyTimer: null,
    batchRunning: false,
    batchCancelling: false,
    autoUploadRunning: false,
    autoUploadCancelling: false,
    autoUploadPaused: false
  };

  function injectStyles() {
    const style = document.getElementById(STYLE_ID) || document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #maca-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.40);
        z-index: 2147483647;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 7vh 16px 16px 16px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }

      #maca-panel {
        width: 100%;
        max-width: 720px;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0,0,0,.30);
        overflow: hidden;
      }

      #maca-panel header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid #eee;
      }

      #maca-panel header .title {
        font-weight: 800;
        font-size: 14px;
        letter-spacing: .2px;
      }

      #maca-panel header .spacer { flex: 1; }

      #maca-panel button {
        border: 1px solid #e5e7eb;
        background: #f9fafb;
        border-radius: 10px;
        padding: 6px 10px;
        cursor: pointer;
        font-weight: 700;
        transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease;
      }

      #maca-panel button:hover { background: #f3f4f6; border-color: #d1d5db; }
      #maca-panel button:active { transform: translateY(1px); }
      #maca-panel button:disabled { opacity: .6; cursor: not-allowed; }

      #maca-panel .body {
        padding: 16px;
        display: grid;
        grid-template-columns: 220px 1fr;
        gap: 16px;
      }

      #maca-panel .preview-col {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      #maca-panel .preview-actions {
        justify-content: center;
        margin-top: 0;
      }
      #maca-panel .content-col {
        min-width: 0;
      }

      #maca-panel .preview {
        border: 1px solid #eee;
        border-radius: 12px;
        overflow: hidden;
        background: #fafafa;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 160px;
        max-height: 260px;
        position: relative;
      }

      /* image: always entire, keep proportions */
      #maca-panel .preview img {
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
        transition: opacity 0.2s ease;
      }

      /* spinner: pure CSS, always above image
         IMPORTANT: use unique class to avoid WP admin ".spinner" collisions */
      #maca-panel .preview .maca-spinner {
        position: absolute;
        inset: 0;
        display: none !important;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 999999 !important;
      }
      #maca-panel .preview .maca-spinner::before {
        content: "";
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 3px solid #e5e7eb;
        border-top-color: #2563eb;
        animation: maca-spin 0.9s linear infinite;
        visibility: visible !important;
        opacity: 1 !important;
      }

      #maca-panel .preview.loading img { opacity: 0.35; }
      #maca-panel .preview.loading .maca-spinner {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
      }

      @keyframes maca-spin { to { transform: rotate(360deg); } }

      /* status + green check (ready) */
      #maca-panel .status {
        grid-column: 1 / -1;
        font-size: 13px;
        color: #374151;
        padding: 8px 10px;
        border-radius: 12px;
        background: #f3f4f6;
        display: flex;
        align-items: center;
        gap: 8px;
        box-sizing: border-box;
      }
      #maca-panel .status-icon {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #10b981;
        display: none;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-weight: 900;
        font-size: 12px;
        line-height: 1;
      }
      #maca-panel .status.ready .status-icon { display: flex; }
      #maca-panel .status.ready .status-icon::before { content: "✓"; }

      #maca-panel label {
        display: block;
        font-size: 12px;
        font-weight: 800;
        margin-top: 10px;
        margin-bottom: 6px;
        color: #111827;
      }

      /* text fade-in */
      #maca-panel textarea {
        width: 100%;
        min-height: 72px;
        resize: vertical;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        font-size: 13px;
        line-height: 1.35;
        box-sizing: border-box;
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      #maca-panel textarea.ready { opacity: 1; }
      #maca-panel textarea[disabled] { background: #f9fafb; color: #6b7280; }

      #maca-panel .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 12px;
      }
      #maca-panel .actions button {
        border-radius: 12px;
        padding: 10px 12px;
        font-weight: 800;
        font-size: 13px;
      }
      #maca-panel .actions button.primary {
        background: #2563eb;
        border-color: #2563eb;
        color: #fff;
      }
      #maca-panel .actions button.primary:hover {
        background: #1d4ed8;
        border-color: #1d4ed8;
      }

      /* copy feedback */
      #maca-panel button.maca-success, #maca-mini button.maca-success {
        background: #10b981 !important;
        color: #fff !important;
        border-color: #059669 !important;
      }
      #maca-panel button.maca-error, #maca-mini button.maca-error {
        background: #ef4444 !important;
        color: #fff !important;
        border-color: #dc2626 !important;
      }

      /* mini bar */
      #maca-mini {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 2147483647;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 999px;
        box-shadow: 0 18px 40px rgba(0,0,0,.22);
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        box-sizing: border-box;
        min-width: 280px;
      }
      #maca-mini .pill {
        font-weight: 900;
        font-size: 12px;
        padding: 4px 10px;
        border-radius: 999px;
        background: #f3f4f6;
      }
      #maca-mini button {
        border: 1px solid #e5e7eb;
        background: #f9fafb;
        border-radius: 999px;
        padding: 7px 12px;
        cursor: pointer;
        font-weight: 800;
        font-size: 12px;
        white-space: nowrap;
        box-sizing: border-box;
      }
      #maca-mini button.primary {
        background: #2563eb;
        border-color: #2563eb;
        color: #fff;
      }
      #maca-mini button.primary:hover {
        background: #1d4ed8;
        border-color: #1d4ed8;
      }

      @media (max-width: 680px) {
        #maca-panel .body { grid-template-columns: 1fr; }
        #maca-panel .preview { max-height: 240px; }
      }
    `;
    if (!style.parentNode) document.head.appendChild(style);
  }

  function removeOverlay() {
    UI.overlay?.remove();
    UI.overlay = null;
    UI.panel = null;
    UI.imgEl = null;
    UI.statusBox = null;
    UI.altArea = null;
    UI.titleArea = null;
    UI.capArea = null;
    STATE.firstPaintDone = false;
  }

  function removeMini() {
    UI.mini?.remove();
    UI.mini = null;
  }

  function clearApplyTimer() {
    if (STATE.applyTimer) {
      clearTimeout(STATE.applyTimer);
      STATE.applyTimer = null;
    }
  }

  function clearAutoApplyTimer() {
    if (STATE.autoApplyTimer) {
      clearTimeout(STATE.autoApplyTimer);
      STATE.autoApplyTimer = null;
    }
    STATE.autoApplyAttempts = 0;
  }

  function scheduleAutoApply() {
    clearAutoApplyTimer();
    if (!STATE.wpAutoApply) return;

    const mode = String(STATE.generateMode || "both");
    const wantAlt = mode !== "caption";
    const wantTitle = mode !== "caption";
    const wantCap = mode !== "alt";
    const payload = {};
    if (wantAlt) payload.alt = (STATE.alt || "");
    if (wantTitle) payload.title = (STATE.title || STATE.alt || "");
    if (wantCap) payload.leyenda = (STATE.leyenda || "");

    const maxAttempts = 40;
    const delayMs = 220;

    const attempt = () => {
      STATE.autoApplyAttempts++;
      try {
        if (!canAutoApplyNow()) {
          if (STATE.autoApplyAttempts < maxAttempts) {
            STATE.autoApplyTimer = setTimeout(attempt, delayMs);
          }
          return;
        }

        const res = applyToWordPressFields(payload);
        const okAlt = !wantAlt || !!res?.alt;
        const okTitle = !wantTitle || !!res?.title;
        const okCap = !wantCap || !!res?.leyenda;
        if ((okAlt && okTitle && okCap) || STATE.autoApplyAttempts >= maxAttempts) return;

        STATE.autoApplyTimer = setTimeout(attempt, delayMs);
      } catch (_) {
        if (STATE.autoApplyAttempts < maxAttempts) {
          STATE.autoApplyTimer = setTimeout(attempt, delayMs);
        }
      }
    };

    STATE.autoApplyTimer = setTimeout(attempt, 80);
  }

  function closeAll() {
    clearApplyTimer();
    clearAutoApplyTimer();
    STATE.jobId = null;
    STATE.imgUrl = "";
    STATE.pageUrl = "";
    STATE.alt = "";
    STATE.title = "";
    STATE.leyenda = "";
    STATE.status = "idle";
    STATE.error = "";
    STATE.loadingSince = 0;
    STATE.pendingResult = null;
    STATE.batchRunning = false;
    STATE.batchCancelling = false;
    STATE.autoUploadRunning = false;
    STATE.autoUploadCancelling = false;
    STATE.autoUploadPaused = false;
    removeOverlay();
    removeMini();
  }

  function setButtonFeedback(btn, { ok, label }) {
    if (!btn) return;

    btn.dataset.macaFeedback = "1";
    const prevText = btn.textContent;

    btn.textContent = ok ? "Copiado ✓" : "Error";
    btn.classList.remove("maca-success", "maca-error");
    btn.classList.add(ok ? "maca-success" : "maca-error");
    btn.disabled = true;

    setTimeout(() => {
      delete btn.dataset.macaFeedback;
      btn.textContent = label || prevText;
      btn.classList.remove("maca-success", "maca-error");
      btn.disabled = (STATE.status !== "ready");
      updateUI();
    }, FEEDBACK_MS);
  }

  
  // Attempt to fill WordPress fields (ALT + Caption) when the Media modal or Attachment details screen is open.
  // Safe no-op outside of WP or when fields are not present.
  const WP_SELECTORS = {
    alt: [
      // Media modal (library / insert media)
      '.media-modal .attachment-details .setting[data-setting="alt"] textarea',
      '.media-modal .attachment-details .setting[data-setting="alt"] input',
      '.media-modal [data-setting="alt"] textarea',
      '.media-modal [data-setting="alt"] input',
      // Attachment details panel outside modal (varies by WP)
      '.attachment-details .setting[data-setting="alt"] textarea',
      '.attachment-details .setting[data-setting="alt"] input',
      '.attachment-details [data-setting="alt"] textarea',
      '.attachment-details [data-setting="alt"] input',
      // Classic attachment edit screen
      '#attachment_alt',
      'textarea.attachment-alt-text',
      'input.attachment-alt-text',
      // Generic / translated labels (Attachment details screen)
      'textarea[aria-label="Texto alternativo"]',
      'input[aria-label="Texto alternativo"]',
      'textarea[aria-label="Alt text"]',
      'input[aria-label="Alt text"]',
      // Fallbacks (rare)
      'input[name="attachment[alt]"]',
      'textarea[name="attachment[alt]"]'
    ].join(','),
    caption: [
      // Media modal (library / insert media)
      '.media-modal .attachment-details .setting[data-setting="caption"] textarea',
      '.media-modal .attachment-details .setting[data-setting="caption"] input',
      '.media-modal .attachment-details .setting[data-setting="caption"] [contenteditable="true"]',
      '.media-modal [data-setting="caption"] textarea',
      '.media-modal [data-setting="caption"] input',
      '.media-modal [data-setting="caption"] [contenteditable="true"]',
      // Attachment details panel outside modal (varies by WP)
      '.attachment-details .setting[data-setting="caption"] textarea',
      '.attachment-details .setting[data-setting="caption"] input',
      '.attachment-details .setting[data-setting="caption"] [contenteditable="true"]',
      '.attachment-details [data-setting="caption"] textarea',
      '.attachment-details [data-setting="caption"] input',
      '.attachment-details [data-setting="caption"] [contenteditable="true"]',
      // Classic attachment edit screen
      '#attachment_caption',
      'textarea.attachment-caption',
      'input.attachment-caption',
      // Generic / translated labels (Attachment details screen)
      'textarea[aria-label="Leyenda"]',
      'input[aria-label="Leyenda"]',
      'textarea[aria-label="Caption"]',
      'input[aria-label="Caption"]',
      'textarea[name="attachment[caption]"]',
      'input[name="attachment[caption]"]'
    ].join(','),
    title: [
      '.media-modal .attachment-details .setting[data-setting="title"] textarea',
      '.media-modal .attachment-details .setting[data-setting="title"] input',
      '.media-modal [data-setting="title"] textarea',
      '.media-modal [data-setting="title"] input',
      '.attachment-details .setting[data-setting="title"] textarea',
      '.attachment-details .setting[data-setting="title"] input',
      '.attachment-details [data-setting="title"] textarea',
      '.attachment-details [data-setting="title"] input',
      '#attachment_title',
      'textarea.attachment-title',
      'input.attachment-title',
      'textarea[aria-label="Título"]',
      'input[aria-label="Título"]',
      'textarea[aria-label="Title"]',
      'input[aria-label="Title"]',
      'input[name="attachment[title]"]',
      'textarea[name="attachment[title]"]'
    ].join(',')
  };


  function isVisibleElement(el) {
    if (!el) return false;
    // offsetParent null for display:none; also check visibility.
    const style = window.getComputedStyle(el);
    if (!style) return false;
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    // If it's in a hidden media modal, WP sometimes sets aria-hidden
    const modal = el.closest && el.closest(".media-modal");
    if (modal && modal.getAttribute && modal.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  function pickBestField(selector) {
    const els = Array.from(document.querySelectorAll(selector));
    // Prefer visible elements first
    for (const el of els) {
      if (isVisibleElement(el)) return el;
    }
    return els[0] || null;
  }

  
  function normText(t) {
    return String(t || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findFieldNearLabel(labelTexts) {
    const targets = Array.isArray(labelTexts) ? labelTexts : [labelTexts];
    const wanted = targets.map(normText);
    // Search likely containers first (media modal + attachment details panels)
    const roots = [
      document.querySelector(".media-modal"),
      document.querySelector(".media-frame"),
      document.querySelector(".attachment-details"),
      document.body
    ].filter(Boolean);

    for (const root of roots) {
      // Look for <label>, <span>, or <div> used as field names in WP media UI
      const nodes = root.querySelectorAll("label, .setting .name, .media-setting .name, .attachment-details label, .attachment-details .name, .compat-item label, .compat-item .label");
      for (const n of nodes) {
        const txt = normText(n.textContent);
        if (!txt) continue;
        if (!wanted.includes(txt)) continue;

        // Try associated control by for/id
        if (n.tagName === "LABEL") {
          const forId = n.getAttribute("for");
          if (forId) {
            const el = root.querySelector(`#${CSS.escape(forId)}`);
            if (el && isVisibleElement(el)) return el;
          }
        }

        // Otherwise search within the same row/container
        const row = n.closest(".setting, .media-setting, .compat-field, .compat-item, tr, .field, .components-base-control") || n.parentElement;
        if (row) {
          const el = row.querySelector('textarea, input, [contenteditable="true"]');
          if (el && isVisibleElement(el)) return el;
        }
      }
    }
    return null;
  }

  function getAltField() {
    return pickBestField(WP_SELECTORS.alt) || findFieldNearLabel(["texto alternativo", "alt text", "alternative text", "alt"]);
  }

  function getCaptionField() {
    return pickBestField(WP_SELECTORS.caption) || findFieldNearLabel(["leyenda", "caption", "descripción", "descripcion"]);
  }

  function getTitleField() {
    return pickBestField(WP_SELECTORS.title) || findFieldNearLabel(["título", "titulo", "title"]);
  }
function isMediaModalOpen() {
    const modal = document.querySelector(".media-modal");
    if (!modal) return false;
    if (modal.getAttribute && modal.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(modal);
    if (!style) return false;
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isAttachmentDetailsScreenOpen() {
    // Attachment edit screen or details panel (non-modal)
    const altEl = getAltField();
    const capEl = getCaptionField();
    // If either field exists and is visible and we're in wp-admin, treat as OK context.
    const inWpAdmin = /\/wp-admin\//.test(location.pathname);
    return inWpAdmin && ((altEl && isVisibleElement(altEl)) || (capEl && isVisibleElement(capEl)));
  }

  function canAutoApplyNow() {
    if (!STATE.wpAutoApplyRequireMedia) return true;
    // Allow auto-apply when either Media modal is open OR an attachment details screen is visible.
    return isMediaModalOpen() || isAttachmentDetailsScreenOpen();
  }

  function setFormValue(el, value) {
    try {
      // Handle contenteditable just in case
      if (el && el.getAttribute && el.getAttribute("contenteditable") === "true") {
        el.textContent = value;
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      // Some WP views listen to key events
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function applyToWordPressFields({ alt, title, leyenda }) {
    const res = { alt: false, title: false, leyenda: false };
    try {
      const altEl = getAltField();
      if (altEl && typeof alt === "string") res.alt = setFormValue(altEl, alt);

      const titleEl = getTitleField();
      if (titleEl && typeof title === "string") res.title = setFormValue(titleEl, title);

      const capEl = getCaptionField();
      if (capEl && typeof leyenda === "string") res.leyenda = setFormValue(capEl, leyenda);

      if (UI.statusBox) {
        const txt = UI.statusBox.querySelector(".status-text");
        if (txt) {
          if (res.alt || res.title || res.leyenda) {
            txt.textContent = "Pegado en WordPress.";
          }
        }
      }
    } catch (_) {}
    return res;
  }

async function copyText(text, btn, label) {
    if (!text) return;
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      ok = false;
      if (UI.statusBox) {
        const txt = UI.statusBox.querySelector(".status-text");
        if (txt) txt.textContent = "No se pudo copiar. Prueba con Ctrl+C dentro del campo.";
      }
    }
    setButtonFeedback(btn, { ok, label });
  }

  function getCurrentOverlayTexts() {
    const alt = UI.altArea ? String(UI.altArea.value || "") : String(STATE.alt || "");
    const title = UI.titleArea ? String(UI.titleArea.value || "") : String(STATE.title || "");
    const leyenda = UI.capArea ? String(UI.capArea.value || "") : String(STATE.leyenda || "");
    return { alt, title, leyenda };
  }


function isWpAdminPage() {
  try {
    return /\/wp-admin\//.test(location.pathname || "");
  } catch (_) {
    return false;
  }
}

function pickMainWpAttachmentsList(root) {
  const browser = root.querySelector(".attachments-browser") || root;
  const lists = Array.from(browser.querySelectorAll("ul.attachments"));
  // Prefer the main grid list (not inside the selection tray)
  for (const ul of lists) {
    if (ul.closest(".media-selection")) continue; // selection tray
    if (ul.closest(".attachments-browser")) return ul;
  }
  // Fallback: any attachments list not in media-selection
  for (const ul of lists) {
    if (ul.closest(".media-selection")) continue;
    return ul;
  }
  return null;
}

function getWpSelectedCount() {
  if (!isWpAdminPage()) return 0;
  const root = document.querySelector(".media-modal") || document.querySelector(".media-frame") || document;
  const list = pickMainWpAttachmentsList(root) || root;
  const selected = list.querySelectorAll(
    "li.attachment[aria-checked='true'], li.attachment[aria-selected='true'], li.attachment.selected"
  );
  return selected ? selected.length : 0;
}

function updateBatchButtonUi() {
  if (!UI.batchBtn) return;
  if (STATE.batchRunning) {
    UI.batchBtn.style.display = "";
    UI.batchBtn.disabled = true;
    UI.batchBtn.textContent = "Procesando lote...";
    return;
  }
  const n = getWpSelectedCount();
  const show = isWpAdminPage() && n > 1;
  UI.batchBtn.style.display = show ? "" : "none";
  UI.batchBtn.disabled = !show;
  UI.batchBtn.textContent = show ? `Procesar selección (${n})` : "Procesar selección";
}

  // Copia ALT, title y leyenda como eventos de copiado consecutivos.
  // Importante: el portapapeles "actual" se queda con el último texto,
  // pero la mayoría de historiales/gestores de portapapeles guardan todos.
  async function copyAllAsEntries(alt, title, leyenda, btn, label) {
    const a = (alt || "").trim();
    const t = (title || "").trim();
    const c = (leyenda || "").trim();
    if (!a && !t && !c) return;

    let ok = true;

    // Preferred path: ask the extension service worker to write *two* clipboard events
    // via an offscreen document (more reliable for Windows clipboard history).
    try {
      const res = await chrome.runtime.sendMessage({
        type: "MACA_COPY_SEQUENCE",
        texts: [a, t, c],
        delayMs: 320
      });
      if (res?.ok) {
        setButtonFeedback(btn, { ok: true, label });
        return;
      }
    } catch (_) {
      // fall through to page clipboard
    }

    // Fallback: page clipboard API (some browsers only keep the last write, and/or don't create two history entries)
    try {
      if (a) await navigator.clipboard.writeText(a);
      await new Promise((r) => setTimeout(r, 220));
      if (t) await navigator.clipboard.writeText(t);
      await new Promise((r) => setTimeout(r, 220));
      if (c) await navigator.clipboard.writeText(c);
    } catch (e) {
      ok = false;
      // Ultimate fallback: copy in a single entry
      try {
        await navigator.clipboard.writeText(`ALT: ${a}

Title: ${t}

Leyenda: ${c}`);
        ok = true;
      } catch (_) {
        ok = false;
      }

      if (!ok && UI.statusBox) {
        const txt = UI.statusBox.querySelector(".status-text");
        if (txt) txt.textContent = "No se pudo copiar. Prueba con Ctrl+C dentro del campo.";
      }
    }

    setButtonFeedback(btn, { ok, label });
  }

  function showMini() {
    if (UI.mini) return;
    injectStyles();

    const mini = document.createElement("div");
    mini.id = "maca-mini";
    mini.innerHTML = `
      <span class="pill">maca</span>
      <button id="maca-mini-alt">ALT</button>
      <button id="maca-mini-cap">Leyenda</button>
      <button id="maca-mini-open" class="primary">Abrir</button>
      <button id="maca-mini-close">Cerrar</button>
    `;
    document.body.appendChild(mini);
    UI.mini = mini;

    mini.querySelector("#maca-mini-alt").addEventListener("click", (e) => {
      copyText(STATE.alt, e.currentTarget, "ALT");
    });
    mini.querySelector("#maca-mini-cap").addEventListener("click", (e) => {
      copyText(STATE.leyenda, e.currentTarget, "Leyenda");
    });
    mini.querySelector("#maca-mini-open").addEventListener("click", () => {
      removeMini();
      showOverlay();
    });
    mini.querySelector("#maca-mini-close").addEventListener("click", () => closeAll());

    updateUI();
  }

  function showOverlay() {
    injectStyles();
    removeOverlay();

    const overlay = document.createElement("div");
    overlay.id = "maca-overlay";
	    overlay.innerHTML = `
      <div id="maca-panel" role="dialog" aria-modal="true">
        <header>
          <span class="title">maca</span>
          <span class="spacer"></span>
          <button id="maca-min" title="Minimizar">-</button>
          <button id="maca-close" title="Cerrar">x</button>
        </header>
        <div class="body">
          <div class="preview-col">
            <div class="preview">
              <div class="maca-spinner" aria-hidden="true"></div>
              <img id="maca-img" alt="" />
            </div>
            <div class="actions preview-actions">
              <button id="maca-regenerate" class="secondary">Regenerar</button>
              <button id="maca-batch" class="secondary">Procesar selección</button>
              <button id="maca-batch-cancel" class="secondary" style="display:none;">Cancelar lote</button>
              <button id="maca-auto-pause" class="secondary" style="display:none;">Pausar auto-subida</button>
              <button id="maca-auto-cancel" class="secondary" style="display:none;">Cancelar auto-subida</button>
            </div>
          </div>
          <div class="content-col">
            <div class="status" id="maca-status">
              <span class="status-icon" aria-hidden="true"></span>
              <span class="status-text"></span>
            </div>
            <label for="maca-alt" id="maca-alt-label">ALT</label>
            <textarea id="maca-alt" placeholder="Generando..." disabled></textarea>
            <label for="maca-title" id="maca-title-label">Title</label>
            <textarea id="maca-title" placeholder="Generando..." disabled></textarea>
            <label for="maca-cap" id="maca-cap-label">Leyenda</label>
            <textarea id="maca-cap" placeholder="Generando..." disabled></textarea>
            <div class="actions copy-actions">
              <button id="maca-copy-alt">Copiar ALT</button>
              <button id="maca-copy-title">Copiar title</button>
              <button id="maca-copy-cap">Copiar leyenda</button>
              <button id="maca-copy-both" class="primary">Copiar todo</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    UI.overlay = overlay;
    UI.panel = overlay.querySelector("#maca-panel");
    UI.imgEl = overlay.querySelector("#maca-img");
    UI.statusBox = overlay.querySelector("#maca-status");
    UI.altArea = overlay.querySelector("#maca-alt");
    UI.titleArea = overlay.querySelector("#maca-title");
    UI.capArea = overlay.querySelector("#maca-cap");
    UI.batchBtn = overlay.querySelector("#maca-batch");
    UI.batchCancelBtn = overlay.querySelector("#maca-batch-cancel");
    UI.autoUploadPauseBtn = overlay.querySelector("#maca-auto-pause");
    UI.autoUploadCancelBtn = overlay.querySelector("#maca-auto-cancel");
    UI.altArea?.addEventListener("input", () => {
      if (STATE.status === "ready") STATE.alt = String(UI.altArea?.value || "");
    });
    UI.capArea?.addEventListener("input", () => {
      if (STATE.status === "ready") STATE.leyenda = String(UI.capArea?.value || "");
    });
    UI.titleArea?.addEventListener("input", () => {
      if (STATE.status === "ready") STATE.title = String(UI.titleArea?.value || "");
    });

    // Ensure correct initial visibility/state for batch button
    try { updateBatchButtonUi(); } catch (_) {}

    // Keep batch button in sync with WP selection changes
    if (!window.__macaOverlayDocClickListener) {
      window.__macaOverlayDocClickListener = () => {
        try { updateBatchButtonUi(); } catch (_) {}
      };
      document.addEventListener("click", window.__macaOverlayDocClickListener, true);
    }

    // Batch process selected (WP media library)
    UI.batchBtn?.addEventListener("click", async () => {
      if (STATE.batchRunning) return;
      updateBatchButtonUi();
      if (UI.batchBtn?.disabled) return;

      STATE.status = "loading";
      STATE.batchRunning = true;
      STATE.batchCancelling = false;
      STATE.error = "";
      STATE.loadingSince = Date.now();
      STATE.firstPaintDone = false;
      if (UI.statusBox) {
        const txt = UI.statusBox.querySelector(".status-text");
        if (txt) txt.textContent = "Procesando selección...";
      }
      updateUI();

      try {
        const res = await chrome.runtime.sendMessage({ type: "MACA_BATCH_PROCESS_SELECTED" });
        if (res?.ok === false) throw new Error(res.error || "Error al procesar selección");
      } catch (err) {
        handleError({ jobId: STATE.jobId, error: err?.message || String(err) });
      } finally {
        updateBatchButtonUi();
      }
    });

    UI.batchCancelBtn?.addEventListener("click", async () => {
      if (!STATE.batchRunning || STATE.batchCancelling) return;
      STATE.batchCancelling = true;
      if (UI.statusBox) {
        const txt = UI.statusBox.querySelector(".status-text");
        if (txt) txt.textContent = "Cancelando lote...";
      }
      updateUI();
      try {
        await chrome.runtime.sendMessage({ type: "MACA_BATCH_CANCEL" });
      } catch (_) {}
    });

    UI.autoUploadPauseBtn?.addEventListener("click", async () => {
      if (!STATE.autoUploadRunning || STATE.autoUploadCancelling) return;
      try {
        if (STATE.autoUploadPaused) {
          await chrome.runtime.sendMessage({ type: "MACA_AUTO_UPLOAD_RESUME" });
        } else {
          await chrome.runtime.sendMessage({ type: "MACA_AUTO_UPLOAD_PAUSE" });
        }
      } catch (_) {}
    });

    UI.autoUploadCancelBtn?.addEventListener("click", async () => {
      if (!STATE.autoUploadRunning || STATE.autoUploadCancelling) return;
      STATE.autoUploadCancelling = true;
      if (UI.statusBox) {
        const txt = UI.statusBox.querySelector(".status-text");
        if (txt) txt.textContent = "Cancelando auto-subida...";
      }
      updateUI();
      try {
        await chrome.runtime.sendMessage({ type: "MACA_AUTO_UPLOAD_CANCEL" });
      } catch (_) {}
    });


    overlay.addEventListener("click", () => {
      removeOverlay();
      showMini();
    });
    UI.panel.addEventListener("click", (e) => e.stopPropagation());

    overlay.querySelector("#maca-min").addEventListener("click", () => {
      removeOverlay();
      showMini();
    });
    overlay.querySelector("#maca-close").addEventListener("click", () => closeAll());

	    overlay.querySelector("#maca-regenerate").addEventListener("click", async (e) => {
	      if (STATE.status === "loading") return;
	      STATE.status = "loading";
	      STATE.error = "";
	      STATE.pendingResult = null;
	      STATE.loadingSince = Date.now();
	      STATE.firstPaintDone = false;
	      updateUI();
	      try {
	        const res = await chrome.runtime.sendMessage({
	          type: "MACA_REGENERATE",
	          imageUrl: STATE.imgUrl,
	          pageUrl: STATE.pageUrl
	        });
	        if (res?.error) throw new Error(res.error);
	        handleResult({ jobId: STATE.jobId, alt: res?.alt || "", title: res?.title || "", leyenda: res?.leyenda || "" });
	      } catch (err) {
	        handleError({ jobId: STATE.jobId, error: err?.message || String(err) });
	      }
	    });

    overlay.querySelector("#maca-copy-alt").addEventListener("click", (e) => {
      const { alt, title } = getCurrentOverlayTexts();
      STATE.alt = alt;
      STATE.title = title || alt;
      copyText(alt, e.currentTarget, "Copiar ALT");
      applyToWordPressFields({ alt, title: STATE.title });
    });
    overlay.querySelector("#maca-copy-title").addEventListener("click", (e) => {
      const { title, alt } = getCurrentOverlayTexts();
      const finalTitle = title || alt || "";
      STATE.title = finalTitle;
      copyText(finalTitle, e.currentTarget, "Copiar title");
      applyToWordPressFields({ title: finalTitle });
    });
    overlay.querySelector("#maca-copy-cap").addEventListener("click", (e) => {
      const { leyenda } = getCurrentOverlayTexts();
      STATE.leyenda = leyenda;
      copyText(leyenda, e.currentTarget, "Copiar leyenda");
      applyToWordPressFields({ leyenda });
    });
    overlay.querySelector("#maca-copy-both").addEventListener("click", (e) => {
      const { alt, title, leyenda } = getCurrentOverlayTexts();
      STATE.alt = alt;
      STATE.title = title || alt;
      STATE.leyenda = leyenda;
      copyAllAsEntries(alt, STATE.title, leyenda, e.currentTarget, "Copiar todo");
      applyToWordPressFields({ alt, title: STATE.title, leyenda });
    });

    updateUI();

    requestAnimationFrame(() => {
      STATE.firstPaintDone = true;
      updateUI();
      tryApplyPendingResult();
    });
  }

  function updateUI() {
    const isLoading = STATE.status === "loading";
    const isReady = STATE.status === "ready";
    const isError = STATE.status === "error";

    if (UI.overlay) {
      if (UI.imgEl) {
        const next = STATE.imgUrl || "";
        if (UI.imgEl.src !== next) UI.imgEl.src = next;
      }

      const preview = UI.overlay.querySelector(".preview");
      if (preview) preview.classList.toggle("loading", isLoading);

	      const mode = String(STATE.generateMode || "both");
	      const showAlt = mode !== "caption";
	      const showTitle = mode !== "caption";
	      const showCap = mode !== "alt";

	      if (UI.statusBox) {
        const textEl = UI.statusBox.querySelector(".status-text");
        UI.statusBox.classList.toggle("ready", isReady);

	        if (isLoading) {
	          textEl.textContent = mode === "alt" ? "Generando ALT y title..." : (mode === "caption" ? "Generando leyenda..." : "Generando ALT, title y leyenda...");
	        }
        else if (isReady) textEl.textContent = "Listo. Puedes copiar los textos.";
        else if (isError) textEl.textContent = `Error: ${STATE.error || "desconocido"}`;
        else textEl.textContent = "";
      }

	      // Toggle fields based on mode
	      const altLabel = UI.overlay.querySelector("#maca-alt-label");
	      const titleLabel = UI.overlay.querySelector("#maca-title-label");
	      const capLabel = UI.overlay.querySelector("#maca-cap-label");
	      if (altLabel) altLabel.style.display = showAlt ? "" : "none";
	      if (titleLabel) titleLabel.style.display = showTitle ? "" : "none";
	      if (capLabel) capLabel.style.display = showCap ? "" : "none";

	      if (UI.altArea) {
        UI.altArea.disabled = !isReady;
        UI.altArea.value = isReady ? (STATE.alt || "") : "";
        UI.altArea.classList.toggle("ready", isReady);
	        UI.altArea.style.display = showAlt ? "" : "none";
      }

	      if (UI.capArea) {
        UI.capArea.disabled = !isReady;
        UI.capArea.value = isReady ? (STATE.leyenda || "") : "";
        UI.capArea.classList.toggle("ready", isReady);
	        UI.capArea.style.display = showCap ? "" : "none";
      }

	      if (UI.titleArea) {
        UI.titleArea.disabled = !isReady;
        UI.titleArea.value = isReady ? (STATE.title || "") : "";
        UI.titleArea.classList.toggle("ready", isReady);
	        UI.titleArea.style.display = showTitle ? "" : "none";
      }

	      const btnAlt = UI.overlay.querySelector("#maca-copy-alt");
	      const btnTitle = UI.overlay.querySelector("#maca-copy-title");
	      const btnCap = UI.overlay.querySelector("#maca-copy-cap");
      const btnBoth = UI.overlay.querySelector("#maca-copy-both");
      const btnRegen = UI.overlay.querySelector("#maca-regenerate");
      const btnBatchCancel = UI.overlay.querySelector("#maca-batch-cancel");
      const btnAutoPause = UI.overlay.querySelector("#maca-auto-pause");
      const btnAutoCancel = UI.overlay.querySelector("#maca-auto-cancel");
	      if (btnRegen) btnRegen.disabled = isLoading;
      if (UI.batchBtn) UI.batchBtn.disabled = STATE.batchRunning || !isWpAdminPage() || getWpSelectedCount() <= 1;
      if (btnBatchCancel) {
        btnBatchCancel.style.display = STATE.batchRunning ? "" : "none";
        btnBatchCancel.disabled = !STATE.batchRunning || STATE.batchCancelling;
        btnBatchCancel.textContent = STATE.batchCancelling ? "Cancelando..." : "Cancelar lote";
      }
      if (btnAutoPause) {
        btnAutoPause.style.display = (!STATE.batchRunning && STATE.autoUploadRunning) ? "" : "none";
        btnAutoPause.disabled = !STATE.autoUploadRunning || STATE.autoUploadCancelling;
        btnAutoPause.textContent = STATE.autoUploadPaused ? "Reanudar auto-subida" : "Pausar auto-subida";
      }
      if (btnAutoCancel) {
        btnAutoCancel.style.display = (!STATE.batchRunning && STATE.autoUploadRunning) ? "" : "none";
        btnAutoCancel.disabled = !STATE.autoUploadRunning || STATE.autoUploadCancelling;
        btnAutoCancel.textContent = STATE.autoUploadCancelling ? "Cancelando..." : "Cancelar auto-subida";
      }
	      if (btnAlt) btnAlt.style.display = showAlt ? "" : "none";
	      if (btnTitle) btnTitle.style.display = showTitle ? "" : "none";
	      if (btnCap) btnCap.style.display = showCap ? "" : "none";
	      if (btnBoth) btnBoth.style.display = (showAlt && showCap) ? "" : "none";

	      [btnAlt, btnTitle, btnCap, btnBoth].forEach((b) => {
	        if (!b) return;
	        if (b.dataset.macaFeedback === "1") return;
	        b.disabled = !isReady;
	      });
    }

    if (UI.mini) {
	      const mode = String(STATE.generateMode || "both");
	      const showAlt = mode !== "caption";
	      const showCap = mode !== "alt";
	      const btnAlt = UI.mini.querySelector("#maca-mini-alt");
	      const btnCap = UI.mini.querySelector("#maca-mini-cap");
	      if (btnAlt) btnAlt.style.display = showAlt ? "" : "none";
	      if (btnCap) btnCap.style.display = showCap ? "" : "none";
	      if (btnAlt && btnAlt.dataset.macaFeedback !== "1") btnAlt.disabled = !isReady;
	      if (btnCap && btnCap.dataset.macaFeedback !== "1") btnCap.disabled = !isReady;
    }
  }

  function tryApplyPendingResult() {
    clearApplyTimer();
    if (!STATE.pendingResult) return;

    const elapsed = Date.now() - STATE.loadingSince;
    const needWait = Math.max(0, MIN_LOADING_MS - elapsed);

    if (!STATE.firstPaintDone) {
      STATE.applyTimer = setTimeout(tryApplyPendingResult, 30);
      return;
    }

    if (needWait > 0) {
      STATE.applyTimer = setTimeout(tryApplyPendingResult, needWait);
      return;
    }

    const { alt, title, leyenda } = STATE.pendingResult;
    STATE.pendingResult = null;
    STATE.alt = alt || "";
    STATE.title = title || alt || "";
    STATE.leyenda = leyenda || "";
    STATE.status = "ready";
    STATE.error = "";
    updateUI();

	    // Optional: auto-fill WordPress fields as soon as we have a result.
	    // Uses multiple retries to cover late-rendered fields (e.g., Attachment details).
	    scheduleAutoApply();

    // Optional: what to do when generation finishes.
    // We run it after a short delay so (if enabled) WP auto-apply has time to fire.
    const action = String(STATE.onCompleteAction || "none");
    if (action !== "none") {
      const delay = STATE.wpAutoApply ? 280 : 80;
      setTimeout(() => {
        try {
          if (action === "minimize") {
            // Minimize to the mini bar.
            if (UI.overlay) {
              removeOverlay();
              showMini();
            } else {
              showMini();
            }
          } else if (action === "close") {
            closeAll();
          }
        } catch (_) {}
      }, delay);
    }
  }

  function handleOpen({ jobId, imgUrl, pageUrl, generateMode, wpAutoApply, wpAutoApplyRequireMedia, onCompleteAction }) {
    clearApplyTimer();
	    clearAutoApplyTimer();
    STATE.jobId = jobId;
    STATE.imgUrl = imgUrl || "";
    STATE.pageUrl = pageUrl || "";
	    STATE.generateMode = String(generateMode || "both");
    STATE.wpAutoApply = !!wpAutoApply;
    STATE.wpAutoApplyRequireMedia = (wpAutoApplyRequireMedia !== undefined) ? !!wpAutoApplyRequireMedia : true;
    STATE.onCompleteAction = String(onCompleteAction || "none");
    STATE.alt = "";
    STATE.title = "";
    STATE.leyenda = "";
    STATE.status = "loading";
    STATE.error = "";
    STATE.loadingSince = Date.now();
    STATE.firstPaintDone = false;
    STATE.pendingResult = null;

    removeMini();
    showOverlay();
  }

  function handleResult({ jobId, alt, title, leyenda }) {
    if (STATE.jobId && jobId && jobId !== STATE.jobId) return;

    STATE.pendingResult = { alt, title, leyenda };
    tryApplyPendingResult();
  }

  
function handleProgress(msg) {
    try {
      const phase = String(msg.phase || "");
      const current = Number(msg.current) || 0;
      const total = Number(msg.total) || 0;

      if (phase === "start") {
        STATE.status = "loading";
        STATE.batchRunning = true;
        STATE.batchCancelling = false;
        STATE.error = "";
        updateUI();
        if (UI.statusBox) {
          const txt = UI.statusBox.querySelector(".status-text");
          if (txt) txt.textContent = `Procesando selección (${current}/${total})...`;
        }
      } else if (phase === "item") {
        if (UI.statusBox) {
          const txt = UI.statusBox.querySelector(".status-text");
          if (txt) txt.textContent = `Procesando ${current}/${total}...`;
        }
      } else if (phase === "done") {
        STATE.batchRunning = false;
        STATE.batchCancelling = false;
        STATE.status = "ready";
        STATE.error = "";
        updateUI();
        if (UI.statusBox) {
          const txt = UI.statusBox.querySelector(".status-text");
          if (txt) txt.textContent = `Selección procesada (${total}/${total}).`;
        }
        updateBatchButtonUi();
      } else if (phase === "cancelled") {
        STATE.batchRunning = false;
        STATE.batchCancelling = false;
        STATE.status = "ready";
        STATE.error = "";
        updateUI();
        if (UI.statusBox) {
          const txt = UI.statusBox.querySelector(".status-text");
          if (txt) txt.textContent = `Lote cancelado (${current}/${total}).`;
        }
        updateBatchButtonUi();
      }
    } catch (_) {}
  }

  function handleError({ jobId, error }) {
    if (STATE.jobId && jobId && jobId !== STATE.jobId) return;
    clearApplyTimer();
    STATE.pendingResult = null;
    STATE.status = "error";
    STATE.batchRunning = false;
    STATE.batchCancelling = false;
    STATE.error = error || "desconocido";
    updateUI();
    updateBatchButtonUi();
  }

  function handleAutoUploadProgress(msg) {
    try {
      const phase = String(msg?.phase || "");
      const done = Number(msg?.done || 0);
      const queued = Number(msg?.queued || 0);
      const ok = Number(msg?.ok || 0);
      const err = Number(msg?.error || 0);

      if (phase === "queued" || phase === "processing" || phase === "done_item" || phase === "error_item") {
        STATE.autoUploadRunning = true;
        if (phase !== "cancel_request") STATE.autoUploadCancelling = false;
      } else if (phase === "cancel_request") {
        STATE.autoUploadRunning = true;
        STATE.autoUploadCancelling = true;
      } else if (phase === "paused") {
        STATE.autoUploadRunning = true;
      } else if (phase === "done_all" || phase === "cancelled" || phase === "safety_stop") {
        STATE.autoUploadRunning = false;
        STATE.autoUploadCancelling = false;
        STATE.autoUploadPaused = false;
      }
      STATE.autoUploadPaused = !!msg?.paused;

      if (UI.statusBox && UI.overlay && !STATE.batchRunning) {
        const txt = UI.statusBox.querySelector(".status-text");
        if (txt) {
          if (phase === "cancel_request") txt.textContent = "Cancelando auto-subida...";
          else if (phase === "paused") txt.textContent = `Auto-subida pausada (${done}/${queued}).`;
          else if (phase === "resumed") txt.textContent = `Auto-subida reanudada (${done}/${queued}).`;
          else if (phase === "safety_stop") txt.textContent = `Auto-subida detenida por fusible (límite ${Number(msg?.fuseMax || 0)}).`;
          else if (phase === "cancelled") txt.textContent = `Auto-subida cancelada (${done}/${queued}).`;
          else if (phase === "done_all") txt.textContent = `Auto-subida completada: ${ok} OK, ${err} error.`;
          else if (phase === "processing") txt.textContent = `Auto-subida en curso (${done}/${queued})...`;
        }
      }
      updateUI();
      updateBatchButtonUi();
    } catch (_) {}
  }

  const listener = (msg) => {
    if (!msg || !msg.type) return;

    if (msg.type === "MACA_OVERLAY_OPEN") handleOpen(msg);
    else if (msg.type === "MACA_OVERLAY_RESULT") handleResult(msg);
    else if (msg.type === "MACA_OVERLAY_ERROR") handleError(msg);
    else if (msg.type === "MACA_OVERLAY_PROGRESS") handleProgress(msg);
    else if (msg.type === "MACA_AUTO_UPLOAD_PROGRESS") handleAutoUploadProgress(msg);
    else if (msg.type === "MACA_OVERLAY_CLOSE") closeAll();
  };

  chrome.runtime.onMessage.addListener(listener);
  window.__macaOverlayListener = listener;
})();
