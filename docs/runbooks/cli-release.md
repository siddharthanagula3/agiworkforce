# CLI Release Runbook

Status: Current
Owner: Platform lead
Last updated: 2026-11-11

Canonical procedure for publishing the `agi` CLI (`apps/cli`) and for every
release after the first.

## Release boundary

- Release tags use `v-cli-<semver>` and must equal the `[package]` version in
  `apps/cli/Cargo.toml`. `.github/workflows/release-cli.yml` refuses any other
  tag, a version whose channel the rollout library derives differently, and a
  tag pushed while `apps/web/public/install.sh` pins no release key.
- A tag run validates the source (formatting, clippy, the CLI test suite, the
  open-source notices), builds six archives, smokes the macOS arm64, Linux x64
  and Windows x64 archives exactly as a user unpacks them, signs the checksum
  manifest twice and publishes a GitHub release:

  | Asset                              | What it is                                                                  |
  | ---------------------------------- | --------------------------------------------------------------------------- |
  | `agiworkforce-darwin-arm64.tar.gz` | macOS Apple silicon (`agi`, `agiworkforce`)                                 |
  | `agiworkforce-darwin-x64.tar.gz`   | macOS Intel                                                                 |
  | `agiworkforce-linux-x64.tar.gz`    | Linux x64, glibc 2.35 or newer                                              |
  | `agiworkforce-linux-arm64.tar.gz`  | Linux arm64, glibc 2.35 or newer                                            |
  | `agiworkforce-windows-x64.zip`     | Windows x64 (`agi.exe`, `agiworkforce.exe`)                                 |
  | `agiworkforce-windows-arm64.zip`   | Windows arm64                                                               |
  | `SHA256SUMS`                       | SHA-256 of every archive                                                    |
  | `SHA256SUMS.sig`                   | P-256 signature by `AGI_CLI_RELEASE_SIGNING_KEY`, pinned in `install.sh`    |
  | `SHA256SUMS.sigstore.json`         | Keyless Sigstore bundle bound to `release-cli.yml@refs/tags/v-cli-<semver>` |

- The binaries themselves carry no platform code signature: no Apple Developer
  ID or notarization, no Windows Authenticode. The signed manifest is the
  integrity check, and the installer and `agi update --install` refuse anything
  it does not cover. The manifest names archives, not versions, so the
  installer also runs the unpacked `agi --version` and refuses a build that
  is not the version it was asked for before replacing anything. Because the installer downloads with `curl`, macOS
  Gatekeeper and Windows SmartScreen do not quarantine the files; a user who
  downloads an archive in a browser instead will see those warnings.
- A manual run of the workflow (Actions tab, or `gh workflow run`) validates
  and builds and smokes all six archives, then stops. It never signs, tags or
  publishes, and needs no signing key. It builds the archives even when the
  source validation job is red, so a failing test does not hide whether they
  compile; a tag builds only source that passed validation.
- The signing job and the release job both run in the protected `cli-release`
  environment, so a tag run waits twice for the owner's approval: once before
  the key is read, once before the release is published. The key is an
  environment secret of `cli-release`; a repository secret would be readable
  by a workflow on any pushed branch. Sentry registration runs afterwards in a
  job of its own with a read-only token.
