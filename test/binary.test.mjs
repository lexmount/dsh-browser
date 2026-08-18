import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  BrowserCliInstallationError,
  BrowserCliResolver,
  EXPECTED_CLI_COMMIT,
  EXPECTED_CLI_REPOSITORY,
  EXPECTED_CLI_VERSION,
  EXPECTED_DOWNLOAD_BASE_URL,
  checksumForAsset,
  platformKey,
  verifyBrowserCliFile,
} from "../lib/binary.js";

function linuxExecutableFixture() {
  const data = Buffer.alloc(120);
  data.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  data.writeUInt16LE(0x3e, 18);
  data.writeBigUInt64LE(64n, 32);
  data.writeUInt16LE(64, 52);
  data.writeUInt16LE(56, 54);
  data.writeUInt16LE(1, 56);
  data.writeUInt32LE(1, 64);
  return data;
}

function macArmExecutableFixture() {
  const data = Buffer.alloc(64);
  data.set([0xcf, 0xfa, 0xed, 0xfe]);
  data.writeUInt32LE(0x0100000c, 4);
  return data;
}

function sourceMetadata() {
  return {
    schemaVersion: 1,
    name: "browser-cli",
    version: EXPECTED_CLI_VERSION,
    repository: EXPECTED_CLI_REPOSITORY,
    commit: EXPECTED_CLI_COMMIT,
    download: {
      baseUrl: EXPECTED_DOWNLOAD_BASE_URL,
      checksums: "SHA256SUMS",
    },
    targets: {
      "win32-x64": "x86_64-pc-windows-msvc",
      "darwin-arm64": "aarch64-apple-darwin",
    },
  };
}

async function createPackageFixture(binary = macArmExecutableFixture()) {
  const root = await mkdtemp(join(tmpdir(), "lexmount-binary-test-"));
  const binaryPath = join(root, "browser-cli");
  await writeFile(binaryPath, binary);
  await chmod(binaryPath, 0o755);
  await writeFile(
    join(root, "native-source.json"),
    `${JSON.stringify(sourceMetadata())}\n`,
  );
  return { root, binaryPath, binary };
}

test("selects only the two currently published platform keys", () => {
  assert.equal(platformKey("win32", "x64"), "win32-x64");
  assert.equal(platformKey("darwin", "arm64"), "darwin-arm64");
  assert.throws(
    () => platformKey("darwin", "x64"),
    BrowserCliInstallationError,
  );
  assert.throws(
    () => platformKey("linux", "x64"),
    BrowserCliInstallationError,
  );
});

test("reads the exact asset checksum from a sha256sum manifest", () => {
  const asset = "browser-cli-v1.1.12-x86_64-unknown-linux-musl";
  const digest = "a".repeat(64);
  assert.equal(
    checksumForAsset(`${"b".repeat(64)}  other\n${digest} *${asset}\n`, asset),
    digest,
  );
  assert.throws(
    () => checksumForAsset(`${digest}  other\n`, asset),
    /does not contain/u,
  );
  assert.throws(
    () => checksumForAsset(`${digest}  ${asset}\n${digest}  ${asset}\n`, asset),
    /more than one/u,
  );
});

test("resolves an explicitly configured CLI without a packaged binary", async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const resolver = new BrowserCliResolver({
    packageRoot: fixture.root,
    platform: "darwin",
    arch: "arm64",
    environment: {
      ...process.env,
      LEXMOUNT_BROWSER_CLI_PATH: fixture.binaryPath,
    },
    verifyExecutable: false,
  });
  const resolved = await resolver.resolve(new AbortController().signal);
  assert.equal(resolved.path, fixture.binaryPath);
  assert.equal(resolved.commit, EXPECTED_CLI_COMMIT);
  assert.equal(resolved.target, "aarch64-apple-darwin");
  assert.equal(
    resolved.sha256,
    createHash("sha256").update(fixture.binary).digest("hex"),
  );
  resolver.dispose();
});

test("rejects a binary that does not match an expected checksum", async (t) => {
  const fixture = await createPackageFixture(linuxExecutableFixture());
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  await assert.rejects(
    verifyBrowserCliFile(fixture.binaryPath, "linux-x64", {
      expectedSha256: "0".repeat(64),
      verifyExecutable: false,
    }),
    /checksum mismatch/u,
  );
});

test("rejects a dynamically linked Linux executable", async (t) => {
  const fixture = await createPackageFixture(linuxExecutableFixture());
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const dynamic = Buffer.from(await readFile(fixture.binaryPath));
  dynamic.writeUInt32LE(3, 64);
  await writeFile(fixture.binaryPath, dynamic);
  await chmod(fixture.binaryPath, 0o755);
  await assert.rejects(
    verifyBrowserCliFile(fixture.binaryPath, "linux-x64", {
      verifyExecutable: false,
    }),
    /wrong executable format/u,
  );
});

test("rejects package metadata that changes the pinned source", async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const source = sourceMetadata();
  source.commit = "0".repeat(40);
  await writeFile(
    join(fixture.root, "native-source.json"),
    `${JSON.stringify(source)}\n`,
  );
  const resolver = new BrowserCliResolver({
    packageRoot: fixture.root,
    platform: "darwin",
    arch: "arm64",
    environment: {
      ...process.env,
      LEXMOUNT_BROWSER_CLI_PATH: fixture.binaryPath,
    },
    verifyExecutable: false,
  });
  await assert.rejects(
    resolver.resolve(new AbortController().signal),
    /Invalid browser CLI source metadata/u,
  );
  resolver.dispose();
});

test("does not start resolution for an already cancelled call", async () => {
  const controller = new AbortController();
  controller.abort();
  const resolver = new BrowserCliResolver({
    platform: "darwin",
    arch: "arm64",
  });
  await assert.rejects(
    resolver.resolve(controller.signal),
    (error) => error?.name === "AbortError",
  );
  resolver.dispose();
});

test("defers an unsupported-platform error until the first tool resolution", async () => {
  const resolver = new BrowserCliResolver({
    platform: "linux",
    arch: "x64",
  });
  await assert.rejects(
    resolver.resolve(new AbortController().signal),
    /currently supports win32-x64 and darwin-arm64 only/u,
  );
  resolver.dispose();
});
