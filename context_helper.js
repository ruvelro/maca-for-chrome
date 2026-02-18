// context_helper.js - captures the last right-click target and extracts an image URL.
// Also supports fetching the currently selected/open media item in WordPress Media Library.
// Loaded only on wp-admin pages via content_scripts.

(() => {
  const STATE = { last: null, lastAt: 0 };
  const MAX_AGE_MS = 120000; // 2 minutes
  const AUTO_UPLOAD = {
    startedAt: Date.now(),
    minAgeMs: 1000,
    uploadSignalWindowMs: 45000,
    uploadSessionStartAt: 0,
    lastUploadingSignalAt: 0,
    byId: new Map()
  };
  const AUTO_UPLOAD_SETTINGS = {
    autoAnalyzeOnSelectMedia: false,
    autoQueueModeVisible: true
  };
  let LAST_USER_SELECT_AT = 0;
  const AUTO_PROGRESS = {
    uiVisible: false,
    hideTimer: null
  };

  function refreshAutoUploadSettings() {
    try {
      chrome.storage.sync.get({
        autoAnalyzeOnSelectMedia: false,
        autoQueueModeVisible: true
      }, (cfg) => {
        AUTO_UPLOAD_SETTINGS.autoAnalyzeOnSelectMedia = !!cfg?.autoAnalyzeOnSelectMedia;
        AUTO_UPLOAD_SETTINGS.autoQueueModeVisible = cfg?.autoQueueModeVisible !== false;
      });
    } catch (_) {}
  }

  function hasRecentUploadSignal() {
    return (Date.now() - Number(AUTO_UPLOAD.lastUploadingSignalAt || 0)) <= AUTO_UPLOAD.uploadSignalWindowMs;
  }

  function markUploadSignal() {
    const now = Date.now();
    const wasRecent = (now - Number(AUTO_UPLOAD.lastUploadingSignalAt || 0)) <= AUTO_UPLOAD.uploadSignalWindowMs;
    if (!wasRecent) AUTO_UPLOAD.uploadSessionStartAt = now;
    AUTO_UPLOAD.lastUploadingSignalAt = now;
  }

  function isInsideWpMediaUploader(target) {
    try {
      const el = target && target.nodeType === 1 ? target : target?.parentElement;
      if (!el) return false;
      return !!el.closest?.(".media-modal, .media-frame, .upload-ui, .media-upload-form, .uploader-inline");
    } catch (_) {
      return false;
    }
  }

  function installUploadSignalHooks() {
    if (window.__macaUploadSignalHooksInstalled) return;
    window.__macaUploadSignalHooksInstalled = true;

    const fileChangeListener = (ev) => {
      try {
        const t = ev?.target;
        if (!t || String(t.tagName || "").toLowerCase() !== "input") return;
        const type = String(t.type || "").toLowerCase();
        if (type !== "file") return;
        if (!isInsideWpMediaUploader(t)) return;
        const filesLen = Number(t.files?.length || 0);
        if (filesLen > 0) markUploadSignal();
      } catch (_) {}
    };

    const dropListener = (ev) => {
      try {
        if (!isInsideWpMediaUploader(ev?.target)) return;
        const filesLen = Number(ev?.dataTransfer?.files?.length || 0);
        if (filesLen > 0) markUploadSignal();
      } catch (_) {}
    };

    const pasteListener = (ev) => {
      try {
        if (!isInsideWpMediaUploader(ev?.target)) return;
        const items = Array.from(ev?.clipboardData?.items || []);
        const hasFile = items.some((it) => String(it?.kind || "").toLowerCase() === "file");
        if (hasFile) markUploadSignal();
      } catch (_) {}
    };

    const clickListener = (ev) => {
      try {
        const tab = ev?.target?.closest?.(".media-menu-item, .media-router a, .media-frame-router .media-menu-item");
        if (tab) {
          const txt = String(tab.textContent || "").trim().toLowerCase();
          if (txt.includes("subir") || txt.includes("upload")) {
            markUploadSignal();
            return;
          }
        }
        const btn = ev?.target?.closest?.(".upload-ui .browser, .media-upload-form .upload-button, .uploader-inline .browser");
        if (btn) markUploadSignal();
      } catch (_) {}
    };

    // Use capture to catch events even when WP stops propagation.
    document.addEventListener("change", fileChangeListener, true);
    document.addEventListener("drop", dropListener, true);
    document.addEventListener("paste", pasteListener, true);
    document.addEventListener("click", clickListener, true);
  }

  function nodeHasUploadSignal(node) {
    try {
      if (!node || node.nodeType !== 1) return false;
      const el = node;
      if (el.matches?.(".attachment.uploading, .uploading, .media-progress-bar, .uploader-inline .uploading")) return true;
      if (el.matches?.("li.attachment[data-id]") && /\bupload/i.test(String(el.className || ""))) return true;
      if (el.querySelector?.(".attachment.uploading, .uploading, .media-progress-bar, .uploader-inline .uploading")) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function countRecentUploadMarked(windowMs = AUTO_UPLOAD.uploadSignalWindowMs) {
    const now = Date.now();
    let n = 0;
    for (const meta of AUTO_UPLOAD.byId.values()) {
      const seenAt = Number(meta?.firstSeenAt || 0);
      if (!seenAt) continue;
      const isRecent = (now - seenAt) <= windowMs;
      if (!isRecent) continue;
      const inUploadSession = !!hasRecentUploadSignal() && Number(AUTO_UPLOAD.uploadSessionStartAt || 0) > 0;
      const inferredBySession =
        inUploadSession &&
        !meta?.initialScan &&
        seenAt >= (Number(AUTO_UPLOAD.uploadSessionStartAt || 0) - 1000);
      if (!meta?.sawUploading && !inferredBySession) continue;
      if (now - Number(meta.firstSeenAt || 0) <= windowMs) n++;
    }
    return n;
  }

  function firstTruthy(...vals) {
    for (const v of vals) {
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v) return v;
    }
    return "";
  }

  function resolveUrl(url) {
    if (!url) return "";
    try { return new URL(url, location.href).href; } catch (_) { return url; }
  }

  function extractUrlFromBackground(bg) {
    // bg like: url("...") or url(...)
    if (!bg || typeof bg !== "string") return "";
    const m = bg.match(/url\((['"]?)(.*?)\1\)/i);
    return m && m[2] ? m[2] : "";
  }

  function isVisible(el) {
    if (!el) return false;
    const rects = el.getClientRects();
    if (!rects || !rects.length) return false;
    const st = getComputedStyle(el);
    return st && st.display !== "none" && st.visibility !== "hidden" && Number(st.opacity || "1") > 0;
  }

  function pickLargestVisibleImg(root) {
    if (!root) return null;
    const imgs = Array.from(root.querySelectorAll("img")).filter(isVisible);
    let best = null;
    let bestArea = 0;
    for (const img of imgs) {
      const src = img.currentSrc || img.getAttribute("src") || "";
      if (!src) continue;
      const w = img.naturalWidth || img.clientWidth || 0;
      const h = img.naturalHeight || img.clientHeight || 0;
      const area = w * h;
      if (area > bestArea) {
        bestArea = area;
        best = img;
      }
    }
    return best;
  }

  function getBgUrl(el) {
    if (!el) return "";
    try {
      const bg = getComputedStyle(el).backgroundImage;
      return extractUrlFromBackground(bg);
    } catch (_) {
      return "";
    }
  }

  function findCandidate(startEl) {
    if (!startEl || startEl.nodeType !== 1) return null;

    // If it's an <img>
    if (startEl.tagName && String(startEl.tagName).toLowerCase() === "img") {
      const img = startEl;
      const url = img.currentSrc || img.getAttribute("src") || "";
      if (url) {
        const ctx = firstTruthy(
          img.getAttribute("alt"),
          img.getAttribute("title"),
          img.getAttribute("aria-label")
        );
        return { imageUrl: resolveUrl(url), filenameContext: ctx };
      }
    }

    // Walk up a few levels looking for usable things:
    // - <img> inside
    // - background-image
    // - useful data attributes
    let el = startEl;
    for (let i = 0; i < 12 && el; i++) {
      if (el.nodeType !== 1) break;

      // data attributes sometimes hold URL
      const dataUrl = firstTruthy(
        el.getAttribute && el.getAttribute("data-url"),
        el.getAttribute && el.getAttribute("data-src"),
        el.getAttribute && el.getAttribute("data-full-url")
      );
      if (dataUrl) {
        const ctx = firstTruthy(
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
          el.getAttribute("data-title"),
          el.getAttribute("data-filename")
        );
        return { imageUrl: resolveUrl(dataUrl), filenameContext: ctx };
      }

      // <img> descendant (thumbnail)
      const img = el.querySelector && el.querySelector("img");
      if (img) {
        const url = img.currentSrc || img.getAttribute("src") || "";
        if (url) {
          const ctx = firstTruthy(
            img.getAttribute("alt"),
            img.getAttribute("title"),
            el.getAttribute && el.getAttribute("aria-label"),
            el.getAttribute && el.getAttribute("title")
          );
          return { imageUrl: resolveUrl(url), filenameContext: ctx };
        }
      }

      // background-image (WP uses this often for attachments)
      const bgUrl = getBgUrl(el);
      if (bgUrl) {
        const ctx = firstTruthy(
          el.getAttribute && el.getAttribute("aria-label"),
          el.getAttribute && el.getAttribute("title"),
          el.getAttribute && el.getAttribute("data-title"),
          el.getAttribute && el.getAttribute("data-filename")
        );
        return { imageUrl: resolveUrl(bgUrl), filenameContext: ctx };
      }

      el = el.parentElement;
    }

    return null;
  }

  function getWpSelectedAttachmentEl() {
    const selectedAll = getWpSelectedAttachmentEls();
    if (!selectedAll.length) return null;
    if (selectedAll.length === 1) return selectedAll[0];

    const focused =
      selectedAll.find(el => el.getAttribute("tabindex") === "0") ||
      selectedAll.find(el => el.classList.contains("details")) ||
      selectedAll[selectedAll.length - 1];

    return focused || selectedAll[selectedAll.length - 1] || null;
  }

  function getWpSelectedAttachmentEls() {
    const root =
      document.querySelector(".media-modal") ||
      document.querySelector(".media-frame") ||
      document;

    const browser = root.querySelector(".attachments-browser") || root;

    // Prefer explicit selected tray items when available (most reliable for multi-select).
    const trayItems = Array.from(browser.querySelectorAll(".media-selection .attachments .attachment[data-id]"));
    if (trayItems.length) return trayItems;

    const list = pickMainAttachmentsList(browser);
    const els = Array.from(list.querySelectorAll(
      "li.attachment[aria-checked='true'], li.attachment.selected"
    ));
    return els;
  }

  function pickMainAttachmentsList(browser) {
    const lists = Array.from(browser.querySelectorAll("ul.attachments"));
    for (const ul of lists) {
      if (ul.closest(".media-selection")) continue;
      return ul;
    }
    return browser.querySelector("ul.attachments") || browser.querySelector(".attachments") || browser;
  }

  function extractCandidateFromAttachmentEl(attEl) {
    if (!attEl) return null;
    const id = attEl.getAttribute("data-id") || attEl.dataset?.id || "";
    const ctxText = firstTruthy(
      attEl.getAttribute("aria-label"),
      attEl.getAttribute("data-title"),
      attEl.getAttribute("data-filename"),
      attEl.querySelector(".filename")?.textContent,
      attEl.querySelector(".title")?.textContent
    );

    // Try <img> inside
    const img = attEl.querySelector("img");
    if (img) {
      const c = findCandidate(img);
      if (c && c.imageUrl) return { id, imageUrl: c.imageUrl, filenameContext: firstTruthy(ctxText, c.filenameContext) };
    }

    // Try background-image on thumbnail
    const thumb = attEl.querySelector(".thumbnail") || attEl;
    const bgEl = thumb.querySelector(".centered") || thumb.querySelector(".thumbnail") || thumb;
    const bg = getComputedStyle(bgEl).backgroundImage;
    const bgUrl = extractUrlFromBackground(bg);
    if (bgUrl) return { id, imageUrl: resolveUrl(bgUrl), filenameContext: ctxText };

    return null;
  }

  function setFormValue(el, value) {
    if (!el) return false;
    try {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clickAttachmentById(id) {
    const scope =
      document.querySelector(".media-modal") ||
      document.querySelector(".media-frame") ||
      document;
    const el = scope.querySelector(`.attachments .attachment[data-id="${CSS.escape(String(id))}"]`);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }

  function deselectAttachmentById(id) {
    const scope =
      document.querySelector(".media-modal") ||
      document.querySelector(".media-frame") ||
      document;
    const el = scope.querySelector(`.attachments .attachment[data-id="${CSS.escape(String(id))}"]`);
    if (!el) return false;
    const selected = el.matches("li.attachment[aria-checked='true'], li.attachment[aria-selected='true'], li.attachment.selected");
    if (!selected) return false;
    el.click();
    return true;
  }

  function ensureAutoProgressUi() {
    if (!document.body) return null;
    let style = document.getElementById("maca-auto-progress-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "maca-auto-progress-style";
      style.textContent = `
        #maca-auto-progress {
          position: fixed;
          right: 14px;
          bottom: 14px;
          z-index: 2147483646;
          background: rgba(17,24,39,.96);
          color: #fff;
          border-radius: 10px;
          padding: 10px 12px;
          font: 12px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          box-shadow: 0 10px 24px rgba(0,0,0,.28);
          min-width: 250px;
        }
        #maca-auto-progress[hidden] { display: none !important; }
        #maca-auto-progress .maca-ap-title { font-weight: 700; margin-bottom: 6px; }
        #maca-auto-progress .maca-ap-row { display: flex; gap: 8px; align-items: center; }
        #maca-auto-progress .maca-ap-count { margin-left: auto; opacity: .9; }
        #maca-auto-progress .maca-ap-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
        #maca-auto-progress .maca-ap-actions button {
          border: 1px solid rgba(255,255,255,.35);
          background: rgba(255,255,255,.12);
          color: #fff;
          border-radius: 8px;
          padding: 4px 8px;
          font: 11px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          cursor: pointer;
        }
        #maca-auto-progress .maca-ap-actions button:disabled { opacity: .65; cursor: not-allowed; }
        .maca-attachment-status {
          position: absolute;
          top: 0;
          left: 0;
          min-width: 20px;
          height: 20px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font: 11px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          color: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,.22);
          pointer-events: none;
          z-index: 7;
          border: 1px solid rgba(255,255,255,.85);
        }
        .maca-attachment-status.compact {
          min-width: 16px;
          height: 16px;
          font-size: 9px;
          border-width: 1px;
        }
        .maca-attachment-status.compact.done { font-size: 8px; }
        .maca-attachment-status.pending { background: #2563eb; }
        .maca-attachment-status.processing { background: #0369a1; }
        .maca-attachment-status.done { background: #16a34a; }
        .maca-attachment-status.error { background: #dc2626; }
      `;
      document.documentElement.appendChild(style);
    }

    let panel = document.getElementById("maca-auto-progress");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "maca-auto-progress";
      panel.hidden = true;
      panel.innerHTML = `
        <div class="maca-ap-title">maca - Auto-generacion</div>
        <div class="maca-ap-row">
          <span id="maca-ap-status">En cola...</span>
          <span id="maca-ap-count" class="maca-ap-count">0/0</span>
        </div>
        <div id="maca-ap-queue" class="maca-ap-queue" style="margin-top:6px; opacity:.9; font-size:11px;"></div>
        <div class="maca-ap-actions">
          <button id="maca-ap-pause" type="button">Pausar</button>
          <button id="maca-ap-cancel" type="button">Cancelar</button>
        </div>
      `;
      const pauseBtn = panel.querySelector("#maca-ap-pause");
      pauseBtn?.addEventListener("click", async () => {
        try {
          const paused = pauseBtn.dataset.paused === "1";
          if (paused) {
            await chrome.runtime.sendMessage({ type: "MACA_AUTO_UPLOAD_RESUME" });
          } else {
            await chrome.runtime.sendMessage({ type: "MACA_AUTO_UPLOAD_PAUSE" });
          }
        } catch (_) {}
      });
      const cancelBtn = panel.querySelector("#maca-ap-cancel");
      cancelBtn?.addEventListener("click", async () => {
        try {
          cancelBtn.disabled = true;
          cancelBtn.textContent = "Cancelando...";
          await chrome.runtime.sendMessage({ type: "MACA_AUTO_UPLOAD_CANCEL" });
        } catch (_) {}
      });
      document.body.appendChild(panel);
    }
    return panel;
  }

  function setAttachmentStatusBadge(attachmentId, state) {
    const id = String(attachmentId || "");
    if (!id) return;
    const scope =
      document.querySelector(".media-modal") ||
      document.querySelector(".media-frame") ||
      document;
    const el = scope.querySelector(`.attachments .attachment[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    let badge = el.querySelector(".maca-attachment-status");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "maca-attachment-status";
      el.appendChild(badge);
    }
    badge.className = `maca-attachment-status ${state}`;
    if (state === "pending") badge.textContent = "...";
    else if (state === "processing") badge.textContent = "*";
    else if (state === "done") badge.textContent = "OK";
    else badge.textContent = "ERR";

    try {
      const rect = el.getBoundingClientRect();
      const compact = rect.width > 0 && rect.width < 170;
      badge.classList.toggle("compact", compact);
      const hostStyle = getComputedStyle(el);
      if (hostStyle.position === "static") el.style.position = "relative";
      const delta = compact ? 4 : 6;
      badge.style.top = `${delta}px`;
      badge.style.left = `${delta}px`;
      badge.style.right = "auto";
    } catch (_) {
      // Fallback to top-left.
      badge.classList.remove("compact");
      badge.style.top = "6px";
      badge.style.left = "6px";
      badge.style.right = "auto";
    }
  }

  function updateAutoProgressUi(msg) {
    const panel = ensureAutoProgressUi();
    if (!panel) {
      setTimeout(() => updateAutoProgressUi(msg), 120);
      return;
    }
    const statusEl = panel.querySelector("#maca-ap-status");
    const countEl = panel.querySelector("#maca-ap-count");
    const queueEl = panel.querySelector("#maca-ap-queue");
    const pauseBtn = panel.querySelector("#maca-ap-pause");
    const cancelBtn = panel.querySelector("#maca-ap-cancel");
    const queued = Number(msg?.queued || 0);
    const done = Number(msg?.done || 0);
    const ok = Number(msg?.ok || 0);
    const err = Number(msg?.error || 0);
    const phase = String(msg?.phase || "");
    const paused = !!msg?.paused;
    const queue = Array.isArray(msg?.queue) ? msg.queue.map(v => String(v || "")).filter(Boolean) : [];

    if (countEl) countEl.textContent = `${Math.min(done, queued)}/${queued}`;
    if (statusEl) {
      if (phase === "done_all") statusEl.textContent = `Completado: ${ok} OK, ${err} error`;
      else if (phase === "cancelled") statusEl.textContent = `Cancelado: ${ok} OK, ${err} error`;
      else if (phase === "safety_stop") statusEl.textContent = `Fusible activado (límite ${Number(msg?.fuseMax || 0)}).`;
      else if (phase === "cancel_request") statusEl.textContent = "Cancelando...";
      else if (phase === "paused") statusEl.textContent = "Pausado.";
      else if (phase === "resumed") statusEl.textContent = "Reanudando...";
      else if (phase === "error_item") statusEl.textContent = `Procesando... (${ok} OK, ${err} error)`;
      else if (phase === "processing") statusEl.textContent = "Analizando y rellenando...";
      else statusEl.textContent = "En cola...";
    }
    if (queueEl) {
      if (AUTO_UPLOAD_SETTINGS.autoQueueModeVisible && queue.length) {
        queueEl.style.display = "";
        queueEl.textContent = `Cola: ${queue.join(", ")}`;
      } else {
        queueEl.style.display = "none";
        queueEl.textContent = "";
      }
    }
    if (pauseBtn) {
      const canPause = !(phase === "done_all" || phase === "cancelled" || phase === "cancel_request");
      pauseBtn.style.display = canPause ? "" : "none";
      pauseBtn.dataset.paused = paused ? "1" : "0";
      pauseBtn.textContent = paused ? "Reanudar" : "Pausar";
      pauseBtn.disabled = phase === "cancel_request";
    }
    if (cancelBtn) {
      const canCancel = !(phase === "done_all" || phase === "cancelled" || phase === "safety_stop");
      cancelBtn.style.display = canCancel ? "" : "none";
      cancelBtn.disabled = phase === "cancel_request";
      if (phase !== "cancel_request") cancelBtn.textContent = "Cancelar";
    }
    panel.hidden = false;
    AUTO_PROGRESS.uiVisible = true;

    if (AUTO_PROGRESS.hideTimer) {
      clearTimeout(AUTO_PROGRESS.hideTimer);
      AUTO_PROGRESS.hideTimer = null;
    }
    if (phase === "done_all" || phase === "cancelled" || phase === "safety_stop") {
      AUTO_PROGRESS.hideTimer = setTimeout(() => {
        panel.hidden = true;
        AUTO_PROGRESS.uiVisible = false;
      }, 6000);
    }
  }

  function isVisibleField(el) {
    if (!el) return false;
    try {
      const st = getComputedStyle(el);
      if (!st) return false;
      if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") return false;
      const modal = el.closest?.(".media-modal");
      if (modal && modal.getAttribute?.("aria-hidden") === "true") return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function pickFieldFromSelectors(scope, details, selectors) {
    const roots = [details, scope, document].filter(Boolean);
    for (const root of roots) {
      for (const sel of selectors) {
        try {
          const all = Array.from(root.querySelectorAll(sel));
          const visible = all.find(isVisibleField);
          if (visible) return visible;
          if (all[0]) return all[0];
        } catch (_) {}
      }
    }
    return null;
  }

  function getAltFieldForAttachment(id) {
    const scope = document.querySelector(".media-modal") || document.querySelector(".media-frame") || document;
    const details =
      scope.querySelector(".attachment-details") ||
      document.querySelector(".attachment-details");
    const selectors = [
      '.attachment-details .setting[data-setting="alt"] textarea',
      '.attachment-details .setting[data-setting="alt"] input',
      '.attachment-details [data-setting="alt"] textarea',
      '.attachment-details [data-setting="alt"] input',
      '.media-modal .attachment-details .setting[data-setting="alt"] textarea',
      '.media-modal .attachment-details .setting[data-setting="alt"] input',
      '.media-modal [data-setting="alt"] textarea',
      '.media-modal [data-setting="alt"] input',
      "#attachment_alt",
      "textarea.attachment-alt-text",
      "input.attachment-alt-text",
      `textarea[name="attachments[${id}][alt]"]`,
      `input[name="attachments[${id}][alt]"]`,
      'textarea[aria-label="Texto alternativo"]',
      'input[aria-label="Texto alternativo"]',
      'textarea[aria-label="Alt text"]',
      'input[aria-label="Alt text"]'
    ];
    return pickFieldFromSelectors(scope, details, selectors);
  }

  function getCaptionFieldForAttachment(id) {
    const scope = document.querySelector(".media-modal") || document.querySelector(".media-frame") || document;
    const details =
      scope.querySelector(".attachment-details") ||
      document.querySelector(".attachment-details");
    const selectors = [
      '.attachment-details .setting[data-setting="caption"] textarea',
      '.attachment-details .setting[data-setting="caption"] input',
      '.attachment-details [data-setting="caption"] textarea',
      '.attachment-details [data-setting="caption"] input',
      '.media-modal .attachment-details .setting[data-setting="caption"] textarea',
      '.media-modal .attachment-details .setting[data-setting="caption"] input',
      '.media-modal [data-setting="caption"] textarea',
      '.media-modal [data-setting="caption"] input',
      "#attachment_caption",
      "textarea.attachment-caption",
      "input.attachment-caption",
      `textarea[name="attachments[${id}][caption]"]`,
      `input[name="attachments[${id}][caption]"]`,
      'textarea[aria-label="Leyenda"]',
      'input[aria-label="Leyenda"]',
      'textarea[aria-label="Caption"]',
      'input[aria-label="Caption"]'
    ];
    return pickFieldFromSelectors(scope, details, selectors);
  }

  function getTitleFieldForAttachment(id) {
    const scope = document.querySelector(".media-modal") || document.querySelector(".media-frame") || document;
    const details =
      scope.querySelector(".attachment-details") ||
      document.querySelector(".attachment-details");
    const selectors = [
      "#attachment_title",
      "input.attachment-title",
      "textarea.attachment-title",
      '.attachment-details .setting[data-setting="title"] input',
      '.attachment-details .setting[data-setting="title"] textarea',
      '.attachment-details [data-setting="title"] input',
      '.attachment-details [data-setting="title"] textarea',
      `.setting[data-setting="title"] input`,
      `.setting[data-setting="title"] textarea`,
      `input[name="attachments[${id}][title]"]`,
      `textarea[name="attachments[${id}][title]"]`,
      'input[aria-label="Título"]',
      'textarea[aria-label="Título"]',
      'input[aria-label="Title"]',
      'textarea[aria-label="Title"]'
    ];
    return pickFieldFromSelectors(scope, details, selectors);
  }

  async function applyToAttachment({ attachmentId, alt, title, leyenda, generateMode, requireMedia }) {
    const id = String(attachmentId || "");
    if (!id) return { ok: false, error: "ID de adjunto inválido." };

    // If requireMedia is on, only run inside media modal/frame or details screen.
    if (requireMedia) {
      const inMedia = !!(document.querySelector(".media-modal") || document.querySelector(".media-frame") || document.querySelector(".attachment-details"));
      if (!inMedia) return { ok: false, error: "No se detecta pantalla de Medios/Detalles." };
    }

    clickAttachmentById(id);

    // Wait briefly for the details panel to update
    const start = Date.now();
    while (Date.now() - start < 3500) {
      const altEl = getAltFieldForAttachment(id);
      const titleEl = getTitleFieldForAttachment(id);
      const capEl = getCaptionFieldForAttachment(id);
      if (altEl || titleEl || capEl) break;
      await new Promise(r => setTimeout(r, 80));
    }

    const res = { alt: false, title: false, leyenda: false };
    const mode = String(generateMode || "both");
    if (mode === "both" || mode === "alt") {
      const altEl = getAltFieldForAttachment(id);
      if (altEl) res.alt = setFormValue(altEl, String(alt || ""));
      const titleEl = getTitleFieldForAttachment(id);
      if (titleEl) res.title = setFormValue(titleEl, String(title || alt || ""));
    }
    if (mode === "both" || mode === "caption") {
      const capEl = getCaptionFieldForAttachment(id);
      if (capEl) res.leyenda = setFormValue(capEl, String(leyenda || ""));
    }
    return { ok: true, applied: res };
  }

  function findWpDetailsCandidate() {
    const details =
      document.querySelector(".media-modal .attachment-details") ||
      document.querySelector(".media-frame .attachment-details") ||
      document.querySelector(".attachment-details");

    if (!details) return null;

    // Common: <img class="details-image">
    const img =
      details.querySelector("img.details-image") ||
      details.querySelector(".thumbnail img") ||
      pickLargestVisibleImg(details);

    if (img) {
      const c = findCandidate(img);
      if (c && c.imageUrl) return c;
    }

    // Sometimes URL is in a readonly input.urlfield
    const urlField = details.querySelector("input.urlfield, input[name='attachments\\[\\d+\\]\\[url\\]']");
    if (urlField && urlField.value) {
      const ctx = firstTruthy(
        details.querySelector(".filename")?.textContent,
        details.querySelector(".title")?.textContent
      );
      return { imageUrl: resolveUrl(urlField.value), filenameContext: (ctx || "").trim() };
    }

    return null;
  }

  function findSelectedWpCandidate() {
    // 1) If details panel is present, it's usually authoritative for the current selection
    const detailsCand = findWpDetailsCandidate();
    if (detailsCand && detailsCand.imageUrl) return detailsCand;

    // 2) Otherwise use the selected attachment tile
    const selectedEl = getWpSelectedAttachmentEl();
    if (selectedEl) {
      // Prefer thumbnail element inside selected tile
      const thumb = selectedEl.querySelector(".thumbnail") || selectedEl;
      // Try <img> inside thumb
      const img = thumb.querySelector("img") || null;
      if (img) {
        const c = findCandidate(img);
        if (c && c.imageUrl) return c;
      }
      // Try background-image on .thumbnail or descendants
      const bgEl =
        thumb.querySelector(".centered") ||
        thumb.querySelector(".thumbnail") ||
        thumb;
      const bgUrl = getBgUrl(bgEl) || getBgUrl(thumb);
      if (bgUrl) {
        const ctx = firstTruthy(
          selectedEl.getAttribute("aria-label"),
          selectedEl.getAttribute("data-filename"),
          selectedEl.getAttribute("data-title")
        );
        return { imageUrl: resolveUrl(bgUrl), filenameContext: ctx };
      }
      // Final attempt: findCandidate on selected tile
      const c = findCandidate(selectedEl);
      if (c && c.imageUrl) return c;
    }

    // 3) No selection found - do NOT pick a random visible image
    return null;
  }

  function isSelectedAttachmentEl(el) {
    if (!el) return false;
    return el.matches("li.attachment[aria-checked='true'], li.attachment[aria-selected='true'], li.attachment.selected");
  }

  function noteAttachmentMeta(el, { initial = false } = {}) {
    if (!el) return null;
    const id = String(el.getAttribute("data-id") || el.dataset?.id || "");
    if (!id) return null;
    const cls = String(el.className || "");
    let meta = AUTO_UPLOAD.byId.get(id);
    if (!meta) {
      meta = { firstSeenAt: Date.now(), sawUploading: false, triggered: false, retries: 0, initialScan: !!initial };
      AUTO_UPLOAD.byId.set(id, meta);
    } else if (initial && meta.initialScan !== false) {
      meta.initialScan = true;
    }
    if (/\bupload/i.test(cls)) {
      meta.sawUploading = true;
      markUploadSignal();
    }
    return { id, meta };
  }

  function maybeAutoProcessUploadedAttachment(el) {
    try {
      const entry = noteAttachmentMeta(el);
      if (!entry) return;
      const { id, meta } = entry;
      if (meta.triggered) return;

      const selected = isSelectedAttachmentEl(el);
      const fromUpload = !!meta.sawUploading;
      const looksLikeNewAfterBoot = !meta.initialScan && Number(meta.firstSeenAt || 0) > (AUTO_UPLOAD.startedAt + 3000);
      const isMultiUpload = countRecentUploadMarked() >= 2;
      const inUploadSession = hasRecentUploadSignal() && Number(AUTO_UPLOAD.uploadSessionStartAt || 0) > 0;
      const allowBatchUploadFlow = isMultiUpload && inUploadSession && (fromUpload || looksLikeNewAfterBoot);
      const userJustSelected = (Date.now() - LAST_USER_SELECT_AT) < 3000;
      const allowSelectFeature = AUTO_UPLOAD_SETTINGS.autoAnalyzeOnSelectMedia && selected && userJustSelected;

      // Default behavior: only auto-run for multi-upload sessions.
      // Optional feature: auto-run on manual selection in media library.
      if (!(allowBatchUploadFlow || allowSelectFeature)) return;
      if ((Date.now() - meta.firstSeenAt) < AUTO_UPLOAD.minAgeMs) return;

      let c = extractCandidateFromAttachmentEl(el) || findCandidate(el);
      if (c?.imageUrl && String(c.imageUrl).startsWith("blob:")) {
        const selectedCand = findSelectedWpCandidate();
        if (selectedCand?.imageUrl && !String(selectedCand.imageUrl).startsWith("blob:")) {
          c = {
            imageUrl: selectedCand.imageUrl,
            filenameContext: firstTruthy(c.filenameContext, selectedCand.filenameContext)
          };
        }
      }
      if (!c?.imageUrl) return;

      meta.triggered = true;
      try {
        chrome.runtime.sendMessage({
          type: "MACA_AUTO_PROCESS_ATTACHMENT",
          attachmentId: id,
          imageUrl: c.imageUrl,
          filenameContext: c.filenameContext || "",
          pageUrl: location.href
        }, (res) => {
          const hadRuntimeError = !!chrome.runtime.lastError;
          const skipped = !!res?.skipped;
          if (skipped) {
            meta.retries = 0;
            if (String(res?.reason || "") !== "duplicate") meta.triggered = false;
            return;
          }
          if (hadRuntimeError || !res?.ok) {
            meta.triggered = false;
            meta.retries = Number(meta.retries || 0) + 1;
            if (meta.retries <= 3) {
              setTimeout(() => {
                try { maybeAutoProcessUploadedAttachment(el); } catch (_) {}
              }, 900);
            }
          } else {
            meta.retries = 0;
          }
        });
      } catch (_) {}
    } catch (_) {}
  }

  function initAutoUploadObserver() {
    try {
      if (window.__macaAutoUploadObserver) return;
      refreshAutoUploadSettings();
      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== "sync") return;
          if (!changes) return;
          if (changes.autoAnalyzeOnSelectMedia) {
            AUTO_UPLOAD_SETTINGS.autoAnalyzeOnSelectMedia = !!changes.autoAnalyzeOnSelectMedia.newValue;
          }
          if (changes.autoQueueModeVisible) {
            AUTO_UPLOAD_SETTINGS.autoQueueModeVisible = changes.autoQueueModeVisible.newValue !== false;
          }
        });
      } catch (_) {}

      const root = document.querySelector(".attachments-browser") || document.body;
      if (!root) return;
      installUploadSignalHooks();

      const scanAll = () => {
        try {
          const all = root.querySelectorAll("li.attachment[data-id]");
          for (const el of all) maybeAutoProcessUploadedAttachment(el);
        } catch (_) {}
      };

      const scanSelected = () => {
        try {
          const selected = getWpSelectedAttachmentEls();
          for (const el of selected) maybeAutoProcessUploadedAttachment(el);
        } catch (_) {}
      };

      const existing = root.querySelectorAll("li.attachment[data-id]");
      for (const el of existing) noteAttachmentMeta(el, { initial: true });
      scanAll();

      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "childList") {
            for (const n of m.addedNodes) {
              if (!n || n.nodeType !== 1) continue;
              const uploadSignal = nodeHasUploadSignal(n);
              if (uploadSignal) markUploadSignal();
              const el = n.matches?.("li.attachment[data-id]") ? n : n.querySelector?.("li.attachment[data-id]");
              if (el) {
                const info = noteAttachmentMeta(el);
                if (uploadSignal) {
                  if (info?.meta) info.meta.sawUploading = true;
                }
                maybeAutoProcessUploadedAttachment(el);
              }
              const all = n.querySelectorAll ? n.querySelectorAll("li.attachment[data-id]") : [];
              for (const li of all) {
                const info = noteAttachmentMeta(li);
                if (uploadSignal) {
                  if (info?.meta) info.meta.sawUploading = true;
                }
                maybeAutoProcessUploadedAttachment(li);
              }
            }
          } else if (m.type === "attributes") {
            const el = m.target?.closest?.("li.attachment[data-id]") || m.target;
            if (el && el.matches?.("li.attachment[data-id]")) {
              noteAttachmentMeta(el);
              maybeAutoProcessUploadedAttachment(el);
            }
          }
        }
      });

      obs.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-checked", "aria-selected", "data-id"]
      });
      window.__macaAutoUploadObserver = obs;

      // Fallback hooks: selection changes in WP don't always mutate useful attrs.
      root.addEventListener("click", () => {
        LAST_USER_SELECT_AT = Date.now();
        setTimeout(scanSelected, 50);
      }, true);
      root.addEventListener("keyup", () => {
        LAST_USER_SELECT_AT = Date.now();
        setTimeout(scanSelected, 50);
      }, true);

      // Short-lived poll to catch delayed updates after upload.
      const pollStart = Date.now();
      const poll = setInterval(() => {
        if (Date.now() - pollStart > 45000) {
          clearInterval(poll);
          return;
        }
        scanAll();
      }, 1200);
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(initAutoUploadObserver, 0), { once: true });
  } else {
    setTimeout(initAutoUploadObserver, 0);
  }

  // Capture last right-click target within wp-admin (helps context menu workflow)
  document.addEventListener("contextmenu", (ev) => {
    try {
      const c = findCandidate(ev.target);
      if (c && c.imageUrl) {
        STATE.last = c;
        STATE.lastAt = Date.now();
        try {
          chrome.runtime.sendMessage({
            type: "MACA_SET_LAST_CANDIDATE",
            candidate: { imageUrl: c.imageUrl, filenameContext: c.filenameContext || "" },
            at: STATE.lastAt
          });
        } catch (_) {}
      }
    } catch (_) {}
  }, true);

  // Respond to background queries
  function findSelectedWpAttachments() {
    const els = getWpSelectedAttachmentEls();
    if (!els.length) return [];

    const seen = new Set();
    const items = [];

    for (const el of els) {
      const id = String(el.getAttribute("data-id") || el.dataset?.id || "");
      const thumb = el.querySelector(".thumbnail") || el.querySelector("img") || el;
      let cand = extractCandidateFromAttachmentEl(el) || findCandidate(thumb) || findCandidate(el);
      if (cand?.imageUrl && String(cand.imageUrl).startsWith("blob:")) {
        const selectedCand = findSelectedWpCandidate();
        if (selectedCand?.imageUrl && !String(selectedCand.imageUrl).startsWith("blob:")) {
          cand = {
            imageUrl: selectedCand.imageUrl,
            filenameContext: firstTruthy(cand.filenameContext, selectedCand.filenameContext)
          };
        }
      }
      if (!cand || !cand.imageUrl) continue;
      const dedupeKey = id || cand.imageUrl;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      items.push({
        id,
        imageUrl: cand.imageUrl,
        filenameContext: cand.filenameContext || ""
      });
    }
    return items;
  }


  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === "MACA_GET_LAST_CANDIDATE") {
      const age = Date.now() - STATE.lastAt;
      if (STATE.last && age <= MAX_AGE_MS) {
        sendResponse({ ok: true, imageUrl: STATE.last.imageUrl, filenameContext: STATE.last.filenameContext || "" });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }

    if (msg.type === "MACA_GET_SELECTED_CANDIDATE") {
      const c = findSelectedWpCandidate();
      if (c && c.imageUrl) {
        sendResponse({ ok: true, imageUrl: c.imageUrl, filenameContext: c.filenameContext || "" });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }
    if (msg.type === "MACA_GET_SELECTED_ATTACHMENTS") {
      const items = findSelectedWpAttachments();
      sendResponse({ ok: true, items });
      return true;
    }
    if (msg.type === "MACA_DESELECT_ATTACHMENT") {
      const ok = deselectAttachmentById(String(msg.attachmentId || ""));
      sendResponse({ ok });
      return true;
    }
    if (msg.type === "MACA_AUTO_UPLOAD_PROGRESS") {
      const attachmentId = String(msg.attachmentId || "");
      const phase = String(msg.phase || "");
      if (attachmentId) {
        if (phase === "queued") setAttachmentStatusBadge(attachmentId, "pending");
        else if (phase === "processing") setAttachmentStatusBadge(attachmentId, "processing");
        else if (phase === "done_item") setAttachmentStatusBadge(attachmentId, "done");
        else if (phase === "error_item") setAttachmentStatusBadge(attachmentId, "error");
      }
      updateAutoProgressUi(msg);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "MACA_APPLY_TO_ATTACHMENT") {
      (async () => {
        // Safety: avoid running inside iframes.
        try {
          if (window.top !== window) {
            sendResponse({ ok: false, skipped: true, reason: "iframe" });
            return;
          }
        } catch (_) {
          sendResponse({ ok: false, skipped: true, reason: "iframe" });
          return;
        }
        const res = await applyToAttachment({
          attachmentId: msg.attachmentId,
          alt: msg.alt,
          title: msg.title,
          leyenda: msg.leyenda,
          generateMode: msg.generateMode,
          requireMedia: msg.requireMedia
        });
        sendResponse(res);
      })();
      return true;
    }
  });
})();

