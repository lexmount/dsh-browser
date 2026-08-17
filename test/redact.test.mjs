import assert from "node:assert/strict";
import test from "node:test";

import { redactText, sanitizeJson } from "../lib/redact.js";

test("redacts credentials and CDP control URLs", () => {
  const environment = { LEXMOUNT_API_KEY: "top-secret" };
  assert.equal(
    redactText("Bearer top-secret wss://example.test/devtools/abc", environment),
    "Bearer [REDACTED_SECRET] [REDACTED_CDP_URL]",
  );
});

test("redacts labeled credentials that are not present in the environment", () => {
  assert.equal(
    redactText(
      'Authorization: Bearer server-secret\nx-api-key=second-secret\n{"apiKey":"third-secret"}',
      {},
    ),
    'Authorization: [REDACTED_SECRET]\nx-api-key=[REDACTED_SECRET]\n{"apiKey":"[REDACTED_SECRET]"}',
  );
});

test("redacts sensitive response keys recursively", () => {
  assert.deepEqual(
    sanitizeJson({
      session: {
        ws: "wss://example.test/devtools/abc",
        webSocketDebuggerUrl: "ws://example.test/devtools/def",
        "x-api-key": "fixture-key",
        title: "Safe title",
      },
    }),
    {
      session: {
        ws: "[REDACTED]",
        webSocketDebuggerUrl: "[REDACTED]",
        "x-api-key": "[REDACTED]",
        title: "Safe title",
      },
    },
  );
});
