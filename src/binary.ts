import {
  accessSync,
  constants,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { isJsonRecord, type JsonValue } from "./json.js";
import { redactText } from "./redact.js";

export const EXPECTED_CLI_VERSION = "1.1.11";
export const EXPECTED_CLI_COMMIT = "1c8e949d613eabbfcdb44c45bba8729189c13b97";
export const EXPECTED_CLI_REPOSITORY = "https://github.com/lexmount/browser-cli-rs.git";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PLATFORM_TARGETS = {
  "win32-x64": {
    path: "win32-x64/browser-cli.exe",
    target: "x86_64-pc-windows-msvc",
  },
  "darwin-arm64": {
    path: "darwin-arm64/browser-cli",
    target: "aarch64-apple-darwin",
  },
  "darwin-x64": {
    path: "darwin-x64/browser-cli",
    target: "x86_64-apple-darwin",
  },
  "linux-x64": {
    path: "linux-x64/browser-cli",
    target: "x86_64-unknown-linux-musl",
  },
} as const;

export type SupportedPlatform = keyof typeof PLATFORM_TARGETS;

interface ManifestEntry {
  path: string;
  sha256: string;
  target: string;
}

interface BinaryManifest {
  schemaVersion: number;
  cli: {
    name: string;
    version: string;
    repository: string;
    commit: string;
  };
  platforms: Record<string, ManifestEntry>;
}

export interface ResolvedBrowserCli {
  path: string;
  platform: SupportedPlatform;
  target: string;
  version: string;
  sha256: string;
  commit: string;
}

export interface ResolveBrowserCliOptions {
  packageRoot?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  verifyExecutable?: boolean;
}

export class BrowserCliInstallationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserCliInstallationError";
  }
}

export function platformKey(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): SupportedPlatform {
  const key = `${platform}-${arch}`;
  if (key in PLATFORM_TARGETS) {
    return key as SupportedPlatform;
  }
  throw new BrowserCliInstallationError(
    `Unsupported platform ${key}. @lexmount/dsh-browser supports win32-x64, darwin-arm64, darwin-x64, and linux-x64.`,
  );
}

function readManifest(packageRoot: string): BinaryManifest {
  const manifestPath = resolve(packageRoot, "vendor", "manifest.json");
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as JsonValue;
  } catch (error) {
    throw new BrowserCliInstallationError(
      `Cannot read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}. Reinstall @lexmount/dsh-browser.`,
    );
  }
  if (
    !isJsonRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    !isJsonRecord(parsed.cli) ||
    !isJsonRecord(parsed.platforms)
  ) {
    throw new BrowserCliInstallationError(
      `Invalid browser CLI manifest at ${manifestPath}. Reinstall @lexmount/dsh-browser.`,
    );
  }
  return parsed as unknown as BinaryManifest;
}

function assertSafeVendorPath(vendorRoot: string, entryPath: string): string {
  const candidate = resolve(vendorRoot, entryPath);
  const withinVendor = relative(vendorRoot, candidate);
  if (withinVendor === "" || withinVendor.startsWith(`..${sep}`) || withinVendor === "..") {
    throw new BrowserCliInstallationError(
      `Invalid browser CLI path ${JSON.stringify(entryPath)} in vendor manifest.`,
    );
  }
  return candidate;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function linuxElfIsStatic(data: Buffer): boolean {
  if (data.length < 64) {
    return false;
  }
  const programHeaderOffset = data.readBigUInt64LE(32);
  if (programHeaderOffset > BigInt(Number.MAX_SAFE_INTEGER)) {
    return false;
  }
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
    if (data.readUInt32LE(offset + index * entrySize) === 3) {
      return false;
    }
  }
  return true;
}

function assertExecutableFormat(path: string, platform: SupportedPlatform): void {
  const data = readFileSync(path);
  const fail = () => {
    throw new BrowserCliInstallationError(
      `browser-cli has the wrong executable format for ${platform}. Reinstall @lexmount/dsh-browser.`,
    );
  };

  if (platform === "linux-x64") {
    if (
      data.length < 20 ||
      !data.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
      data[4] !== 2 ||
      data[5] !== 1 ||
      data.readUInt16LE(18) !== 0x3e ||
      !linuxElfIsStatic(data)
    ) {
      fail();
    }
    return;
  }

  if (platform === "win32-x64") {
    if (data.length < 64 || data[0] !== 0x4d || data[1] !== 0x5a) {
      fail();
      return;
    }
    const peOffset = data.readUInt32LE(0x3c);
    if (
      peOffset + 26 > data.length ||
      !data.subarray(peOffset, peOffset + 4).equals(Buffer.from("PE\0\0", "binary")) ||
      data.readUInt16LE(peOffset + 4) !== 0x8664 ||
      data.readUInt16LE(peOffset + 24) !== 0x20b
    ) {
      fail();
    }
    return;
  }

  const expectedCpu = platform === "darwin-arm64" ? 0x0100000c : 0x01000007;
  if (
    data.length < 8 ||
    !data.subarray(0, 4).equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])) ||
    data.readUInt32LE(4) !== expectedCpu
  ) {
    fail();
  }
}

