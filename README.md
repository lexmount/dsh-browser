# `@lexmount/dsh-browser`

Lexmount cloud browser tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The package is a DSH Bundle: it registers native model tools and invokes the bundled Rust `browser-cli` directly. It does not run an MCP server and does not require Rust, Python, or a browser driver on an end-user machine.

> Status: pre-release implementation. The package has not been published to npm yet.

## Supported hosts

| Host | Release target |
| --- | --- |
| Windows x64 | `x86_64-pc-windows-msvc` |
| macOS Apple Silicon | `aarch64-apple-darwin` |
| macOS Intel | `x86_64-apple-darwin` |
| Linux x64 | `x86_64-unknown-linux-musl` |

All four executables ship in one npm package. Runtime selection uses `process.platform` and `process.arch`; every executable is checked against the package manifest, SHA-256 digest, and required `browser-cli` version before tools are registered.

## Install

After the first npm pre-release is available:

```bash
corepack enable pnpm
npx --yes @deepseek-ai/dsh@0.1.0-rc.6 plugin --profile web add @lexmount/dsh-browser@next
npx --yes @deepseek-ai/dsh@0.1.0-rc.6 web
```

DSH RC.6 delegates plugin installation to a `pnpm` executable on `PATH`; it does not bundle that executable. If Corepack cannot create the shim in your Node installation, install pnpm through your normal Node package-manager setup and confirm `pnpm --version` before running `dsh plugin`.

For unattended use, install the same Bundle into the headless profile:

```bash
npx --yes @deepseek-ai/dsh@0.1.0-rc.6 plugin --profile headless add @lexmount/dsh-browser@next
```

The supported Harness line is `>=0.1.0-rc.6 <0.2.0`. DSH remains a release candidate, so every DSH upgrade requires an installation and tool-registration regression run.

## First use

1. Run `lexmount_doctor`.
2. If credentials are missing, run `lexmount_auth_login` from the interactive Web profile and approve access in the system browser.
3. Create a temporary session with `lexmount_session_create`, or select/create a persistent Context when login state must be reused.
4. Navigate, inspect with `lexmount_browser_snapshot`, then use typed wait/click/fill tools.
5. Close temporary sessions with `lexmount_session_close`.

The login flow stores credentials at the existing `browser-cli` location and never asks the user to paste an API key into chat. Headless runs must be authenticated beforehand because the current PKCE flow requires an interactive system browser.

## Tool surface

The Bundle registers 31 native tools:

- diagnostics and authentication: version, doctor, auth status/login/logout;
- Sessions: create/get/list/close/keepalive/targets;
- downloads: list/get/archive/delete;
- Contexts: create/get/list/fork/delete/force-release;
- browser actions: open URL, wait selector/text, click, fill, snapshot, screenshot, PDF;
- escape hatches: arbitrary page JavaScript and raw CDP.

Screenshot results are persisted through the DSH image attachment service. PDF and download tools write to the requested host path and return that path because DSH `0.1.0-rc.6` has no generic binary attachment content block.

## Security and behavior

- Model input is passed as a child-process argument array with `shell: false`; it is never concatenated into a shell command.
- DSH cancellation terminates the owned `browser-cli` child process; plugin disposal terminates remaining children.
- API keys, Authorization fields, `ws`, and Chrome DevTools WebSocket URLs are removed from returned structured data and diagnostic text.
- Tool descriptions and system guidance tell the model to obtain user confirmation before purchases, publication, destructive remote actions, and account/security changes.
- JavaScript evaluation and raw CDP are intentionally model-visible to match the existing WorkBuddy plugin. They are high-risk escape hatches and should be used only when typed actions cannot express the task.

DSH RC.6 does not expose MCP-style side-effect annotations on native tools. UI presentation categories are not permission enforcement. See [DSH RC.6 integration gaps](docs/dsh-rc6-gaps.md) for the exact impact.

## Known browser-cli limitations

The first release intentionally retains the behavior already shipped through WorkBuddy:

- URL, form value, JavaScript, metadata, and raw CDP params are visible in the local process argv;
- each action connects independently and selects the first page target;
- ordinary interaction is limited to wait, click, and fill; there is no ACE, hover, press, select, check, drag, or file upload;
- CDP commands do not have complete internal deadlines or reconnect/replay behavior;
- snapshot returns complete page text and HTML;
- login still uses the existing Codex/WorkBuddy route and wording;
- credential writes and Windows ACL behavior are unchanged;
- Windows binaries are not Authenticode-signed in the first release;
- output paths are not restricted by an additional plugin sandbox.

## Development

```bash
npm install
npm test
```

Stage a real native binary for the current host and run the native integration test:

```bash
node scripts/stage-binary.mjs \
  --target linux-x64 \
  --source /absolute/path/to/browser-cli
npm run vendor:verify
npm run test:native
```

`native-source.json` pins the exact browser-cli repository commit and four Rust targets. Release CI builds each target, signs and notarizes both macOS binaries, generates `vendor/manifest.json`, verifies every digest, and assembles one npm tarball.

See [manual platform validation](docs/manual-platform-validation.md) before promoting a pre-release to `latest`.
Current repository, npm, environment, and signing prerequisites are tracked in [release access readiness](docs/release-access.md).
Completed checks and remaining release gates are tracked in [implementation status](docs/implementation-status.md).
