/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
(function () {
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

  function pickFieldFromSelectors(roots, selectors) {
    for (const root of roots.filter(Boolean)) {
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

  function pickBestField(selector, root = document) {
    const els = Array.from(root.querySelectorAll(selector));
    for (const el of els) {
      if (isVisibleField(el)) return el;
    }
    return els[0] || null;
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findFieldNearLabel(labelTexts, roots) {
    const targets = Array.isArray(labelTexts) ? labelTexts : [labelTexts];
    const wanted = targets.map(normalizeText);
    const resolvedRoots = (roots || [
      document.querySelector(".media-modal"),
      document.querySelector(".media-frame"),
      document.querySelector(".attachment-details"),
      document.body
    ]).filter(Boolean);

    for (const root of resolvedRoots) {
      const nodes = root.querySelectorAll("label, .setting .name, .media-setting .name, .attachment-details label, .attachment-details .name, .compat-item label, .compat-item .label");
      for (const n of nodes) {
        const txt = normalizeText(n.textContent);
        if (!txt || !wanted.includes(txt)) continue;

        if (n.tagName === "LABEL") {
          const forId = n.getAttribute("for");
          if (forId) {
            const el = root.querySelector(`#${CSS.escape(forId)}`);
            if (el && isVisibleField(el)) return el;
          }
        }

        const row = n.closest(".setting, .media-setting, .compat-field, .compat-item, tr, .field, .components-base-control") || n.parentElement;
        if (row) {
          const el = row.querySelector('textarea, input, [contenteditable="true"]');
          if (el && isVisibleField(el)) return el;
        }
      }
    }
    return null;
  }

  function setWpFormValue(el, value) {
    if (!el) return false;
    try {
      el.focus?.();
      if (el.getAttribute?.("contenteditable") === "true") {
        el.innerHTML = "";
        el.textContent = value;
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
      el.blur?.();
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      el.dispatchEvent(new Event("focusout", { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  }

  window.__MACA_WP_DOM = {
    isVisibleField,
    pickFieldFromSelectors,
    pickBestField,
    normalizeText,
    findFieldNearLabel,
    setWpFormValue
  };
})();