function parseVersion(stdout: string, environment: NodeJS.ProcessEnv): string {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(stdout) as JsonValue;
  } catch {
    throw new BrowserCliInstallationError(
      `browser-cli version returned invalid JSON: ${redactText(stdout.trim(), environment)}`,
    );
  }
  if (!isJsonRecord(parsed) || parsed.ok !== true || !isJsonRecord(parsed.data)) {
    throw new BrowserCliInstallationError("browser-cli version returned an invalid response envelope.");
  }
  const version = parsed.data.version;
  if (typeof version !== "string") {
    throw new BrowserCliInstallationError("browser-cli version response did not include a version string.");
  }
  return version;
}

export function resolveBrowserCli(
  options: ResolveBrowserCliOptions = {},
): ResolvedBrowserCli {
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const selectedPlatform = platformKey(options.platform, options.arch);
  const manifest = readManifest(packageRoot);

  if (
    manifest.cli.name !== "browser-cli" ||
    manifest.cli.version !== EXPECTED_CLI_VERSION ||
    manifest.cli.repository !== EXPECTED_CLI_REPOSITORY ||
    manifest.cli.commit !== EXPECTED_CLI_COMMIT
  ) {
    throw new BrowserCliInstallationError(
      `The package expects browser-cli ${EXPECTED_CLI_VERSION}, but its manifest is incompatible. Reinstall @lexmount/dsh-browser.`,
    );
  }

  const candidateEntry: unknown = manifest.platforms[selectedPlatform];
  const expectedEntry = PLATFORM_TARGETS[selectedPlatform];
  if (
    !isJsonRecord(candidateEntry) ||
    candidateEntry.path !== expectedEntry.path ||
    typeof candidateEntry.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(candidateEntry.sha256) ||
    candidateEntry.target !== expectedEntry.target
  ) {
    throw new BrowserCliInstallationError(
      `The package does not contain a manifest entry for ${selectedPlatform}. Reinstall @lexmount/dsh-browser.`,
    );
  }
  const entry = candidateEntry as unknown as ManifestEntry;

  const vendorRoot = resolve(packageRoot, "vendor");
  const binaryPath = assertSafeVendorPath(vendorRoot, entry.path);
  try {
    const stats = statSync(binaryPath);
    if (!stats.isFile()) {
      throw new Error("not a regular file");
    }
    const realVendor = realpathSync(vendorRoot);
    const realBinary = realpathSync(binaryPath);
    const realRelative = relative(realVendor, realBinary);
    if (realRelative.startsWith(`..${sep}`) || realRelative === "..") {
      throw new Error("resolves outside vendor directory");
    }
    accessSync(
      binaryPath,
      process.platform === "win32" ? constants.F_OK : constants.X_OK,
    );
  } catch (error) {
    throw new BrowserCliInstallationError(
      `browser-cli is missing or not executable at ${binaryPath}: ${error instanceof Error ? error.message : String(error)}. Reinstall @lexmount/dsh-browser.`,
    );
  }

  assertExecutableFormat(binaryPath, selectedPlatform);

  const actualHash = sha256(binaryPath);
  if (actualHash !== entry.sha256.toLowerCase()) {
    throw new BrowserCliInstallationError(
      `browser-cli checksum mismatch for ${selectedPlatform}. Expected ${entry.sha256}, received ${actualHash}. Reinstall @lexmount/dsh-browser.`,
    );
  }

  if (options.verifyExecutable !== false) {
    const result = spawnSync(binaryPath, ["version"], {
      encoding: "utf8",
      env: process.env,
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    if (result.error !== undefined || result.status !== 0) {
      const stderr = result.stderr.trim();
      const detail = redactText(
        result.error?.message ??
          (stderr.length > 0 ? stderr : `exit status ${String(result.status)}`),
      );
      throw new BrowserCliInstallationError(
        `browser-cli failed its startup version check: ${detail}. Reinstall @lexmount/dsh-browser.`,
      );
    }
    const actualVersion = parseVersion(result.stdout.trim(), process.env);
    if (actualVersion !== manifest.cli.version) {
      throw new BrowserCliInstallationError(
        `browser-cli version mismatch: manifest=${manifest.cli.version}, binary=${actualVersion}. Reinstall @lexmount/dsh-browser.`,
      );
    }
  }

  return {
    path: binaryPath,
    platform: selectedPlatform,
    target: entry.target,
    version: manifest.cli.version,
    sha256: actualHash,
    commit: manifest.cli.commit,
  };
}
