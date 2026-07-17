# AGI CLI — Volume 28 — Deployment

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, and the real repo paths this volume covers: `.github/workflows/release-cli.yml`, `.github/workflows/build-windows-release.yml`, `scripts/install.sh`, `scripts/update-homebrew-tap.sh`, `scripts/homebrew/agiworkforce.rb`, `scripts/publish-cli.sh`, `apps/cli/npm/package.json`, `apps/cli/Cargo.toml`, and `apps/cli/src/agent/mod.rs`.

## Overview & stance

This volume covers how the AGI CLI binary reaches user machines: release artifacts, package-manager channels, updates, versioning, rollback, and the CI/CD that produces them. AGI CLI ships as a single native Rust binary named `agi`, with `agiworkforce` retained only as a backward-compatible alias — `apps/cli/Cargo.toml` declares both `[[bin]]` targets, and `default-run = "agi"`. All user-facing examples in this document use `agi`.

Deployment is deliberately trust-neutral: placing a binary on disk moves no prompts, chats, files, or keys anywhere. The three trust modes (Local, BYOK, Managed Cloud) are selected at runtime and enforced by `PrivacyMode` in `apps/cli/src/agent/mod.rs` (✅ Built), which blocks a Local session from silently reaching a non-local provider. Local and BYOK are free access modes; Managed-Cloud plans (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) apply only to signed-in cloud usage and are irrelevant to installation. No install channel may bundle credentials or enable cloud routing by default.

Real channels — GitHub Releases, Homebrew, `install.sh`, npm, and `cargo install` — are live. OS package managers with no repo evidence (winget, Scoop, APT, DNF, Pacman, Docker) are marked 🔭.

## GitHub Releases

✅ Built. `.github/workflows/release-cli.yml` triggers on `v-cli-*` tags and builds six targets: `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu` (via `cross`), `aarch64-pc-windows-msvc`, `x86_64-pc-windows-msvc`. macOS/Linux ship `tar.gz`; Windows ships `zip`; each archive carries both `agi` and `agiworkforce`. The `github-release` job publishes via `softprops/action-gh-release` with `body_path: CHANGELOG.md` (root `CHANGELOG.md` ✅ exists). Requirement: every published archive is named `agiworkforce-<platform>.<ext>` so `scripts/install.sh` can resolve it; the release must be non-draft, non-prerelease for the installer's `releases?per_page=20` filter to find it.

## Homebrew

🟡 Partial. `scripts/update-homebrew-tap.sh` regenerates `Formula/agiworkforce.rb` in `siddharthanagula3/homebrew-tap`, computing sha256 for four platforms (darwin arm64/x64, linux arm64/x64), then commits/pushes. The checked-in source formula is `scripts/homebrew/agiworkforce.rb`. Install: `brew install siddharthanagula3/tap/agiworkforce`. Gap: `release-cli.yml` does **not** invoke the tap script — it is a manual, founder-run step (verified: no homebrew job in the workflow). Requirement: wire the tap refresh into the pipeline so the formula never lags the release.

## Winget

🔭 Planned. No winget manifest exists in the repo (verified). Windows users install via the `.zip` from GitHub Releases or `install.sh` under Git Bash/WSL. Target: publish a `winget` manifest referencing the `win32-x64`/`win32-arm64` archives so `winget install AGI.CLI` works, with checksum pinning per version.

## Scoop

🔭 Planned. No Scoop bucket or app manifest exists (verified). Target: a Scoop manifest in a dedicated bucket that points at the Windows `zip` release assets and installs `agi.exe` (with the `agiworkforce.exe` alias), version- and hash-pinned.

## Cargo Install

✅ Built. Source install works today: `cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli --bin agi`. This is also the documented fallback that `scripts/install.sh` prints when a prebuilt archive is missing. Build pins Rust `1.94.0` (`release-cli.yml` `RUST_VERSION`); Linux source builds need `libasound2-dev`/`libudev-dev` because `cpal` (voice) links unconditionally. 🔭 (not yet): publishing to crates.io — the crate is `license = "Proprietary"`, so `cargo install agiworkforce-cli` from the public registry is out of scope until a licensing decision lands.

## APT

🔭 Planned. No Debian packaging exists (no `debian/`, `.deb`, or control files — verified). Debian/Ubuntu users use `install.sh` (musl and glibc are detected) or the raw `linux-x64`/`linux-arm64` archives. Target: a `.deb` built from the release binary and an APT repo so `apt-get install agi` works, with the package placing `agi` on `PATH` and shipping the alias.

## DNF

🔭 Planned. No RPM spec or `.rpm` artifacts exist (verified). Fedora/RHEL users use `install.sh` or the Linux archives today. Target: an RPM built from the release binary and a DNF repo definition so `dnf install agi` works, checksum-pinned per `v-cli-` tag.

## Pacman

🔭 Planned. No `PKGBUILD` exists (verified). Arch users use `install.sh` or the Linux archives. Target: an AUR `PKGBUILD` (source or `-bin`) that fetches the release archive, verifies sha256, and installs `agi` plus the alias.

## Docker

🔭 Planned. No CLI Dockerfile exists — the only Dockerfiles in-repo are `services/api-gateway/Dockerfile` and `services/signaling-server/Dockerfile` (verified), neither of which packages the CLI. Target: a minimal image (distroless or slim) containing the Linux `agi` binary for CI/sandbox use. Trust requirement: the image must ship **no** provider keys or cloud config and must default to Local; BYOK/Managed require explicit runtime env/consent, never a baked-in credential layer.

