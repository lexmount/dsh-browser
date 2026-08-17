import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  BrowserCliInstallationError,
  EXPECTED_CLI_COMMIT,
  EXPECTED_CLI_REPOSITORY,
  EXPECTED_CLI_VERSION,
  platformKey,
  resolveBrowserCli,
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

async function createPackageFixture() {
  const root = await mkdtemp(join(tmpdir(), "lexmount-binary-test-"));
  const relativePath = "linux-x64/browser-cli";
  const binaryPath = join(root, "vendor", relativePath);
  const binary = linuxExecutableFixture();
  await mkdir(join(root, "vendor", "linux-x64"), { recursive: true });
  await writeFile(binaryPath, binary);
  await chmod(binaryPath, 0o755);
  const manifest = {
    schemaVersion: 1,
    cli: {
      name: "browser-cli",
      version: EXPECTED_CLI_VERSION,
      repository: EXPECTED_CLI_REPOSITORY,
      commit: EXPECTED_CLI_COMMIT,
    },
    platforms: {
      "linux-x64": {
        path: relativePath,
        sha256: createHash("sha256").update(binary).digest("hex"),
        target: "x86_64-unknown-linux-musl",
      },
    },
  };
  await writeFile(
    join(root, "vendor", "manifest.json"),
    `${JSON.stringify(manifest)}\n`,
  );
  return { root, binaryPath, manifest };
}

test("selects only the four supported platform keys", () => {
  assert.equal(platformKey("linux", "x64"), "linux-x64");
  assert.equal(platformKey("darwin", "arm64"), "darwin-arm64");
  assert.throws(
    () => platformKey("linux", "arm64"),
    BrowserCliInstallationError,
  );
});

test("resolves a pinned binary with matching format and checksum", async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const resolved = resolveBrowserCli({
    packageRoot: fixture.root,
    platform: "linux",
    arch: "x64",
    verifyExecutable: false,
  });
  assert.equal(resolved.path, fixture.binaryPath);
  assert.equal(resolved.commit, EXPECTED_CLI_COMMIT);
  assert.equal(resolved.target, "x86_64-unknown-linux-musl");
});

test("rejects a binary changed after its manifest was generated", async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const changed = linuxExecutableFixture();
  changed[119] = 1;
  await writeFile(fixture.binaryPath, changed);
  await chmod(fixture.binaryPath, 0o755);
  assert.throws(
    () =>
      resolveBrowserCli({
        packageRoot: fixture.root,
        platform: "linux",
        arch: "x64",
        verifyExecutable: false,
      }),
    /checksum mismatch/u,
  );
});

test("rejects a dynamically linked Linux executable", async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const dynamic = linuxExecutableFixture();
  dynamic.writeUInt32LE(3, 64);
  fixture.manifest.platforms["linux-x64"].sha256 = createHash("sha256")
    .update(dynamic)
    .digest("hex");
  await writeFile(fixture.binaryPath, dynamic);
  await chmod(fixture.binaryPath, 0o755);
  await writeFile(
    join(fixture.root, "vendor", "manifest.json"),
    `${JSON.stringify(fixture.manifest)}\n`,
  );
  assert.throws(
    () =>
      resolveBrowserCli({
        packageRoot: fixture.root,
        platform: "linux",
        arch: "x64",
        verifyExecutable: false,
      }),
    /wrong executable format/u,
  );
});

test("rejects a manifest that remaps a platform entry", async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  fixture.manifest.platforms["linux-x64"].path = "../outside/browser-cli";
  await writeFile(
    join(fixture.root, "vendor", "manifest.json"),
    `${JSON.stringify(fixture.manifest)}\n`,
  );
  assert.throws(
    () =>
      resolveBrowserCli({
        packageRoot: fixture.root,
        platform: "linux",
        arch: "x64",
        verifyExecutable: false,
      }),
    /does not contain a manifest entry/u,
  );
});

test("reports a malformed platform entry as an installation error", async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  fixture.manifest.platforms["linux-x64"] = null;
  await writeFile(
    join(fixture.root, "vendor", "manifest.json"),
    `${JSON.stringify(fixture.manifest)}\n`,
  );
  assert.throws(
    () =>
      resolveBrowserCli({
        packageRoot: fixture.root,
        platform: "linux",
        arch: "x64",
        verifyExecutable: false,
      }),
    BrowserCliInstallationError,
  );
});
