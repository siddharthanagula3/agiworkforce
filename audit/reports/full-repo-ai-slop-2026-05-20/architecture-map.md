# Full-Repo Audit Architecture Map - 2026-05-20

This map is based on repo files and command output, not external assumptions:

- `AGI_WORKFORCE.md` single source of truth, read in this pass.
- `BUILD.md` prerequisites, build commands, and CI overview, read in this pass.
- `package.json` workspace scripts and `pnpm.overrides`, inspected with Node.
- `cargo metadata --no-deps --format-version 1`, run locally.
- `.github/workflows/*.yml`, enumerated locally.
- `audit/reports/full-repo-ai-slop-2026-05-20/file-inventory.tsv`, generated locally.

## Inventory

- Inventory rows: 6,292 including header; 6,291 file entries.
- Scan evidence files:
  - `scan-command-exec.txt` - command/network/process/file execution candidates.
  - `scan-debug-logs.txt` - logging/debug markers.
  - `scan-model-ids.txt` - hardcoded model/provider candidates.
  - `scan-risky-patterns.txt` - broad risk pattern sweep.
  - `scan-service-role.txt` - service-role and privileged-token candidates.
  - `scan-skipped-tests.txt` - skipped/weakened tests.
  - `scan-slop-markers.txt` - TODO/FIXME/mock/demo/placeholder markers.
  - `scan-xss-exec-sinks.txt` - XSS/eval/HTML/command sink candidates.

Generated/vendor/build outputs were excluded from manual review priority where identified by path/category, including `node_modules`, `target`, `dist`, `build`, coverage, caches, Playwright reports, and generated platform build outputs.

## Surfaces And Entry Points

- CLI/TUI: `apps/cli/`, Rust binary workspace member. Main command surface is cargo-built via `cargo build --release -p agiworkforce-cli`.
- Desktop: `apps/desktop/`, Tauri v2 with React/Vite frontend and Rust backend in `apps/desktop/src-tauri/`. Important trust-boundary entry points include IPC commands, native messaging host, MCP commands, local filesystem/search, realtime websocket server, and secure storage.
- Web: `apps/web/`, Next app router plus API routes. Build script also builds the desktop SPA into `apps/web/public/chat/` before `next build`.
- Mobile: `apps/mobile/`, Expo/React Native. Important trust-boundary entry points include onboarding/auth mode, local encrypted storage, provider keys, telemetry queue, model download/listing, and app-intent/deep-link surfaces.
- Chrome extension: `apps/extension/`, MV3 extension. Important boundary is browser/content/background/native-host messaging.
- VS Code extension: `apps/extension-vscode/`, VS Code command/chat participant surface.
- Services: `services/api-gateway/` Express gateway and `services/signaling-server/` WebRTC/signaling.
- Database: `supabase/` migrations are canonical per repo guidance. `apps/web/supabase/migrations/` is legacy and remains a known drift risk.

## Package And Dependency Graph

Node workspaces discovered under:

- `apps/{desktop,extension,extension-vscode,mobile,sandbox,web}`
- `packages/{api,apply-patch,browser-tool,compliance,data-layer,design-tokens,llm-normalize,llm-runtime,local-llm,mcp,react-native-worklets,routing,runtime,skills,stores,types,unified-chat,utils}`
- `services/{api-gateway,signaling-server}`

Rust workspace packages from `cargo metadata --no-deps` in this pass:

- `agiworkforce-app-server`
- `agiworkforce-apply-patch`
- `agiworkforce-async-utils`
- `agiworkforce-cli`
- `agiworkforce-command-registry`
- `agiworkforce-desktop`
- `agiworkforce-execpolicy`
- `agiworkforce-network-proxy`
- `agiworkforce-plugin-runtime`
- `agiworkforce-protocol`
- `agiworkforce-sandbox-policy`
- `agiworkforce-task-runtime`
- `agiworkforce-utils-absolute-path`
- `agiworkforce-utils-cache`
- `agiworkforce-utils-home-dir`
- `agiworkforce-utils-image`
- `agiworkforce-utils-rustls-provider`
- `agiworkforce-utils-string`
- `agiworkforce-utils-template`

## Data Flows And Auth Boundaries

- Local Desktop mode: desktop-only, local SQLite/local providers, no Supabase auth or sync.
- Cloud mode: Desktop/Web/Mobile cross Supabase auth, Realtime sync, BYOK or managed cloud providers, and Dispatch.
- Provider boundary: provider adapters and runtime packages normalize cross-provider tool/message payloads. Model IDs must be sourced from `models.json`/catalogs, not hardcoded.
- Browser/native boundary: Chrome extension sends native messages to desktop native host; strict response MAC verification exists in `apps/extension/src/background.ts`.
- MCP/tool boundary: desktop tool confirmation gates Plan/Safe/Build/Autopilot execution and read-only MCP allowlists.
- Mobile local storage boundary: Expo SecureStore holds SQLCipher key material; SQLite holds conversations/messages/provider metadata/telemetry.
- Web/API boundary: Next API routes and services handle Supabase, Stripe, providers, and public HTTP inputs.

## External Services

Observed/documented service dependencies include Supabase, Stripe, provider SDKs/APIs, Ollama/LMStudio local runtimes, Fly.io, Vercel, Expo/EAS, Chrome Web Store, VS Code Marketplace, GitHub Actions, and Playwright.

## Toolchain And Commands

Pinned toolchain from repo files:

- Node 22 (`.nvmrc`, `BUILD.md`).
- pnpm 9.15.3 (`package.json:packageManager`, verified by `pnpm --version`).
- Rust 1.94.0 (`apps/desktop/src-tauri/rust-toolchain.toml`, `BUILD.md`).
- TypeScript pinned by root `pnpm.overrides`.

Repo-level commands discovered:

- `pnpm lint`
- `pnpm lint:extension`
- `pnpm typecheck`
- `pnpm typecheck:all`
- `pnpm test`
- `pnpm build`
- `pnpm build:desktop`
- `cargo check --workspace`
- `cargo test --workspace --lib`
- `cargo clippy --workspace --lib -- -D warnings -D unsafe-code`
- `cargo audit`

## GitHub Actions

Workflows enumerated:

- `.github/workflows/actions-pinned-check.yml`
- `.github/workflows/agiworkforce-bot.yml`
- `.github/workflows/build-windows-release.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/cli-release.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/deploy-signaling-server.yml`
- `.github/workflows/e2e-tests.yml`
- `.github/workflows/release-cli.yml`
- `.github/workflows/release-desktop.yml`
- `.github/workflows/release.yml`

`ci.yml` gates JS audit, lint, typecheck, tests, web/service/extension builds, Semgrep, Rust audit, desktop/CLI Rust tests, strict clippy, desktop e2e, all-features clippy, and macOS/Windows Rust smoke jobs. Release workflows add package/bundle validation and signing-dependent release paths.
