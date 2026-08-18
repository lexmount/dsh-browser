import type {
  ParameterSchemaSpec,
  ToolCallKind,
} from "@deepseek-ai/dsh-tools";

type ToolArguments = Record<string, unknown>;

export type ToolOutputKind = "json" | "screenshot";

export interface CliToolSpec {
  name: string;
  description: string;
  parameters: ParameterSchemaSpec;
  outputKind?: ToolOutputKind;
  argv(arguments_: ToolArguments): string[];
  presentation(arguments_: ToolArguments): {
    card: "generic";
    title: string;
    kind: ToolCallKind;
  };
}

const noParameters = {} satisfies ParameterSchemaSpec;

const sessionId = {
  type: "string",
  required: true,
  description: "Lexmount browser session ID.",
} as const;

const contextId = {
  type: "string",
  required: true,
  description: "Lexmount persistent browser context ID.",
} as const;

const outputPath = {
  type: "string",
  required: true,
  description: "Destination file path on the DSH host.",
} as const;

function requiredString(arguments_: ToolArguments, name: string): string {
  const value = arguments_[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function optionalString(arguments_: ToolArguments, name: string): string | undefined {
  const value = arguments_[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  return value;
}

function optionalNumber(arguments_: ToolArguments, name: string): number | undefined {
  const value = arguments_[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function optionalBoolean(arguments_: ToolArguments, name: string): boolean | undefined {
  const value = arguments_[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be a boolean`);
  }
  return value;
}

function addStringFlag(
  argv: string[],
  flag: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    argv.push(flag, value);
  }
}

function addNumberFlag(
  argv: string[],
  flag: string,
  value: number | undefined,
): void {
  if (value !== undefined) {
    argv.push(flag, String(value));
  }
}

function addBooleanFlag(
  argv: string[],
  flag: string,
  value: boolean | undefined,
): void {
  if (value === true) {
    argv.push(flag);
  }
}

function presentation(
  title: string | ((arguments_: ToolArguments) => string),
  kind: ToolCallKind,
): CliToolSpec["presentation"] {
  return (arguments_) => ({
    card: "generic",
    title: typeof title === "string" ? title : title(arguments_),
    kind,
  });
}

export const TOOL_SPECS: readonly CliToolSpec[] = [
  {
    name: "lexmount_browser_version",
    description: "Return the pinned Lexmount browser CLI version.",
    parameters: noParameters,
    argv: () => ["version"],
    presentation: presentation("Check Lexmount browser version", "read"),
  },
  {
    name: "lexmount_doctor",
    description:
      "Check Lexmount credentials and API connectivity. Run this before creating a browser session.",
    parameters: noParameters,
    argv: () => ["doctor"],
    presentation: presentation("Check Lexmount browser readiness", "read"),
  },
  {
    name: "lexmount_auth_status",
    description:
      "Check whether Lexmount browser credentials are configured. Secret values are never returned.",
    parameters: noParameters,
    argv: () => ["auth", "status"],
    presentation: presentation("Check Lexmount authentication", "read"),
  },
  {
    name: "lexmount_auth_login",
    description:
      "Start interactive Lexmount PKCE login. This opens the system browser and waits for the user to approve access. It requires an interactive desktop; for unattended Headless runs, authenticate beforehand in the Web profile or with browser-cli.",
    parameters: {
      project_id: {
        type: "string",
        description: "Optional Lexmount project to preselect during authorization.",
      },
      timeout_seconds: {
        type: "integer",
        description: "Seconds to wait for the browser callback. Defaults to 300.",
      },
    },
    argv: (arguments_) => {
      const argv = ["auth", "login"];
      addStringFlag(argv, "--project-id", optionalString(arguments_, "project_id"));
      addNumberFlag(
        argv,
        "--timeout-seconds",
        optionalNumber(arguments_, "timeout_seconds"),
      );
      return argv;
    },
    presentation: presentation("Authorize Lexmount Browser", "execute"),
  },
  {
    name: "lexmount_auth_logout",
    description:
      "Delete the locally stored Lexmount browser credential file. Environment-provided credentials are not changed.",
    parameters: noParameters,
    argv: () => ["auth", "logout"],
    presentation: presentation("Remove Lexmount browser credentials", "delete"),
  },
  {
    name: "lexmount_session_create",
    description:
      "Create a Lexmount cloud browser session and wait until it is active. Recording, downloads, persistent contexts, proxies, and longer lifetimes may consume additional resources.",
    parameters: {
      browser_mode: {
        type: "string",
        enum: ["normal", "light"],
        description: "Browser resource mode. Defaults to normal.",
      },
      context_id: {
        type: "string",
        description: "Optional persistent Context to mount.",
      },
      context_mode: {
        type: "string",
        enum: ["read_write", "read_only"],
        description: "Persistent Context access mode. Defaults to read_write.",
      },
      context_description: {
        type: "string",
        description: "Description used when the service creates a Context.",
      },
      weak_lock: {
        type: "boolean",
        description: "Request weak Context locking.",
      },
      official_proxy: {
        type: "boolean",
        description: "Enable a Lexmount official proxy.",
      },
      custom_image_id: {
        type: "string",
        description: "Optional custom browser image ID.",
      },
      window_size: {
        type: "string",
        description: "Browser window size such as 1920,1080.",
      },
      downloads: {
        type: "boolean",
        description: "Enable session downloads.",
      },
      recording: {
        type: "boolean",
        description: "Enable persistent session recording.",
      },
      timeout_seconds: {
        type: "integer",
        description: "Seconds to wait for activation. Defaults to 600.",
      },
    },
    argv: (arguments_) => {
      const argv = ["session", "create"];
      addStringFlag(argv, "--browser-mode", optionalString(arguments_, "browser_mode"));
      addStringFlag(argv, "--context-id", optionalString(arguments_, "context_id"));
      addStringFlag(argv, "--context-mode", optionalString(arguments_, "context_mode"));
      addStringFlag(
        argv,
        "--context-description",
        optionalString(arguments_, "context_description"),
      );
      addBooleanFlag(argv, "--weak-lock", optionalBoolean(arguments_, "weak_lock"));
      addBooleanFlag(
        argv,
        "--official-proxy",
        optionalBoolean(arguments_, "official_proxy"),
      );
      addStringFlag(
        argv,
        "--custom-image-id",
        optionalString(arguments_, "custom_image_id"),
      );
      addStringFlag(argv, "--window-size", optionalString(arguments_, "window_size"));
      addBooleanFlag(argv, "--downloads", optionalBoolean(arguments_, "downloads"));
      addBooleanFlag(argv, "--recording", optionalBoolean(arguments_, "recording"));
      addNumberFlag(
        argv,
        "--timeout-seconds",
        optionalNumber(arguments_, "timeout_seconds"),
      );
      return argv;
    },
    presentation: presentation("Create a Lexmount browser session", "execute"),
  },
  {
    name: "lexmount_session_get",
    description: "Get one Lexmount browser session by ID.",
    parameters: { session_id: sessionId },
    argv: (arguments_) => [
      "session",
      "get",
      "--session-id",
      requiredString(arguments_, "session_id"),
    ],
    presentation: presentation("Get Lexmount browser session", "read"),
  },
  {
    name: "lexmount_session_list",
    description: "List Lexmount browser sessions, optionally filtered by status.",
    parameters: {
      status: {
        type: "string",
        description: "Optional session status filter, such as active or closed.",
      },
    },
    argv: (arguments_) => {
      const argv = ["session", "list"];
      addStringFlag(argv, "--status", optionalString(arguments_, "status"));
      return argv;
    },
    presentation: presentation("List Lexmount browser sessions", "read"),
  },
  {
    name: "lexmount_session_close",
    description:
      "Close a Lexmount browser session. Closing a read-write Context session normally persists its browser state.",
    parameters: { session_id: sessionId },
    argv: (arguments_) => [
      "session",
      "close",
      "--session-id",
      requiredString(arguments_, "session_id"),
    ],
    presentation: presentation("Close Lexmount browser session", "delete"),
  },
  {
    name: "lexmount_session_keepalive",
    description:
      "Poll a Lexmount browser session for a bounded duration to keep the tool call active and report state snapshots.",
    parameters: {
      session_id: sessionId,
      interval_seconds: {
        type: "integer",
        description: "Polling interval in seconds. Defaults to 5.",
      },
      duration_seconds: {
        type: "integer",
        description: "Total polling duration in seconds. Defaults to 60.",
      },
      stop_on_inactive: {
        type: "boolean",
        description: "Stop polling when the session is no longer active.",
      },
    },
    argv: (arguments_) => {
      const argv = [
        "session",
        "keepalive",
        "--session-id",
        requiredString(arguments_, "session_id"),
      ];
      addNumberFlag(
        argv,
        "--interval",
        optionalNumber(arguments_, "interval_seconds"),
      );
      addNumberFlag(
        argv,
        "--duration",
        optionalNumber(arguments_, "duration_seconds"),
      );
      addBooleanFlag(
        argv,
        "--stop-on-inactive",
        optionalBoolean(arguments_, "stop_on_inactive"),
      );
      return argv;
    },
    presentation: presentation("Keep Lexmount browser session active", "read"),
  },
  {
    name: "lexmount_session_targets",
    description:
      "List browser targets for a Lexmount session. CDP control WebSocket addresses are redacted from the result.",
    parameters: { session_id: sessionId },
    argv: (arguments_) => [
      "session",
      "targets",
      "--session-id",
      requiredString(arguments_, "session_id"),
    ],
    presentation: presentation("List Lexmount browser targets", "read"),
  },
  {
    name: "lexmount_download_list",
    description: "List downloads created by a Lexmount browser session.",
    parameters: { session_id: sessionId },
    argv: (arguments_) => [
      "session",
      "downloads",
      "list",
      "--session-id",
      requiredString(arguments_, "session_id"),
    ],
    presentation: presentation("List Lexmount browser downloads", "read"),
  },
  {
    name: "lexmount_download_get",
    description:
      "Download one session file to a host path. The result returns that path; DSH RC.6 has no generic binary attachment block.",
    parameters: {
      session_id: sessionId,
      download_id: {
        type: "string",
        required: true,
        description: "Download ID returned by lexmount_download_list.",
      },
      output_path: outputPath,
    },
    argv: (arguments_) => [
      "session",
      "downloads",
      "get",
      "--session-id",
      requiredString(arguments_, "session_id"),
      "--download-id",
      requiredString(arguments_, "download_id"),
      "--output",
      requiredString(arguments_, "output_path"),
    ],
    presentation: presentation("Download Lexmount browser file", "edit"),
  },
  {
    name: "lexmount_download_archive",
    description:
      "Archive all session downloads to a host file. The result returns that path; DSH RC.6 has no generic binary attachment block.",
    parameters: {
      session_id: sessionId,
      output_path: outputPath,
    },
    argv: (arguments_) => [
      "session",
      "downloads",
      "archive",
      "--session-id",
      requiredString(arguments_, "session_id"),
      "--output",
      requiredString(arguments_, "output_path"),
    ],
    presentation: presentation("Archive Lexmount browser downloads", "edit"),
  },
  {
    name: "lexmount_download_delete",
    description:
      "Permanently delete every download associated with a Lexmount browser session.",
    parameters: { session_id: sessionId },
    argv: (arguments_) => [
      "session",
      "downloads",
      "delete",
      "--session-id",
      requiredString(arguments_, "session_id"),
      "--yes",
    ],
    presentation: presentation("Delete Lexmount browser downloads", "delete"),
  },
  {
    name: "lexmount_context_create",
    description:
      "Create a persistent Lexmount browser Context for reusing cookies and browser state.",
    parameters: {
      description: {
        type: "string",
        description: "Human-readable Context purpose.",
      },
      metadata: {
        type: "json",
        description: "Optional JSON metadata stored with the Context.",
      },
    },
    argv: (arguments_) => {
      const argv = ["context", "create"];
      addStringFlag(argv, "--description", optionalString(arguments_, "description"));
      if (arguments_.metadata !== undefined) {
        argv.push("--metadata-json", JSON.stringify(arguments_.metadata));
      }
      return argv;
    },
    presentation: presentation("Create Lexmount browser Context", "execute"),
  },
  {
    name: "lexmount_context_get",
    description: "Get one persistent Lexmount browser Context by ID.",
    parameters: { context_id: contextId },
    argv: (arguments_) => [
      "context",
      "get",
      "--context-id",
      requiredString(arguments_, "context_id"),
    ],
    presentation: presentation("Get Lexmount browser Context", "read"),
  },
  {
    name: "lexmount_context_list",
    description: "List persistent Lexmount browser Contexts.",
    parameters: {
      status: {
        type: "string",
        enum: ["available", "locked"],
        description: "Optional Context status filter.",
      },
      limit: {
        type: "integer",
        description: "Maximum Contexts to return. Defaults to 20.",
      },
    },
    argv: (arguments_) => {
      const argv = ["context", "list"];
      addStringFlag(argv, "--status", optionalString(arguments_, "status"));
      addNumberFlag(argv, "--limit", optionalNumber(arguments_, "limit"));
      return argv;
    },
    presentation: presentation("List Lexmount browser Contexts", "read"),
  },
  {
    name: "lexmount_context_fork",
    description:
      "Fork a persistent Lexmount browser Context into a new independent Context.",
    parameters: { context_id: contextId },
    argv: (arguments_) => [
      "context",
      "fork",
      "--context-id",
      requiredString(arguments_, "context_id"),
    ],
    presentation: presentation("Fork Lexmount browser Context", "execute"),
  },
  {
    name: "lexmount_context_delete",
    description:
      "Permanently delete a persistent Lexmount browser Context and its saved browser state.",
    parameters: { context_id: contextId },
    argv: (arguments_) => [
      "context",
      "delete",
      "--context-id",
      requiredString(arguments_, "context_id"),
      "--yes",
    ],
    presentation: presentation("Delete Lexmount browser Context", "delete"),
  },
  {
    name: "lexmount_context_force_release",
    description:
      "Force-release a locked Lexmount browser Context. Use only after confirming the owning session is dead; unsaved browser state may be discarded.",
    parameters: { context_id: contextId },
    argv: (arguments_) => [
      "context",
      "force-release",
      "--context-id",
      requiredString(arguments_, "context_id"),
      "--yes",
    ],
    presentation: presentation("Force-release Lexmount browser Context", "delete"),
  },
  {
    name: "lexmount_browser_open_url",
    description:
      "Navigate the first page target in a Lexmount browser session to an absolute URL.",
    parameters: {
      session_id: sessionId,
      url: {
        type: "string",
        required: true,
        description: "Absolute URL to open.",
      },
      timeout_ms: {
        type: "integer",
        description: "Navigation timeout in milliseconds. Defaults to 30000.",
      },
    },
    argv: (arguments_) => {
      const argv = [
        "action",
        "open-url",
        "--session-id",
        requiredString(arguments_, "session_id"),
        "--url",
        requiredString(arguments_, "url"),
      ];
      addNumberFlag(argv, "--timeout-ms", optionalNumber(arguments_, "timeout_ms"));
      return argv;
    },
    presentation: presentation(
      (arguments_) => `Open ${requiredString(arguments_, "url")}`,
      "fetch",
    ),
  },
  {
    name: "lexmount_browser_wait_selector",
    description: "Wait until a CSS selector exists in the first page target.",
    parameters: {
      session_id: sessionId,
      selector: {
        type: "string",
        required: true,
        description: "CSS selector to wait for.",
      },
      timeout_ms: {
        type: "integer",
        description: "Wait timeout in milliseconds. Defaults to 30000.",
      },
    },
    argv: (arguments_) => {
      const argv = [
        "action",
        "wait-selector",
        "--session-id",
        requiredString(arguments_, "session_id"),
        "--selector",
        requiredString(arguments_, "selector"),
      ];
      addNumberFlag(argv, "--timeout-ms", optionalNumber(arguments_, "timeout_ms"));
      return argv;
    },
    presentation: presentation("Wait for browser element", "read"),
  },
  {
    name: "lexmount_browser_wait_text",
    description:
      "Wait for text to become present or absent. Matching is normalized, case-insensitive contains by default.",
    parameters: {
      session_id: sessionId,
      text: {
        type: "string",
        required: true,
        description: "Text to wait for.",
      },
      selector: {
        type: "string",
        description: "Optional CSS selector that scopes text matching.",
      },
      state: {
        type: "string",
        enum: ["present", "absent"],
        description: "Desired state. Defaults to present.",
      },
      exact: {
        type: "boolean",
        description: "Require the complete normalized text to match.",
      },
      case_sensitive: {
        type: "boolean",
        description: "Use case-sensitive matching.",
      },
      include_hidden: {
        type: "boolean",
        description: "Include hidden element text.",
      },
      timeout_ms: {
        type: "integer",
        description: "Wait timeout in milliseconds. Defaults to 30000.",
      },
      poll_ms: {
        type: "integer",
        description: "Polling interval in milliseconds. Defaults to 250.",
      },
    },
    argv: (arguments_) => {
      const argv = [
        "action",
        "wait-text",
        "--session-id",
        requiredString(arguments_, "session_id"),
        "--text",
        requiredString(arguments_, "text"),
      ];
      addStringFlag(argv, "--selector", optionalString(arguments_, "selector"));
      addStringFlag(argv, "--state", optionalString(arguments_, "state"));
      addBooleanFlag(argv, "--exact", optionalBoolean(arguments_, "exact"));
      addBooleanFlag(
        argv,
        "--case-sensitive",
        optionalBoolean(arguments_, "case_sensitive"),
      );
      addBooleanFlag(
        argv,
        "--include-hidden",
        optionalBoolean(arguments_, "include_hidden"),
      );
      addNumberFlag(argv, "--timeout-ms", optionalNumber(arguments_, "timeout_ms"));
      addNumberFlag(argv, "--poll-ms", optionalNumber(arguments_, "poll_ms"));
      return argv;
    },
    presentation: presentation("Wait for browser text", "read"),
  },
  {
    name: "lexmount_browser_click",
    description:
      "Click the first element matching a CSS selector. The page may navigate, submit data, or cause other external side effects.",
    parameters: {
      session_id: sessionId,
      selector: {
        type: "string",
        required: true,
        description: "CSS selector to click.",
      },
    },
    argv: (arguments_) => [
      "action",
      "click",
      "--session-id",
      requiredString(arguments_, "session_id"),
      "--selector",
      requiredString(arguments_, "selector"),
    ],
    presentation: presentation("Click browser element", "execute"),
  },
  {
    name: "lexmount_browser_fill",
    description:
      "Replace the value of the first form control matching a CSS selector and dispatch input/change events. This does not submit the form by itself.",
    parameters: {
      session_id: sessionId,
      selector: {
        type: "string",
        required: true,
        description: "CSS selector for the form control.",
      },
      value: {
        type: "string",
        required: true,
        description: "Value to enter. It is passed through the local process argv, matching browser-cli behavior.",
      },
    },
    argv: (arguments_) => [
      "action",
      "fill",
      "--session-id",
      requiredString(arguments_, "session_id"),
      "--selector",
      requiredString(arguments_, "selector"),
      "--value",
      requiredString(arguments_, "value"),
    ],
    presentation: presentation("Fill browser form control", "edit"),
  },
  {
    name: "lexmount_browser_evaluate",
    description:
      "Execute arbitrary JavaScript in the first page target and return its JSON-serializable result. This is a high-risk escape hatch; prefer typed browser tools when they can express the task.",
    parameters: {
      session_id: sessionId,
      expression: {
        type: "string",
        required: true,
        description: "JavaScript expression to execute. It is passed through local process argv.",
      },
    },
    argv: (arguments_) => [
      "action",
      "eval",
      "--session-id",
      requiredString(arguments_, "session_id"),
      "--expression",
      requiredString(arguments_, "expression"),
    ],
    presentation: presentation("Evaluate browser JavaScript", "execute"),
  },
  {
    name: "lexmount_browser_snapshot",
    description:
      "Read the first page target's URL, title, complete innerText, and complete outerHTML. The result is intentionally not truncated by this plugin.",
    parameters: { session_id: sessionId },
    argv: (arguments_) => [
      "action",
      "snapshot",
      "--session-id",
      requiredString(arguments_, "session_id"),
    ],
    presentation: presentation("Read Lexmount browser page", "read"),
  },
  {
    name: "lexmount_browser_screenshot",
    description:
      "Capture a PNG screenshot and return it as a durable DSH image attachment. If output_path is provided, also keep the PNG at that host path.",
    parameters: {
      session_id: sessionId,
      output_path: {
        type: "string",
        description: "Optional destination path. When omitted, a temporary file is removed after attachment storage.",
      },
      full_page: {
        type: "boolean",
        description: "Capture the full scrollable page.",
      },
    },
    outputKind: "screenshot",
    argv: (arguments_) => {
      const output = optionalString(arguments_, "output_path");
      if (output === undefined) {
        throw new TypeError("screenshot output path must be supplied by the runtime");
      }
      const argv = [
        "action",
        "screenshot",
        "--session-id",
        requiredString(arguments_, "session_id"),
        "--path",
        output,
      ];
      addBooleanFlag(argv, "--full-page", optionalBoolean(arguments_, "full_page"));
      return argv;
    },
    presentation: presentation("Capture Lexmount browser screenshot", "read"),
  },
  {
    name: "lexmount_browser_pdf",
    description:
      "Print the first page target to a PDF file on the DSH host. The result returns the path; DSH RC.6 has no generic binary attachment block.",
    parameters: {
      session_id: sessionId,
      output_path: outputPath,
      print_background: {
        type: "boolean",
        description: "Include CSS backgrounds in the PDF.",
      },
    },
    argv: (arguments_) => {
      const argv = [
        "action",
        "pdf",
        "--session-id",
        requiredString(arguments_, "session_id"),
        "--path",
        requiredString(arguments_, "output_path"),
      ];
      addBooleanFlag(
        argv,
        "--print-background",
        optionalBoolean(arguments_, "print_background"),
      );
      return argv;
    },
    presentation: presentation("Print Lexmount browser page to PDF", "edit"),
  },
  {
    name: "lexmount_browser_raw_cdp",
    description:
      "Execute an arbitrary Chrome DevTools Protocol command in the first page target. This is a high-risk escape hatch; prefer typed browser tools when they can express the task. CDP control WebSocket addresses are redacted from results.",
    parameters: {
      session_id: sessionId,
      method: {
        type: "string",
        required: true,
        description: "CDP method such as Runtime.evaluate.",
      },
      params: {
        type: "json",
        description: "CDP parameters object. Defaults to an empty object.",
      },
    },
    argv: (arguments_) => [
      "action",
      "raw",
      "--session-id",
      requiredString(arguments_, "session_id"),
      "--method",
      requiredString(arguments_, "method"),
      "--params-json",
      JSON.stringify(arguments_.params ?? {}),
    ],
    presentation: presentation("Run raw browser CDP command", "execute"),
  },
] as const;

export const TOOL_NAMES = TOOL_SPECS.map((spec) => spec.name);
