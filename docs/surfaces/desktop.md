# Desktop surface

> **Path:** `apps/desktop/` · **Stack:** Tauri v2.11.1 + React (Vite) · **Owner:** founder · **Status:** v1.2.0 shipped Linux; macOS + Windows release pipeline unblocked 2026-05-16 (PLA renewed). **Updated:** 2026-05-21.

## Mission

Native Mac / Windows / Linux app for the same chat layer that runs on web and mobile. Power-user surface — keyboard shortcuts, Cmd-K palette, MCP plugins, computer-use (Pro+ tier), Dispatch host for mobile-controlled tasks.

## Status at HEAD

| Item          | State                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| Linux build   | ✅ v1.2.0 shipped 2026-05-04 (AppImage)                                                                 |
| macOS build   | 🚧 unblocked (PLA renewed 2026-05-16, signing identity `D2PR62RLT4` active); rebuild + notarize pending |
| Windows build | 🚧 unsigned ships; EV cert still pending                                                                |
| Active chat   | `ChatInterface` from `@agiworkforce/unified-chat` (was `packages/chat`)                                 |
| v3 UI         | live behind `DESKTOP_CHAT_V3=true` (default-on per PR #366)                                             |

## Verified codebase numbers (2026-05-17 audit)

- **749** `.rs` files in `apps/desktop/src-tauri/` · ~**377K** LOC
- **1,111** `.ts`/`.tsx` files in `apps/desktop/src/` · **303,407** LOC
- **1,488** `#[tauri::command]` decorators across **137** source files
- **118** stores (was claimed 84 in older memory — undercount)
- **74** component subdirs in `apps/desktop/src/components/`

## Stack + locked versions

| Layer              | Choice                                       | Version                                                         |
| ------------------ | -------------------------------------------- | --------------------------------------------------------------- |
| Shell              | Tauri v2                                     | 2.11.1                                                          |
| Frontend framework | React                                        | 19.x via Vite                                                   |
| Bundler            | Vite                                         | latest (per `package.json`)                                     |
| Rust toolchain     | rustc                                        | 1.94.0 (pinned in `apps/desktop/src-tauri/rust-toolchain.toml`) |
| Native deps        | macOS Seatbelt entitlements XML; Linux bwrap | per `src-tauri/Cargo.toml`                                      |
| Distribution       | DMG (signed `D2PR62RLT4`) · MSI · AppImage   | `target/release/bundle/`                                        |

## File layout

```
apps/desktop/
├── src/                            React frontend
│   ├── App.tsx                     entry; loads ChatInterface and chat overlays
│   ├── features/
│   │   ├── chat/                   Desktop-owned chat shell, CommandPalette, SearchModal, ToolLabel, shortcuts
│   │   └── onboarding/
│   │       └── OnboardingWizard.tsx   ⚠ canonical mode picker (Local vs Cloud); ModeSelectionDialog was deleted, do NOT reintroduce
│   ├── stores/                     118 Zustand stores
│   ├── hooks/                      40+ custom hooks
│   ├── constants/
│   │   └── models.json             ⚠ mirror of packages/types/models.json; SSOT is packages/types
│   └── i18n/                       English + Spanish locales wired
├── src-tauri/                      Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   └── ...                     749 .rs files
│   ├── Cargo.toml                  workspace member; depends only on sandbox-policy crate
│   ├── tauri.conf.json             app metadata; bundle identifier com.agiworkforce.desktop
│   ├── rust-toolchain.toml         Rust 1.94.0 pin
│   └── target/release/bundle/      DMG / MSI / AppImage outputs
├── public/                         static assets
├── package.json                    @agiworkforce/desktop
└── tsconfig.json
```

## Key files to know

| File                                                        | What                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/App.tsx`                                  | Entry. Loads `ChatInterface` from `@agiworkforce/unified-chat` and Desktop chat overlays from `apps/desktop/src/features/chat/`. The retired `apps/desktop/src/components/UnifiedAgenticChat/` directory is removed and guarded. |
| `apps/desktop/src/features/onboarding/OnboardingWizard.tsx` | Mode picker. **`ModeSelectionDialog` was removed and must not be reintroduced** (PRD V5 §10 lock #2).                                                                                                                            |
| `apps/desktop/src-tauri/Cargo.toml`                         | Workspace lint rules: `unsafe_code = "deny"`, `await_holding_lock = "warn"`.                                                                                                                                                     |
| `apps/desktop/src/constants/models.json`                    | Mirror file — DO NOT edit; SSOT is `packages/types/src/models.json`.                                                                                                                                                             |
| `.github/workflows/release-desktop.yml`                     | Tag-triggered build + sign + notarize. Needs `APPLE_*` + `WINDOWS_CERTIFICATE*` GitHub secrets.                                                                                                                                  |

## Build + test commands

```bash
# Dev (hot-reload, opens a window)
pnpm dev:desktop

# Production bundle
pnpm build:desktop
# Outputs: apps/desktop/src-tauri/target/release/bundle/

# Typecheck just desktop
pnpm typecheck

# Typecheck all workspaces
pnpm typecheck:all

# Rust check
cargo check --workspace

# Rust tests
cargo test --workspace --lib

# Playwright E2E
pnpm --filter desktop exec playwright test

# Lint
pnpm lint                    # excludes apps/extension
```

## Release process

1. Bump version in `apps/desktop/src-tauri/tauri.conf.json` + `apps/desktop/package.json`
2. Update `CHANGELOG.md` with the release notes
3. Tag: `git tag v-desktop-X.Y.Z && git push --tags`
4. GitHub Actions workflow `release-desktop.yml` runs on tag push:
   - macOS: builds + signs with `APPLE_CERTIFICATE` + notarizes via `APPLE_*` secrets
   - Windows: builds + signs with `WINDOWS_CERTIFICATE` (currently missing → unsigned builds ship)
   - Linux: builds AppImage unsigned
   - Uploads to GitHub Releases
   - Signed Ed25519 update endpoint at Supabase (per `memory/reference/patterns/release-pipeline.md`)

## Provider integrations on desktop

All 10+ providers route through `@agiworkforce/llm-normalize` via `packages/api`. Desktop is the first surface that wires every provider end-to-end. See [docs/surfaces/cli.md](cli.md) for the canonical list (CLI registers all 12 named + Custom).

## Current open work (Wave 6, in flight)

1. **W6 #15** — Desktop Dispatch outbound signer (hard deadline 2026-06-05). Currently mobile can send to desktop but desktop can't sign outbound. Without this, mobile rejects desktop signals after 2026-06-05.
2. **W6 #19** — Remove `?? 'gpt-5.4'` hardcoded fallbacks in 5 Web files (cross-surface — see [docs/surfaces/web.md](web.md)).
3. **W6 #22** — CLI sandbox hard-refuse on Windows + Linux-no-bwrap (no silent fallthrough). Cross-surface with CLI.

## Gotchas

- **Two stale claims in older docs.** Older MEMORY.md said "84 stores" and "97 component subdirs" — actual today is **118 stores** and **74 component subdirs**. Audit verified.
- **Retired chat folder:** `apps/desktop/src/components/UnifiedAgenticChat/` is removed. Do not recreate it. Desktop-owned chat code now lives in `apps/desktop/src/features/chat/`; the component name `UnifiedAgenticChat` can still appear inside that feature folder and tests.
- **`apps/desktop/src/constants/models.json` is a mirror.** Never edit this file directly. SSOT is `packages/types/src/models.json`. There's a build-time sync (or should be — verify).
- **macOS code-signing identity:** `D2PR62RLT4`. Don't change without owner approval.
- **Bundle identifier:** `com.agiworkforce.desktop`. Don't change — would break update channel.

## Current References

- [docs/current/product-suite.md](../current/product-suite.md) - Desktop role in Web/Mobile/Desktop chat sync and local compute.
- [docs/current/technical-architecture.md](../current/technical-architecture.md) - runtime, generated-file, and provider boundaries.
- [docs/current/agent-and-repo-operability.md](../current/agent-and-repo-operability.md) - current docs and agent workflow rules.
- [docs/decisions/CURRENT_DECISIONS.md](../decisions/CURRENT_DECISIONS.md) - current trust-boundary and application-suite decisions.
- Historical Tauri command and layout details live in `docs/archive/2026-05-21-docs-consolidation/`.

## Memory references

- `memory/reference/patterns/release-pipeline.md` — desktop + CLI signing, notarization, update endpoint
- `memory/reference/patterns/tauri-build-commands.md` — Tauri v2 build/bundle/sign commands
- `memory/audits/release-v1.2.0-2026-05-04.md` — v1.2.0 release state + APPLE\_\* secret blockers

## Operational owner

Founder. Hiring: looking for a senior Rust engineer + macOS specialist post-launch.
