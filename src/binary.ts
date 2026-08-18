import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HarnessError } from "@deepseek-ai/dsh-llm";

import { isJsonRecord, type JsonValue } from "./json.js";
import { redactText } from "./redact.js";

export const EXPECTED_CLI_VERSION = "1.1.13";
export const EXPECTED_CLI_COMMIT = "3af544780365309feae97d51b631070e7ca73762";
export const EXPECTED_CLI_REPOSITORY =
  "https://github.com/lexmount/browser-cli-rs.git";
export const EXPECTED_DOWNLOAD_BASE_URL =
  "https://cli-bin-1377899528.cos.ap-nanjing.myqcloud.com/releases/browser-cli/v1.1.13";

const CHECKSUM_ASSET = "SHA256SUMS";
const MAX_CHECKSUM_BYTES = 1024 * 1024;
const MAX_BINARY_BYTES = 128 * 1024 * 1024;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PLATFORM_TARGETS = {
  "win32-x64": {
    asset: "browser-cli-v1.1.13-x86_64-pc-windows-msvc.exe",
    executable: "browser-cli.exe",
    target: "x86_64-pc-windows-msvc",
  },
  "darwin-arm64": {
    asset: "browser-cli-v1.1.13-aarch64-apple-darwin",
    executable: "browser-cli",
    target: "aarch64-apple-darwin",
  },
  "darwin-x64": {
    asset: "browser-cli-v1.1.13-x86_64-apple-darwin",
    executable: "browser-cli",
    target: "x86_64-apple-darwin",
  },
  "linux-x64": {
    asset: "browser-cli-v1.1.13-x86_64-unknown-linux-musl",
    executable: "browser-cli",
    target: "x86_64-unknown-linux-musl",
  },
} as const;

export type SupportedPlatform = keyof typeof PLATFORM_TARGETS;
const PUBLISHED_PLATFORM_KEYS = ["win32-x64", "darwin-arm64"] as const;

interface NativeSource {
  schemaVersion: number;
  name: string;
  version: string;
  repository: string;
  commit: string;
  download: {
    baseUrl: string;
    checksums: string;
  };
  targets: Record<string, string>;
}

interface CacheMetadata {
  schemaVersion: number;
  name: string;
  version: string;
  repository: string;
  commit: string;
  downloadBaseUrl: string;
  platform: SupportedPlatform;
  target: string;
  asset: string;
  sha256: string;
}

export interface ResolvedBrowserCli {
  path: string;
  platform: SupportedPlatform;
  target: string;
  version: string;
  sha256: string;
  commit: string;
}

export interface VerifyBrowserCliOptions {
  environment?: NodeJS.ProcessEnv;
  expectedSha256?: string;
  verifyExecutable?: boolean;
}

export interface BrowserCliResolverOptions {
  packageRoot?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  environment?: NodeJS.ProcessEnv;
  cacheDirectory?: string;
  verifyExecutable?: boolean;
  downloadTimeoutMs?: number;
}

interface PendingResolution {
  controller: AbortController;
  promise: Promise<ResolvedBrowserCli>;
  settled: boolean;
  waiters: number;
}

export class BrowserCliInstallationError extends HarnessError {
  constructor(message: string) {
    super(message, "browser_cli_installation_error");
    this.name = "BrowserCliInstallationError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error("Lexmount browser CLI resolution was cancelled.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError(signal.reason);
  }
}

export function platformKey(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): SupportedPlatform {
  const key = `${platform}-${arch}`;
  if (
    key in PLATFORM_TARGETS &&
    PUBLISHED_PLATFORM_KEYS.includes(
      key as (typeof PUBLISHED_PLATFORM_KEYS)[number],
    )
  ) {
    return key as SupportedPlatform;
  }
  throw new BrowserCliInstallationError(
    `Unsupported platform ${key}. This @lexmount/dsh-browser pre-release currently supports win32-x64 and darwin-arm64 only.`,
  );
}

