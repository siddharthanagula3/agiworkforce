# AGI Workforce — Target Architecture (Phase 4)

Status: Current
Owner: Lead engineer (autonomous recon)
Last updated: 2026-05-29

This is the architecture the project should converge on. It is largely an extension of what already exists (the bones are good) plus a disciplined "wire-the-built-thing + delete-the-dead-thing" cleanup. Source: `reports/audit/AUDIT.md`, the verified Rust closure, and the boundary locks in `AGENTS.md`/`docs/current/technical-architecture.md`.

## 1. Layering (keep — it already holds)

```
apps/{web,desktop,mobile,extension,extension-vscode,sandbox}   ← shippable surfaces (own product policy)
        │  import ↓ only
packages/*  (TS contracts/providers/runtime/UI/compliance/utils)   ← shared TS; MUST NOT import apps
crates/*    (Rust protocol/registry/sandbox/utils + 2 binaries)    ← shared Rust
services/{api-gateway,signaling-server}                            ← deployable backends; MUST NOT import UI pkgs
apps/web/db/neon/                                                  ← canonical DB migrations
```

Enforced today by `check:boundaries` (passing). **Keep these invariants.** Provider SDKs are adapters, not architecture (PLAN.md 3B).

## 2. The shared engine contract (the spine)

- **`packages/types`** (`models.json`, `suite-contracts.ts`: `PrivacyMode`/`ProviderMode`/`ChatExecutionMode`/`assertSurfaceCanSyncChats`/generated-file trust-boundary) is the canonical cross-surface contract. **All model IDs/prices/caps flow from `models.json`** (generated via `sync-models.mjs`). The #1 current debt — **catalog drift in tests** — is a symptom of surfaces hardcoding what should be read from this spine. Target: every surface (incl. Rust CLI + desktop) resolves models through a catalog/slot resolver, never literals; the existing `model-catalog.test.ts` slot-resolver pattern becomes the norm.
- **`@agiworkforce/llm-normalize`** = canonical normalized event stream + CacheIntent/CacheObservation. **`@agiworkforce/llm-runtime`/`routing`/`runtime`** = execution + model selection + shared runtime. These are strong and alive — keep as the single execution core.
- **Rust `agiworkforce-protocol`** mirrors the wire/types contract for the CLI/desktop binaries.

## 3. Multi-provider abstraction (consolidate the three forks)

Today there are **three** provider layers: canonical `packages/providers/*` (used by api-gateway), legacy `apps/web/lib/llm-providers/*` (fetch-based, used by web `/api/llm/v1`), and `apps/web/lib/ai-sdk/*` (Vercel AI SDK wrapper). **Target: one canonical provider-adapter interface** (`packages/providers` + `llm-runtime`), with web routes migrated onto it behind a compatibility shim that preserves OpenAI-compatible SSE framing, tool-status events, usage reconciliation, and credits/auth (WEB-PROVIDER-DRIFT-01 / R26-2). Wire the 4 orphaned adapters (deepseek/xai/perplexity/lmstudio) into `providerAdapters.ts` (4-line registration) so the gateway can actually use them.

## 4. Local-LLM layer (keep; finish the edges)

`packages/local-llm` (tier1/tier2/tier3 adapters; on-device catalog SSOT) is the canonical on-device path; mobile consumes it correctly with a fail-closed remote gate. Finish: (a) populate the default-model catalog so first-run download works (P1-MOBILE-FIRSTRUN); (b) make tier2/tier3 cancellation real (Stop = no-op today); (c) keep the on-device catalog distinct from the cloud `models.json` (it already is).

## 5. IPC & transports

- **Desktop**: Tauri v2 IPC (~1496 commands in `lib.rs run()`); SQLCipher local DB; loopback realtime WS (HMAC, constant-time, rate-limited) for Chrome/Mobile/CLI bridges. Keep. Harden: the byte-slice panic class (P0-1) sits on IPC-reachable paths — route every truncation through one char-safe helper.
- **Chrome ↔ Desktop**: native messaging + `http://localhost:8787` bridge (validated localhost only). Keep; track the plaintext-localhost residual; fix the buggy v1 cloud-IPC CI guard so the boundary is actually enforced.
- **api-gateway**: Express (helmet/CSRF) JWT+Clerk; catalog-driven proxy; kill-switch. Keep; fix the RLS-claim/revocation gaps (P1-GW-*).

## 6. State

