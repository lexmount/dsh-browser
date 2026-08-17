import assert from "node:assert/strict";
import test from "node:test";

import { TOOL_NAMES, TOOL_SPECS } from "../lib/tool-specs.js";

test("registers a unique and complete CLI tool surface", () => {
  assert.equal(TOOL_NAMES.length, 31);
  assert.equal(new Set(TOOL_NAMES).size, TOOL_NAMES.length);
  assert.ok(TOOL_NAMES.includes("lexmount_browser_evaluate"));
  assert.ok(TOOL_NAMES.includes("lexmount_browser_raw_cdp"));
  assert.ok(TOOL_NAMES.includes("lexmount_browser_screenshot"));
});

test("builds argv arrays without shell interpolation", () => {
  const fill = TOOL_SPECS.find((spec) => spec.name === "lexmount_browser_fill");
  assert.ok(fill);
  assert.deepEqual(
    fill.argv({
      session_id: "session-1",
      selector: "input[name='q']",
      value: "$(touch /tmp/never) `uname` ; & |",
    }),
    [
      "action",
      "fill",
      "--session-id",
      "session-1",
      "--selector",
      "input[name='q']",
      "--value",
      "$(touch /tmp/never) `uname` ; & |",
    ],
  );
});

test("serializes structured metadata and raw CDP parameters", () => {
  const contextCreate = TOOL_SPECS.find(
    (spec) => spec.name === "lexmount_context_create",
  );
  const raw = TOOL_SPECS.find(
    (spec) => spec.name === "lexmount_browser_raw_cdp",
  );
  assert.ok(contextCreate);
  assert.ok(raw);
  assert.deepEqual(contextCreate.argv({ metadata: { purpose: "test" } }), [
    "context",
    "create",
    "--metadata-json",
    '{"purpose":"test"}',
  ]);
  assert.deepEqual(
    raw.argv({
      session_id: "session-1",
      method: "Runtime.evaluate",
      params: { expression: "1 + 1" },
    }),
    [
      "action",
      "raw",
      "--session-id",
      "session-1",
      "--method",
      "Runtime.evaluate",
      "--params-json",
      '{"expression":"1 + 1"}',
    ],
  );
});
