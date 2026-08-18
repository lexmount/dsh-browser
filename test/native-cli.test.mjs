import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { BrowserCliResolver } from "../lib/binary.js";
import { BrowserCliRunner } from "../lib/cli.js";
import { TOOL_SPECS } from "../lib/tool-specs.js";

const sampleArguments = {
  session_id: "session-fixture",
  context_id: "context-fixture",
  download_id: "download-fixture",
  output_path: "/tmp/lexmount-fixture",
  url: "https://example.com/",
  selector: "body",
  text: "Example",
  value: "fixture",
  expression: "1 + 1",
  method: "Runtime.evaluate",
};

test("downloads, resolves, and executes the native browser CLI", async () => {
  const binary = new BrowserCliResolver();
  const runner = new BrowserCliRunner(binary);
  const signal = new AbortController().signal;
  try {
    const version = await runner.run(["version"], signal);
    assert.equal(version.version, "1.1.13");

    const status = await runner.run(["auth", "status"], signal);
    assert.equal(typeof status.valid, "boolean");
    assert.equal(typeof status.api_key_present, "boolean");
    assert.equal("api_key" in status, false);
  } finally {
    runner.dispose();
  }
});

test("every registered tool maps to a command accepted by browser-cli", async () => {
  const resolver = new BrowserCliResolver();
  try {
    const binary = await resolver.resolve(new AbortController().signal);
    for (const spec of TOOL_SPECS) {
      const result = spawnSync(
        binary.path,
        [...spec.argv(sampleArguments), "--help"],
        { encoding: "utf8", shell: false, timeout: 10_000, windowsHide: true },
      );
      assert.equal(
        result.status,
        0,
        `${spec.name}: ${result.error?.message ?? result.stderr ?? result.stdout}`,
      );
    }
  } finally {
    resolver.dispose();
  }
});
