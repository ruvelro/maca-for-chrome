/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
(function () {
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
    for (const ul of lists) {
      if (ul.closest(".media-selection")) continue;
      if (ul.closest(".attachments-browser")) return ul;
    }
    for (const ul of lists) {
      if (ul.closest(".media-selection")) continue;
      return ul;
    }
    return browser.querySelector("ul.attachments") || browser.querySelector(".attachments") || browser;
  }

  function getWpSelectedAttachmentEls(root = document) {
    const scope = root.querySelector(".media-modal") || root.querySelector(".media-frame") || root;
    const browser = scope.querySelector(".attachments-browser") || scope;
    const trayItems = Array.from(browser.querySelectorAll(".media-selection .attachments .attachment[data-id]"));
    if (trayItems.length) return trayItems;
    const list = pickMainWpAttachmentsList(browser);
    return Array.from(list.querySelectorAll("li.attachment[aria-checked='true'], li.attachment[aria-selected='true'], li.attachment.selected"));
  }

  function getWpSelectedAttachmentEl(root = document) {
    const selectedAll = getWpSelectedAttachmentEls(root);
    if (!selectedAll.length) return null;
    if (selectedAll.length === 1) return selectedAll[0];
    const focused = selectedAll.find((el) => el.getAttribute("tabindex") === "0") || selectedAll.find((el) => el.classList.contains("details")) || selectedAll[selectedAll.length - 1];
    return focused || selectedAll[selectedAll.length - 1] || null;
  }

  function getWpSelectedCount(root = document) {
    if (!isWpAdminPage()) return 0;
    return getWpSelectedAttachmentEls(root).length;
  }

  window.__MACA_WP_MEDIA = {
    isWpAdminPage,
    pickMainWpAttachmentsList,
    getWpSelectedAttachmentEls,
    getWpSelectedAttachmentEl,
    getWpSelectedCount
  };
})();
