# `@lexmount/dsh-browser`

Lexmount cloud browser tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). This package is a lightweight DSH Bundle: it registers native model tools and invokes the Rust `browser-cli`, but it does not contain a native executable, run an MCP server, or depend on the Lexmount Node.js SDK.

> Status: preview releases are published on npm under the `next` tag. Use `next` until Windows and macOS validation is complete.

> **Current platform support:** Windows x64 and macOS Apple Silicon only. Linux and macOS Intel do not currently have official downloadable `browser-cli` assets and are not supported by this pre-release.

## Runtime architecture

```text
DSH Web / Headless
  → @lexmount/dsh-browser (Bundle and Node adapter only)
  → pinned browser-cli download and user cache
  → browser-cli child process
  → Lexmount API / CDP / cloud browser
```

The Bundle registers tools without accessing the network. On the first tool call it selects the current OS/CPU asset, downloads the pinned `browser-cli` release and `SHA256SUMS` from Lexmount's versioned Tencent COS path, verifies the digest, executable format, static Linux contract, and CLI version, then installs it atomically in a user cache. Later calls and restarts reuse the verified cache, so an already populated cache works offline.

The npm tarball contains no `browser-cli` or `browser-cli.exe` file. End users do not need Rust, Python, a browser driver, or an npm lifecycle script.

## Platform status

| Host | Release asset target | Current status |
| --- | --- | --- |
| Windows x64 | `x86_64-pc-windows-msvc` | Supported |
| macOS Apple Silicon | `aarch64-apple-darwin` | Supported |
| macOS Intel | `x86_64-apple-darwin` | Not currently supported; asset missing |
| Linux x64 | `x86_64-unknown-linux-musl` | Not currently supported; asset missing |

`native-source.json` pins `browser-cli` v1.1.12 at commit `f0ad71be2fb7f34413a08a4eaf630dfd22c6c2a4`. This pre-release intentionally uses the two assets published by that immutable release. Adding Linux or macOS Intel requires a new browser-cli version and a new npm package version with fresh validation; it will not mutate this release in place.

## Install

Install the current npm pre-release:

```bash
corepack enable pnpm
npx --yes @deepseek-ai/dsh@0.1.0-rc.6 plugin --profile web add @lexmount/dsh-browser@next
npx --yes @deepseek-ai/dsh@0.1.0-rc.6 web
```

Keep `@next` in preview installations; do not rely on npm's implicit `latest` tag until this release line is formally promoted.

DSH RC.6 delegates plugin installation to a `pnpm` executable on `PATH`; it does not bundle that executable. If Corepack cannot create the shim, install pnpm through the normal Node package-manager setup and verify `pnpm --version` first.

For unattended use, install the same Bundle into the Headless profile:

```bash
npx --yes @deepseek-ai/dsh@0.1.0-rc.6 plugin --profile headless add @lexmount/dsh-browser@next
```

The supported Harness range is `>=0.1.0-rc.6 <0.2.0`. DSH remains a release candidate, so each DSH upgrade requires installation and tool-registration regression testing.

## First use and cache

1. Run `lexmount_doctor`. The first call may download the current platform executable.
2. If credentials are missing, run `lexmount_auth_login` from the interactive Web profile and approve access in the system browser.
3. Create a temporary Session, or select/create a persistent Context when login state must be reused.
4. Navigate, inspect with `lexmount_browser_snapshot`, then use typed wait/click/fill tools.
5. Close temporary Sessions when finished.

Default cache locations are:

| Platform | Cache root |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Lexmount\dsh-browser` |
| macOS | `~/Library/Caches/Lexmount/dsh-browser` |
| Linux | `${XDG_CACHE_HOME:-~/.cache}/lexmount/dsh-browser` |

Set `LEXMOUNT_BROWSER_CLI_CACHE_DIR` to choose another cache root. `LEXMOUNT_BROWSER_CLI_PATH` is an explicit administrator/developer override for a preinstalled CLI; that path is still checked for format and version, but its trust is controlled by whoever sets the environment variable.

The login flow stores credentials at the existing `browser-cli` location and never asks the user to paste an API key into chat. Headless runs must authenticate beforehand because the PKCE flow requires an interactive system browser.

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

- Downloads use a fixed HTTPS origin and version path. The matching `SHA256SUMS` entry, executable format, platform architecture, expected CLI version, and cache metadata are verified before execution.
- A cancelled first call cancels its download when no other call is waiting. Plugin disposal cancels downloads and terminates owned child processes.
- Model input is passed as a child-process argument array with `shell: false`; it is never concatenated into a shell command.
- API keys, Authorization fields, `ws`, and Chrome DevTools WebSocket URLs are removed from returned data and diagnostics.
- Tool guidance tells the model to obtain user confirmation before purchases, publication, destructive remote actions, and account/security changes.
- JavaScript evaluation and raw CDP remain model-visible to match the existing WorkBuddy plugin.

DSH RC.6 does not expose MCP-style side-effect annotations on native tools. UI presentation categories are not permission enforcement. See [DSH RC.6 integration gaps](docs/dsh-rc6-gaps.md).

## Known browser-cli limitations

The first release intentionally retains behavior already shipped through WorkBuddy:

- URL, form value, JavaScript, metadata, and raw CDP params are visible in local process argv;
- each action connects independently and selects the first page target;
- ordinary interaction is limited to wait, click, and fill; there is no ACE, hover, press, select, check, drag, or file upload;
- CDP commands do not have complete internal deadlines or reconnect/replay behavior;
- snapshot returns complete page text and HTML;
- credential writes and Windows ACL behavior are unchanged;
- Windows binaries are not Authenticode-signed in the first release;
- output paths are not restricted by an additional plugin sandbox.

## Development

```bash
npm install
npm run check
npm run package:verify
```

On a currently supported host, test a locally built v1.1.12 CLI without changing the package:

```bash
LEXMOUNT_BROWSER_CLI_PATH=/absolute/path/to/browser-cli npm run test:native
```

Verify the pinned remote assets, then run the real current-platform integration test on Windows x64 or macOS Apple Silicon:

```bash
npm run native:assets
npm run test:native
```

The `browser-cli-rs` repository owns native builds, macOS signing/notarization, checksums, and COS publication. This repository verifies those immutable inputs and publishes only the lightweight npm wrapper. See [release procedure](docs/release.md), [manual platform validation](docs/manual-platform-validation.md), [release access readiness](docs/release-access.md), and [implementation status](docs/implementation-status.md).
