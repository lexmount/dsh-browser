# Manual platform validation

Run this checklist against the exact npm tarball that will be promoted. Record OS version, CPU architecture, Node version, DSH version, package version, browser-cli version, and the tarball SHA-256.

## Installation and loading

1. Start from a clean disposable DSH profile.
2. Install the tarball with `dsh plugin --profile <profile> add <tarball>`.
3. Run `dsh --profile <profile> --dump-config` and confirm one `lexmount-browser` row.
4. Start the Web profile and confirm all 31 `lexmount_*` tools register without warnings.
5. Remove the Bundle and confirm the patch layer and tools disappear.

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

- SmartScreen/antivirus behavior is documented for the unsigned first-release binary.
- Paths containing spaces and non-ASCII characters work.
- Cancellation leaves no `browser-cli.exe` process.

### macOS ARM64 and x64

- `codesign --verify --strict` succeeds.
- Gatekeeper accepts the notarized executable on a clean machine.
- Both native architectures report browser-cli `1.1.11`.

### Linux x64

- `file` reports a musl-targeted x86-64 ELF and `ldd` reports a static executable.
- Run on at least one Debian/Ubuntu host and one non-glibc distribution or minimal container.
- System-browser launch and CA certificate discovery work in a desktop environment.

## Headless profile

1. Authenticate beforehand.
2. Run a non-interactive open/snapshot/screenshot/close workflow.
3. Confirm a missing credential produces an actionable interactive-login requirement instead of a false success.
