import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const source = JSON.parse(
  await readFile(new URL("../native-source.json", import.meta.url), "utf8"),
);
const repositoryUrl = new URL(source.repository.replace(/\.git$/u, ""));
assert.equal(repositoryUrl.hostname, "github.com", "native source must be on GitHub");
const [owner, repository] = repositoryUrl.pathname.split("/").filter(Boolean);
assert.ok(owner && repository, "native source repository URL is invalid");
const githubHeaders = {
  accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN
    ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};
const tagResponse = await fetch(
  `https://api.github.com/repos/${owner}/${repository}/git/ref/tags/v${source.version}`,
  {
    headers: githubHeaders,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  },
);
assert.equal(tagResponse.ok, true, `browser-cli tag returned HTTP ${tagResponse.status}`);
const tagRef = await tagResponse.json();
let releaseCommit = tagRef.object?.sha;
if (tagRef.object?.type === "tag") {
  const annotatedTagResponse = await fetch(tagRef.object.url, {
    headers: githubHeaders,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(
    annotatedTagResponse.ok,
    true,
    `annotated browser-cli tag returned HTTP ${annotatedTagResponse.status}`,
  );
  const annotatedTag = await annotatedTagResponse.json();
  assert.equal(annotatedTag.object?.type, "commit", "browser-cli tag must resolve to a commit");
  releaseCommit = annotatedTag.object?.sha;
}
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
