import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(".");

function listJsFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full, base));
    else if (entry.name.endsWith(".js")) out.push(path.relative(base, full));
  }
  return out;
}

test("shared build generator refreshes both browser outputs", () => {
  execFileSync("node", [path.join("scripts", "build-extensions.mjs"), "all"], {
    cwd: root,
    stdio: "pipe"
  });

  const chromeManifest = JSON.parse(fs.readFileSync(path.join(root, "maca por chrome", "manifest.json"), "utf8"));
  const firefoxManifest = JSON.parse(fs.readFileSync(path.join(root, "maca for firefox", "manifest.json"), "utf8"));
  const chromeBackground = fs.readFileSync(path.join(root, "maca por chrome", "background.js"), "utf8");

  assert.equal(fs.existsSync(path.join(root, "maca por chrome", "wp_dom_shared.js")), true);
  assert.equal(fs.existsSync(path.join(root, "maca for firefox", "wp_dom_shared.js")), true);
  assert.equal(fs.existsSync(path.join(root, "maca por chrome", "wp_selectors_shared.js")), true);
  assert.equal(fs.existsSync(path.join(root, "maca for firefox", "wp_media_shared.js")), true);
  assert.equal(fs.existsSync(path.join(root, "maca por chrome", "background", "runtime-state.js")), true);
  assert.equal(fs.existsSync(path.join(root, "maca for firefox", "background", "config.js")), true);

  assert.equal(chromeManifest.content_scripts[0].js[0], "wp_dom_shared.js");
  assert.equal(chromeManifest.version, "1.0.10");
  assert.equal(firefoxManifest.content_scripts[0].js[0], "wp_dom_shared.js");
  assert.equal(firefoxManifest.version, "1.0.10");
  assert.match(chromeBackground, /AUTO-GENERATED FILE/);

  for (const variantDir of [path.join(root, "maca por chrome"), path.join(root, "maca for firefox")]) {
    for (const rel of listJsFiles(variantDir)) {
      assert.doesNotThrow(() => {
        execFileSync("node", ["--check", path.join(variantDir, rel)], { cwd: root, stdio: "pipe" });
      });
    }
  }
});
