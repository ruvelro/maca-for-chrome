/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */
export async function ensureOverlayInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["wp_dom_shared.js", "wp_selectors_shared.js", "wp_media_shared.js", "overlay.js"]
    });
    return true;
  } catch (_) {
    return false;
  }
}

export async function sendOverlay(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    const injected = await ensureOverlayInjected(tabId);
    if (!injected) throw error;
    await chrome.tabs.sendMessage(tabId, payload);
  }
}
