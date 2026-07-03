# AGI Desktop — Volume 01 — Product Overview

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/desktop/AGENTS.md`, and verified repo paths: `apps/desktop/src/features/v3/DesktopShellV3.tsx`, `apps/desktop/src/features/v3/CodeModeHome.tsx`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `apps/desktop/src-tauri/src/integrations/native_messaging/manifest.rs`, `apps/desktop/src/features/mobile-companion/`, `apps/desktop/src/features/settings/tabs/`, `apps/desktop/src-tauri/src/core/llm/providers/`, `packages/types/src/models.json`.

## Overview & stance

This volume frames AGI Desktop as the **full-trust surface** of the six-surface suite. Desktop is the only place where all three trust modes are user-selectable — **Local** (on-device/local runtime), **BYOK** (user-supplied keys), and **Managed Cloud** (public alpha, open by default for signed-in users) — each with a correct, visible provider label. Desktop is also the suite's **local-private compute host**: it runs the `127.0.0.1` bridge for the Chrome and VS Code extensions and hosts the Chrome native-messaging endpoint. Every capability below carries a mandatory ✅ / 🟡 / 🔭 label; these are target/design specs, not authorization to ship (serial-by-surface lock holds; Mobile is the active surface).

## Vision

Own the private, multi-provider AI workstation: your models, your keys, your files, no markup — running on your machine and reachable from your phone as a remote window, never a cloud handoff you did not choose. 🔭 Planned (strategy; host fabric partially built — `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`).

## Mission

Give power users one desktop app where Local, BYOK, and Managed Cloud coexist with honest, visible trust labels, and where the desktop acts as the trusted hub for the browser and editor companions. 🟡 Partial — three-mode selection and the bridge host exist; Settings IA and companion wiring have gaps (`apps/desktop/src/features/settings/tabs/`).

## Product Goals

- Selectable Local / BYOK / Managed Cloud with a visible provider label per session. 🟡 Partial (`apps/desktop/src/features/settings/tabs/ModelsKeys/`).
- Enforce Local→BYOK as an explicit fork (context selection, secret scan, payload preview, label, consent). 🔭 Planned.
- Serve as the loopback host for Chrome + VS Code with bridge tokens and IP lockout. ✅ Built (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`: `LOCKOUT_DURATION` 300s, `x-bridge-token`, loopback-only).
- Default chat storage to Local; cross the cloud boundary only on explicit opt-in. ✅ Built (`apps/desktop/AGENTS.md` locked decision; `apps/desktop/src/features/settings/tabs/Privacy/`).

## User Personas

- **Privacy-first engineer** — runs Local models on sensitive repos; never wants silent cloud egress.
- **BYOK power user** — brings OpenAI/Anthropic/etc. keys, pays providers directly, no markup.
- **Managed-cloud subscriber** — wants zero setup, cross-device sync, and metered usage.
- **Suite operator** — pairs phone (remote window) and drives the browser/editor from the desktop hub.
  🔭 Planned (persona modeling; no persona-config code path).

## User Stories

- As a privacy-first user, I select Local and see a "Local — on device" label, and my files never leave the machine unless I transfer them. 🟡 Partial (local default enforced; label surfacing incomplete).
- As a BYOK user, I add a key in Models & Keys and it is stored in the OS keychain, not plaintext. 🟡 Partial (keyring access exists — `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs`).
- As a suite user, I scan a QR on my phone to open a remote window over a session that keeps running on the desktop. 🟡 Partial (`apps/desktop/src/features/mobile-companion/QRPairingCard.tsx`; companion panel commented out at `apps/desktop/src/features/chat/index.tsx:109`).
- As a Managed-Cloud user, my chats sync Web↔Mobile↔Desktop. 🔭 Planned on Desktop (delta-sync APIs live in `apps/web/app/api/{chat,memory,projects}/sync`).

## Success Metrics

Trust-label accuracy = 100% of sessions show the correct mode; zero silent Local→Cloud/BYOK crossings; bridge auth-failure lockouts logged; Local→BYOK fork completion rate; Managed-Cloud sync convergence latency. 🔭 Planned (metrics not yet instrumented on Desktop).

## Business Goals

Convert free Local/BYOK users into Managed-Cloud subscribers on the pricing ladder — **Free $0; Basic $8 (₹399); Pro $20; Max $100 and $200; Enterprise custom** — with no top-ups. Local and BYOK stay free access modes, not plans. 🟡 Partial — Desktop encodes older tiers pending reconciliation (`packages/types/src/billing-catalog.ts`; tracked gap).

## Market Position

