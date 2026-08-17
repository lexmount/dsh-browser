import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HarnessError } from "@deepseek-ai/dsh-llm";

import {
  BrowserCliError,
  BrowserCliProtocolError,
  BrowserCliRunner,
} from "../lib/cli.js";

function runNode(source, options = {}) {
  const runner = new BrowserCliRunner(process.execPath, options);
  const controller = new AbortController();
  return {
    controller,
    runner,
    promise: runner.run(["--input-type=module", "--eval", source], controller.signal),
  };
}

test("parses and redacts a successful browser-cli envelope", async () => {
  const execution = runNode(
    `console.log(JSON.stringify({ok:true,data:{api_key:process.env.LEXMOUNT_API_KEY,ws:"wss://example.test/devtools/1",safe:true}}))`,
    { environment: { ...process.env, LEXMOUNT_API_KEY: "fixture-secret" } },
  );
  try {
    assert.deepEqual(await execution.promise, {
      api_key: "[REDACTED]",
      ws: "[REDACTED]",
      safe: true,
    });
  } finally {
    execution.runner.dispose();
  }
});

test("preserves a structured CLI error code while redacting its message", async () => {
  const execution = runNode(
    `console.error(JSON.stringify({ok:false,error:"authentication_error",message:"bad fixture-secret"})); process.exit(1)`,
    { environment: { ...process.env, LEXMOUNT_API_KEY: "fixture-secret" } },
  );
  try {
    await assert.rejects(execution.promise, (error) => {
      assert.ok(error instanceof BrowserCliError);
      assert.ok(error instanceof HarnessError);
      assert.equal(error.code, "authentication_error");
      assert.equal(error.message, "bad [REDACTED_SECRET]");
      return true;
    });
  } finally {
    execution.runner.dispose();
  }
});

test("rejects malformed successful output as a protocol error", async () => {
  const execution = runNode(`console.log("not-json")`);
  try {
    await assert.rejects(execution.promise, BrowserCliProtocolError);
  } finally {
    execution.runner.dispose();
  }
});

test("forwards cancellation by terminating the owned child process", async () => {
  const execution = runNode(`setInterval(() => {}, 1000)`, { killGraceMs: 100 });
  setTimeout(() => execution.controller.abort(), 50).unref();
  try {
    await assert.rejects(execution.promise, (error) => error?.name === "AbortError");
  } finally {
    execution.runner.dispose();
  }
});

test(
  "plugin disposal escalates termination for an uncooperative child",
  { skip: process.platform === "win32" },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "lexmount-runner-test-"));
    const readyPath = join(directory, "ready");
    const execution = runNode(
      `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(readyPath)}, "ready"); process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)`,
      { killGraceMs: 100 },
    );
    let settled = false;
    void execution.promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    try {
      await assert.doesNotReject(async () => {
        for (let attempt = 0; attempt < 200; attempt += 1) {
          try {
            await access(readyPath);
            return;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        throw new Error("child did not report readiness");
      });

      execution.runner.dispose();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(settled, false);
      await assert.rejects(execution.promise, (error) => {
        assert.ok(error instanceof BrowserCliError);
        assert.equal(error.code, "plugin_disposed");
        return true;
      });
    } finally {
      execution.runner.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  },
);
