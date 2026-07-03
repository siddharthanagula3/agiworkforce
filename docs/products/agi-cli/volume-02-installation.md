# AGI CLI — Volume 02 — Installation

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, and the real repo paths this volume covers: `scripts/install.sh`, `scripts/homebrew/agiworkforce.rb`, `scripts/update-homebrew-tap.sh`, `.github/workflows/release-cli.yml`, `apps/cli/npm/package.json`, `apps/cli/Cargo.toml`, `apps/cli/src/lib.rs`, and `apps/cli/src/agent/mod.rs`.

## Overview & stance

AGI CLI is the pure-Rust (Ratatui TUI) developer surface, shipping as a single native binary named `agi` (with `agiworkforce` retained only as a backward-compatible alias — `apps/cli/Cargo.toml` declares both `[[bin]]` targets). Installation must not itself become a trust-boundary event: fetching and placing a binary never sends prompts, chats, files, or provider keys anywhere. All three trust modes (Local, BYOK, Managed Cloud) are selected _after_ install and are enforced at runtime by `PrivacyMode` in `apps/cli/src/agent/mod.rs` (✅ Built), which blocks a Local session from silently routing to a non-local provider (see the "Privacy boundary blocked" guard, `apps/cli/src/agent/mod.rs:707`, with a regression test at `:1446`). Local and BYOK are free access modes, not paid plans; Managed-Cloud plans (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) apply only to signed-in cloud usage and are irrelevant to the install itself. All user-facing examples use `agi`, never `agiworkforce <cmd>`.

Real release channels exist: `.github/workflows/release-cli.yml` triggers on `v-cli-*` tags, builds six platform binaries, publishes npm packages, and creates the GitHub release that `scripts/install.sh` downloads from. Package managers with no repo evidence are marked 🔭.

## Windows

🟡 Partial. `release-cli.yml` builds `win32-x64` and `win32-arm64` `.zip` archives (with `.exe`), and `scripts/install.sh` recognizes `MINGW*|MSYS*|CYGWIN*` and unzips. Gap: install.sh needs a bash-capable shell (Git Bash/WSL); there is no native PowerShell installer or `cmd`/PowerShell PATH handling, and no winget/MSI. Manual extract-and-add-to-PATH is the supported native flow until a first-class installer lands (🔭).

## macOS

✅ Built. `scripts/install.sh` maps `Darwin*` to `darwin`, detects `arm64`/`x64`, and detects Rosetta to install the native arm64 archive. Binaries `agiworkforce-darwin-arm64.tar.gz` and `-x64.tar.gz` are produced by `release-cli.yml`. Homebrew (below) and `cargo install` are alternatives.

## Linux

🟡 Partial. `scripts/install.sh` maps `Linux*`, detects `x64`/`arm64`, and detects musl libc (appends `-musl`). `release-cli.yml` builds `linux-x64` and `linux-arm64` **gnu** archives. Gap: no musl artifact is currently published, so the musl branch can 404 on Alpine/static hosts — fall back to `cargo install` there.

## Homebrew

✅ Built (mechanism). `scripts/homebrew/agiworkforce.rb` is the formula (installs `agi`, keeps `agiworkforce`), and `scripts/update-homebrew-tap.sh <version>` fetches per-platform SHA-256 sums from the `v-cli-<version>` release and publishes to the `siddharthanagula3/homebrew-tap` repo. User flow: `brew install siddharthanagula3/tap/agiworkforce`. The in-repo formula carries placeholder `version "1.0.0"` and `PLACEHOLDER_SHA256_*` values; the tap-publish script overwrites both from a real release, so the tap only goes live once a `v-cli-*` release is cut (🟡 until then).

## Winget

🔭 Planned. No winget manifest or reference exists in the repo. Do not claim availability.

## Scoop

🔭 Planned. No Scoop bucket/manifest exists in the repo.

## Cargo Install

✅ Built. From a checkout: `cargo install --path apps/cli --bin agi` (`apps/cli/README.md`). `scripts/install.sh` also prints a from-source fallback, `cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli --bin agi`, when a prebuilt archive is missing. Note the Linux build statically links `cpal` (voice), so ALSA/udev dev headers are required — the workflow installs them; document this for source builds.

## APT

🔭 Planned. No `.deb` packaging, PPA, or apt repo exists. Debian/Ubuntu users use `install.sh` (glibc) or `cargo install`.

## DNF

🔭 Planned. No `.rpm` spec or DNF/COPR repo exists in the repo.

## Pacman

🔭 Planned. No PKGBUILD or AUR entry exists in the repo.

## Standalone Installer

✅ Built (shell) / 🟡 (Windows). `scripts/install.sh` is the curl-pipe installer: `curl -fsSL https://agiworkforce.com/install.sh | bash`. It resolves the latest `v-cli-` tag via the GitHub API, downloads `agiworkforce-<platform>.(tar.gz|zip)`, extracts to `~/.agi/bin` (override with `--install-dir`), reconciles `agi`/`agiworkforce` names, and `chmod +x`. Flags: `--version`, `--no-modify-path`, `--install-dir`. An npm distribution also exists (`@agiworkforce/cli`, `apps/cli/npm/package.json`) with per-platform `optionalDependencies` and `agi`/`agiworkforce` bins. A signed native Windows/macOS installer package is 🔭.

## Shell Configuration

✅ Built. Two layers: (1) `install.sh` `add_to_path` writes an export/`fish_add_path` line into the right rc file (`.zshrc`, `.bashrc`/`.bash_profile`, fish `config.fish`, else `.profile`) and is idempotent. (2) The binary generates completions itself — `agi completion <bash|zsh|fish>` (`generate_shell_completion`, `apps/cli/src/lib.rs:503`; the older `--completions` flag is a deprecated alias). Per-project runtime config (`output_style`, `privacy_mode`) persists to `.agiworkforce/config.toml` under `[ui]`, distinct from shell rc files.

