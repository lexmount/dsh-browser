import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceConfig = JSON.parse(
  await readFile(resolve(packageRoot, "native-source.json"), "utf8"),
);

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const target = option("--target");
const source = option("--source");

if (target === undefined || source === undefined) {
  throw new Error(
    "Usage: node scripts/stage-binary.mjs --target <platform-arch> --source <binary>",
  );
}
if (!(target in sourceConfig.targets)) {
  throw new Error(`Unsupported target ${JSON.stringify(target)}`);
}

const sourcePath = resolve(source);
const sourceStats = await stat(sourcePath);
if (!sourceStats.isFile()) {
  throw new Error(`Native source is not a regular file: ${sourcePath}`);
}

const filename = target === "win32-x64" ? "browser-cli.exe" : "browser-cli";
const targetDirectory = resolve(packageRoot, "vendor", target);
const targetPath = resolve(targetDirectory, filename);
await mkdir(targetDirectory, { recursive: true });
await copyFile(sourcePath, targetPath);
if (target !== "win32-x64") {
  await chmod(targetPath, 0o755);
}

const data = await readFile(targetPath);
const digest = createHash("sha256").update(data).digest("hex");
const manifestPath = resolve(packageRoot, "vendor", "manifest.json");

let previousPlatforms = {};
try {
  const previous = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    previous !== null &&
    previous.cli?.name === sourceConfig.name &&
    previous.cli?.version === sourceConfig.version &&
    previous.cli?.repository === sourceConfig.repository &&
    previous.cli?.commit === sourceConfig.commit &&
    previous.platforms !== null &&
    typeof previous.platforms === "object" &&
    !Array.isArray(previous.platforms)
  ) {
    previousPlatforms = previous.platforms;
  }
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

const platforms = {
  ...previousPlatforms,
  [target]: {
    path: `${target}/${filename}`,
    sha256: digest,
    target: sourceConfig.targets[target],
  },
};

const sortedPlatforms = Object.fromEntries(
  Object.entries(platforms).sort(([left], [right]) => left.localeCompare(right)),
);

const manifest = {
  schemaVersion: 1,
  cli: {
    name: sourceConfig.name,
    version: sourceConfig.version,
    repository: sourceConfig.repository,
    commit: sourceConfig.commit,
  },
  platforms: sortedPlatforms,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(
  `${JSON.stringify({ target, source: basename(sourcePath), path: targetPath, sha256: digest })}\n`,
);
