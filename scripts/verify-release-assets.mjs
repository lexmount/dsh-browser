import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const source = JSON.parse(
  await readFile(new URL("../native-source.json", import.meta.url), "utf8"),
);
const repositoryUrl = new URL(source.repository.replace(/\.git$/u, ""));
assert.equal(repositoryUrl.hostname, "github.com", "native source must be on GitHub");
assert.equal(
  repositoryUrl.pathname.split("/").filter(Boolean).length,
  2,
  "native source repository URL is invalid",
);
const tagName = `refs/tags/v${source.version}`;
const tagResult = spawnSync(
  "git",
  ["ls-remote", "--tags", source.repository, tagName, `${tagName}^{}`],
  {
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    shell: false,
    timeout: 30_000,
    windowsHide: true,
  },
);
if (tagResult.error !== undefined || tagResult.status !== 0) {
  throw tagResult.error ?? new Error(tagResult.stderr || "git ls-remote failed");
}
const remoteTags = new Map(
  tagResult.stdout
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [commit, reference] = line.split(/\s+/u);
      return [reference, commit];
    }),
);
const releaseCommit = remoteTags.get(`${tagName}^{}`) ?? remoteTags.get(tagName);
assert.ok(releaseCommit, `browser-cli tag v${source.version} does not exist`);
assert.equal(releaseCommit, source.commit, "browser-cli tag does not match native source commit");

const baseUrl = source.download.baseUrl.replace(/\/$/u, "");
const checksumUrl = `${baseUrl}/${source.download.checksums}`;
const checksumResponse = await fetch(checksumUrl, {
  redirect: "error",
  signal: AbortSignal.timeout(30_000),
});
assert.equal(
  checksumResponse.ok,
  true,
  `checksum manifest returned HTTP ${checksumResponse.status}`,
);
const checksumManifest = await checksumResponse.text();

const assets = Object.values(source.targets).map(
  (target) =>
    `browser-cli-v${source.version}-${target}${target === "x86_64-pc-windows-msvc" ? ".exe" : ""}`,
);
for (const asset of assets) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const checksumMatch = new RegExp(
    `^([a-fA-F0-9]{64})[\\t ]+\\*?${escaped}\\s*$`,
    "mu",
  ).exec(checksumManifest);
  assert.ok(checksumMatch?.[1], `checksum manifest is missing ${asset}`);
  const expectedHash = checksumMatch[1].toLowerCase();
  const response = await fetch(`${baseUrl}/${asset}`, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  assert.equal(response.ok, true, `${asset} returned HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  assert.ok(
    data.length > 0 && data.length <= 128 * 1024 * 1024,
    `${asset} has an invalid size`,
  );
  const actualHash = createHash("sha256").update(data).digest("hex");
  assert.equal(actualHash, expectedHash, `${asset} checksum mismatch`);
}

process.stdout.write(`${JSON.stringify({ ok: true, version: source.version, assets })}\n`);
