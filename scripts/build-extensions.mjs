import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const sharedDir = path.join(root, "src", "shared");
const platformDir = path.join(root, "src", "platform");

const managedFiles = [
  "background.js",
  "context_helper.js",
  "offscreen.html",
  "offscreen.js",
  "options.css",
  "options.html",
  "options.js",
  "overlay.js",
  "popup.css",
  "popup.html",
  "popup.js",
  "prompts.js",
  "util.js",
  "wp_dom_shared.js",
  "wp_selectors_shared.js",
  "wp_media_shared.js",
  "manifest.json",
  "README.md"
];

const managedDirs = ["background", "icons", "providers"];

const variants = {
  chrome: {
    outputDir: path.join(root, "maca por chrome"),
    platformDir: path.join(platformDir, "chrome")
  },
  firefox: {
    outputDir: path.join(root, "maca for firefox"),
    platformDir: path.join(platformDir, "firefox")
  }
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function removeIfExists(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  ensureDir(path.dirname(dest));
  const ext = path.extname(src).toLowerCase();
  if ([".js", ".css", ".html", ".md", ".txt"].includes(ext)) {
    const raw = fs.readFileSync(src, "utf8");
    const banner = ext === ".html"
      ? "<!-- AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. -->\n"
      : ext === ".md" || ext === ".txt"
        ? "<!-- AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. -->\n"
        : "/* AUTO-GENERATED FILE. EDIT src/shared/ OR src/platform/ INSTEAD. */\n";
    const cleaned = raw.replace(/^(?:\/\* AUTO-GENERATED FILE\.[^\n]*\*\/|<!-- AUTO-GENERATED FILE\.[^\n]*-->)\r?\n/, "");
    fs.writeFileSync(dest, `${banner}${cleaned}`, "utf8");
    return;
  }
  fs.copyFileSync(src, dest);
}

function assertExists(target, label) {
  if (!fs.existsSync(target)) {
    throw new Error(`${label} not found: ${target}`);
  }
}

function buildVariant(name) {
  const variant = variants[name];
  if (!variant) {
    throw new Error(`Unknown variant: ${name}`);
  }

  assertExists(sharedDir, "Shared source directory");
  assertExists(variant.platformDir, "Platform source directory");

  ensureDir(variant.outputDir);

  for (const file of managedFiles) {
    removeIfExists(path.join(variant.outputDir, file));
  }
  for (const dir of managedDirs) {
    removeIfExists(path.join(variant.outputDir, dir));
  }

  for (const file of managedFiles) {
    const sharedFile = path.join(sharedDir, file);
    const platformFile = path.join(variant.platformDir, file);
    if (fs.existsSync(platformFile)) {
      copyRecursive(platformFile, path.join(variant.outputDir, file));
    } else if (fs.existsSync(sharedFile)) {
      copyRecursive(sharedFile, path.join(variant.outputDir, file));
    }
  }

  for (const dir of managedDirs) {
    const sharedPath = path.join(sharedDir, dir);
    if (fs.existsSync(sharedPath)) {
      copyRecursive(sharedPath, path.join(variant.outputDir, dir));
    }
  }

  process.stdout.write(`Built ${name} -> ${path.relative(root, variant.outputDir)}\n`);
}

const requested = process.argv.slice(2);
const targets = requested.length === 0 || requested.includes("all")
  ? Object.keys(variants)
  : requested;

for (const target of targets) {
  buildVariant(target);
}
