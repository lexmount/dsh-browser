# Release access readiness

Observed on 2026-08-18. These are external prerequisites, not package implementation claims.

## Confirmed available

- `browser-cli` v1.1.12 is an official public tag at commit `f0ad71be2fb7f34413a08a4eaf630dfd22c6c2a4`.
- Its GitHub release and COS path publicly expose the two assets claimed by this npm pre-release: Windows x64 and macOS ARM64.
- `npm run native:assets` downloads both files and verifies their pinned SHA-256 digests.
- `https://github.com/lexmount/dsh-browser` exists and the current GitHub identity has admin permission.
- The required DSH RC.6 packages are installable from the public npm registry.

## Confirmed blockers before publication

1. The `dsh-browser` GitHub repository is private and empty. The local source, CI, and release workflow have not been pushed, so no npm assembly artifact can yet be produced by GitHub Actions.
2. The local npm session is not authenticated: `npm whoami` returns `ENEEDAUTH`.
3. `@lexmount/dsh-browser` returns npm 404. npm requires the package to exist before a Trusted Publisher can be configured, so the first tarball must be published interactively with account 2FA.
4. npm ownership/team permission for the public `@lexmount` scope cannot be verified until login.
5. The GitHub `npm` environment and required reviewer policy cannot be created/verified until the repository has its workflow branch. No npm token should be added; later publishes use OIDC.
6. `package.json` and `LICENSE` declare MIT with `Copyright (c) 2026 Lexmount`. The owner or legal reviewer must approve that public license before first publication.
7. The new lightweight tarball still needs Windows x64 and macOS Apple Silicon manual validation plus real Lexmount service E2E.

## Repository visibility

A private source repository can publish a public npm package through Trusted Publishing, but npm will not create public provenance for it. It also prevents ordinary npm users from opening source, issues, and GitHub Release links. Make the repository public before release if public provenance and public support links are required; visibility changes remain an owner decision.

## npm versions

- The current shell uses Node v22.21.0 and npm 10.9.4, which is too old for npm Trusted Publishing.
- Node v22.22.2 with npm 12.0.2 is already installed locally, but the user must select that Node version before interactive npm administration.
- The release workflow avoids local ambiguity by pinning Node 24.15.0 and npm 12.0.2. npm Trusted Publishing requires npm 11.5.1 or later.

## Owner actions

1. Confirm the MIT license and decide private versus public GitHub visibility.
2. Review and authorize the initial push to `lexmount/dsh-browser`.
3. Run CI and the tag-only release workflow with `publish=false`.
4. Validate the exact Action artifact on Windows x64 and macOS Apple Silicon.
5. Select Node 22.22.2 or newer, run `npm login`, complete 2FA, and verify `npm whoami` plus `@lexmount` publish permission.
6. Publish the verified tarball once with `--access public --tag next`.
7. Configure npm Trusted Publishing for `lexmount/dsh-browser`, workflow `release.yml`, environment `npm`, and allowed action `npm publish`.
8. Create the GitHub `npm` environment with reviewers and test OIDC using a new unused npm version.
