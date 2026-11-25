---
id: "F072-11"
type: "feature"
title: "Install, update, diagnostics and shell completion"
aliases: ["install.sh", "agi update", "agi update --check", "agi update --install", "agi doctor", "agi completion", "agi completions", "--completions", "S72.26", "S72.35", "S72.36"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "partial", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.26", "S72.35", "S72.36"]
depends_on: ["surface:cli", "surface:web", "api:GET /api/releases/cli/latest", "file:apps/web/public/install.sh", "file:apps/cli/src/update_check.rs", "file:apps/cli/src/doctor.rs", "file:apps/web/lib/surface-status.ts", "test:scripts/release/install-script.test.mjs", "SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-api-and-contracts", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-11 Install, update, diagnostics and shell completion

The CLI (surface:cli only) is installed by a script served from the web site that verifies a signed checksum list before installing. `agi update` compares versions and can replace itself. `agi doctor` prints a local setup report. `agi completion bash|zsh|fish` prints a completion script. The CLI is partial until a first signed release is published.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.26](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7226), [S72.35](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7235), [S72.36](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7236).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** The installer detects the platform, finds the newest release through /api/releases/cli/latest, downloads the archive and signed checksum list from GitHub, verifies them, checks the binary reports the right version, and installs it (apps/web/public/install.sh:111-300). `agi update` reads the same feed and can verify and swap the binary (apps/cli/src/lib.rs:6559-6580, 4952-4992; apps/cli/src/update_check.rs:751-803). `agi doctor` runs local checks (apps/cli/src/doctor.rs:59-76). `agi completion` prints scripts from clap (apps/cli/src/lib.rs:740-743, 6631-6634).

**Why it exists.** People need a safe way to install and keep the CLI current, find setup problems, and use tab completion (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.26, S72.35, S72.36).

**Who uses it.** New users installing the CLI, maintainers updating it, and support staff reading doctor output.

**Problems it solves**

- Installing unverified bytes.
- Being on an old build without knowing.
- Not knowing why the CLI fails on this machine.
- Typing long commands without completion.

**Use cases**

- `curl -fsSL https://agiworkforce.com/install.sh | bash` on a new laptop.
- `agi update --check` in CI to detect an outdated runner.
- `agi doctor --json` attached to a support request.
- `agi completion zsh > ~/.zfunc/_agi`.

## 2. User experience

**Where to find it**

- surface:cli commands `agi update [--check] [--install] [-y]`, `agi doctor [--json] [--export]`, `agi completion <bash|zsh|fish>` (alias `completions`), hidden-by-deprecation `--completions <SHELL>` (apps/cli/src/lib.rs:812-826, 852-858, 1067-1076, 7821-7824). Installer at https://agiworkforce.com/install.sh, served from apps/web/public/install.sh with a rewrite in apps/web/next.config.ts:238. The web surface list shows the CLI as `Coming soon` (apps/web/lib/surface-status.ts:9).

**Before you start**

- Installer: bash, curl, openssl; tar or unzip; glibc 2.35 or newer on Linux; no musl (apps/web/public/install.sh:96-110, 147-153).
- Update --install: a release for this platform (macOS or Linux, arm64 or x64), openssl and tar on a trusted PATH, write access to the install folder (apps/cli/src/update_check.rs:243-253, 751-770).
- At least one published signed release; today unknown (see unknowns).

**Screens and controls**

- Installer options `--version`, `--install-dir`, `--no-modify-path` (apps/web/public/install.sh:3-8, 59-79).
- `agi update` prints Running and Published lines and a verdict (apps/cli/src/update_check.rs:240-267).
- `agi update --install` prints what will be replaced and asks `Install agi <version> into <dir>?` unless -y (apps/cli/src/lib.rs:4966-4985).
- `agi doctor` prints `AGI doctor` with checks and an overall status (apps/cli/src/doctor.rs:132-150).

**Journey**

1. 1. Run the installer one-liner.
2. 2. It prints platform, version and directory, downloads, verifies the signature and checksum, and installs agi and agiworkforce (apps/web/public/install.sh:307-330).
3. 3. It adds the install folder to the shell profile unless told not to (apps/web/public/install.sh:261-285).
4. 4. Run `agi doctor` to check setup.
5. 5. Later run `agi update`; if newer, run `agi update --install` and confirm.
6. 6. Add completion with `agi completion zsh`.

**What the person sees and gets**

- Installer errors such as `No signed AGI CLI release is published yet.` (apps/web/public/install.sh:133).
- Update verdicts: up to date, update available with install command, newer than published, or cannot compare (apps/cli/src/update_check.rs:240-267).
- Startup notice `agi <v> is available (you have <v>)...` in the full-screen screen (apps/cli/src/update_check.rs:312-323).
- Doctor JSON with version, generated_at, cwd, summary and checks (apps/cli/src/doctor.rs:41-47).

**Settings**

- `updates.check_on_startup` in config (apps/cli/src/config.rs:109-116); AGIWORKFORCE_NO_UPDATE_CHECK (apps/cli/src/update_check.rs:29-30, 120-134).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Installer verifies a signature over the checksum list against a public key pinned in the script, optionally verifies a Sigstore bundle when cosign exists, checks the archive checksum, and refuses a build that reports a different version (apps/web/public/install.sh:147-200, 250-300).
- Installer refuses musl and old glibc, handles Rosetta, adds PATH to the right profile (apps/web/public/install.sh:82-110, 232-285).
- With no release the feed returns 404 and the installer says so (apps/web/app/api/releases/cli/latest/route.ts:12-17; apps/web/public/install.sh:133).
- The feed advertises a release only when its archives and signed manifest are publicly retrievable (apps/web/lib/releases/github-cli-releases.ts:107-150; test apps/web/lib/releases/__tests__/cli-release-reachability.test.ts).
- `agi update` reads /api/releases/cli/latest with a 5 second timeout (apps/cli/src/update_check.rs:26, 805-835) and `--check` exits 1 when a newer release exists (apps/cli/src/lib.rs:6573-6578).
- `agi update --install` verifies the signed manifest with the key built from install.sh, checks the SHA-256, verifies reported versions, swaps files with backup and rollback (apps/cli/src/update_check.rs:459-470, 751-803, 640-740).
- It refuses package-manager installs, desktop-bundled copies and Windows (apps/cli/src/update_check.rs:196-262).
- Startup update check runs in the background, only when updates.check_on_startup is true, privacy is not Local and the env switch is off (apps/cli/src/update_check.rs:122-160).
- `agi doctor` runs ten groups of checks and always prints a report; live network probes are skipped (apps/cli/src/doctor.rs:59-76, 682-708).
- `agi completion` supports bash, zsh and fish (apps/cli/src/lib.rs:728-743).

**Incomplete**

- Per the brief, the owner must set the release signing secret, publish the first signed release and mark the CLI available (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.35; doc: audit/partial/072-cli-and-terminal-application.md). The secret and release steps are in doc: docs/runbooks/cli-release.md. Whether a release exists is unknown.
- `agi update --install` has no Windows path; it points to Git Bash or WSL (apps/cli/src/update_check.rs:196-203). The installer needs Git Bash, MSYS2, Cygwin or WSL on Windows (apps/web/public/install.sh:9-10).
- `agi doctor` has no strict exit status (apps/cli/src/doctor.rs:49-57).
- The first draft cites install.sh:31-34; the pinned key block is at install.sh:31-34 by line, and the verifier at 147-160 (apps/web/public/install.sh:31, 147-160).

**Present but disconnected or switched off**

- The brief marks the CLI partial and surface-status shows `Coming soon` (apps/web/lib/surface-status.ts:9).

**Not available**

- No package-manager install (the runbook states the CLI ships only through the signed script; doc: audit/decisions/founder-actions.md item 9).
- No binary platform signing: no Apple notarization or Windows Authenticode (doc: docs/runbooks/cli-release.md).

## 4. Required behaviour

**Established requirements**

- The CLI can be installed via a published package or script and can check for and install updates itself. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.35)
- A diagnostics command checks the local setup and prints a human or JSON report. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.36)
- The CLI generates shell completion scripts for bash, zsh and fish. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.26)
- The installer and updater accept exactly the same releases (same pinned key). (source: apps/cli/src/update_check.rs:352-358 comment)
- Releases are tags v-cli-<semver> matching Cargo.toml and are signed in the protected cli-release environment. (source: doc: docs/runbooks/cli-release.md (Release boundary))