function cacheRoot(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): string {
  const configured = environment.LEXMOUNT_BROWSER_CLI_CACHE_DIR?.trim();
  if (configured !== undefined && configured.length > 0) {
    return resolve(configured);
  }
  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA?.trim();
    return localAppData !== undefined && localAppData.length > 0
      ? join(localAppData, "Lexmount", "dsh-browser")
      : join(homedir(), "AppData", "Local", "Lexmount", "dsh-browser");
  }
  if (platform === "darwin") {
    return join(homedir(), "Library", "Caches", "Lexmount", "dsh-browser");
  }
  const xdgCache = environment.XDG_CACHE_HOME?.trim();
  return xdgCache !== undefined && xdgCache.length > 0
    ? join(xdgCache, "lexmount", "dsh-browser")
    : join(homedir(), ".cache", "lexmount", "dsh-browser");
}

async function readNativeSource(packageRoot: string): Promise<NativeSource> {
  const sourcePath = resolve(packageRoot, "native-source.json");
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(await readFile(sourcePath, "utf8")) as JsonValue;
  } catch (error) {
    throw new BrowserCliInstallationError(
      `Cannot read ${sourcePath}: ${errorMessage(error)}. Reinstall @lexmount/dsh-browser.`,
    );
  }

  if (
    !isJsonRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    parsed.name !== "browser-cli" ||
    parsed.version !== EXPECTED_CLI_VERSION ||
    parsed.repository !== EXPECTED_CLI_REPOSITORY ||
    parsed.commit !== EXPECTED_CLI_COMMIT ||
    !isJsonRecord(parsed.download) ||
    parsed.download.baseUrl !== EXPECTED_DOWNLOAD_BASE_URL ||
    parsed.download.checksums !== CHECKSUM_ASSET ||
    !isJsonRecord(parsed.targets)
  ) {
    throw new BrowserCliInstallationError(
      `Invalid browser CLI source metadata at ${sourcePath}. Reinstall @lexmount/dsh-browser.`,
    );
  }

  const sourceTargets = parsed.targets;
  const expectedKeys = [...PUBLISHED_PLATFORM_KEYS].sort();
  if (JSON.stringify(Object.keys(sourceTargets).sort()) !== JSON.stringify(expectedKeys)) {
    throw new BrowserCliInstallationError(
      `Invalid browser CLI target set at ${sourcePath}. Reinstall @lexmount/dsh-browser.`,
    );
  }
  for (const key of expectedKeys) {
    const platform = key as SupportedPlatform;
    if (sourceTargets[platform] !== PLATFORM_TARGETS[platform].target) {
      throw new BrowserCliInstallationError(
        `Invalid browser CLI target ${platform} at ${sourcePath}. Reinstall @lexmount/dsh-browser.`,
      );
    }
  }

  return parsed as unknown as NativeSource;
}

