import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { HarnessError } from "@deepseek-ai/dsh-llm";

import { isJsonRecord, type JsonValue } from "./json.js";
import { redactText, sanitizeJson } from "./redact.js";

export class BrowserCliError extends HarnessError {
  readonly exitCode: number | null;

  constructor(message: string, code: string, exitCode: number | null = null) {
    super(message, code);
    this.name = "BrowserCliError";
    this.exitCode = exitCode;
  }
}

export class BrowserCliProtocolError extends BrowserCliError {
  constructor(message: string, exitCode: number | null = null) {
    super(message, "protocol_error", exitCode);
    this.name = "BrowserCliProtocolError";
  }
}

function abortError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error("Lexmount browser tool call was cancelled.");
  error.name = "AbortError";
  return error;
}

function parseEnvelope(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  environment: NodeJS.ProcessEnv,
): JsonValue {
  if (exitCode === 0) {
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(stdout.trim()) as JsonValue;
    } catch {
      throw new BrowserCliProtocolError(
        `browser-cli returned invalid JSON: ${redactText(stdout.trim(), environment)}`,
        exitCode,
      );
    }
    if (!isJsonRecord(parsed) || parsed.ok !== true || !("data" in parsed)) {
      throw new BrowserCliProtocolError(
        "browser-cli returned an invalid success envelope.",
        exitCode,
      );
    }
    return sanitizeJson(parsed.data, environment);
  }

  const candidate = stderr.trim() || stdout.trim();
  if (candidate.length > 0) {
    try {
      const parsed = JSON.parse(candidate) as JsonValue;
      if (isJsonRecord(parsed) && parsed.ok === false) {
        const code = typeof parsed.error === "string" ? parsed.error : "cli_error";
        const message =
          typeof parsed.message === "string"
            ? redactText(parsed.message, environment)
            : `browser-cli failed with ${code}`;
        throw new BrowserCliError(message, code, exitCode);
      }
    } catch (error) {
      if (error instanceof BrowserCliError) {
        throw error;
      }
    }
  }

  throw new BrowserCliProtocolError(
    `browser-cli exited with status ${String(exitCode)}${candidate.length > 0 ? `: ${redactText(candidate, environment)}` : ""}`,
    exitCode,
  );
}

export interface BrowserCliRunnerOptions {
  environment?: NodeJS.ProcessEnv;
  killGraceMs?: number;
}

export class BrowserCliRunner {
  readonly path: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly killGraceMs: number;

  #terminators = new Map<
    ChildProcessByStdio<null, Readable, Readable>,
    () => void
  >();
  #disposed = false;

  constructor(path: string, options: BrowserCliRunnerOptions = {}) {
    this.path = path;
    this.environment = options.environment ?? process.env;
    this.killGraceMs = options.killGraceMs ?? 2_000;
  }

  async run(arguments_: readonly string[], signal: AbortSignal): Promise<JsonValue> {
    if (this.#disposed) {
      throw new BrowserCliError("Lexmount browser plugin is shutting down.", "plugin_disposed");
    }
    if (signal.aborted) {
      throw abortError(signal.reason);
    }

    return await new Promise<JsonValue>((resolvePromise, rejectPromise) => {
      const child = spawn(this.path, [...arguments_], {
        env: this.environment,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let killTimer: NodeJS.Timeout | undefined;
      let spawnError: Error | undefined;
      let terminating = false;

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.once("error", (error) => {
        spawnError = error;
      });

      const terminate = () => {
        if (
          terminating ||
          child.exitCode !== null ||
          child.signalCode !== null
        ) {
          return;
        }
        terminating = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
        }, this.killGraceMs);
        killTimer.unref();
      };
      this.#terminators.set(child, terminate);

      const onAbort = () => {
        terminate();
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        terminate();
      }

      child.once("close", (exitCode) => {
        this.#terminators.delete(child);
        signal.removeEventListener("abort", onAbort);
        if (killTimer !== undefined) {
          clearTimeout(killTimer);
        }

        if (signal.aborted) {
          rejectPromise(abortError(signal.reason));
          return;
        }
        if (this.#disposed) {
          rejectPromise(
            new BrowserCliError(
              "Lexmount browser plugin is shutting down.",
              "plugin_disposed",
              exitCode,
            ),
          );
          return;
        }
        if (spawnError !== undefined) {
          rejectPromise(
            new BrowserCliError(
              `Unable to start browser-cli: ${redactText(spawnError.message, this.environment)}`,
              "spawn_error",
              exitCode,
            ),
          );
          return;
        }
        try {
          resolvePromise(parseEnvelope(stdout, stderr, exitCode, this.environment));
        } catch (error) {
          rejectPromise(error);
        }
      });
    });
  }

  dispose(): void {
    this.#disposed = true;
    for (const terminate of this.#terminators.values()) {
      terminate();
    }
  }
}
