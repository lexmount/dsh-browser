import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const packageRoot = new URL("../", import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL("package.json", packageRoot), "utf8"),
);

assert.ok(
  Array.isArray(packageJson.files) &&
    packageJson.files.every((entry) => !entry.startsWith("vendor/")),
  "package files must not include vendor binaries",
);

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const packed = spawnSync(
  npmCommand,
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  {
    cwd: packageRoot,
    encoding: "utf8",
    shell: false,
    timeout: 60_000,
    windowsHide: true,
  },
);
if (packed.error !== undefined || packed.status !== 0) {
  throw packed.error ?? new Error(packed.stderr || "npm pack --dry-run failed");
}

const rawReport = JSON.parse(packed.stdout);
const report = Array.isArray(rawReport)
  ? rawReport
  : Object.values(rawReport);
assert.ok(report.length === 1, "unexpected npm pack report");
const files = report[0]?.files?.map((entry) => entry.path);
assert.ok(Array.isArray(files), "npm pack report did not include files");
for (const required of [
  "lib/binary.js",
  "lib/index.js",
  "native-source.json",
  "cordis.patch.yml",
]) {
  assert.ok(files.includes(required), `npm package is missing ${required}`);
}
assert.equal(
  files.some(
    (path) =>
      path.startsWith("vendor/") ||
      /(^|\/)browser-cli(?:\.exe)?$/u.test(path),
  ),
  false,
  "npm package must not contain a browser-cli executable",
);

process.stdout.write(
  `${JSON.stringify({ ok: true, fileCount: files.length, unpackedSize: report[0].unpackedSize })}\n`,
);