**Acceptance criteria**

1. With no release published, the installer exits 1 with `No signed AGI CLI release is published yet.`
2. With a published release, the installer verifies and installs agi and agiworkforce into ~/.agi/bin and reports PATH changes.
3. A tampered archive or manifest is refused and nothing is replaced.
4. `agi update` prints Running and Published versions and a verdict.
5. `agi update --check` exits 1 only when a newer release exists.
6. `agi doctor --json` prints valid JSON with summary and checks.
7. `agi completion bash` output defines `_agi()`.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI status on the web must change from Coming soon only after the first release exists [inferred from the brief's unfinished note].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make `--check` exit 75 or a dedicated code, not 1, when the feed is unreachable, and keep 1 for outdated.
- [proposed] Add `agi doctor --strict` for CI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | install.sh | `apps/web/public/install.sh` | Signed installer script. |
| config | install.sh rewrite | `apps/web/next.config.ts` | Serves /install.sh (line 238). |
| endpoint | api:GET /api/releases/cli/latest | `apps/web/app/api/releases/cli/latest/route.ts` | Release feed, 404 when none, rate limited. |
| service | fetchCliReleaseAvailability | `apps/web/lib/releases/github-cli-releases.ts` | Selects archives, requires signed manifest assets and public reachability. |
| service | update_check | `apps/cli/src/update_check.rs` | Feed fetch, version compare, install plan, verification, swap, startup check. |
| command | Command::Update | `apps/cli/src/lib.rs` | Subcommand (812-826) and handler (6559-6580). |
| service | run_update_install | `apps/cli/src/lib.rs` | Confirm then install (4952-4992). |
| service | doctor | `apps/cli/src/doctor.rs` | Report types and checks (14-150, 155-800). |
| command | Command::Doctor handler | `apps/cli/src/lib.rs` | Runs report or export (7471-7490). |
| service | diagnostics_bundle | `apps/cli/src/diagnostics_bundle.rs` | `doctor --export` redacted file. |
| command | Command::Completion | `apps/cli/src/lib.rs` | Subcommand (852-858), generator (740-743), handler (6631-6634), deprecated flag (7821-7824). |
| config | UpdatesConfig | `apps/cli/src/config.rs` | updates.check_on_startup (109-116). |
| service | release signing key tooling | `scripts/release/release-signing-key.mjs` | Pins the public key into install.sh (doc: docs/runbooks/cli-release.md). |
| config | release workflow | `.github/workflows/release-cli.yml` | Builds, signs and publishes archives (doc: docs/runbooks/cli-release.md). |
| config | surface status | `apps/web/lib/surface-status.ts` | CLI shown as Coming soon (line 9). |
| test | install-script.test.mjs | `scripts/release/install-script.test.mjs` | Installer behaviour tests. |
| test | cli-release-reachability | `apps/web/lib/releases/__tests__/cli-release-reachability.test.ts` | Feed advertises only retrievable assets. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Installer asks the web feed for the newest version. | our servers | apps/web/public/install.sh:125-140; apps/web/app/api/releases/cli/latest/route.ts:8-25 |
| The feed asks GitHub for the latest stable release and probes asset reachability. | outside service | apps/web/lib/releases/github-cli-releases.ts:85-150 |
| Installer downloads the archive, SHA256SUMS, signature and optional Sigstore bundle from GitHub. | outside service | apps/web/public/install.sh:218-238 |
| Verification, version check, extraction and install happen on the user's machine. | device | apps/web/public/install.sh:147-216, 240-262 |
| `agi update` fetches the feed, compares semver, and for --install repeats download and verification, then swaps binaries with rollback. | device and our servers | apps/cli/src/update_check.rs:751-835, 640-740 |
| `agi doctor` inspects config, runtime tools, auth, sandbox, state folders, MCP, plugins, models, transport and git, all locally. | device | apps/cli/src/doctor.rs:59-76 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Installed binaries agi and agiworkforce | ~/.agi/bin by default | No | Previous binaries are kept as backups during an update and restored on failure (apps/cli/src/update_check.rs:559-600) |
| release-notes-seen marker | File in the config folder | No | Overwritten per release (apps/cli/src/update_check.rs:81-99) |
| Doctor report | Printed; `--export` writes a redacted file in the current folder | No; the user decides whether to attach it | User-managed (apps/cli/src/lib.rs:7471-7490) |

**Models and providers.** No model or provider takes part. The release host is GitHub; the feed lives on the AGI web app.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code: install, update, doctor and completion need no sign-in. |
| Permissions | Update needs write access to the install folder (apps/cli/src/update_check.rs:268-282). Installer writes shell profiles unless --no-modify-path. |
| Subscription | none found in the code. The plan table lists the CLI as a Premium-and-above managed surface for Cloud use (doc: docs/product/definition.md:294-301), not for installing. |
| Limits and metering | Feed route is rate limited with the release-latest bucket (apps/web/app/api/releases/cli/latest/route.ts:9-12); startup fetch timeout 5s, download 600s (apps/cli/src/update_check.rs:21-22). |
| Feature flags | updates.check_on_startup, AGIWORKFORCE_NO_UPDATE_CHECK, surface-status label (apps/web/lib/surface-status.ts:9). |
| Model compatibility | none found in the code. |
| Provider restrictions | Releases are served from the GitHub repository named in the script (apps/web/public/install.sh:23). |
| Local mode | Local privacy mode switches the automatic startup check off (apps/cli/src/update_check.rs:122-134). An explicit `agi update` still contacts the feed [inferred from apps/cli/src/lib.rs:6559-6565]. Doctor and completion make no network call (apps/cli/src/doctor.rs:700). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No release published | Feed 404; installer and `agi update` say none is published. | apps/web/public/install.sh:133; apps/cli/src/update_check.rs:818-826 |
| Region blocked | Installer reports 451 as not available in the region. | apps/web/public/install.sh:134 |
| Offline | Installer: could not reach agiworkforce.com; update: request error; startup check silently skipped. | apps/web/public/install.sh:128-130; apps/cli/src/update_check.rs:139-142 |
| Signature or checksum mismatch | Install refused, nothing replaced. | apps/web/public/install.sh:203-216; apps/cli/src/update_check.rs:777-781 |
| Older signed build served under a newer version | Refused by the reported-version check. | apps/web/public/install.sh:194-203; scripts/release/install-script.test.mjs tests |
| Non-interactive `--install` without -y | Prompt answers no; `Nothing was installed.` | apps/cli/src/lib.rs:4972-4984; apps/cli/src/output.rs:363-370 |
| Install owned by a package manager | Refuses and says to update with that manager. | apps/cli/src/update_check.rs:204-262 |
| Swap fails midway | Previous binaries restored; stranded files reported. | apps/cli/src/update_check.rs:587-640 |
| Escape sequences in feed text | Stripped before printing. | apps/cli/src/update_check.rs:150-157, 850-870 test |
| Accessibility | Plain output with --plain; installer uses coloured text with no plain switch (not handled in the code). | apps/web/public/install.sh:14-21 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `scripts/release/install-script.test.mjs`: Installer: signed build with the right version installs; older build under a newer version, archive mismatch, non-running binary, control bytes in the version are refused; pin guard and key pinning; PATH profile handling for zsh, bash, fish and an on-PATH folder.
- `apps/web/lib/releases/__tests__/cli-release-reachability.test.ts`: Feed advertises only retrievable archives and a signed manifest; treats network failure as unavailable.
- `apps/cli/src/update_check.rs`: Feed parsing, escape-free output, version verdicts, startup-check rules, config opt-out (tests from line 840 on).
- `apps/cli/src/doctor.rs`: Config parse failure, summary ordering, git hygiene, MCP load problems, optional runtimes, text formatter (tests 860-1060).
- `apps/cli/src/lib.rs`: completion and completions parse; bash output defines _agi (tests at 10979-11018).

**Test scenarios**

- **No release yet**
  1. Run the installer one-liner against a site with no CLI release.
  - Expected: Exit 1 with `No signed AGI CLI release is published yet.`
- **Verified install**
  1. With a published signed release run the installer.
  2. Run `agi --version`.
  - Expected: Version equals the release; PATH message shown.
- **Tamper**
  1. Edit a downloaded archive in a local mirror of the release and run the installer.
  - Expected: `Archive checksum verification failed; refusing to install.`
- **Update check**
  1. Run `agi update` and `agi update --check; echo $?`.
  - Expected: Verdict printed; status 1 only when newer exists.
- **Doctor JSON**
  1. Run `agi doctor --json | jq .summary`.
  - Expected: Object with overall, pass, warn, fail, unknown.
- **Completion**
  1. Run `agi completion zsh | head`.
  - Expected: A zsh completion script that references agi.

**Where to look when it fails**

- Installer messages on stderr (apps/web/public/install.sh:41-44).
- `agi doctor` check ids (apps/cli/src/doctor.rs:155-800).
- Feed response codes 200, 404, 451 (apps/web/public/install.sh:130-137).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **No signed release is confirmed published; surface status says Coming soon.** Affects: surface:cli all new users. Evidence: apps/web/lib/surface-status.ts:9; doc: audit/partial/072-cli-and-terminal-application.md. Work needed: Owner sets AGI_CLI_RELEASE_SIGNING_KEY in the cli-release environment, publishes the first signed release (doc: docs/runbooks/cli-release.md), then updates the status.
- **`agi update --install` does not support Windows.** Affects: surface:cli Windows users. Evidence: apps/cli/src/update_check.rs:196-203, 243-253. Work needed: Add a Windows swap path.
- **`doctor` cannot fail a script.** Affects: surface:cli CI. Evidence: apps/cli/src/doctor.rs:49-57. Work needed: Strict exit option.
- **`--check` exits 1 for outdated, the same as generic failure.** Affects: surface:cli CI. Evidence: apps/cli/src/lib.rs:6573-6578. Work needed: Document or change.
- **No test spawns the CLI to verify `update` or `completion` output end to end.** Affects: surface:cli. Evidence: apps/cli/tests lists none. Work needed: Add binary tests.

**Depends on**

- surface:cli
- surface:web
- api:GET /api/releases/cli/latest
- file:apps/web/public/install.sh
- file:apps/cli/src/update_check.rs
- file:apps/cli/src/doctor.rs
- file:apps/web/lib/surface-status.ts
- test:scripts/release/install-script.test.mjs
- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-api-and-contracts
- mode:local

## Unknown

- Whether any signed CLI release has been published.
- The key and install flow on real Windows with Git Bash (only test file names read).
- Whether the GitHub repository in the script is public at release time.
- How the web rewrite at apps/web/next.config.ts:238 maps /install.sh (only the line was seen).
