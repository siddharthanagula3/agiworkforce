# Building AGI Workforce

This document covers the prerequisites and build commands for every shippable surface in the monorepo. If you're new to the codebase, start here — the goal is "junior engineer can clone, follow this doc, and produce a working desktop build in under 30 minutes" (FIX-038 / Sprint 5 acceptance criterion).

## Prerequisites

| Tool                | Version | Why                                                                                                                                                                         |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                | 22      | Pinned in `.nvmrc` and `package.json:engines.node`                                                                                                                          |
| pnpm                | 9.15.3  | Pinned in `package.json:packageManager`. `corepack enable` will install this version automatically                                                                          |
| Rust                | 1.94.0  | Pinned in `apps/desktop/src-tauri/rust-toolchain.toml`. Targets pinned: `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-pc-windows-msvc`, `x86_64-unknown-linux-gnu` |
| Tauri prerequisites | —       | OS-specific, see below                                                                                                                                                      |

### Tauri prerequisites by OS

**macOS:**

```bash
xcode-select --install
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev pkg-config
```

**Windows:**

- WebView2 runtime (usually pre-installed on Windows 11)
- Visual Studio Build Tools 2022 with the "Desktop development with C++" workload

### Optional tooling

- `cargo-audit` for the dep-vulnerability checks CI runs (`cargo install cargo-audit --version 0.22.1 --locked`)
- `playwright` for desktop E2E smoke tests (`pnpm --filter desktop exec playwright install`)
- `dotslash` for fetching prebuilt binaries used by some Rust crates

## First-time setup

```bash
git clone git@github.com:siddharthanagula3/agiworkforce.git
cd agiworkforce

# Node tooling
nvm use            # picks up .nvmrc
corepack enable    # enables pnpm@9.15.3
pnpm install

# Rust tooling — rustup will auto-install 1.94.0 from rust-toolchain.toml on first cargo invocation
rustup show
```

Verify:

```bash
node --version          # v22.x
pnpm --version          # 9.15.3
rustc --version         # 1.94.0
```

## Building each surface

### Desktop (Tauri)

```bash
# Dev (hot-reload, opens a window)
pnpm dev:desktop

# Production bundle
pnpm build:desktop
# Bundles land in apps/desktop/src-tauri/target/release/bundle/
```

Signed/notarized release builds run through `.github/workflows/release-desktop.yml` on tag push. macOS signing needs `APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD` + `APPLE_SIGNING_IDENTITY` + `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID` GitHub secrets. Windows signing needs `WINDOWS_CERTIFICATE` + `WINDOWS_CERTIFICATE_PASSWORD` (FIX-010 in the remediation plan — currently in-progress, builds ship unsigned until the EV cert lands).

### Web app (Next.js + Vite)

```bash
pnpm --filter web dev      # localhost:3000
pnpm --filter web build    # builds desktop SPA into public/chat then runs `next build`
```

The web build pipeline is unusual: it builds the **desktop** SPA via Vite, copies the output into `apps/web/public/chat/`, then runs `next build` so the chat surface ships from the same code. See `apps/web/package.json:scripts.build` for the chain.

### Mobile (Expo)

```bash
pnpm --filter @agiworkforce/mobile start    # Expo dev server
pnpm --filter @agiworkforce/mobile ios      # iOS simulator
pnpm --filter @agiworkforce/mobile android  # Android emulator
```

### CLI + TUI

```bash
cargo build --release -p agiworkforce-cli
./target/release/agiworkforce --help

# Or run via cargo without building first
cargo run -p agiworkforce-cli -- exec "Hello, world"
```

### VS Code extension

```bash
pnpm --filter agi-workforce build
# .vsix lands at apps/extension-vscode/agi-workforce-*.vsix; install via "Extensions: Install from VSIX..."
```

### Chrome extension

```bash
pnpm --filter @agiworkforce/extension build
# Load apps/extension/dist as an unpacked extension in chrome://extensions
```

## Test commands

```bash
# Frontend
pnpm test                     # vitest across every TS workspace
pnpm typecheck:all            # tsc --noEmit across every TS workspace
pnpm lint                     # eslint --max-warnings=0

# Rust
cargo check --workspace                   # fast: type-check only
cargo test --workspace --lib --no-run     # builds all unit-test binaries (CI gate)
cargo test --workspace --lib              # actually runs them
cargo clippy --workspace --lib -- -D warnings -D unsafe-code

# Desktop E2E
pnpm --filter desktop exec playwright test
```

## Troubleshooting

**`pnpm install` reports "unmet peer typescript@<6.0.0"** — pre-FIX-017 lockfile drift. We pin TS at 5.9.3 across the workspace via `pnpm.overrides` (see `package.json`). If you see a TS 6.x install in `node_modules/.pnpm/`, run `pnpm install --force` to re-resolve.

**`cargo audit` reports vulnerabilities you don't recognize** — check `.cargo/audit.toml` for the documented ignore list. Optional features (mongodb / mysql_async via `remote-databases`) carry transitive advisories that are ignored with per-entry justification.

**Workspace exclusions** — `Cargo.toml` excludes `agiworkforce-tui`, `agiworkforce-tui_app_server`, and `agiworkforce-cloud-tasks`; they are mid-port from codex-rs and Sprint 5 will deal with them properly. Nothing in `apps/desktop` or `apps/cli` depends on them today.

**Tauri build fails on Linux with `libwebkit2gtk` errors** — install the system deps in the prerequisites table above. The Tauri team's docs at https://tauri.app/v2/guides/getting-started/prerequisites/linux/ have OS-specific instructions if Ubuntu/Debian apt names differ on your distro.

**`pnpm typecheck` errors with `TS5103: Invalid value for '--ignoreDeprecations'`** — TS 5.9.3 expects `"5.0"`, TS 6.x expects `"6.0"`. We ship with TS 5.9.3 pinned and `"5.0"` everywhere. If your local install drifted to TS 6, run `pnpm install --force`.

## CI overview

`.github/workflows/ci.yml` runs on every PR + every push to `main`:

1. Lint (eslint --max-warnings=0)
2. Type check (tsc --noEmit across all TS workspaces)
3. Tests (vitest)
4. Build (web, packages, extension)
5. Dependency audit (pnpm audit + cargo audit, both blocking on high+ severity per FIX-043)
6. Rust clippy (-D warnings -D unsafe-code)
7. Rust workspace test build

`.github/workflows/release-desktop.yml` runs on tag push and produces signed bundles for macOS (universal/aarch64/x86_64), Windows x64, and Linux x64.
