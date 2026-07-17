# AGI Runtime — Volume 39 — Future Runtime Features

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root) and the nearest surface rules (`apps/desktop/AGENTS.md`, `services/AGENTS.md`); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon). Real repo parts used are cited inline and enumerated in the Repository map below.

## Overview & stance

This volume defines the **long-horizon** direction for the AGI Runtime — the internal shared execution layer, not a seventh user product. **Every capability here is 🔭 Planned by definition.** Nothing here authorizes building: the serial-by-surface lock holds, Mobile is the active surface.

Scale-out must never dissolve the trust boundaries. The three modes are fixed: **Local** (on-device / local runtime), **BYOK** (user keys; Desktop / CLI / VS Code only — never Web or Mobile), and **Managed Cloud** (public alpha, open by default for signed-in users). Remote Control stays a **window over a locally-running session**, not a fourth mode: compute stays on the host, connections are outbound-only, paired (QR + HMAC), and approval-gated. Local chats, files, and sessions are never silently routed to BYOK or Cloud; Local→BYOK remains an explicit fork (context selection, secret scan, payload preview, visible provider label, consent). The target architecture is assembled from the real parts cited below — there is **no monolithic runtime daemon today**, and this volume does not invent one as shipped.

## Multi-agent orchestration 🔭

Planned: a scheduler that fans one goal across sub-agents (planner / worker / reviewer) over the existing task-execution and command surfaces (`crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`, `crates/agiworkforce-command-registry`), with tool/permission gating inherited from `crates/agiworkforce-protocol/src/{approvals.rs,permissions.rs,dynamic_tools.rs}`. Requirements: every sub-agent runs under **one** trust mode for its lifetime — a graph may not mix a Local worker with a Cloud worker in a silent DAG. Each sub-agent gets a `thread_id` (`crates/agiworkforce-protocol/src/thread_id.rs`) and surfaces approvals individually; a cross-mode edge must produce a visible fork prompt with provider label before it executes.

## Distributed execution 🔭

Planned: splitting one session's tool calls across more than one execution host while a single client stays authoritative. The substrate is the local hosts that already exist — the CLI's stdio/WebSocket app-server (`crates/agiworkforce-app-server/src/lib.rs`, CLI-only) and the Desktop `127.0.0.1` WS/IPC host (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, with IP lockout + IPC token). Requirements: distribution is opt-in per session; a Local session distributes only across hosts the user owns, never off-device without an explicit Cloud fork; sandbox/exec policy (`crates/agiworkforce-execpolicy`, `crates/sandbox-policy`) and network policy (`crates/agiworkforce-network-proxy`, `crates/agiworkforce-protocol/src/network_policy.rs`) enforce identically on every host — a denial on the origin host is honored on every worker host.

## Remote workers 🔭

Planned: paired **remote windows** that steer a session running on a host (Claude Code Remote Control / Codex-remote parity), extended from the current Desktop↔Mobile companion. The pairing/relay fabric exists — `services/signaling-server/src/index.ts` (roles `desktop|mobile`, QR codes, per-role HMAC `pairTokens`, verbs `approval_request`/`approval_response`, `dispatch_request`/`dispatch_response`, `heartbeat`/`heartbeat_ack`, `cancel`, offline approval queueing) plus `services/api-gateway/src/routes/{mobile,pair}.ts` and `apps/mobile/services/companion.ts`. The companion last mile is **🟡 Partial**: `apps/mobile/lib/v1FeatureFlags.ts` ships `companion: false` (dispatch off), and Desktop re-emits control as an unlistened `CustomEvent('mobile-companion:control')` (`apps/desktop/src/stores/connectionStore.ts`). Requirement: remote workers never move compute to the cloud — the host runs; the phone/web pane observes and approves. CLI and VS Code remote attach are 🔭.

## Cluster execution 🔭

Planned: pooling several hosts under one addressable runtime for parallel long-running jobs (Managed-Cloud path only), distinct from the Cloud-RUN (Claude-Code-on-the-web style) lane. Requirements: cluster membership is Managed-Cloud, gated by the signed-in entitlement and metered per plan (Max $100 and Max $200 tiers for high parallelism; Enterprise for org pools) — no credit top-ups, no invented INR. Local and BYOK sessions **cannot** enroll; enrolling a Local session returns a refusal with a fork offer, never a silent upgrade. No cluster daemon exists today — 🔭.

## Enterprise policy engine 🔭

Planned: an org-scoped policy layer that constrains which modes, providers, tools, and destinations each seat may use, evaluated before every tool call. The seed exists in `services/api-gateway/src/routes/enterprise.ts` (`DEFAULT_ENTERPRISE_ADMIN_POLICY`, org-role checks, support cases carrying a `privacyLabel` enum `local_only|byok|managed|security_sensitive`) and in `crates/agiworkforce-protocol/src/permissions.rs`. Requirements: decisions are auditable; a policy may **tighten** but never silently loosen a boundary (it cannot force a Local session into Cloud); model gating reads IDs **only** from `packages/contracts/types/src/models.json`. Served by **Enterprise (custom)** — no consumer "Team" plan. Engine evaluation is 🔭; the admin/policy scaffold is 🟡.

## Federated runtimes 🔭

