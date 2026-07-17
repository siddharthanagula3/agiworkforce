# AGI Runtime — Volume 34 — Testing

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root) and `apps/mobile/AGENTS.md` (active surface); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); grounded in `Cargo.toml` (workspace), `crates/agiworkforce-app-server/tests/jsonrpc.rs`, `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/tests/lifecycle.rs`, `crates/agiworkforce-protocol/src/error_tests.rs`, `packages/client/client-runtime/src/__tests__/`, `services/signaling-server/__tests__/`, `services/api-gateway/vitest.config.ts`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `apps/web/app/api/{chat,memory,projects}/sync/route.ts`, `apps/web/app/api/control-plane/status/route.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, and `scripts/check-llm-failure-guardrails.mjs`.

## Overview & stance

This volume defines how the **internal AGI Runtime layer** is tested — the shared Rust crates, `packages/client/client-runtime`, the Desktop `127.0.0.1` WS/IPC host, the Chrome native-messaging bridge, the `services/signaling-server` relay, and the Neon delta-sync APIs. AGI Runtime is not a user surface, so its tests live _inside_ the surfaces and services that compile it rather than in a standalone app. Because the Runtime spans **three trust modes** (Local, BYOK on Desktop/CLI/VS Code only, Managed Cloud), the highest-value tests are boundary tests: they assert that Local chats/files/sessions are **never** silently routed to BYOK or Cloud, that remote-control traffic is a window over a locally-running session (compute stays on the host), and that only Managed-Cloud rows enter Neon delta-sync. No fake tests: `pnpm check:llm-failures` (`scripts/check-llm-failure-guardrails.mjs`, plus `:staged`/`:changed`/`:strict`) guards against swallowed assertions, always-pass stubs, and mock-only "coverage." These are target/design requirements; writing them is not authorization to implement (serial-by-surface lock holds; Mobile is active).

## Unit Testing — individual components

Every Runtime component ships table-driven unit tests for its pure logic. Rust crates use in-tree `#[cfg(test)]` modules and `#[tokio::test]` for async paths; TS packages use Vitest.

- ✅ Built — Rust protocol/type units: `crates/agiworkforce-protocol/src/error_tests.rs` plus `#[test]` modules across `thread_id.rs`, `models.rs`, `approvals.rs`, `permissions.rs`. Run via `cargo test --workspace`.
- ✅ Built — Runtime TS units: `packages/client/client-runtime/src/__tests__/`, `state/__tests__/`, `offline-queue/__tests__/`, `queue/__tests__/`, `context/__tests__/` (Vitest, `packages/client/client-runtime/vitest.config.ts`).
- ✅ Built — Companion pairing validators: `apps/mobile/services/companion.ts` QR/HMAC pattern parsing (`PAIRING_CODE_PATTERN`) is deterministic and must have unit coverage for malformed/oversized/wrong-role codes.
- 🔭 Planned — `agiworkforce-command-registry` needs per-crate unit suites (the `agiworkforce-plugin-runtime` crate this used to also cite was removed 2026-07-08, zero dependents, no replacement crate exists yet) for command dispatch and sandbox-policy resolution beyond current coverage.

Requirement: no unit test may assert only that a mock was called with no behavioral check; model IDs used in fixtures come from `packages/contracts/types/src/models.json`, never hardcoded.

## Integration Testing — component interactions

Integration tests exercise two or more Runtime components across a real transport (JSON-RPC-over-stdio, WebSocket, HTTP) with no network to third parties.

- ✅ Built — app-server JSON-RPC lifecycle: `crates/agiworkforce-app-server/tests/jsonrpc.rs` drives `initialize → tools/list → tools/call → shutdown` through the public `ToolDispatch` trait, mirroring the CLI's production wiring (app-server is consumed **only** by `agi`).
- ✅ Built — task-runtime lifecycle: `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/tests/lifecycle.rs`.
- ✅ Built — Desktop WS/IPC host: `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` carries an in-file `mod tests` (IP lockout, IPC token) — assert Chrome-ext / VS Code-ext / Tauri-webview clients authenticate and unauthorized IPs are locked out.
- ✅ Built — Signaling relay + pairing HTTP: `services/signaling-server/__tests__/` (`connection-manager`, `websocket/messages`, `http/pairings`, `http/health`) and gateway `services/api-gateway/src/routes/{pair,mobile}.ts` Zod `.strict()` validation (`vitest.config.ts`).
- 🟡 Partial — Desktop↔Mobile companion round-trip: control verbs exist end-to-end at the relay, but `apps/mobile/lib/v1FeatureFlags.ts` keeps `companion:false`/`dispatch:false` and the desktop last mile re-emits control events as a window `CustomEvent 'mobile-companion:control'` with no listener, so a full dispatch integration test cannot yet pass. Track as gap.
- 🔭 Planned — CLI and VS Code remote-attach integration; cross-surface presence via `surface_heartbeats` (route `apps/web/app/api/control-plane/status/route.ts` queries the table, but no Neon migration creates it — presence is unbuilt).

## Runtime Testing — end-to-end runtime behavior

