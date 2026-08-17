import type { JsonValue } from "./json.js";

const SENSITIVE_KEYS = new Set([
  "apikey",
  "authorization",
  "browserwsendpoint",
  "cdpurl",
  "websocketdebuggerurl",
  "websocketdebuggerurltransformed",
  "ws",
  "xapikey",
]);

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function nonEmptySecrets(environment: NodeJS.ProcessEnv): string[] {
  return [environment.LEXMOUNT_API_KEY]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort((left, right) => right.length - left.length);
}

export function redactText(
  value: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  let redacted = value;
  for (const secret of nonEmptySecrets(environment)) {
    redacted = redacted.split(secret).join("[REDACTED_SECRET]");
  }
  redacted = redacted.replace(
    /(["']?(?:api[_-]?key|x-api-key|authorization)["']?\s*[:=]\s*)(["'])(.*?)\2/giu,
    (_match, prefix: string, quote: string) =>
      `${prefix}${quote}[REDACTED_SECRET]${quote}`,
  );
  redacted = redacted.replace(
    /(\b(?:api[_-]?key|x-api-key|authorization)\b\s*:\s*)([^\r\n,;}]+)/giu,
    "$1[REDACTED_SECRET]",
  );
  redacted = redacted.replace(
    /(\b(?:api[_-]?key|x-api-key|authorization)\b\s*=\s*)([^\s,;}\]]+)/giu,
    "$1[REDACTED_SECRET]",
  );
  return redacted.replace(
    /\b(?:ws|wss):\/\/[^\s"'<>]+/giu,
    "[REDACTED_CDP_URL]",
  );
}

export function sanitizeJson(
  value: JsonValue,
  environment: NodeJS.ProcessEnv = process.env,
): JsonValue {
  if (typeof value === "string") {
    return redactText(value, environment);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item, environment));
  }

  const output: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = SENSITIVE_KEYS.has(normalizedKey(key))
      ? "[REDACTED]"
      : sanitizeJson(child, environment);
  }
  return output;
}
