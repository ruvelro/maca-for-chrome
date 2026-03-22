import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputs = [path.join(root, "maca por chrome"), path.join(root, "maca for firefox")];

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}

function snapshot() {
  const data = new Map();
  for (const dir of outputs) {
    if (!fs.existsSync(dir)) continue;
    for (const rel of listFiles(dir)) {
      data.set(`${path.basename(dir)}:${rel}`, fs.readFileSync(path.join(dir, rel)));
    }
  }
  return data;
}

const before = snapshot();
execFileSync("node", [path.join(root, "scripts", "build-extensions.mjs"), "all"], { cwd: root, stdio: "pipe" });
const after = snapshot();

const changed = [];
for (const [key, buf] of before.entries()) {
  const next = after.get(key);
  if (!next || Buffer.compare(buf, next) !== 0) changed.push(key);
}

if (changed.length) {
  process.stderr.write(`Generated output drift detected. Rebuild and do not edit generated folders directly:\n${changed.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Generated outputs are in sync.\n");
