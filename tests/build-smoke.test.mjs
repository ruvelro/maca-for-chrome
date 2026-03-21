import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(".");

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
  assert.equal(chromeManifest.version, "1.0.9");
  assert.equal(firefoxManifest.content_scripts[0].js[0], "wp_dom_shared.js");
  assert.equal(firefoxManifest.version, "1.0.9");
  assert.match(chromeBackground, /AUTO-GENERATED FILE/);
});
