import { basename, join } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import type { AttachmentStore, ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";

import { isJsonRecord, type JsonValue } from "./json.js";
import type { BrowserCliRunner } from "./cli.js";
import { TOOL_SPECS, type CliToolSpec } from "./tool-specs.js";

export interface LexmountToolRuntime {
  runner: BrowserCliRunner;
  attachments: AttachmentStore;
}

type ToolArguments = Record<string, unknown>;

function renderJson(value: JsonValue) {
  return [{ type: "text" as const, text: JSON.stringify(value) }];
}

function attachmentFromValue(value: JsonValue): ImageAttachmentRef | undefined {
  if (!isJsonRecord(value) || !isJsonRecord(value.attachment)) {
    return undefined;
  }
  const attachment = value.attachment;
  if (
    typeof attachment.attachmentId !== "string" ||
    typeof attachment.mediaType !== "string" ||
    typeof attachment.bytes !== "number" ||
    typeof attachment.width !== "number" ||
    typeof attachment.height !== "number"
  ) {
    return undefined;
  }
  return attachment as unknown as ImageAttachmentRef;
}

function renderScreenshot(value: JsonValue) {
  const attachment = attachmentFromValue(value);
  if (attachment === undefined) {
    return renderJson(value);
  }
  const result = isJsonRecord(value) && "result" in value ? value.result : value;
  return [
    { type: "image" as const, attachment },
    { type: "text" as const, text: JSON.stringify(result) },
  ];
}

function omitTemporaryPath(value: JsonValue): JsonValue {
  if (!isJsonRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "path"),
  );
}

async function executeScreenshot(
  spec: CliToolSpec,
  arguments_: ToolArguments,
  signal: AbortSignal,
  runtime: LexmountToolRuntime,
): Promise<JsonValue> {
  const requestedPath = arguments_.output_path;
  if (requestedPath !== undefined && typeof requestedPath !== "string") {
    throw new TypeError("output_path must be a string");
  }

  const temporaryDirectory =
    requestedPath === undefined
      ? await mkdtemp(join(tmpdir(), "lexmount-dsh-browser-"))
      : undefined;
  const screenshotPath = requestedPath ?? join(temporaryDirectory!, "screenshot.png");

  try {
    const result = await runtime.runner.run(
      spec.argv({ ...arguments_, output_path: screenshotPath }),
      signal,
    );
    const data = await readFile(screenshotPath);
    const attachment = await runtime.attachments.saveImage({
      data,
      mediaType: "image/png",
      name: basename(screenshotPath),
    });
    return {
      result: requestedPath === undefined ? omitTemporaryPath(result) : result,
      attachment: attachment as unknown as JsonValue,
    };
  } finally {
    if (temporaryDirectory !== undefined) {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  }
}

export function registerLexmountTools(
  ctx: Context,
  runtime: LexmountToolRuntime,
): void {
  for (const spec of TOOL_SPECS) {
    ctx.tools.register(
      defineTool({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
          schema: { type: "json" },
          render: (_arguments, value) =>
            spec.outputKind === "screenshot"
              ? renderScreenshot(value)
              : renderJson(value),
        },
        async execute(arguments_, exec) {
          const looseArguments = arguments_ as ToolArguments;
          return spec.outputKind === "screenshot"
            ? await executeScreenshot(spec, looseArguments, exec.signal, runtime)
            : await runtime.runner.run(spec.argv(looseArguments), exec.signal);
        },
        presentCall: (arguments_) =>
          spec.presentation(arguments_ as ToolArguments),
      }),
    );
  }
}
