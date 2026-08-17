# Implementation status

Status captured on 2026-08-17 for `@lexmount/dsh-browser@0.1.0-rc.0`. This file distinguishes implemented behavior from release-complete validation.

## Completed locally

- DSH Bundle manifest and Cordis patch implemented.
- All 31 frozen browser-cli capabilities registered as DSH native tools, including evaluate and raw CDP.
- Node adapter uses `spawn` argument arrays with `shell: false`, forwards `AbortSignal`, terminates owned children, parses the existing JSON envelope, preserves CLI error codes through DSH's `HarnessError` channel, and recursively redacts secrets and CDP control URLs.
- Current-platform binary selection validates the exact pinned repository, commit, CLI version, target, package path, executable format, executable permission, and SHA-256 before registration; Linux additionally rejects ELF files with a dynamic program interpreter.
- Screenshot output is stored through the DSH image attachment service; temporary screenshot files and their non-durable paths are removed. RC.6 PDF/download attachment limitations are documented separately.
- `npm run check` passes 19 automated tests covering binary rejection paths, protocol parsing, structured and labeled-text redaction, cancellation, forced cleanup of a child that ignores graceful termination, schema/argv mapping, 31-tool registration, and screenshot cleanup/attachment rendering.
- The complete Node check passes on both the declared minimum Node `22.14.0` (npm `10.9.2`) and the CI-pinned Node `22.22.2`; CI runs both versions.
- The pinned `browser-cli-rs` commit passes `cargo fmt --check`, all 9 Rust unit tests, and Clippy with warnings denied under Rust 1.93.1 on this Linux host.
- A true static-PIE `x86_64-unknown-linux-musl` binary was built from the pinned Rust commit with the Ubuntu `musl`, `musl-dev`, and `musl-tools` 1.2.4-2 packages extracted under `/tmp` (no system package installation). `file`, `ldd`, and ELF program-header checks confirm that it is x86-64, statically linked, and has no dynamic interpreter. Its staged SHA-256 is `a148a44421555414a5bf69a73a73995a238ed267a4b2c0862f2a1fd62f0b83e3`.
- The staged Linux binary passes the package manifest verifier, resolves from the packaged runtime, reports browser-cli `1.1.11`, returns the expected JSON protocol envelope, and accepts the command mapping for every one of the 31 registered tools.
- `npm pack` produces a development tarball containing the compiled Bundle, native-source pin, Linux binary, and matching manifest. The tarball is not a release artifact because the Windows and macOS binaries have not yet been assembled.
- A fresh disposable DSH `0.1.0-rc.6` Web profile successfully installed the Linux development tarball through the real `dsh plugin`/pnpm path without peer-dependency warnings. A separate add/remove composition check produced exactly one `lexmount-browser` row after installation and no Lexmount row after removal.
- The clean profile booted through the real DSH Web launcher. DSH's live plugin-inventory API reported `@lexmount/dsh-browser` as `enabled: true` and `fiberPhase: active`. Of 134 inventory entries, all 108 enabled entries were active and the other 26 were intentionally disabled/unmounted; no enabled entry was failed, pending, loading, or unloading. The installed package exported 31 distinct tool names, and its `BrowserCliError` shared the running host's `HarnessError` identity. Combined with the 31-definition registration test, this proves that the packaged plugin reached and completed its registration path rather than merely appearing in the composed YAML.
- The same tarball installs into a fresh Headless profile without peer warnings, composes exactly one `lexmount-browser` row, and reaches the Headless application's native help path. An authenticated Headless task remains part of service E2E rather than this load check.
- CI and release workflow YAML parse successfully. Release assembly requires all four native artifacts, builds and starts each macOS architecture on a matching native runner, validates architecture and hashes, creates one npm tarball, and passes that exact tarball through the manual approval gate without rebuilding. The npm OIDC job has read-only repository access; GitHub Release creation runs afterward in a separate job that has no OIDC permission.

## Not yet complete

- Real Lexmount authentication, Session, Context, browser action, screenshot, PDF/download, cancellation, cleanup, and Headless service E2E remain pending.
- This host currently has neither a browser-cli credential file nor Lexmount credential environment variables, so the real service E2E must begin with interactive PKCE login.
- Windows x64 and both macOS architectures remain CI/manual-platform work. No claim is made that they passed from this Linux host.
- macOS signing/notarization, GitHub environments/secrets, npm login/scope ownership, the first npm publish, Trusted Publishing, public repository access, and provenance remain external release gates. See [release access readiness](release-access.md).
- DSH RC.6 cannot enforce the frozen architecture's generic per-tool side-effect metadata or generic PDF/download attachments. See [DSH RC.6 integration gaps](dsh-rc6-gaps.md).

The package is therefore an implemented pre-release working tree, not yet a stable publishable artifact.
