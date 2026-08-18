# Manual platform validation

Run this checklist against the exact npm tarball that will be published. The current pre-release supports Windows x64 and macOS Apple Silicon only. Record OS version, CPU architecture, Node version, DSH version, npm package version, browser-cli version, npm tarball SHA-256, downloaded asset name, and downloaded asset SHA-256.

## Package and installation

1. Verify the tarball against the workflow `SHA256SUMS`.
2. List the tarball and confirm it contains `lib/`, `native-source.json`, Bundle metadata, docs, and license, but no `vendor/`, `browser-cli`, or `browser-cli.exe`.
3. Start from a clean disposable DSH profile and a clean `LEXMOUNT_BROWSER_CLI_CACHE_DIR`.
4. Install the tarball with `dsh plugin --profile <profile> add <tarball>`.
5. Confirm installation and tool registration do not download a native asset.
6. Start the Web profile and confirm all 31 `lexmount_*` tools register without warnings.
7. Remove the Bundle and confirm its patch layer and tools disappear.

## First download and cache

1. Reinstall, run `lexmount_doctor`, and confirm the first tool call downloads exactly the current platform asset from the pinned v1.1.12 COS path.
2. Compare the cached executable hash with its `SHA256SUMS` entry.
3. Confirm cache metadata records v1.1.12, commit `f0ad71be2fb7f34413a08a4eaf630dfd22c6c2a4`, platform target, asset name, and digest.
4. Disconnect outbound network access, restart DSH, and confirm the verified cache still runs.
5. Corrupt a disposable copy of the cache, restore network access, and confirm the next call refuses the corrupt file and replaces it from the pinned release.
6. Cancel a first-use download and confirm no temporary executable is selected or left as the active cache entry.

## Authentication

1. Run auth status and doctor while logged out.
2. Start login from the Web profile and complete the system-browser PKCE flow.
3. Confirm doctor reports ready without exposing the API key.
4. Restart DSH and confirm credentials remain usable.
5. Log out and confirm only the credential file is removed.

## Browser lifecycle

1. Create a temporary Session and confirm returned CDP WebSocket fields are redacted.
2. Open a public page, snapshot it, wait for a selector and text, click, and fill a non-sensitive form.
3. Run evaluate and a harmless raw CDP command.
4. Capture viewport and full-page screenshots and confirm the image renders in DSH.
5. Print a PDF to a workspace path and confirm the file is valid.
6. Enable downloads, download a harmless fixture, retrieve it, archive downloads, then delete downloads.
7. Close the Session and confirm it becomes inactive.

## Persistent Context

1. Create a Context with description and metadata.
2. Create a read-write Session using it, set harmless browser state, then close normally.
3. Reopen the Context and confirm state is retained.
4. Fork it and verify the new Context is independent.
5. Delete the test Contexts.
6. Exercise force-release only with a deliberately abandoned test Session.

## Cancellation and cleanup

1. Cancel a long wait and confirm the local browser-cli process exits.
2. Stop DSH during an active tool call and confirm no browser-cli child remains.
3. Confirm temporary screenshot directories are removed after success, failure, and cancellation.

## Platform-specific checks

### Windows x64

- Asset: `browser-cli-v1.1.12-x86_64-pc-windows-msvc.exe`.
- SmartScreen/antivirus behavior is documented for the unsigned binary.
- Cache paths containing spaces and non-ASCII characters work.
- The CLI reports v1.1.12 and cancellation leaves no `browser-cli.exe` process.

### macOS Apple Silicon

- Asset: `browser-cli-v1.1.12-aarch64-apple-darwin`.
- `codesign --verify --strict` succeeds.
- Gatekeeper accepts the notarized executable on a clean machine.
- The process is native arm64 and reports browser-cli v1.1.12.

macOS Intel and Linux are not part of this pre-release validation because the pinned native release has no assets for them.

## Headless profile

1. Authenticate beforehand.
2. Run a non-interactive open/snapshot/screenshot/close workflow.
3. Confirm a missing credential produces an actionable interactive-login requirement instead of a false success.