## Automatic Updates

🔭 Planned. The CLI has no in-binary self-update path today (verified: no update-check code under `apps/cli/src`; `session.rs` `updated_at` is a session timestamp, not an app updater). Current update is manual: `brew upgrade siddharthanagula3/tap/agiworkforce`, re-running `install.sh`, or `cargo install` again. Target: an opt-in `agi`-driven update check that compares the running version against the latest `v-cli-` release and prompts before replacing the binary — network-off by default for Local-only users, and never auto-downloading without consent.

## Version Management

🟡 Partial. The package version is the single source in `apps/cli/Cargo.toml` (`version = "1.7.1"`), mirrored by `apps/cli/npm/package.json` (`1.7.1`). Release tags use the `v-cli-X.Y.Z` scheme (distinct from `v-desktop-*`); `install.sh` filters `releases` by the `v-cli-` prefix and supports `--version` to pin an exact tag. Requirement: `agi --version` must report the `Cargo.toml` version, and the tag/version/CHANGELOG must move together. Gap: `docs/surfaces/cli.md` still cites "v1.1.6 latest" while the crate is at `1.7.1` — reconcile the surface doc to the `Cargo.toml` source of truth.

## Rollback

🟡 Partial. Downgrade works today by pinning: `install.sh --version v-cli-X.Y.Z`, `brew` reinstall of an older formula, or `gh release download v-cli-X.Y.Z --repo siddharthanagula3/agiworkforce`. There is no first-class `agi` rollback command. Target (🔭): a documented, tested per-channel downgrade procedure plus retention of the last N release archives so a pinned rollback always resolves.

## CI/CD

✅ Built. `.github/workflows/release-cli.yml` is the release pipeline (build → `publish-npm` → `github-release`); `.github/workflows/build-windows-release.yml` provides Windows build coverage. npm publish runs `scripts/publish-cli.sh --yes` with `apps/cli/npm` `package-check`, gated on `NPM_TOKEN`. Requirement: tests/lints (`cargo test -p agiworkforce-cli`, `cargo clippy … -D warnings`) gate merges to `main` before a `v-cli-` tag is cut; secrets (`NPM_TOKEN`) live only in CI, never in artifacts.

## Repository map

- `.github/workflows/release-cli.yml` — 6-platform build, npm publish, GitHub release.
- `.github/workflows/build-windows-release.yml` — Windows build coverage.
- `scripts/install.sh` — curl-pipe installer (`~/.agi/bin`, platform + musl detect, cargo fallback).
- `scripts/update-homebrew-tap.sh`, `scripts/homebrew/agiworkforce.rb` — Homebrew tap generator + source formula.
- `scripts/publish-cli.sh` — npm publish driver.
- `apps/cli/npm/package.json`, `apps/cli/npm/` — `@agiworkforce/cli` wrapper.
- `apps/cli/Cargo.toml` — version SSOT + `agi`/`agiworkforce` bin targets.
- `apps/cli/src/agent/mod.rs` — `PrivacyMode` trust-mode enforcement.
- `CHANGELOG.md` — release notes body.

## Competitor notes

Claude Code CLI and OpenAI Codex CLI distribute primarily via npm/curl and are single-vendor: the binary talks to one provider's cloud. AGI CLI's deliberate divergence is trust-mode plurality carried through deployment — the same binary supports Local, BYOK (Desktop/CLI/VS Code only), and Managed Cloud, and no install channel presumes cloud. Where competitors lean on one registry, AGI targets the full native-package matrix (Homebrew ✅; winget/Scoop/APT/DNF/Pacman/Docker 🔭). AGI never bundles provider keys in an artifact, and BYOK stays a local, explicit, per-provider choice, never a baked-in default.

## Acceptance / Definition of Done

A channel is production-ready when the artifact installs the `agi` binary (plus alias) on `PATH`, `agi --version` matches the `Cargo.toml`/tag version, checksums are pinned, and the channel is refreshed automatically on each `v-cli-` release.

- [ ] Build: `cargo build --release -p agiworkforce-cli` green on all six targets; CHANGELOG and `Cargo.toml`/npm versions match the tag.
- [ ] Trust: no channel bundles provider keys or enables BYOK/Managed by default; fresh install defaults to Local; `PrivacyMode` guard verified post-install.
- [ ] Security: release secrets (`NPM_TOKEN`) confined to CI; archive checksums recomputed and pinned per platform; Homebrew formula sha256 matches published assets.

## Anti-patterns

- Claiming a package channel is shipped without a manifest in the repo — winget/Scoop/APT/DNF/Pacman/Docker are 🔭 until a real file exists.
- Baking provider keys, BYOK config, or Managed-Cloud defaults into any artifact, or letting an installer route Local data off-device.
- Using `agiworkforce <cmd>` in examples — `agiworkforce` is a compatibility alias only; examples use `agi`.
- Hardcoding model IDs in release/install tooling; model IDs come only from `packages/contracts/types/src/models.json`.
- Referencing removed tiers (Plus, `pro_plus`, Hobby) or inventing INR prices for Pro/Max, or adding credit top-ups.
- Referencing Supabase anywhere in deployment (stack is Clerk + Neon + Stripe).
- Letting the Homebrew formula, `docs/surfaces/cli.md` version, or npm version drift from the `Cargo.toml`/tag source of truth.