## PATH Management

✅ Built. The binary lives under `~/.agi/bin` (installer default); shell config (`~/.agiworkforce/config.toml`) and project config (`.agiworkforce/config.toml`) are separate. `install.sh` adds `~/.agi/bin` to PATH for the current session and rc file unless `--no-modify-path` is passed; it skips when the dir is already present. Windows PATH updates for `cmd`/PowerShell are not automated (🔭).

## Version Management

🟡 Partial. Pinning is supported: `install.sh --version <tag>` installs a specific `v-cli-*` release; npm consumers pin `@agiworkforce/cli@<x.y.z>`; `cargo install` builds a specific ref. Gap: no side-by-side multi-version manager (e.g. `agi use <version>`), and no in-binary channel switch — a new version overwrites the one in `~/.agi/bin`. Multi-version coexistence is 🔭.

## Updates

🟡 Partial. Updating means re-installing through the same channel: re-run `curl … | bash`, `brew upgrade siddharthanagula3/tap/agiworkforce`, `npm update -g @agiworkforce/cli`, or re-run `cargo install`. There is **no** built-in binary self-updater (`agi update` is a **plugin** update command, not a CLI self-update — `apps/cli/src/lib.rs:819`; a marketplace `update` also exists). A first-class `agi upgrade` self-updater is 🔭.

## Verification

✅ Built. Post-install checks: `agi --version` (clap `version`, `apps/cli/src/lib.rs:140`), and `agi doctor` / `agi doctor --json` for local diagnostics (`Command::Doctor`, `apps/cli/src/lib.rs:643` → `doctor::run_doctor`). The Homebrew formula's `test do` block asserts `agi --version`, `agi --list-models` (boots without any API key), and that the `agiworkforce` alias exists (`scripts/homebrew/agiworkforce.rb:42`). Auth is verified separately via `agi login` / `agi auth-status` — never required merely to prove the binary installed.

## Repository map

- `scripts/install.sh` — curl-pipe standalone installer (platform/arch/Rosetta/musl detection, PATH).
- `scripts/homebrew/agiworkforce.rb`, `scripts/update-homebrew-tap.sh` — Homebrew formula + tap publisher.
- `.github/workflows/release-cli.yml` — `v-cli-*` release build + npm publish + GitHub release.
- `apps/cli/npm/{package.json,bin,scripts}` — npm distribution wrapper (`@agiworkforce/cli`).
- `apps/cli/Cargo.toml` — `agi`/`agiworkforce` bin targets, dependency + feature set.
- `apps/cli/src/lib.rs` — CLI arg/subcommand definitions, completion + doctor entry points.
- `apps/cli/src/agent/mod.rs` — `PrivacyMode` and the Local→BYOK/Managed boundary guard.
- `apps/cli/README.md` — install/cargo/source-build quickstart.

## Competitor notes

Claude Code CLI (npm/native, Anthropic-only) and Codex CLI (npm + Homebrew, OpenAI-only) install cleanly but bind you to one provider; Gemini CLI is Google-only; OpenCode is multi-provider but Bun-based. AGI CLI's deliberate divergence: one native Rust binary that is **multi-provider and BYOK-capable on this surface** (Local + BYOK + Managed), installable from GitHub releases, `install.sh`, Homebrew, npm, or `cargo` — with trust mode chosen and enforced at runtime, not baked into the installer. Installation never assumes cloud: a fresh `agi` can run fully Local (e.g. against Ollama/LM Studio) with no account, matching the local-first stance.

## Acceptance / Definition of Done

Production-ready gate: a signed, versioned `v-cli-*` release exists; `install.sh`, Homebrew tap, npm, and `cargo install` all resolve to the same version and place a working `agi` on PATH on macOS/Linux (and via extract on Windows); `agi --version` and `agi doctor` pass; and no install path can silently alter a Local trust boundary.

- [ ] Build: `install.sh`, `brew install …/tap/agiworkforce`, `npm i -g @agiworkforce/cli`, and `cargo install --path apps/cli --bin agi` each yield a runnable `agi` matching the release version; `agi --version` + `agi doctor --json` succeed.
- [ ] Trust: no installer or updater writes provider keys or Managed-Cloud config; Local remains the default until the user explicitly picks BYOK/Managed; the `PrivacyMode` guard test (`apps/cli/src/agent/mod.rs:1446`) passes.
- [ ] Security: release archives are checksum-verified (Homebrew SHA-256 from `update-homebrew-tap.sh`); `install.sh` downloads only over HTTPS from the pinned GitHub repo; PATH edits are idempotent and reversible via `--no-modify-path`.

## Anti-patterns

- Claiming winget/Scoop/APT/DNF/Pacman availability — none exist in the repo; keep them 🔭.
- Presenting `agi update` as a binary self-updater — it updates plugins only; the CLI self-upgrade is 🔭.
- Using `agiworkforce <cmd>` in examples — always `agi`; `agiworkforce` is an alias only.
- Advertising a musl Linux download as shipped — the musl artifact is not published yet (🟡).
- Making installation an auth/cloud gate, or having any install/update step move Local data to BYOK/Managed — a trust-boundary violation.
- Inventing model IDs, INR prices (only Basic ₹399 is fixed; Pro/Max INR TBD), removed tiers (Plus/Hobby/pro_plus), credit top-ups, or referencing Supabase — none belong in this surface.
- Marking Homebrew/GitHub-release install as fully live before a real `v-cli-*` release replaces the placeholder version/SHA values in the formula.
