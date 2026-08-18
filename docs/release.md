# Release procedure

The npm package is a wrapper only. Native executables are released first by `lexmount/browser-cli-rs`; this repository never builds or embeds them.

## Required release order

1. Publish the pinned `browser-cli` version from `lexmount/browser-cli-rs`.
2. Confirm its version tag resolves to the commit in `native-source.json`.
3. Confirm the COS `SHA256SUMS` and both currently supported assets are public:
   - `aarch64-apple-darwin`;
   - `x86_64-pc-windows-msvc.exe`.
4. Run `npm run release:check`. It verifies the lightweight package, the GitHub tag/commit, and downloads both remote assets to verify their published SHA-256 digests.
5. Only then create and push the matching `@lexmount/dsh-browser` version tag; the tag push starts its release automatically.

The current npm pre-release supports Windows x64 and macOS Apple Silicon only. Linux x64 and macOS Intel require a later browser-cli release and a new npm package version.

## GitHub Action: assemble and publish the npm wrapper

`.github/workflows/release.yml` runs automatically when an exact `v*` version tag is pushed. Merging a pull request or pushing `main` runs CI but does not publish a release:

1. `assemble` checks that the pushed ref is exactly `v<package.json version>`.
2. It uses Node 24.15.0 and pins npm 12.0.2. npm Trusted Publishing requires npm 11.5.1 or later.
3. `npm ci` installs locked development dependencies.
4. `npm run release:check` runs Node tests, verifies that the npm file list contains no executable, and fully downloads both supported remote assets to compare them with the pinned checksum manifest.
5. `npm pack` produces one lightweight tarball. The workflow rejects any `package/vendor/`, `browser-cli`, or `browser-cli.exe` entry.
6. The tarball, `SHA256SUMS`, and `native-source.json` become one immutable `npm-package` artifact.
7. The workflow maps versions containing a prerelease suffix to the npm `next` tag and versions without a prerelease suffix to `latest`.
8. The `npm` environment releases that exact artifact through OIDC; no rebuild occurs. If environment reviewers are configured, this job waits for their approval.
9. npm publish-time scanning makes new versions temporarily unavailable. The workflow waits up to 25 minutes, downloads the exact public version, and compares its SHA-256 with the assembled artifact.
10. Only after the public registry comparison succeeds does a separate job attach the same tarball, checksum, and source pin to the matching GitHub Release.

The workflow never needs Rust, Apple signing secrets, COS credentials, or native build runners. Those belong to the upstream browser-cli release.

## Bootstrap npm publication record

The first version could not use Trusted Publishing because npm required the package to exist before its Publisher could be configured. It was therefore published interactively on 2026-08-18 with npm web authentication:

```bash
npm publish --access public --tag next
```

Recorded result:

- package: `@lexmount/dsh-browser@0.1.0-rc.0`;
- npm SHA-1: `a76b0fc017ef56c21e2eb080b63423f2a48012a2`;
- tarball SHA-256: `10edac9849e4ded35c8b15afa125680d9bd0a9ac0a0843d69ef57170cea05fa8`;
- npm integrity: `sha512-4EsVaX2qwMXiCkGOLXobuFF948jACFZ0WYmg/yzce9Ryb/kD6p5KTE3MyNpvSNuton5Z9LqvJaA+j6i4YuXabA==`;
- npm publish-time scanning passed and a fresh public-registry download matched the local tarball byte-for-byte;
- clean DSH RC.6 Web and Headless profiles installed `@lexmount/dsh-browser@next`, and Web returned HTTP 200;
- annotated Git tag `v0.1.0-rc.0` points to commit `ef93ac2ad309447a05608c496aa4ce2e96575816`, the exact release source state.

The publication was requested with `next`, but npm exposed both `next` and `latest` for this first package version. An authenticated removal of `latest` returned HTTP 400. Preview installation instructions therefore continue to name `@next` explicitly.

## Configure npm Trusted Publishing

After the package exists, configure its Trusted Publisher on npmjs.com with:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization | `lexmount` |
| Repository | `dsh-browser` |
| Workflow filename | `release.yml` |
| Environment | `npm` |
| Allowed action | `npm publish` |

Create the GitHub `npm` environment with required reviewers. The publish job has `contents: read` and `id-token: write`; it uses a GitHub-hosted runner and no long-lived npm token.

Once OIDC publishing is proven, set npm publishing access to require 2FA and disallow traditional tokens. Trusted publishing from a public source repository automatically produces npm provenance; a private repository can publish through OIDC but does not receive public provenance.

The package is currently treated as ordinary authorized browser automation. If the owner instead classifies its arbitrary JavaScript/raw CDP capabilities as dual-use under npm policy, do not use the direct OIDC publish step above: add the persistent `contentPolicy` metadata and `DISCLOSURE`, stage through OIDC, and require a 2FA promotion. See npm's [Dual-Use Content Policy](https://docs.npmjs.com/policies/dual-use/).

## Later pre-releases

1. Update `package.json` and `package-lock.json` to a new unused pre-release version.
2. Update `native-source.json` and the matching constants/tests only when moving to a different reviewed browser-cli release.
3. Merge the version change through a pull request and wait for `main` CI to pass.
4. Create and push the exact `v<package version>` tag on that merged commit.
5. The tag push starts `assemble-release` automatically and selects npm `next` for the prerelease version.
6. If the `npm` environment requires review, approve the publish job after the assembly checks pass. The same bytes are published and attached to the GitHub Release.

An npm name/version pair can never be reused, even after unpublishing. Do not rebuild or republish an existing version.

## Stable promotion

Create a version without a prerelease suffix only after Windows x64, macOS Apple Silicon, and real Lexmount service validation are complete; its tag-triggered release publishes to npm `latest` automatically. During preview, `next` is the documented channel even though npm also exposed `latest` for the bootstrap version. If stable product policy still requires Linux, do not create a stable version tag until a later cross-platform version is approved. To promote an already published version without rebuilding it, move `latest` explicitly:

```bash
npm dist-tag add @lexmount/dsh-browser@<version> latest
```

Promotion changes only the dist-tag. It must not rebuild the package or native executable.
