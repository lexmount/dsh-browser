# Release access status

Observed on 2026-08-18. These are external publication and account facts, not browser-runtime validation claims.

## Confirmed available

- `browser-cli` v1.1.12 is an official public tag at commit `f0ad71be2fb7f34413a08a4eaf630dfd22c6c2a4`.
- Its GitHub release and COS path publicly expose the two assets claimed by this npm pre-release: Windows x64 and macOS ARM64.
- `npm run native:assets` downloads both files and verifies their pinned SHA-256 digests.
- npm account `lexmount` has read-write access to `@lexmount/dsh-browser`.
- `@lexmount/dsh-browser@0.1.0-rc.0` was published interactively with npm web authentication and is public.
- npm publish-time scanning completed, and the public registry tarball is byte-for-byte identical to the local release tarball. Its SHA-256 is `10edac9849e4ded35c8b15afa125680d9bd0a9ac0a0843d69ef57170cea05fa8`.
- Clean DSH RC.6 Web and Headless profiles installed `@lexmount/dsh-browser@next` from the public registry. Each composed config contains exactly one `lexmount-browser` entry, and the clean Web profile returned HTTP 200.
- `https://github.com/lexmount/dsh-browser` now contains `main` and the annotated `v0.1.0-rc.0` tag. The tag points to the exact source state used for the published tarball.
- GitHub Actions CI run `32095403677` passed on Node 22.14.0 and Node 22.22.2.
- Tag-only Action run `32095697452` passed with `publish=false`. Its downloaded `npm-package` artifact, checksum file, and native source pin are valid; the Action tarball is byte-for-byte identical to the public npm tarball.

## Current npm tags

The first publication was requested with `--tag next`. After npm publish-time scanning, the registry exposed both `next` and `latest` at `0.1.0-rc.0`. An authenticated attempt to remove `latest` returned HTTP 400, so both tags remain. Preview documentation explicitly installs `@next`; no stable-support claim is inferred from the registry's `latest` tag.

## Remaining production gates

1. Run the manual download/cache/native integration checklist on Windows x64 and macOS Apple Silicon.
2. Complete real Lexmount authentication, Session, Context, browser action, screenshot, PDF/download, cancellation, cleanup, and Headless service E2E.
3. Create the GitHub `npm` environment and configure its approval policy.
4. Configure npm Trusted Publishing only after the final workflow commit is visible on `main` and CI is green.
5. Decide whether the private GitHub repository should become public. Private repositories can publish through Trusted Publishing but do not receive public npm provenance.
6. Confirm the MIT license and `Copyright (c) 2026 Lexmount` with the owner or legal reviewer.

## npm versions and scanning

- The verified interactive publication used Node v22.22.2 and npm 12.0.2.
- The release workflow pins Node 24.15.0 and npm 12.0.2. npm Trusted Publishing requires npm 11.5.1 or later.
- npm now scans a publish before it becomes available for install. The release workflow waits up to 25 minutes, downloads the public registry tarball, and compares its SHA-256 with the assembled artifact before creating a GitHub Release.

## Dual-use policy checkpoint

The package is intended for authorized browser automation, not penetration testing or security research. It nevertheless exposes arbitrary page JavaScript and raw CDP to match the existing WorkBuddy integration. No npm dual-use declaration was added to `0.1.0-rc.0`, and npm's publication scan accepted the package.

Before changing that classification, review npm's [Dual-Use Content Policy](https://docs.npmjs.com/policies/dual-use/). A dual-use declaration is persistent and would change the release architecture: direct Trusted Publishing is not permitted for declared dual-use packages; OIDC may only stage them, followed by a 2FA-enforced promotion.

## Owner actions

1. Review the final pushed workflow and confirm the ordinary browser-automation classification, MIT license, and repository visibility.
2. Create the GitHub `npm` environment with any required reviewers.
3. Configure npm Trusted Publishing for organization/user `lexmount`, repository `dsh-browser`, workflow filename `release.yml`, and environment `npm`.
4. Complete Windows x64 and macOS Apple Silicon validation against the exact public npm version.
5. Publish the next unused npm version through the tag-only Action and verify OIDC, the npm scanning wait, and the matching GitHub Release.
