# Desktop surface

> **Path:** `apps/desktop/` · **Stack:** Tauri v2.11.1 + React (Vite) · **Owner:** founder · **Status:** v1.2.0 shipped Linux; macOS + Windows release pipeline unblocked 2026-05-16 (PLA renewed). **Updated:** 2026-05-21.

## Mission

Native Mac / Windows / Linux app for the same chat layer that runs on web and mobile. Power-user surface, keyboard shortcuts, Cmd-K palette, MCP plugins, computer-use (Pro+ tier), Dispatch host for mobile-controlled tasks.

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
- **118** stores (was claimed 84 in older memory, undercount)
- **74** component subdirs in the former Desktop components tree, all since moved into
  `apps/desktop/src/features/` and `apps/desktop/src/ui/`. The old tree
  no longer exists; `pnpm check:structure-conventions` fails if any of those retired
  domain directories (including `ui/`) or an import of their old paths reappears.

## Stack + locked versions

| Layer              | Choice                                                                 | Version                                                         |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| Shell              | Tauri v2                                                               | 2.11.1                                                          |
| Frontend framework | React                                                                  | 19.x via Vite                                                   |
| Bundler            | Vite                                                                   | latest (per `package.json`)                                     |
| Rust toolchain     | rustc                                                                  | 1.94.0 (pinned in `apps/desktop/src-tauri/rust-toolchain.toml`) |
| Native deps        | macOS Seatbelt entitlements XML; Linux bwrap                           | per `src-tauri/Cargo.toml`                                      |
| Distribution       | Linux AppImage automated; Windows gated on Authenticode; macOS blocked | root `target/release/bundle/`                                   |

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
│   │   └── models.json             ⚠ mirror of packages/contracts/types/models.json; SSOT is packages/contracts/types
│   └── i18n/                       English + Spanish locales wired
├── src-tauri/                      Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   └── ...                     750 .rs files
│   ├── Cargo.toml                  workspace member; depends only on sandbox-policy crate
│   ├── tauri.conf.json             app metadata; bundle identifier com.agiworkforce.desktop
│   ├── rust-toolchain.toml         Rust 1.94.0 pin
│   └── Cargo/Tauri sources         build outputs live at root target/ because this is a Cargo workspace member
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
| `apps/desktop/src/constants/models.json`                    | Mirror file, DO NOT edit; SSOT is `packages/contracts/types/src/models.json`.                                                                                                                                                    |
| `.github/workflows/release-desktop.yml`                     | Canonical `v-desktop-*` workflow. Validates versions, builds Linux x86_64, attaches the Tauri updater signature, publishes, then ingests updater metadata.                                                                       |
| `.github/workflows/build-windows-release.yml`               | Manual recovery workflow for a selected published desktop tag. Checks out that tag, requires Azure Artifact Signing identity/config, verifies Authenticode before upload, then ingests Windows updater metadata.                 |

## Build + test commands

