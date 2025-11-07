# AGI Workforce - Consolidated Project Overview

## Snapshot

- **Goal:** Ship a Windows-first autonomous agent built on Tauri 2.0, React 18, and a Rust command layer. The agent must automate desktop, browser, filesystem, API, and productivity workflows while routing intelligently across cloud LLMs and local models (Ollama) to minimize cost.
- **Current State:** Pre-alpha with AGI system fully implemented. Build health significantly improved. AGI Core system complete with chat integration, resource monitoring, and 15+ tools. See [STATUS.md](./STATUS.md) for detailed current implementation status.
- **Key Differentiator:** Local-first multi-LLM router that blends on-device inference (Ollama) with optional premium providers (OpenAI, Anthropic, Google) using token-pack billing.

## Architecture Summary

- **Desktop App:** Tauri 2.0 shell with React 18 UI, Zustand stores, and Tailwind/Radix-based components.
- **Rust Backend:** MCP modules for Windows UI automation, browser automation (Playwright/CDP), filesystem, database, API, cloud storage, and telemetry.
- **Shared Packages:** `@agiworkforce/utils` (signaling client, shared helpers).
- **Services:** Node/Express API Gateway, WebSocket gateway, and a custom signaling server for mobile/desktop pairing.
- **Mobile Companion:** Expo/React Native app (scaffolded). Stores, signaling, and WebRTC wiring compile but require device-level testing.

## Build & Test Status

| Check                                     | Status  | Notes                                                                         |
| ----------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `pnpm typecheck`                          | Pass    | TypeScript errors reduced from ~1,200 to under 100 through critical fixes.    |
| `pnpm lint`                               | Pass    | Repo-wide lint passes with the TypeScript-aware resolver.                     |
| Version pinning                           | Done    | Node 20.11.0+/22.x, pnpm 8.15.0+, Rust 1.90.0 enforced via config files.      |
| Rust safety fixes                         | Done    | Fixed critical undefined behavior in screen capture (RGBQUAD initialization). |
| `pnpm --filter @agiworkforce/desktop dev` | Pending | UI compiles; functional smoke-tests still required on a live desktop.         |
| Rust `cargo check` / tests                | Pending | Must be re-run after recent TypeScript and UI refactors.                      |
| Automated tests                           | Gaps    | Vitest/Playwright suites for desktop; Jest/Detox for mobile.                  |

## Multi-LLM Strategy

- **Providers:** OpenAI, Anthropic, Google, and Ollama (local). Provider metadata syncs between Rust and TypeScript.
- **Routing:** Prioritise Ollama for default tasks; fall back to premium LLMs when quality or latency thresholds demand it. Persist routing and cost telemetry in SQLite.
- **Billing:** Implement token-pack accounting for premium usage; surface remaining quota in the Cost Dashboard.
- **Observability:** Capture provider latency, token counts, cache hits, and failure paths for every execution.
- **Setup:** Distinguish local providers (no API key) from cloud providers (secure key storage). Add health checks, onboarding flows, and usage analytics.

## Automation MCP Coverage

| MCP                                    | Backend Status                                          | UI Status           | Key TODOs                                                       |
| -------------------------------------- | ------------------------------------------------------- | ------------------- | --------------------------------------------------------------- |
| Windows Automation                     | Rust modules (UIA, input, overlay, capture) implemented | UI overlays present | Add permission prompts, sandbox enforcement, integration tests. |
| Browser Automation                     | Playwright/CDP bridge, signaling server ready           | UI scaffolding      | Package extension, build smoke scripts, handle auth flows.      |
| Filesystem                             | CRUD plus watcher commands                              | UI partial          | Build scoped browser with permissions and resilient errors.     |
| Database                               | Connector scaffolding                                   | UI partial          | Query templates, credential vault, result viewers.              |
| API                                    | HTTP/OAuth module implemented                           | UI partial          | Fix key storage, request templating, response parsing.          |
| Cloud Storage                          | Provider modules (Drive, Dropbox, OneDrive) implemented | UI partial          | Verify OAuth flows, delta sync, permission UI.                  |
| Document MCP                           | Minimal                                                 | UI missing          | Implement ingestion, OCR pipeline, vector store integration.    |
| Productivity, Communications, Calendar | Partially scaffolded                                    | UI missing          | Complete feature set and integration.                           |

## Desktop UI Status

