# AGI Workforce – Consolidated Project Overview

## Snapshot

- **Goal**: Ship a Windows-first autonomous agent built on Tauri 2.0, React 18, and a Rust command layer. The agent must automate desktop, browser, filesystem, API, and productivity workflows while routing intelligently across cloud LLMs and local models (Ollama) to minimize cost.
- **Current State**: **Pre-alpha**. `pnpm typecheck` and `pnpm lint` now pass with zero warnings or errors, but end-to-end automation, security guardrails, and runtime validation are incomplete.
- **Key Differentiator**: Local-first multi-LLM router that blends on-device inference (Ollama) with optional premium providers (OpenAI, Anthropic, Google) using token-pack billing.

## Architecture Summary

- **Desktop App**: Tauri 2.0 shell with React 18 UI, Zustand stores, and Tailwind/Radix-based components.
- **Rust Backend**: MCP modules for Windows UI automation, browser automation (Playwright/CDP), filesystem, database, API, cloud storage, and telemetry.
- **Shared Packages**: `@agiworkforce/utils` (signaling client, shared helpers).
- **Services**: Node/Express API Gateway, WebSocket gateway, and a custom signaling server for mobile/desktop pairing.
- **Mobile Companion**: Expo/React Native app (scaffolded). Stores, signaling, and WebRTC wiring compile but require device-level testing.

## Build & Test Status

| Check                                     | Status                                 | Notes                                                            |
| ----------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `pnpm typecheck`                          | ✅                                     | Strict mode enforced across apps, packages, and services.        |
| `pnpm lint`                               | ✅                                     | Repo-wide lint passes with TypeScript-aware resolver.            |
| `pnpm --filter @agiworkforce/desktop dev` | ⚠️ Pending manual verification         | UI compiles; functional smoke-tests still required.              |
| Rust `cargo check` / tests                | ⚠️ Not yet re-run after recent changes | Execute before release.                                          |
| Automated tests                           | ⚠️ Gaps                                | Add Vitest/Playwright suites for desktop; Jest/Detox for mobile. |

## Multi-LLM Strategy

- **Providers**: OpenAI, Anthropic, Google, Ollama (local). Provider metadata syncs between Rust and TypeScript.
- **Routing**: Prioritize Ollama for default tasks; fall back to premium LLMs on quality or latency thresholds. Persist routing/cost telemetry in SQLite.
- **Billing**: Implement token-pack accounting for premium usage; surface remaining quota in the Cost Dashboard.
- **Observability**: Capture provider latency, token counts, cache hits, and failure paths for every execution.
- **Setup**: Distinguish local providers (no API key) vs cloud providers (secure key storage). Add health checks and onboarding flows.

## Automation MCP Coverage

| MCP                                    | Backend Status                                          | UI Status           | Key TODOs                                                       |
| -------------------------------------- | ------------------------------------------------------- | ------------------- | --------------------------------------------------------------- |
| Windows Automation                     | Rust modules (UIA, input, overlay, capture) implemented | UI overlays present | Add permission prompts, sandbox enforcement, integration tests. |
| Browser Automation                     | Playwright/CDP bridge, signaling server ready           | UI scaffolding      | Package extension, build smoke scripts, handle auth flows.      |
| Filesystem                             | CRUD + watcher commands                                 | UI partial          | Build scoped browser w/ permissions, error handling.            |
| Database                               | Connector scaffolding                                   | UI partial          | Query templates, credential vault, result viewers.              |
| API                                    | HTTP/OAuth module implemented                           | UI partial          | Fix key storage, request templating, response parsing.          |
| Cloud Storage                          | Provider modules (Drive, Dropbox, OneDrive) implemented | UI partial          | Verify OAuth flows, delta sync, permission UI.                  |
| Document MCP                           | Minimal                                                 | UI missing          | Implement ingestion, OCR pipeline, vector store integration.    |
| Productivity, Communications, Calendar | Partially scaffolded                                    | UI missing          | Complete feature set and integration.                           |

## Desktop UI Status

- Shell: Frameless window, tray, docking, and theme controls compile; require runtime QA and accessibility pass.
- Chat: Zustand stores, message list, composer, cost widgets compile; integrate streaming, attachments, and cost data.
- Code Workspace: Monaco editor, file tree, diff viewer wired with strict typings; finish backend save/revert validations.
- Terminal: PTY handler present; connect UI and enforce security (command allow-lists).
- Analytics: Cost dashboard components compile; hook up real telemetry data.

## Mobile Companion Status

- Pairing Modal, signaling client, and connection store compile under strict mode.
- WebRTC helper adapts to `react-native-webrtc` typings; persistent testing on physical devices still required.
- Push notifications, sync store, and device management use explicit `null` states; integrate with production services.

## Security & Compliance Plan

1. **Permission Framework**: Prompt before sensitive automation actions; persist consents with expiry.
2. **Secrets Vault**: Store API keys and OAuth tokens via Windows Credential Manager (DPAPI). Avoid SQLite/plaintext secrets.
3. **Audit & Telemetry**: Emit structured logs for every MCP invocation, provider call, and permission decision; integrate with central logging.
4. **Prompt Hygiene**: Add middleware to detect prompt-injection patterns and escalate high-risk commands for human confirmation.
5. **Sandboxing**: Limit filesystem/network access; run automation in controlled contexts.
6. **Packaging**: Sign Tauri builds, enforce auto-update signature checks, document enterprise distribution steps.

## Testing & Automation Roadmap

- **Immediate**: Add Vitest unit tests for stores/hooks; implement Playwright smoke suite for key desktop flows.
- **Automation**: Capture deterministic scripts for Windows & browser MCPs running in VM snapshots; integrate into CI once stable.
- **Mobile**: Add Jest tests for stores/services; plan Detox/e2e once device provisioning is set up.
- **CI/CD**: Configure GitHub Actions for lint/typecheck/tests on PRs; add binary builds and release packaging once automation passes.

## Outstanding Work

1. **Runtime Validation**: Manually verify desktop shell, chat, MCP operations, and multi-LLM routing after recent fixes.
2. **Automation Guardrails**: Implement permission prompts, telemetry, and sandboxing before exposing automation to users.
3. **LLM Router Enhancements**: Finish provider health checks, fallback policies, and token-pack billing enforcement.
4. **Mobile Companion QA**: Exercise pairing, streaming, and remote control on physical devices; address WebRTC edge cases.
5. **Documentation & Runbooks**: Update `README.md` and this overview as functionality evolves; maintain a changelog for release readiness.

---

**Canonical Reference**: This document supersedes previous status, audit, milestone, and feature markdown files. Keep it updated alongside code changes to maintain a single source of truth. README.md remains the entry point for setup instructions.