```bash
# Dev (hot-reload, opens a window)
pnpm dev:desktop

# Production bundle
pnpm build:desktop
# Outputs: target/release/bundle/ (the Cargo workspace target directory)

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

1. Bump the same version in `apps/desktop/package.json`,
   `apps/desktop/src-tauri/tauri.conf.json`, and `apps/desktop/src-tauri/Cargo.toml`.
2. Run `bash scripts/release.sh X.Y.Z` to validate the tag plan.
3. From a clean tree, run `bash scripts/release.sh X.Y.Z --yes`; it creates and pushes only
   `v-desktop-X.Y.Z`.
4. `release-desktop.yml` validates, builds Linux x86_64, uploads the AppImage plus Tauri updater
   signature to a draft, publishes the GitHub release, and only then writes the Neon updater row.
5. Windows is not part of that atomic workflow. If Windows is intentionally added to an existing
   desktop release, invoke `build-windows-release.yml` for the exact tag. It refuses to publish
   without a valid Authenticode certificate and checks out the selected tag rather than `main`.
6. There is no production macOS workflow. Do not claim a signed/notarized DMG until that job and
   its Apple credentials exist.

Windows publication requires a verified Azure Artifact Signing account and certificate profile.
Configure GitHub secrets `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID`, plus
repository variables `AZURE_ARTIFACT_SIGNING_ENDPOINT`, `AZURE_ARTIFACT_SIGNING_ACCOUNT`, and
`AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE`. The workflow installs the pinned
`artifact-signing-cli` version, feeds it to Tauri through a release-only `signCommand` overlay,
and refuses upload unless Windows reports every shipping executable as Authenticode-valid.

## Provider integrations on desktop

All 10+ providers route through `@agiworkforce/provider-protocol` via `packages/client/desktop-command-client`. Desktop is the first surface that wires every provider end-to-end. See [docs/surfaces/cli.md](cli.md) for the canonical list (CLI registers all 12 named + Custom).

## Computer-use action routing and platform support (2026-09-05)

One classified action is resolved by `src-tauri/src/automation/action_router/` before the
observe-plan-act visual loop is reached. The order is fixed in code, never left to model tool
choice: an HTTP retrieval, then the platform accessibility service, then the page over the devtools
protocol, then vision as the last resort. Each tier answers from a typed capability check and
records a typed decline on the `computer_use:action_routed` event, which names the driver that ran
the action.

| Tier          | Driver                                         | Verbs it accepts                                                                                                                            |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| API           | `http_api`                                     | retrieve an absolute URL                                                                                                                    |
| Accessibility | `macos_accessibility`, `windows_ui_automation` | invoke a named control, type into a named field, toggle a named control, focus a window by title, scroll a named region, read a named value |
| DOM           | `chrome_devtools_protocol`                     | navigate, click, type, select an option, read text, scroll into view                                                                        |
| Visual        | `visual_loop`                                  | everything the tiers above declined                                                                                                         |

Platform support for the accessibility tier is decided, not implicit:

| Platform | Accessibility tier                                                                                                                                                                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | Supported through `automation/mac`. `scroll a named region` is declined `platform_unsupported`, the service exposes no scroll pattern                                                                                                                                                                                                        |
| Windows  | Supported through `automation/uia`, including scrolling                                                                                                                                                                                                                                                                                      |
| Linux    | **Not supported.** There is no AT-SPI implementation here, and adding one is not a bounded change: it needs a new crate dependency, a session bus client, and a full inspector. The tier declines `platform_unsupported` with the platform named, the decline is recorded on the routing event, and the visual loop takes the action instead |

`automation::accessibility_backend()` is the single place that answers "does this platform have an
accessibility driver, and what is it called". The Linux `uia` shim in `automation/mod.rs` still
errors on every call, now with one named constant rather than ten copies of a sentence, so a caller
that reaches it past the tier gets the same answer the router already gave.

## Dispatch and scheduled routines (shipped; verified 2026-08-09)

Mobile-to-Desktop Dispatch and on-device scheduled routines both exist in code, which is what the
`/agi-work` marketing page claims ("Scheduled routines and mobile-to-desktop dispatch ship with the
Desktop app"). Evidence:

- **Outbound signing exists**: this closes the old "W6 #15 outbound signer" item, which said
  desktop could receive but not sign. `signOutbound()`
  (`apps/desktop/src/services/dispatch.ts:313`) invokes the Rust `dispatch_hmac_sign` command, and
  every outbound companion control message is signed through it in `sendCompanionControl()`
  (`apps/desktop/src/stores/connectionStore.ts:241`).
- **Inbound dispatch runs a real task**, the runtime is started at
  `apps/desktop/src/App.tsx:649` (`initializeCoworkDispatchRuntime`), and a
  `dispatch.task.create` control message submits an actual agent goal
  (`apps/desktop/src/services/coworkDispatch.ts:412-468`), streaming status back to Mobile.
- **Dispatch is default-deny per device**, `apps/desktop/src/stores/coworkDispatchStore.ts` starts
  `enabled: false`; only Settings → Cowork turns it on, and a task arriving while it is off is
  rejected with that reason. Pairing alone never grants execution authority.
- **Scheduled routines are real and persisted**, the scheduler lives in
  `apps/desktop/src-tauri/src/sys/commands/scheduler.rs`, its store is created at
  `apps/desktop/src-tauri/src/lib.rs:812-844` (SQLite `scheduler.db`, temp-dir fallback), and its
  commands are registered at `apps/desktop/src-tauri/src/lib.rs:2022-2032`. The UI is
  `AgiWorkScheduled`, mounted in `apps/desktop/src/features/v3/DesktopShellV3.tsx:831`.

There is still no Dispatch **subpanel** in the desktop shell; dispatch is configured in
Settings → Cowork and observed from Mobile. The deeper "desktop routines product" tracked as
CAP-049 is about that missing surface and the host-relay contract, not about the transport above.

## Current open work (Wave 6, in flight)

1. **W6 #19**: Remove hardcoded model fallbacks in 5 Web files (cross-surface, see [docs/surfaces/web.md](web.md)).
2. **W6 #22**: CLI sandbox hard-refuse on Windows + Linux-no-bwrap (no silent fallthrough). Cross-surface with CLI.

## Gotchas

- **Counts in prose go stale.** This file has carried three different store counts. Measure before citing one: `git ls-files 'apps/desktop/src/stores/*' | wc -l`.
- **Retired chat folder:** `apps/desktop/src/components/UnifiedAgenticChat/` is removed. Do not recreate it. Desktop-owned chat code now lives in `apps/desktop/src/features/chat/`; the component name `UnifiedAgenticChat` can still appear inside that feature folder and tests.
- **There is no desktop model mirror.** `apps/desktop/src/constants/models.json` does not exist; the catalog is resolved through `packages/contracts/types/src/model-catalog.ts` like every other surface.
- **macOS code-signing identity:** `D2PR62RLT4`. Don't change without owner approval.
- **Bundle identifier:** `com.agiworkforce.desktop`. Don't change, would break update channel.

## Current References

- [docs/product/suite.md](../product/suite.md) - Desktop role in Web/Mobile/Desktop chat sync and local compute.
- [docs/architecture/overview.md](../architecture/overview.md) - runtime, generated-file, and provider boundaries.
- [docs/development/agent-operability.md](../development/agent-operability.md) - current docs and agent workflow rules.
- [docs/decisions/README.md](../decisions/README.md) - current trust-boundary and application-suite decisions.
- Historical Tauri command and layout details live only in git history.

## Memory references

- `memory/reference/patterns/release-pipeline.md`, desktop + CLI signing, notarization, update endpoint
- `memory/reference/patterns/tauri-build-commands.md`, Tauri v2 build/bundle/sign commands
- `memory/audits/release-v1.2.0-2026-05-04.md`, v1.2.0 release state + APPLE\_\* secret blockers

## Operational owner

Founder. Hiring: looking for a senior Rust engineer + macOS specialist post-launch.