End-to-end tests validate a whole path through the assembled Runtime, including trust-boundary enforcement.

- ✅ Built — Neon delta-sync E2E semantics: `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — cursor + tombstones + idempotent upsert. Tests must prove replaying a batch is idempotent, tombstones delete, and **only** `cloud_managed` rows sync (Local/BYOK rows never appear).
- 🟡 Partial — Remote-control window semantics: prove the session keeps running on the host and the phone/web client is an outbound-only, approval-gated window (Claude Code Remote Control / Codex parity). Relay verbs (`approval_request/response`, `sync`, `dispatch`, `heartbeat`, `cancel`, offline queueing) are testable at `services/signaling-server`, but the mobile→desktop dispatch loop is blocked by the flags above.
- 🔭 Planned — Full six-surface runtime scenarios (Chrome bridge → Desktop host → CLI session) and a monolithic "runtime daemon" harness — there is **no** such daemon today; do not test one as shipped.

## Performance Testing

- ✅ Built (harness available) — Rust benches/timed tests via `cargo test`/`criterion` where present; relay load characteristics implied by `services/signaling-server` rate-limit constants (100 msgs/min per IP, message-size caps).
- 🔭 Planned — SLOs: pairing handshake p95 latency; relay fan-out under N concurrent desktop|mobile roles; delta-sync batch throughput and cursor-advance latency; on-device (Local) inference token/sec captured per device class. Record targets, not vibes; measurements must cite the run.

## Security Testing — security verification

- ✅ Built — Pairing/relay hardening: `services/signaling-server/src/index.ts` (HMAC `pairTokens`, `timingSafeEqual`, per-IP connection limits, Zod message validation, size limits, blacklisting); gateway `pair.ts`/`mobile.ts` rate limits + `.strict()`. `services/signaling-server/__tests__/` covers these paths.
- ✅ Built — Local host isolation: `websocket_server.rs` IP lockout + IPC token; native-messaging host `apps/desktop/src-tauri/src/bin/native_messaging_host.rs` + localhost port-8787 bridge.
- 🔭 Planned — Trust-boundary red-team suite: attempt to route a `local_only` session to BYOK/Cloud and assert refusal; assert Local→BYOK fork is blocked without context selection, secret scan, payload preview, visible provider label, and consent; assert Mobile/Web never accept BYOK keys. Guard-level: `pnpm check:llm-failures:strict` must run in CI and stay green.

## Repository map

- `Cargo.toml` — workspace root; `cargo test --workspace`.
- `crates/agiworkforce-{protocol,task-runtime,plugin-runtime,command-registry,app-server}/` — Rust units + `tests/`.
- `packages/client/client-runtime/src/__tests__/` (and sub-suites) — Vitest.
- `services/signaling-server/__tests__/`, `services/api-gateway/` (`vitest.config.ts`).
- `apps/desktop/src-tauri/src/integrations/realtime/` (`websocket_server.rs`, `presence.rs`), `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts`, `apps/web/app/api/control-plane/status/route.ts`.
- `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`.
- `scripts/check-llm-failure-guardrails.mjs`; `pnpm test` = `pnpm -r test`.

## Competitor notes

Claude Code Remote Control (research preview) and OpenAI Codex remote connections test a single-vendor phone→host window; ChatGPT tests a cloud-only stack. AGI diverges deliberately: tests must cover **multiple providers** (IDs from `models.json`), **BYOK where allowed** (Desktop/CLI/VS Code only), **per-surface trust** (Mobile/Web have no BYOK), and **local-first** execution where compute stays on the host. Parity references are behavioral targets, not code to copy.

## Acceptance / Definition of Done

Production-ready when `cargo test --workspace` and `pnpm -r test` are green in CI, every Runtime component has real behavioral tests (no swallowed assertions), and trust-boundary tests exist and pass.

- [ ] **Build** — `cargo test --workspace` + `pnpm test` green; new Runtime code has behavioral unit + integration tests.
- [ ] **Trust** — E2E asserts Local never routes to BYOK/Cloud; only `cloud_managed` rows delta-sync; remote control keeps the session on the host.
- [ ] **Security** — `pnpm check:llm-failures:strict` green in CI; pairing/relay hardening and host-isolation paths covered.

## Anti-patterns

- Do not write fake/always-pass tests, assert-only-that-a-mock-was-called, or mock-only "coverage" — `pnpm check:llm-failures` will flag them.
- Do not test a monolithic runtime daemon as shipped; it does not exist.
- Do not hardcode or invent model IDs in fixtures — read `packages/contracts/types/src/models.json`.
- Do not assert a companion/dispatch E2E as passing while `companion`/`dispatch` flags are `false` and the desktop listener is unwired; label 🟡.
- Do not reference Supabase; the stack is Clerk + Neon + Stripe. Do not use `middleware.ts` in Next.js 16 (it is `proxy.ts`).
- Do not encode removed tiers (Plus/Hobby/`pro_plus`) or invent INR prices in billing-adjacent fixtures; use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise, no top-ups.
- CLI examples use the `agi` binary, never `agiworkforce <cmd>`.
