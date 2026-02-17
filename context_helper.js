// context_helper.js - captures the last right-click target and extracts an image URL.
// Also supports fetching the currently selected/open media item in WordPress Media Library.
// Loaded only on wp-admin pages via content_scripts.

(() => {
  const STATE = { last: null, lastAt: 0 };
  const MAX_AGE_MS = 120000; // 2 minutes
  const AUTO_UPLOAD = {
    startedAt: Date.now(),
    minAgeMs: 1000,
    byId: new Map()
  };

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
    const list = browser.querySelector("ul.attachments") || browser.querySelector(".attachments") || browser;

    const els = Array.from(list.querySelectorAll(
      "li.attachment[aria-checked='true'], li.attachment.selected, li.attachment[aria-selected='true']"
    ));
    return els;
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

  function noteAttachmentMeta(el) {
    if (!el) return null;
    const id = String(el.getAttribute("data-id") || el.dataset?.id || "");
    if (!id) return null;
    const cls = String(el.className || "");
    let meta = AUTO_UPLOAD.byId.get(id);
    if (!meta) {
      meta = { firstSeenAt: Date.now(), sawUploading: false, triggered: false, retries: 0 };
      AUTO_UPLOAD.byId.set(id, meta);
    }
    if (/\bupload/i.test(cls)) meta.sawUploading = true;
    return { id, meta };
  }

  function maybeAutoProcessUploadedAttachment(el) {
    try {
      const entry = noteAttachmentMeta(el);
      if (!entry) return;
      const { id, meta } = entry;
      if (meta.triggered) return;
      const selected = isSelectedAttachmentEl(el);
      const looksLikeNewAfterBoot = meta.firstSeenAt > (AUTO_UPLOAD.startedAt + 3000);
      if (!meta.sawUploading && (!looksLikeNewAfterBoot || !selected)) return;
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
      const root = document.querySelector(".attachments-browser") || document.body;
      if (!root) return;

      const scanSelected = () => {
        try {
          const selected = getWpSelectedAttachmentEls();
          for (const el of selected) maybeAutoProcessUploadedAttachment(el);
        } catch (_) {}
      };

      const existing = root.querySelectorAll("li.attachment[data-id]");
      for (const el of existing) noteAttachmentMeta(el);
      scanSelected();

      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "childList") {
            for (const n of m.addedNodes) {
              if (!n || n.nodeType !== 1) continue;
              const el = n.matches?.("li.attachment[data-id]") ? n : n.querySelector?.("li.attachment[data-id]");
              if (el) {
                noteAttachmentMeta(el);
                maybeAutoProcessUploadedAttachment(el);
              }
              const all = n.querySelectorAll ? n.querySelectorAll("li.attachment[data-id]") : [];
              for (const li of all) {
                noteAttachmentMeta(li);
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
      root.addEventListener("click", () => setTimeout(scanSelected, 50), true);
      root.addEventListener("keyup", () => setTimeout(scanSelected, 50), true);

      // Short-lived poll to catch delayed updates after upload.
      const pollStart = Date.now();
      const poll = setInterval(() => {
        if (Date.now() - pollStart > 45000) {
          clearInterval(poll);
          return;
        }
        scanSelected();
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