export function checksumForAsset(manifest: string, asset: string): string {
  let checksum: string | undefined;
  for (const line of manifest.split(/\r?\n/u)) {
    const match = /^([a-fA-F0-9]{64})[\t ]+\*?(.+?)\s*$/u.exec(line);
    if (match === null || match[1] === undefined || match[2] !== asset) {
      continue;
    }
    if (checksum !== undefined) {
      throw new BrowserCliInstallationError(
        `Checksum manifest contains more than one entry for ${asset}.`,
      );
    }
    checksum = match[1].toLowerCase();
  }
  if (checksum === undefined) {
    throw new BrowserCliInstallationError(
      `Checksum manifest does not contain ${asset}. browser-cli ${EXPECTED_CLI_VERSION} is incomplete for this platform.`,
    );
  }
  return checksum;
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

function assertExecutableFormat(
  data: Buffer,
  platform: SupportedPlatform,
): void {
  const fail = () => {
    throw new BrowserCliInstallationError(
      `browser-cli has the wrong executable format for ${platform}.`,
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
      !data
        .subarray(peOffset, peOffset + 4)
        .equals(Buffer.from("PE\0\0", "binary")) ||
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
    throw new BrowserCliInstallationError(
      "browser-cli version returned an invalid response envelope.",
    );
  }
  const version = parsed.data.version;
  if (typeof version !== "string") {
    throw new BrowserCliInstallationError(
      "browser-cli version response did not include a version string.",
    );
  }
  return version;
}

export async function verifyBrowserCliFile(
  path: string,
  platform: SupportedPlatform,
  options: VerifyBrowserCliOptions = {},
): Promise<string> {
  const environment = options.environment ?? process.env;
  let size: number;
  try {
    const stats = await stat(path);
    if (!stats.isFile()) {
      throw new Error("not a regular file");
    }
    size = stats.size;
    if (size <= 0 || size > MAX_BINARY_BYTES) {
      throw new Error(`unexpected size ${String(size)} bytes`);
    }
    await access(
      path,
      process.platform === "win32" ? constants.F_OK : constants.X_OK,
    );
  } catch (error) {
    throw new BrowserCliInstallationError(
      `browser-cli is missing or not executable at ${path}: ${errorMessage(error)}.`,
    );
  }

  const data = await readFile(path);
  assertExecutableFormat(data, platform);
  const actualHash = createHash("sha256").update(data).digest("hex");
  if (
    options.expectedSha256 !== undefined &&
    actualHash !== options.expectedSha256.toLowerCase()
  ) {
    throw new BrowserCliInstallationError(
      `browser-cli checksum mismatch for ${platform}. Expected ${options.expectedSha256}, received ${actualHash}.`,
    );
  }

  if (options.verifyExecutable !== false) {
    const result = spawnSync(path, ["version"], {
      encoding: "utf8",
      env: environment,
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    if (result.error !== undefined || result.status !== 0) {
      const stderr = result.stderr.trim();
      const detail = redactText(
        result.error?.message ??
          (stderr.length > 0 ? stderr : `exit status ${String(result.status)}`),
        environment,
      );
      throw new BrowserCliInstallationError(
        `browser-cli failed its startup version check: ${detail}.`,
      );
    }
    const actualVersion = parseVersion(result.stdout.trim(), environment);
    if (actualVersion !== EXPECTED_CLI_VERSION) {
      throw new BrowserCliInstallationError(
        `browser-cli version mismatch: expected=${EXPECTED_CLI_VERSION}, binary=${actualVersion}.`,
      );
    }
  }

  return actualHash;
}

function contentLength(response: Response): number | undefined {
  const value = response.headers.get("content-length");
  if (value === null || !/^\d+$/u.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function fetchResource<T>(
  url: string,
  label: string,
  signal: AbortSignal,
  timeoutMs: number,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort(
      new Error(`Timed out downloading ${label} after ${String(timeoutMs)} ms.`),
    );
  }, timeoutMs);
  timer.unref();
  const combinedSignal = AbortSignal.any([signal, timeoutController.signal]);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: combinedSignal,
    });
    if (!response.ok) {
      throw new BrowserCliInstallationError(
        `Unable to download ${label}: HTTP ${String(response.status)} from ${url}. browser-cli ${EXPECTED_CLI_VERSION} may not be published for this platform yet.`,
      );
    }
    return await consume(response);
  } catch (error) {
    if (signal.aborted) {
      throw abortError(signal.reason);
    }
    if (timeoutController.signal.aborted) {
      throw new BrowserCliInstallationError(errorMessage(timeoutController.signal.reason));
    }
    if (error instanceof BrowserCliInstallationError) {
      throw error;
    }
    throw new BrowserCliInstallationError(
      `Unable to download ${label} from ${url}: ${errorMessage(error)}.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function downloadText(
  url: string,
  label: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<string> {
  return await fetchResource(url, label, signal, timeoutMs, async (response) => {
    const announcedLength = contentLength(response);
    if (announcedLength !== undefined && announcedLength > MAX_CHECKSUM_BYTES) {
      throw new BrowserCliInstallationError(
        `${label} is larger than the ${String(MAX_CHECKSUM_BYTES)} byte limit.`,
      );
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > MAX_CHECKSUM_BYTES) {
      throw new BrowserCliInstallationError(
        `${label} is larger than the ${String(MAX_CHECKSUM_BYTES)} byte limit.`,
      );
    }
    return data.toString("utf8");
  });
}

async function downloadBinary(
  url: string,
  destination: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<string> {
  return await fetchResource(
    url,
    "browser-cli executable",
    signal,
    timeoutMs,
    async (response) => {
      const announcedLength = contentLength(response);
      if (announcedLength !== undefined && announcedLength > MAX_BINARY_BYTES) {
        throw new BrowserCliInstallationError(
          `browser-cli executable is larger than the ${String(MAX_BINARY_BYTES)} byte limit.`,
        );
      }
      if (response.body === null) {
        throw new BrowserCliInstallationError(
          "browser-cli executable download returned an empty response body.",
        );
      }

      const file = await open(destination, "wx", 0o600);
      const hash = createHash("sha256");
      let bytes = 0;
      try {
        for await (const chunk of response.body) {
          throwIfAborted(signal);
          const data = Buffer.from(chunk);
          bytes += data.length;
          if (bytes > MAX_BINARY_BYTES) {
            throw new BrowserCliInstallationError(
              `browser-cli executable is larger than the ${String(MAX_BINARY_BYTES)} byte limit.`,
            );
          }
          hash.update(data);
          await file.write(data);
        }
        if (bytes === 0) {
          throw new BrowserCliInstallationError(
            "browser-cli executable download returned no data.",
          );
        }
        await file.sync();
      } finally {
        await file.close();
      }
      return hash.digest("hex");
    },
  );
}

function cacheMetadata(
  platform: SupportedPlatform,
  sha256: string,
): CacheMetadata {
  const selected = PLATFORM_TARGETS[platform];
  return {
    schemaVersion: 1,
    name: "browser-cli",
    version: EXPECTED_CLI_VERSION,
    repository: EXPECTED_CLI_REPOSITORY,
    commit: EXPECTED_CLI_COMMIT,
    downloadBaseUrl: EXPECTED_DOWNLOAD_BASE_URL,
    platform,
    target: selected.target,
    asset: selected.asset,
    sha256,
  };
}

function parseCacheMetadata(
  value: JsonValue,
  platform: SupportedPlatform,
): CacheMetadata {
  const selected = PLATFORM_TARGETS[platform];
  if (
    !isJsonRecord(value) ||
    value.schemaVersion !== 1 ||
    value.name !== "browser-cli" ||
    value.version !== EXPECTED_CLI_VERSION ||
    value.repository !== EXPECTED_CLI_REPOSITORY ||
    value.commit !== EXPECTED_CLI_COMMIT ||
    value.downloadBaseUrl !== EXPECTED_DOWNLOAD_BASE_URL ||
    value.platform !== platform ||
    value.target !== selected.target ||
    value.asset !== selected.asset ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.sha256)
  ) {
    throw new BrowserCliInstallationError(
      `Invalid cached browser-cli metadata for ${platform}.`,
    );
  }
  return value as unknown as CacheMetadata;
}

function resolvedResult(
  path: string,
  platform: SupportedPlatform,
  sha256: string,
): ResolvedBrowserCli {
  return {
    path,
    platform,
    target: PLATFORM_TARGETS[platform].target,
    version: EXPECTED_CLI_VERSION,
    sha256,
    commit: EXPECTED_CLI_COMMIT,
  };
}

function fileErrorCode(error: unknown): string | undefined {
  return isJsonRecord(error) && typeof error.code === "string"
    ? error.code
    : undefined;
}

async function replaceAtomically(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
    return;
  } catch (error) {
    if (!new Set(["EACCES", "EEXIST", "EPERM"]).has(fileErrorCode(error) ?? "")) {
      throw error;
    }
  }

  const backup = `${destination}.previous-${randomUUID()}`;
  let backedUp = false;
  try {
    try {
      await rename(destination, backup);
      backedUp = true;
    } catch (error) {
      if (fileErrorCode(error) !== "ENOENT") {
        throw error;
      }
    }
    await rename(source, destination);
  } catch (error) {
    if (backedUp) {
      try {
        await rename(backup, destination);
      } catch {
        // Preserve the original error; the backup path is included below.
      }
    }
    throw new BrowserCliInstallationError(
      `Unable to install browser-cli at ${destination}: ${errorMessage(error)}${backedUp ? `; previous file retained at ${backup}` : ""}.`,
    );
  }
  if (backedUp) {
    try {
      await unlink(backup);
    } catch {
      // A stale version-scoped cache backup is harmless and can be removed later.
    }
  }
}

async function waitForResolution(
  promise: Promise<ResolvedBrowserCli>,
  signal: AbortSignal,
): Promise<ResolvedBrowserCli> {
  throwIfAborted(signal);
  return await new Promise<ResolvedBrowserCli>((resolvePromise, rejectPromise) => {
    const onAbort = () => rejectPromise(abortError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(resolvePromise, rejectPromise).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

export class BrowserCliResolver {
  readonly packageRoot: string;
  readonly runtimePlatform: NodeJS.Platform;
  readonly architecture: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly cacheDirectory: string;
  readonly verifyExecutable: boolean;
  readonly downloadTimeoutMs: number;

  #disposed = false;
  #pending: PendingResolution | undefined;
  #resolved: ResolvedBrowserCli | undefined;

  constructor(options: BrowserCliResolverOptions = {}) {
    this.packageRoot = options.packageRoot ?? PACKAGE_ROOT;
    const rawPlatform = options.platform ?? process.platform;
    this.runtimePlatform = rawPlatform;
    this.architecture = options.arch ?? process.arch;
    this.environment = options.environment ?? process.env;
    this.cacheDirectory =
      options.cacheDirectory ?? cacheRoot(rawPlatform, this.environment);
    this.verifyExecutable = options.verifyExecutable !== false;
    this.downloadTimeoutMs =
      options.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
    if (
      !Number.isSafeInteger(this.downloadTimeoutMs) ||
      this.downloadTimeoutMs <= 0
    ) {
      throw new TypeError("downloadTimeoutMs must be a positive safe integer");
    }
  }

  async #resolveUncached(signal: AbortSignal): Promise<ResolvedBrowserCli> {
    await readNativeSource(this.packageRoot);
    throwIfAborted(signal);
    const platform = platformKey(this.runtimePlatform, this.architecture);

    const explicitPath = this.environment.LEXMOUNT_BROWSER_CLI_PATH?.trim();
    if (explicitPath !== undefined && explicitPath.length > 0) {
      const path = resolve(explicitPath);
      const sha256 = await verifyBrowserCliFile(path, platform, {
        environment: this.environment,
        verifyExecutable: this.verifyExecutable,
      });
      return resolvedResult(path, platform, sha256);
    }

    const selected = PLATFORM_TARGETS[platform];
    const directory = join(
      this.cacheDirectory,
      `v${EXPECTED_CLI_VERSION}`,
      platform,
    );
    const binaryPath = join(directory, selected.executable);
    const metadataPath = join(directory, "install.json");

    try {
      const metadata = parseCacheMetadata(
        JSON.parse(await readFile(metadataPath, "utf8")) as JsonValue,
        platform,
      );
      const sha256 = await verifyBrowserCliFile(binaryPath, platform, {
        environment: this.environment,
        expectedSha256: metadata.sha256,
        verifyExecutable: this.verifyExecutable,
      });
      return resolvedResult(binaryPath, platform, sha256);
    } catch {
      // Missing, stale, or corrupt cache entries are replaced from the pinned release.
    }

    await mkdir(directory, { mode: 0o700, recursive: true });
    const checksumUrl = `${EXPECTED_DOWNLOAD_BASE_URL}/${CHECKSUM_ASSET}`;
    const checksumManifest = await downloadText(
      checksumUrl,
      "browser-cli checksum manifest",
      signal,
      this.downloadTimeoutMs,
    );
    const expectedHash = checksumForAsset(checksumManifest, selected.asset);
    const binaryUrl = `${EXPECTED_DOWNLOAD_BASE_URL}/${selected.asset}`;
    const identifier = `${String(process.pid)}-${randomUUID()}`;
    const binaryTemporaryPath = join(directory, `.${selected.executable}.${identifier}.tmp`);
    const metadataTemporaryPath = join(directory, `.install.${identifier}.tmp`);

    try {
      const downloadedHash = await downloadBinary(
        binaryUrl,
        binaryTemporaryPath,
        signal,
        this.downloadTimeoutMs,
      );
      if (downloadedHash !== expectedHash) {
        throw new BrowserCliInstallationError(
          `Downloaded browser-cli checksum mismatch for ${platform}. Expected ${expectedHash}, received ${downloadedHash}.`,
        );
      }
      if (process.platform !== "win32") {
        await chmod(binaryTemporaryPath, 0o755);
      }
      await verifyBrowserCliFile(binaryTemporaryPath, platform, {
        environment: this.environment,
        expectedSha256: expectedHash,
        verifyExecutable: this.verifyExecutable,
      });
      await writeFile(
        metadataTemporaryPath,
        `${JSON.stringify(cacheMetadata(platform, expectedHash), null, 2)}\n`,
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      await replaceAtomically(binaryTemporaryPath, binaryPath);
      await replaceAtomically(metadataTemporaryPath, metadataPath);

      const installedHash = await verifyBrowserCliFile(binaryPath, platform, {
        environment: this.environment,
        expectedSha256: expectedHash,
        verifyExecutable: this.verifyExecutable,
      });
      return resolvedResult(binaryPath, platform, installedHash);
    } finally {
      await Promise.allSettled([
        unlink(binaryTemporaryPath),
        unlink(metadataTemporaryPath),
      ]);
    }
  }

  async resolve(signal: AbortSignal): Promise<ResolvedBrowserCli> {
    if (this.#disposed) {
      throw new BrowserCliInstallationError(
        "Lexmount browser plugin is shutting down.",
      );
    }
    throwIfAborted(signal);
    if (this.#resolved !== undefined) {
      return this.#resolved;
    }

    if (this.#pending?.controller.signal.aborted === true) {
      this.#pending = undefined;
    }
    if (this.#pending === undefined) {
      const controller = new AbortController();
      const pending: PendingResolution = {
        controller,
        promise: Promise.resolve<ResolvedBrowserCli>(undefined as never),
        settled: false,
        waiters: 0,
      };
      pending.promise = this.#resolveUncached(controller.signal)
        .then((resolved) => {
          this.#resolved = resolved;
          return resolved;
        })
        .finally(() => {
          pending.settled = true;
          if (this.#pending === pending) {
            this.#pending = undefined;
          }
        });
      this.#pending = pending;
    }

    const pending = this.#pending;
    pending.waiters += 1;
    try {
      return await waitForResolution(pending.promise, signal);
    } finally {
      pending.waiters -= 1;
      if (pending.waiters === 0 && !pending.settled) {
        pending.controller.abort(
          new Error("All waiting Lexmount browser tool calls were cancelled."),
        );
      }
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#pending?.controller.abort(
      new Error("Lexmount browser plugin is shutting down."),
    );
  }
}
