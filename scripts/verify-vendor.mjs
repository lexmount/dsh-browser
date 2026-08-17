import { createHash } from "node:crypto";
import { constants, accessSync, readFileSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const vendorRoot = resolve(packageRoot, "vendor");
const source = JSON.parse(readFileSync(resolve(packageRoot, "native-source.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(vendorRoot, "manifest.json"), "utf8"));
const allTargets = Object.keys(source.targets).sort();
const currentTarget = `${process.platform}-${process.arch}`;
const verifyAll = process.argv.includes("--all");
const requestedTargets = verifyAll ? allTargets : [currentTarget];
const expectedPaths = {
  "win32-x64": "win32-x64/browser-cli.exe",
  "darwin-arm64": "darwin-arm64/browser-cli",
  "darwin-x64": "darwin-x64/browser-cli",
  "linux-x64": "linux-x64/browser-cli",
};

function linuxElfIsStatic(data) {
  if (data.length < 64) return false;
  const programHeaderOffset = data.readBigUInt64LE(32);
  if (programHeaderOffset > BigInt(Number.MAX_SAFE_INTEGER)) return false;
  const offset = Number(programHeaderOffset);
  const entrySize = data.readUInt16LE(54);
  const entryCount = data.readUInt16LE(56);
  if (
    entrySize < 56 ||
    entryCount === 0 ||
    entryCount === 0xffff ||
    offset + entrySize * entryCount > data.length
  ) {
    return false;
  }
  for (let index = 0; index < entryCount; index += 1) {
    if (data.readUInt32LE(offset + index * entrySize) === 3) return false;
  }
  return true;
}

if (
  manifest.schemaVersion !== 1 ||
  manifest.cli?.name !== source.name ||
  manifest.cli?.version !== source.version ||
  manifest.cli?.repository !== source.repository ||
  manifest.cli?.commit !== source.commit
) {
  throw new Error("vendor/manifest.json does not match native-source.json");
}
const manifestTargets = Object.keys(manifest.platforms ?? {}).sort();
if (manifestTargets.some((target) => !allTargets.includes(target))) {
  throw new Error("vendor/manifest.json contains an unsupported release target");
}
if (verifyAll && JSON.stringify(manifestTargets) !== JSON.stringify(allTargets)) {
  throw new Error("vendor/manifest.json must contain exactly the four release targets");
}

function assertExecutableFormat(target, data) {
  if (target === "linux-x64") {
    if (
      data.length < 20 ||
      !data.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
      data[4] !== 2 ||
      data[5] !== 1 ||
      data.readUInt16LE(18) !== 0x3e ||
      !linuxElfIsStatic(data)
    ) {
      throw new Error(`Expected a static little-endian x86-64 ELF for ${target}`);
    }
    return;
  }

  if (target === "win32-x64") {
    if (data.length < 64 || data[0] !== 0x4d || data[1] !== 0x5a) {
      throw new Error(`Expected a PE executable for ${target}`);
    }
    const peOffset = data.readUInt32LE(0x3c);
    if (
      peOffset + 26 > data.length ||
      !data.subarray(peOffset, peOffset + 4).equals(Buffer.from("PE\0\0", "binary")) ||
      data.readUInt16LE(peOffset + 4) !== 0x8664 ||
      data.readUInt16LE(peOffset + 24) !== 0x20b
    ) {
      throw new Error(`Expected an x86-64 PE32+ executable for ${target}`);
    }
    return;
  }

  const expectedCpu = target === "darwin-arm64" ? 0x0100000c : 0x01000007;
  if (
    data.length < 8 ||
    !data.subarray(0, 4).equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])) ||
    data.readUInt32LE(4) !== expectedCpu
  ) {
    throw new Error(`Expected the requested 64-bit Mach-O architecture for ${target}`);
  }
}

const verified = [];
for (const target of requestedTargets) {
  if (!(target in source.targets)) {
    throw new Error(`Unsupported current platform ${target}`);
  }
  const entry = manifest.platforms?.[target];
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Missing vendor manifest entry for ${target}`);
  }
  if (entry.path !== expectedPaths[target]) {
    throw new Error(`Unexpected vendor path for ${target}`);
  }
  if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
    throw new Error(`Invalid SHA-256 manifest value for ${target}`);
  }
  if (entry.target !== source.targets[target]) {
    throw new Error(`Native target mismatch for ${target}`);
  }

  const path = resolve(vendorRoot, entry.path);
  const withinVendor = relative(vendorRoot, path);
  if (withinVendor === ".." || withinVendor.startsWith(`..${sep}`)) {
    throw new Error(`Vendor path escapes package root for ${target}`);
  }
  if (!statSync(path).isFile()) {
    throw new Error(`Vendor binary is not a regular file for ${target}`);
  }
  if (target !== "win32-x64") {
    accessSync(path, constants.X_OK);
  }

  const data = readFileSync(path);
  assertExecutableFormat(target, data);
  const digest = createHash("sha256").update(data).digest("hex");
  if (digest !== entry.sha256) {
    throw new Error(`SHA-256 mismatch for ${target}`);
  }

  if (target === currentTarget) {
    const result = spawnSync(path, ["version"], {
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    if (result.error !== undefined || result.status !== 0) {
      throw result.error ?? new Error(`browser-cli version exited ${result.status}`);
    }
    const envelope = JSON.parse(result.stdout);
    if (envelope.ok !== true || envelope.data?.version !== source.version) {
      throw new Error(`browser-cli version mismatch for ${target}`);
    }
  }
  verified.push({ target, path: entry.path, sha256: digest });
}

process.stdout.write(`${JSON.stringify({ ok: true, verified })}\n`);
