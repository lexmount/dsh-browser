# Implementation status

Status captured on 2026-08-18 for `@lexmount/dsh-browser@0.1.0-rc.0`. The npm wrapper is implemented locally; stable publication is still blocked by native assets and external validation.

## Completed locally

- DSH Bundle manifest and Cordis patch implemented.
- All 31 frozen browser-cli capabilities registered as DSH native tools, including evaluate and raw CDP.
- Node adapter uses `spawn` argument arrays with `shell: false`, forwards cancellation, terminates owned children, parses the existing JSON envelope, preserves CLI error codes through DSH's `HarnessError` channel, and recursively redacts secrets and CDP control URLs.
- Package loading and tool registration do not access the network or require a native executable.
- First tool use resolves the current platform, checks an administrator-provided `LEXMOUNT_BROWSER_CLI_PATH` or a versioned user cache, then downloads from the pinned COS release when needed.
- Download installation verifies the exact `SHA256SUMS` entry, a 128 MiB size limit, executable format/architecture, static Linux ELF contract, CLI version, and cache metadata before atomically replacing the cached file.
- Concurrent first calls share one resolution; cancellation stops the download when no waiter remains; plugin disposal cancels resolution and terminates active child processes.
- Screenshot output is stored through the DSH image attachment service; temporary screenshot files are removed. RC.6 PDF/download attachment limitations are documented separately.
- `npm run check` passes 21 automated tests covering source/target pins, deferred unsupported-platform errors, checksum parsing, executable rejection paths, explicit-path resolution, protocol parsing, redaction, cancellation, forced cleanup, schema/argv mapping, 31-tool registration, and screenshot cleanup.
- `npm run package:verify` reports a 24-file npm payload and rejects any native executable path. The current unpacked wrapper is about 105 KiB.
- `npm run native:assets` resolves the official v1.1.12 tag to the pinned commit, downloads the Windows x64 and macOS ARM64 assets from COS, and verifies both SHA-256 digests successfully.
- `npm audit --omit=dev` reports zero known vulnerabilities.
- The release workflow uses tag-only assembly, pins Node 24.15.0 and npm 12.0.2, creates one tarball, verifies it contains no executable, and passes the exact artifact through the npm environment approval gate without rebuilding.
- The previous bundled Linux binary and all `vendor/` package entries have been removed from the working tree.
- A newly packed lightweight tarball installs through the real DSH RC.6 `dsh plugin`/pnpm path into clean disposable Web and Headless profiles without peer warnings. Both composed configs contain exactly one `lexmount-browser` entry.
- The clean Web profile boots successfully on an OS-assigned port and returns HTTP 200. This proves unsupported Linux is deferred until tool resolution instead of breaking Bundle registration. The Headless profile reaches its native help path. Neither load path downloads a CLI.

## Native source currently pinned

- repository: `https://github.com/lexmount/browser-cli-rs.git`;
- version: `1.1.12`;
- tag commit: `f0ad71be2fb7f34413a08a4eaf630dfd22c6c2a4`;
- COS base: `https://cli-bin-1377899528.cos.ap-nanjing.myqcloud.com/releases/browser-cli/v1.1.12`.

The upstream v1.1.12 Action completed successfully and published macOS ARM64 and Windows x64. Those are the only platforms claimed by this npm pre-release. Linux x64 and macOS Intel are deferred to a new native and npm version.

## Not yet complete

- Because the current host is Linux and Linux is not supported by this pre-release, the runtime download/native integration test must be completed on Windows x64 and macOS Apple Silicon.
- Real Lexmount authentication, Session, Context, browser action, screenshot, PDF/download, cancellation, cleanup, and Headless service E2E remain pending.
- Windows x64 and macOS Apple Silicon remain manual-platform work. No claim is made that they passed from this Linux host.
- `https://github.com/lexmount/dsh-browser` is private and empty, so this repository's CI/release workflow cannot run yet.
- The current machine is not authenticated to npm, `@lexmount/dsh-browser` returns npm 404, and the first package version must be published interactively before Trusted Publishing can be configured.
- npm scope permission, account 2FA, GitHub `npm` environment/reviewers, repository visibility, and MIT license approval remain external release gates.
- DSH RC.6 cannot enforce generic per-tool side-effect metadata or generic PDF/download attachments. See [DSH RC.6 integration gaps](dsh-rc6-gaps.md).

The npm artifact is structurally release-ready for its stated two-platform pre-release. External repository, npm authentication, legal approval, DSH regression, and real Windows/macOS validation still block publication.