- TS: Zustand stores live at the `@shared/stores` alias (`apps/web/shared/stores`), NOT in the empty `@agiworkforce/stores` package. **Resolve the package identity**: either populate `@agiworkforce/stores` and migrate consumers, or delete it and remove the phantom `workspace:*` deps from web+desktop. Prefer the latter (lower risk) unless a shared cross-surface store is genuinely planned.
- Desktop chat/artifact state is package-owned (`@agiworkforce/unified-chat`); the desktop-local duplicate `features/chat`/`features/artifacts` trees are dead and should be deleted once the package path is confirmed to carry equivalent sanitization.

## 7. Security model (target)

- **Trust boundaries** (Local / BYOK / Managed) enforced in code, never silent. Move the privacy gate to **defense-in-depth**: keep the orchestration-layer `validate_privacy_boundary()` AND add a check adjacent to `models::stream_completion` so non-`send()` egress paths (voice, advisor, future fallback) cannot slip through (closes P1-VOICE, P2-advisor, P1-FALLBACK as a class).
- **Artifact rendering**: converge on ONE hardened renderer. Either route artifacts through the cross-origin `apps/sandbox` (CSP `connect-src 'none'`, origin allowlist) or bring the in-app `ReactPreview`/`buildSandboxedHtml` up to the same CSP bar (P2). The cross-origin sandbox is the stronger model.
- **Managed/cloud** stays gated (CLOUD-01) until metering/abuse/refund/retention controls exist.
- **Secret handling**: keep keys in Rust SecretManager / OS keyring / Neon; TS layers stay thin wrappers. Add tests to the `logger` secret-redactor (untested today).
- **Exec/egress enforcement**: decide whether `network-proxy`+`execpolicy` become the single enforcement path (wire them) or are documented as reserved — and in the latter case, audit the LIVE gating (`apps/cli/src/sandbox.rs` + `policy/`, `apps/desktop/.../sys/security/`) as the real control.

## 8. Keep / Refactor / Delete (summary; full ledger in AUDIT.md §6)

- **KEEP**: layering + boundaries; types/llm-normalize/llm-runtime/routing/runtime spine; local-llm; Tauri IPC + SQLCipher; api-gateway/signaling; unified-chat package; `app-server` + `task-runtime` crates.
- **REFACTOR/WIRE**: consolidate 3 web provider layers → canonical adapter; wire 4 orphan provider adapters; wire `app-server` crate (fix the broken shipped `tools/call`); move privacy gate to defense-in-depth; converge artifact renderer + CSP; converge Desktop Settings IA + sidebar nav to the live shell; catalog-resolver everywhere (kill drift).
- **DELETE** (after prove-dead + build-green-without): `apply-patch` + `plugin-runtime` crates; CLI `subagent_v2.rs`; Desktop legacy `features/chat`/`features/v3` dead islands; gateway `chat.ts`/`dotfile.ts`/`pair.ts`; `buildFallbackChain` (unless gated); empty `@agiworkforce/stores` + phantom deps; fabricated `AnalyticsDashboard`; dead web settings hooks.

## 9. Two cross-cutting remediation programs

### 9a. Panic-site removal on shipping paths (the real subset of the "2,409 unwrap/expect")
- The raw count is mostly test code + sound invariants. The **actionable subset** is small and concrete: the ~11 desktop byte-slice abort sites (P0-1), the `utils-cache` current-thread panic (P1), the CLI `task_registry` poison-unwraps (P3), `config_types::default_provider_auth_cwd` (P3, out of closure).
- **Approach**: fix the P0/P1 sites with shared char-safe / poison-tolerant helpers + regression tests. Do NOT add `clippy::unwrap_used`/`expect_used` to the workspace lint set (it would turn `-D warnings` into thousands of errors and make the gate unpassable — Cargo.toml comment is explicit). Instead track "user-reachable panic sites" as a scoped, test-encoded metric (see DoD).

### 9b. Orphan-crate / dead-code removal
- Delete the 2 safe-delete crates; keep+wire `app-server`; decide network-proxy/execpolicy. Update the stale root `Cargo.toml` "44 crates" comment to the verified closure (13 in-closure + 4 orphans). Prove-dead via `cargo build` green-without + repo-wide ref search before each deletion; one crate per PR, reversible.

## 10. North star (product)
Converge the six surfaces onto the locked SoT: one chat (normal + files/artifacts/tools/projects), visible Local/BYOK/Managed labels everywhere, catalog-owned models, the locked Settings IA, Desktop as the local compute host (Cowork/Code real, not placeholders), Mobile local-first first-run that actually works offline, and parity-matrix rows moved from Partial→verified with tests + e2e. The engineering bar is current Claude/ChatGPT/Codex (see `reports/research/*`): tools-rich composer, artifacts/inline-blocks (NOT a canvas clone — OpenAI is retiring canvas), agentic research, connectors/MCP with precise trust labels, and on-device mobile inference.