The private, multi-provider desktop workstation: local-first, BYOK where allowed, and a managed-cloud option — versus single-vendor desktop assistants. Desktop is the trust superset of the suite (Web/Mobile are cloud-leaning; CLI/VS Code share Desktop's three modes but stay workspace-scoped). 🔭 Planned (positioning).

## Competitive Analysis — vs Claude Desktop and ChatGPT desktop (macOS Chat Bar, Codex app)

Claude Desktop centers one vendor with MCP connectors and Remote Control (research preview). ChatGPT's macOS app adds a global Chat Bar and "work with apps"; the Codex app QR-pairs a phone to steer a Mac/Windows host. AGI diverges: **multi-provider + BYOK on Desktop**, **three explicit trust modes with visible labels**, **local-first default**, and a **remote window** (compute stays on host, outbound-only, QR + HMAC, approval-gated) rather than a cloud handoff. 🟡 Partial — bridge/HMAC host built (`websocket_server.rs`); global bar and full remote UX 🔭.

## Product Principles

- Never silently route Local chats/files/sessions to BYOK or Cloud. ✅ (`apps/desktop/AGENTS.md` locked; `send_message.rs` gate).
- Local→BYOK is always an explicit, consented fork. 🔭 Planned.
- Remote Control is a window, not a fourth trust mode. 🟡 (`apps/desktop/src/features/mobile-companion/`).
- Keys in OS keychains, never plaintext. 🟡 (`managed_cloud_provider.rs` keyring).
- Model IDs only from `packages/types/src/models.json`. ✅.

## Desktop Architecture — Tauri v2 + React

Tauri v2 (Rust `src-tauri`) + React + Vite. The V3 shell (`apps/desktop/src/features/v3/DesktopShellV3.tsx`) drives panels `chat | projects | artifacts | scheduled | dispatch` via `AgiWorkProjects/Artifacts/Scheduled/Dispatch`. ✅ Built. The Rust host binds `127.0.0.1` for the extension bridge and native-messaging host `com.agiworkforce.browser` (`native_messaging/manifest.rs`). ✅. **AGI Code** exists (`apps/desktop/src/features/v3/CodeModeHome.tsx`, exported from `v3/index.ts`) but is **not mounted** in the shell. 🟡.

## Cloud Mode — overview

Managed Cloud is public-alpha, open by default for signed-in users; access flows through the managed provider path (`apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs`, keyring-held access token). Managed-Cloud chats are the only rows eligible for Neon delta-sync (`apps/web/app/api/{chat,memory,projects}/sync`). 🟡 Partial — provider path built; Desktop sync client 🔭. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` remains only as a kill-switch.

## Local Mode — overview

Local runs on-device via the local provider under `apps/desktop/src-tauri/src/core/llm/providers/`, with chat storage defaulting to `"local"` and `settings_load_from_disk` coercing any persisted `"cloud"` back to local. ✅ Built (`apps/desktop/AGENTS.md` locked decision). Local files stay local unless explicitly transferred; local rows never sync.

## Constraints

Tauri v2 + Rust host; keys in macOS Keychain / Windows Credential Manager / Linux Secret Service; BYOK is Desktop/CLI/VS Code only (never Web/Mobile); Next.js 16 uses `proxy.ts`; stack is Clerk + Neon + Stripe (no Supabase). 🟡 (keyring — `managed_cloud_provider.rs`).

## Assumptions

Signed-in users can reach Managed Cloud by default; users hold their own BYOK keys; phone pairing uses QR + HMAC; the reader treats older billing tiers in code as a tracked gap, not truth. 🔭.

## Risks

Silent trust-boundary crossing (highest severity); companion control events re-emitted with no listener (`apps/desktop/src/features/mobile-companion/`, 🟡); Settings IA drift from the locked spec (`apps/desktop/src/features/settings/tabs/` shows more tabs than the target IA); billing-catalog encoding removed tiers; unmounted AGI Code creating a dead surface.

## Repository map

- `apps/desktop/src/features/v3/` — V3 shell, AGI Work panels, `CodeModeHome.tsx` (unmounted).
- `apps/desktop/src/features/mobile-companion/` — QR pairing, remote-approval UI.
- `apps/desktop/src/features/settings/tabs/` — Desktop settings (converging to locked IA).
- `apps/desktop/src-tauri/src/integrations/realtime/` — `127.0.0.1` WS/IPC bridge host.
- `apps/desktop/src-tauri/src/integrations/native_messaging/` — Chrome host `com.agiworkforce.browser`.
- `apps/desktop/src-tauri/src/core/llm/providers/` — Local / BYOK / managed-cloud providers.
- `packages/types/src/models.json` — model catalog SSOT.

## Competitor notes

Claude/ChatGPT/Codex desktop assistants are single-vendor and cloud-leaning. AGI's deliberate divergence: multi-provider, BYOK where allowed (Desktop/CLI/VS Code), per-surface trust with visible labels, local-first defaults, and a remote window that keeps compute on the host. Competitors are parity references only — no proprietary code or branding is copied.

## Acceptance / Definition of Done

Production-ready when all three modes are selectable with correct visible labels, Local→BYOK enforces the full fork gate, no silent Local→Cloud/BYOK crossing exists, and the pricing model matches canon.

- [ ] Build: `pnpm --filter @agiworkforce/desktop typecheck` and `cargo check -p agiworkforce-desktop` green.
- [ ] Trust: every session renders the correct mode label; Local rows never sync; Local→BYOK fork requires consent.
- [ ] Security: keys in OS keychain only; bridge enforces token + IP lockout; HMAC pairing verified.

## Anti-patterns

Do not silently route Local chats/files to BYOK or Cloud; do not invent model IDs (read `packages/types/src/models.json`); do not enable BYOK on Web/Mobile; do not reference Supabase or `middleware.ts`; do not use removed tiers (Plus/Hobby/`pro_plus`) or add top-ups or invent Pro/Max INR prices; do not claim shipped state without a real repo path; do not present the unmounted AGI Code or commented-out companion panel as live.