Planned: multiple independently-owned AGI Runtimes (e.g. two orgs, or self-hosted + managed) that interoperate over signed, brokered links rather than a shared database. Requirements: federation crosses a trust boundary, so every hop is an explicit, consented, labeled fork with no automatic data flow, riding the existing approval + secret-scan model. Each runtime keeps its own policy engine; a federated call is denied unless **both** sides' policies allow it. Entirely 🔭 — no federation broker exists.

## Team sessions 🔭

Planned: two or more authenticated users attached to one live session (co-drive, hand-off, watch). Presence primitives are early — `apps/desktop/src-tauri/src/integrations/realtime/{presence.rs,collaboration.rs}` exist, but cross-surface presence is **🔭**: `apps/web/app/api/control-plane/status/route.ts` queries a `surface_heartbeats` table that **does not exist** in the Neon migrations (tracked gap). Requirements: team sessions are Managed-Cloud + Enterprise only; each participant's actions are attributed and approval-gated; a guest cannot exceed the host's trust mode, and no Local session becomes multi-user without an explicit Cloud fork.

## Shared workspaces 🔭

Planned: durable multi-user project/memory spaces layered on Neon delta-sync (`apps/web/app/api/{chat,memory,projects}/sync/route.ts` — cursor + tombstones + idempotent upsert). Requirements: only **Managed-Cloud** rows sync, and a Local-tagged row is provably absent from every shared-workspace payload. CLI, VS Code, and Chrome stay workspace/task-scoped — any handoff into a shared app workspace is explicit and redacted, never automatic. Settings sharing is allowlist-gated and lands last.

## Headless deployments 🔭

Planned: running the Runtime unattended (CI, servers, scheduled jobs) with no interactive approvals, driven by the `agi` binary and the app-server host (`crates/agiworkforce-app-server/src/lib.rs`). Requirements: headless mode demands a pre-approved policy bundle (from the enterprise engine) because no human is present to approve; it defaults to the **least-privileged** mode, refuses to auto-escalate Local→BYOK/Cloud, and takes secrets from the environment, never embedded. With no policy bundle it refuses risky tools rather than prompting into a void. 🔭 — no headless entrypoint ships today.

## Repository map

- `crates/agiworkforce-{protocol,task-runtime,plugin-runtime,command-registry,app-server}` — protocol, task execution, plugins, commands, CLI-only stdio/WS host.
- `crates/{agiworkforce-execpolicy,sandbox-policy,agiworkforce-network-proxy}` — exec/sandbox/network enforcement.
- `packages/client/client-runtime/src` — shared TS runtime.
- `apps/desktop/src-tauri/src/integrations/realtime/{websocket_server,presence,collaboration}.rs` — 127.0.0.1 host.
- `apps/desktop/src-tauri/src/bin/native_messaging_host.rs` — Chrome `com.agiworkforce.browser` host + port-8787 bridge.
- `services/signaling-server/src/index.ts` — WebRTC pairing/relay.
- `services/api-gateway/src/routes/{mobile,pair,enterprise}.ts` — pairing-code, pair, enterprise policy routes.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — Neon delta-sync.
- `apps/web/app/api/control-plane/status/route.ts` — cross-surface status (needs `surface_heartbeats` — 🔭 gap).
- `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/desktop/src/stores/connectionStore.ts` — companion 🟡.

## Competitor notes

Claude Code Remote Control (research preview) and OpenAI Codex remote connections both let a phone steer a session running on a host — "nothing moves to the cloud." AGI matches that window model and diverges deliberately: **multi-provider** (IDs from `models.json`, not one vendor), **BYOK where the surface allows it** (Desktop / CLI / VS Code), **per-surface trust** (Web / Mobile never hold keys), and **local-first** by default. Where Claude/ChatGPT default org features to their own cloud, AGI keeps federation and clustering behind explicit, consented forks and a policy engine that can only tighten boundaries.

## Acceptance / Definition of Done

A capability is production-ready only when it is re-labeled from 🔭 with a real merged repo path; preserves the three trust modes end-to-end; makes every cross-mode transition an explicit consented fork (context selection, secret scan, payload preview, provider label); enforces policy and sandbox/network identically on every host; and reads model IDs only from `packages/contracts/types/src/models.json`.

- [ ] **Build:** cited repo path; passes `pnpm check:boundaries`, `pnpm check:service-layer`, `pnpm check:llm-failures`.
- [ ] **Trust:** no Local/BYOK row or session routes to Cloud without a logged, consented fork; remote/cluster/federation hops are approval-gated.
- [ ] **Security:** pairing stays QR + per-role HMAC; headless runs require a pre-approved policy bundle and default least-privilege; per-participant/host audit trail.

## Anti-patterns

- Claiming any Volume 39 item is shipped, or citing a path as ✅ when the feature is 🔭 (e.g. presenting `surface_heartbeats` reads as working presence).
- Inventing a monolithic runtime daemon, treating remote workers / clusters as a fourth trust mode, or silently routing a Local/BYOK session into Cloud clustering, federation, or a shared workspace.
- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json`; inventing routes, env vars, command names, or INR prices.
- Reintroducing removed tiers ("Plus", `pro_plus`, "Hobby"), credit top-ups, or a consumer "Team" plan (use Enterprise).
- Referencing Supabase, renaming Next.js `proxy.ts` back to `middleware.ts`, or using `agiworkforce <cmd>` instead of the `agi` binary.
