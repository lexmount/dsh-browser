# Release procedure

## One-time npm setup

1. Confirm the publisher controls the `@lexmount` npm scope and has account 2FA enabled.
2. Complete the first `0.1.0-rc.*` publication interactively because npm cannot configure a Trusted Publisher for a package that does not yet exist. Publish the exact tarball downloaded from the workflow; do not run `npm pack` again.
3. In the npm package settings, bind Trusted Publishing to this GitHub repository and `.github/workflows/release.yml`.
4. Configure the GitHub `npm` environment and the `macos-release` signing/notarization secrets used by the workflow.

No long-lived npm token is required after Trusted Publishing is configured.
Trusted Publishing automatically emits provenance only when the source repository is public. The package does not force `publishConfig.provenance=true`, because that would break the first interactive publication and is unsupported while this repository remains private. See [release access readiness](release-access.md).

## Pre-release

1. Update `package.json` to the intended pre-release version.
2. Keep `native-source.json` pinned to a reviewed browser-cli commit and matching CLI version.
3. Create and push the matching version tag, for example `v0.1.0-rc.0`.
4. For the first package version, run `assemble-release` on that tag with `publish=false`, download the `npm-package` artifact, and complete the manual platform checklist against that exact tarball. Log in locally and publish that downloaded tarball with `--access public --tag next`, then create a GitHub Release containing the same tarball, `SHA256SUMS`, and `manifest.json`.
5. After npm Trusted Publishing is configured, run `assemble-release` on the matching version tag with `publish=true` and `npm_tag=next`. The `npm` GitHub environment must require reviewer approval.
6. While the publish job is waiting for environment approval, download the completed `npm-package` artifact and validate that exact tarball on all required platforms. Approve the environment only after the validation record is complete. The waiting job publishes the same artifact without rebuilding it; only after npm succeeds does a separate, non-OIDC job attach the tarball, `SHA256SUMS`, and native manifest to the matching GitHub Release.

## Stable promotion

Promote only after Windows x64, macOS ARM64, macOS x64, and Linux x64 validation records are complete and the open DSH host limitations are accepted for the release notes.

```bash
npm dist-tag add @lexmount/dsh-browser@<version> latest
```

Do not rebuild between pre-release validation and promotion. The npm version, tarball SHA-256, browser-cli commit, four binary hashes, GitHub run, and macOS notarization records must identify the same artifact set.