- The settings this relies on, read 2026-11-11 from GitHub's documentation:
  environments, required reviewers, administrator bypass and deployment tag
  policies
  (<https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments>,
  <https://docs.github.com/en/rest/deployments/environments>,
  <https://docs.github.com/en/rest/deployments/branch-policies>), tag rulesets
  (<https://docs.github.com/en/rest/repos/rules>), and the OIDC subject an
  environment job presents
  (<https://docs.github.com/en/actions/reference/security/oidc>).

## Install channels

| Channel                                                  | Produced by this repository                                                   | Advertised |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| `curl -fsSL https://agiworkforce.com/install.sh \| bash` | Yes: `apps/web/public/install.sh`, served by the web deploy                   | Yes        |
| `agi update --install`                                   | Yes: macOS and Linux; Windows reinstalls with the script from Git Bash or WSL | Yes        |
| VS Code "Install AGI CLI"                                | Yes: runs the install script                                                  | Yes        |
| Desktop app                                              | Yes: the desktop installer bundles its own `agi`                              | Yes        |
| `cargo install --path apps/cli --bin agi`                | Source build                                                                  | README     |
| Homebrew                                                 | `scripts/update-homebrew-tap.sh` writes a formula into a private tap          | No         |
| npm, WinGet, apt/dnf, PowerShell installer               | Nothing                                                                       | No         |

Decision D-2026-09-15-24 keeps an install route out of every document until its
assets and signatures exist. Homebrew stays unadvertised while
`siddharthanagula3/homebrew-tap` is private.

How the leaders ship their CLIs, read 2026-11-11:

- Claude Code (<https://code.claude.com/docs/en/setup>): a native installer for
  macOS, Linux and WSL (`install.sh`), PowerShell (`install.ps1`) and CMD
  (`install.cmd`), plus a Homebrew cask, WinGet, signed apt, dnf and apk
  repositories and npm. Native installs update themselves in the background on
  a `latest` or `stable` channel. Each release publishes a GPG-signed
  `manifest.json` of SHA-256 checksums; macOS binaries are notarized and
  Windows binaries Authenticode-signed.
- Codex CLI (<https://learn.chatgpt.com/docs/codex/cli>): an install script
  (`curl -fsSL https://chatgpt.com/codex/install.sh | sh`) that is also the
  documented update path, with npm, Homebrew and Windows options.

The gaps against them are a native Windows installer, background auto-update,
package-manager channels and platform code signatures. Each needs an owner
decision and, except the Windows installer, an account; none is required for
a first release.

## First release

**Owner** steps need the owner's GitHub admin rights, a secret or a deploy
decision. **Lead** steps can be run from this repository.

1. **Lead. Prove the build matrix.** With `release-cli.yml` on `main`:

   ```bash
   gh workflow run release-cli.yml --ref main
   gh run watch "$(gh run list --workflow release-cli.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
   ```

   Expect "Validate CLI source" and all six "Build" jobs green, and the signing
   and release jobs skipped. A red Windows arm64 or Linux arm64 build is fixed
   here, before any key exists. The workflow has never completed successfully: its latest run, a manual one
   on 2026-11-11, failed.

   Both Linux builds also run "Require the glibc floor the installer
   promises", which prints the newest glibc each binary needs and fails above
   `MIN_GLIBC_VERSION` in `install.sh` (2.35: Ubuntu 22.04, Debian 12). The
   installer refuses an older glibc, and musl, before it downloads anything.
   Linux x64 builds on `ubuntu-22.04`, the oldest image GitHub offers, for
   that reason; when GitHub retires it, raise the floor in `install.sh` and
   in the support article together.

2. **Owner. Protect the release environments and tags, before any signing
   key, publish identity or store credential exists.** This one step covers
   the CLI, VS Code, Open VSX and Chrome releases. A workflow that names a
   missing environment creates it with no protection, and an environment
   secret is only as safe as the rules in front of it. Each of the four
   environments gets the owner as required reviewer and a deployment policy
   that admits only its release tags, so neither a branch push nor a
   `workflow_dispatch` from a branch can reach it:

   ```bash
   REPO=siddharthanagula3/agiworkforce
   REVIEWER_ID=$(gh api users/siddharthanagula3 --jq .id)
   for entry in 'cli-release:v-cli-*' 'vscode-marketplace:v-vscode-*' 'open-vsx:v-vscode-*' 'chrome-web-store:v-ext-*'; do
     name="${entry%%:*}" tag="${entry#*:}"
     printf '{"wait_timer":0,"prevent_self_review":false,"reviewers":[{"type":"User","id":%s}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' "$REVIEWER_ID" \
       | gh api --method PUT "repos/$REPO/environments/$name" --input -
     gh api --method POST "repos/$REPO/environments/$name/deployment-branch-policies" \
       -f name="$tag" -f type=tag
   done
   ```

   "Prevent self-review" stays off while the owner is the only reviewer, or he
   could never approve a tag he pushed. Then, for each of the four, open
   Settings > Environments > the environment, deselect **Allow administrators
   to bypass configured protection rules** and click **Save protection
   rules**; the REST reference lists no field for that setting.

   Restrict who may create, move or delete the release tags with a tag
   ruleset. `actor_id` 5 is the Repository admin role; the REST reference
   does not list role ids, so if GitHub refuses the request, create the same
   ruleset under Settings > Rules > Rulesets > New ruleset > New tag ruleset,
   with Repository admin in the bypass list, the three target patterns below,
   and Restrict creations, Restrict updates, Restrict deletions and Block
   force pushes ticked.

   ```bash
   gh api --method POST "repos/$REPO/rulesets" --input - <<'JSON'
   {
     "name": "release-tags",
     "target": "tag",
     "enforcement": "active",
     "conditions": {
       "ref_name": {
         "include": ["refs/tags/v-cli-*", "refs/tags/v-vscode-*", "refs/tags/v-ext-*"],
         "exclude": []
       }
     },
     "rules": [
       { "type": "creation" },
       { "type": "update", "parameters": { "update_allows_fetch_and_merge": false } },
       { "type": "deletion" },
       { "type": "non_fast_forward" }
     ],
     "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }]
   }
   JSON
   ```

   The ruleset leaves out `v-desktop-*`: a manual desktop release creates its
   tag with the Actions token when it publishes the draft release, which a
   creation rule would refuse.

3. **Owner. Prove the protection** with the read-only probe. It makes only
   `gh api` GET calls and fails when any of the four environments is missing,
   has no required reviewer, lets administrators bypass it, or admits anything
   but its tags; when `AGI_CLI_RELEASE_SIGNING_KEY` is a repository secret;
   and when no active tag ruleset restricts the release tags.

   ```bash
   node scripts/release/check-release-environments.mjs
   ```

   Run it again after every change to these settings. Do not create a key or
   an identity until it prints `OK`.

4. **Owner. Create the release signing key**, offline, and keep the private
   half in the password manager. It is never committed and never leaves the
   machine except into the environment secret below.

   ```bash
   openssl ecparam -name prime256v1 -genkey -noout -out agi-cli-release.key
   openssl ec -in agi-cli-release.key -pubout -out agi-cli-release.pub
   ```

5. **Owner. Store the private key as an environment secret of `cli-release`**,
   never as a repository secret. Only a job that declares `cli-release`, runs
   for a `v-cli-*` tag and has the owner's approval can read it.

   ```bash
   gh secret set AGI_CLI_RELEASE_SIGNING_KEY --env cli-release --repo siddharthanagula3/agiworkforce < agi-cli-release.key
   node scripts/release/check-release-environments.mjs
   ```

   Optional, for crash reports: repository secret `SENTRY_DSN_CLI` (baked
   into the binary by the build jobs, which run in no environment, so an
   environment secret of that name is never read), repository secret
   `SENTRY_AUTH_TOKEN` and variables `SENTRY_ORG` and `SENTRY_PROJECT_CLI`
   (release registration). Without them the release still publishes and logs
   a warning.

6. **Lead. Pin the public key** with the one command that writes it, never by
   hand. It adds the key to `RELEASE_SIGNING_KEY` in
   `apps/web/public/install.sh`, in the layout the pin guard, the installer,
   `agi update` and the release jobs all read, and refuses a key that is not
   P-256:

   ```bash
   node scripts/release/release-signing-key.mjs pin agi-cli-release.pub
   node scripts/release/check-pinned-release-key.mjs
   node --test scripts/release/install-script.test.mjs
   ```

   Expect `Pinned: 1 release signing key(s) in ...`, then
   `apps/web/public/install.sh pins 1 P-256 release signing key(s)`, then
   `fail 0`. Commit it to `main`. The CLI compiles `install.sh` into itself
   (`apps/cli/src/update_check.rs`), so `agi update --install` trusts only the
   keys pinned in the commit it was built from: the pin must land before the
   tag.

7. **Owner. Deploy the web app** from that commit, so
   `https://agiworkforce.com/install.sh` serves the pinned key. From the root
   of a checkout of that commit:

   ```bash
   curl -fsSL https://agiworkforce.com/install.sh | diff - apps/web/public/install.sh && echo 'served installer matches'
   ```

   Expect only `served installer matches`. Any diff output means the site
   still serves another installer; do not tag until it matches.

8. **Owner. Tag the release** on the commit from step 6 or later. The version
   is the one in `apps/cli/Cargo.toml` (`0.0.1` today); to release another,
   change it there in a commit first and let Cargo update `Cargo.lock`.

   ```bash
   git tag v-cli-0.0.1 <commit-on-main>
   git push origin v-cli-0.0.1
   gh run watch "$(gh run list --workflow release-cli.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
   ```

   Approve `cli-release` twice in the run: for "Sign CLI release assets"
   after the six builds are green, and for "Create GitHub Release" after
   checking the signed `SHA256SUMS` in the signing job's artifact.

9. **Lead. Verify what users get**, on a Mac, a Linux machine and Windows Git
   Bash:

   ```bash
   gh release view v-cli-0.0.1 --json assets --jq '.assets[].name'
   curl -fsSL https://agiworkforce.com/api/releases/cli/latest
   curl -fsSL https://agiworkforce.com/install.sh | bash
   ```

   The asset list is the nine names in the table above, and the feed answers
   `"version":"0.0.1"`. The installer ends with `Installed agi 0.0.1` and, on a
   machine where `~/.agi/bin` was not on `PATH`, names the profile it changed
   and the `export PATH=...` line. Open a new terminal, then:

   ```bash
   agi --version && agi doctor && agi update
   ```

   Expect `agi 0.0.1`, and `agi update` reporting nothing newer. Then check
   both signatures on files downloaded for the check, from the root of the
   checkout:

   ```bash
   verify_dir=$(mktemp -d)
   gh release download v-cli-0.0.1 --repo siddharthanagula3/agiworkforce --pattern 'SHA256SUMS*' --dir "$verify_dir"
   node scripts/release/release-signing-key.mjs export "$verify_dir/keys"
   openssl dgst -sha256 -verify "$verify_dir/keys/1.pem" -signature "$verify_dir/SHA256SUMS.sig" "$verify_dir/SHA256SUMS"
   cosign verify-blob --bundle "$verify_dir/SHA256SUMS.sigstore.json" \
     --certificate-identity https://github.com/siddharthanagula3/agiworkforce/.github/workflows/release-cli.yml@refs/tags/v-cli-0.0.1 \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com "$verify_dir/SHA256SUMS"
   ```

   Expect `Wrote 1 pinned release signing key(s)`, then `Verified OK` from
   `openssl` and `Verified OK` from `cosign`.

   Then: `agi login` completes the device sign-in, `agi usage` answers in
   Managed mode, and the same command is refused after `/privacy-mode local`
   or `/privacy-mode byok` in the terminal UI.

10. **Lead. Mark the CLI released** in `apps/web/lib/surface-status.ts` and its
    test, so `/cli`, `/download` and the support article show the install
    command; the owner deploys it.

11. **Lead. Close the audit items**: delete
    `audit/blockers/14-desktop-and-vscode-need-unpublished-cli.md` and mark
    S72.35 `cli` done in `audit/ledger/ecosystem-capability-ledger.jsonl`.

## Every later release

Bump the version in `apps/cli/Cargo.toml`, merge, run step 1 if the build
changed, then steps 8 and 9. A prerelease version (`0.1.0-beta.1`) is
published as a GitHub prerelease, which the release feed and the installer's
default ignore.

## Pulling a bad release

The release feed (`/api/releases/cli/latest`) serves the newest stable
`v-cli-*` release whose manifest and archives are public. To withdraw one,
mark it a prerelease or delete it on GitHub; the feed then serves the previous
release once its five-minute caches expire, within about ten minutes. `agi update` never downgrades, so a user who
already installed the bad build reinstalls with
`install.sh --version <previous>`. Publish a fixed version instead whenever
possible.

## Rotating the signing key

Pin the new public key beside the old one with
`node scripts/release/release-signing-key.mjs pin <new public key>`, which keeps
every key already pinned, release once signed
with the old key, replace the `AGI_CLI_RELEASE_SIGNING_KEY` secret in the
`cli-release` environment (step 5), release
again, then drop the old key. Builds before the rotation trust only the keys
pinned when they were built.
