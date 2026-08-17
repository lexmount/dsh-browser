# Release access readiness

Observed on 2026-08-17. These are external-state prerequisites, not implementation claims. Re-run the checks immediately before the first publication.

## Confirmed blockers

1. `https://github.com/lexmount/dsh-browser` is currently **private and empty**. It has no remote default branch, so the workflows in this working tree do not exist on GitHub and cannot run yet. Pushing the initial branch is a separate external action and requires explicit approval.
2. A private source repository can use npm Trusted Publishing, but npm does not generate provenance for a public package published from a private repository. It also makes the package's GitHub homepage, issue tracker, source, and Release artifacts inaccessible to ordinary npm users. Make the repository public before release if those public access and provenance properties are required; changing visibility requires an explicit owner decision.
3. The local npm CLI returns `ENEEDAUTH` for `npm whoami`. The publisher must run `npm login`, complete account-level 2FA, and verify permission to publish public packages in the `@lexmount` scope.
4. `@lexmount/dsh-browser` currently returns npm `E404`, so the first version has not been published. npm cannot configure a Trusted Publisher or staged publishing for a package that does not yet exist. The first verified tarball must be published interactively with 2FA.
5. The GitHub repository currently has no repository Actions secrets, variables, or environments. The `macos-release` environment and its five signing/notarization secrets must exist before macOS jobs can pass:
   - `MACOS_DEVELOPER_ID_APPLICATION_P12_BASE64`
   - `MACOS_DEVELOPER_ID_P12_PASSWORD`
   - `APPLE_NOTARY_APPLE_ID`
   - `APPLE_NOTARY_TEAM_ID`
   - `APPLE_NOTARY_APP_PASSWORD`
6. The `npm` environment does not exist. Create it with required reviewers before enabling workflow publication, then configure npm Trusted Publishing for organization `lexmount`, repository `dsh-browser`, workflow filename `release.yml`, environment `npm`, and the `npm publish` action.
7. DSH RC.6's plugin manager shells out to `pnpm`. This development host can run pnpm only through `corepack pnpm`; there is no `pnpm` executable on `PATH`, so an unmodified local `dsh plugin` command currently exits with its missing-pnpm diagnostic. Enable a pnpm shim before local installation testing. End-user installation documentation must retain this prerequisite until DSH changes its plugin manager.
8. `package.json` and `LICENSE` currently declare MIT with `Copyright (c) 2026 Lexmount`. The owner or legal reviewer must confirm that public licensing choice before the first public npm publication.

## Access that could not be verified

- The current GitHub credential can read this private repository, but it cannot enumerate Lexmount organization-level Actions secrets or variables (`HTTP 403`). Organization-provided macOS secrets may exist, but their availability to this repository is unverified.
- npm scope ownership and team permissions cannot be checked until this machine is authenticated to npm.
- Apple certificate validity, notarization credentials, and environment reviewer configuration cannot be verified without the GitHub environment and a workflow run.

## Confirmed available dependencies

- `https://github.com/lexmount/browser-cli-rs` is public and the pinned commit is readable.
- GitHub Actions is enabled for `dsh-browser`. Its current policy allows all actions and does not require action SHA pinning.
- The required DSH RC.6 packages are installable from the public npm registry in the current development environment.

## Owner actions before first release

1. Confirm the MIT license and copyright holder text.
2. Decide whether the GitHub repository becomes public. Public is recommended for a public user-facing plugin, public issues/releases, and npm provenance.
3. Approve and push the initial `main` branch.
4. Configure the two GitHub environments and macOS secrets, then run the assembly workflow with `publish=false`.
5. Authenticate npm, verify `@lexmount` publish permission and 2FA, and publish the first manually validated tarball.
6. Configure npm Trusted Publishing only after the package exists; then test it with a new pre-release version rather than reusing the first version.
