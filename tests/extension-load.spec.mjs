import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { test, expect, chromium } from "@playwright/test";

test("chrome extension service worker loads and options page opens", async () => {
  const extensionPath = path.resolve("maca por chrome");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maca-ext-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: process.env.PLAYWRIGHT_EXTENSION_CHANNEL || "msedge",
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    expect(worker.url()).toContain("chrome-extension://");

    const details = await worker.evaluate(() => ({
      manifest: chrome.runtime.getManifest(),
      optionsUrl: chrome.runtime.getURL("options.html")
    }));

    expect(details.manifest.version).toBe("1.0.10");
    const page = await context.newPage();
    await page.goto(details.optionsUrl);
    await expect(page.locator("body")).toContainText("maca");
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