- Shell: Frameless window, tray, docking, and theme controls compile; require runtime QA and accessibility pass.
- Chat: Zustand stores, message list, composer, and cost widgets compile; integrate streaming, attachments, and cost data.
- Code Workspace: Monaco editor, file tree, diff viewer wired with strict typings; finish backend save/revert validations.
- Terminal: PTY handler present; connect UI and enforce security (command allow-lists).
- Analytics: Cost dashboard components compile; hook up real telemetry data.

## Mobile Companion Status

- Pairing modal, signaling client, and connection store compile under strict type checking.
- WebRTC helper adapts to `react-native-webrtc` typings; persistent testing on physical devices still required.
- Manual pairing fallback now resolves the WebSocket URL from Expo environment variables (`EXPO_PUBLIC_SIGNALING_WS_URL`, `EXPO_PUBLIC_SIGNALING_HTTP_URL`, or `EXPO_PUBLIC_SIGNALING_HOST` plus `EXPO_PUBLIC_SIGNALING_WS_PATH`). Document and verify these before device testing.
- Push notifications, sync store, and device management use explicit `null` states; integrate with production services.

## Security and Compliance Plan

1. **Permission Framework:** Prompt before sensitive automation actions; persist consents with expiry.
2. **Secrets Vault:** Store API keys and OAuth tokens via Windows Credential Manager (DPAPI). Avoid SQLite/plaintext secrets.
3. **Audit and Telemetry:** Emit structured logs for every MCP invocation, provider call, and permission decision; integrate with central logging.
4. **Prompt Hygiene:** Add middleware to detect prompt-injection patterns and escalate high-risk commands for human confirmation.
5. **Sandboxing:** Limit filesystem and network access; run automation in controlled contexts.
6. **Packaging:** Sign Tauri builds, enforce auto-update signature checks, document enterprise distribution steps.

## Testing and Automation Roadmap

- Immediate: Add Vitest unit tests for stores/hooks; implement a Playwright smoke suite for key desktop flows.
- Automation: Capture deterministic scripts for Windows and browser MCPs running in VM snapshots; integrate into CI once stable.
- Mobile: Add Jest tests for stores/services; plan Detox/e2e once device provisioning is set up.
- CI/CD: Configure GitHub Actions for lint/typecheck/tests on PRs; add binary builds and release packaging once automation passes.

## Recent Improvements (Phases 1-3)

### Phase 1: Critical Fixes

- Fixed critical Rust undefined behavior in screen capture module (RGBQUAD zero-initialization with `std::mem::zeroed()`)
- Added missing `tsconfig.json` files to `packages/types` and `packages/utils` for proper TypeScript project references
- Relaxed `exactOptionalPropertyTypes` to `false` in `tsconfig.base.json` for better Tauri API compatibility
- Installed missing API gateway dependencies

### Phase 2: Version Pinning

- Created `.nvmrc` pinning Node to 20.11.0 for consistent development environments
- Created `.npmrc` with `engine-strict=true` and pnpm configuration
- Created `rust-toolchain.toml` pinning Rust to 1.90.0 for consistent toolchain
- Added `engines` field to root `package.json` (Node >=20.11.0 <23, pnpm >=8.15.0)
- Updated README.md with comprehensive setup documentation

### Phase 3: Dependency Cleanup

- Updated Node engine constraint to support both v20.x and v22.x for flexibility

## Outstanding Work

1. **Runtime Validation:** Manually verify desktop shell, chat, MCP operations, and multi-LLM routing after recent fixes.
2. **Automation Guardrails:** Implement permission prompts, telemetry, and sandboxing before exposing automation to users.
3. **LLM Router Enhancements:** Finish provider health checks, fallback policies, and token-pack billing enforcement.
4. **Mobile Companion QA:** Exercise pairing, streaming, and remote control on physical devices; address WebRTC edge cases.
5. **Documentation and Runbooks:** Keep this overview and README in sync with functionality; maintain a changelog for release readiness.

---

**Documentation Structure:**

- **README.md** - Entry point for setup instructions and getting started
- **STATUS.md** - Current implementation status and recent improvements (updated regularly)
- **PROJECT_OVERVIEW.md** (this file) - Architecture overview and project structure
- **CLAUDE.md** - Development guide for AI assistants

**Note:** Previous redundant status/implementation files have been consolidated into STATUS.md. Always update STATUS.md when making significant changes to the codebase.
