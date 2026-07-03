# AGI Mobile — Volume 01 — Product Overview

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md` (repo root), `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and verified repo paths: `apps/mobile/app.config.js`, `lib/v1FeatureFlags.ts`, `services/remoteChatGate.ts`, `services/cloudSyncEngine.ts`, `services/companion.ts`, `services/modelDownload.ts`, `lib/egressGuard.ts`, `storage/installedModels.ts`, `packages/types/src/models.json`.

## Overview & stance

This volume is the product charter for AGI Mobile — the Expo / React Native surface (`app.config.js`: `AGI Workforce`, bundle `com.agiworkforce.app`, v1.2.0). Mobile exposes exactly **two** trust modes: **Local** (a small on-device LLM, free) and **Managed Cloud** (public alpha, open by default). **Mobile has NO BYOK** — no provider-key affordance, and "Provider Configuration" means on-device model management, never API keys (`apps/mobile/AGENTS.md`; `lib/v1FeatureFlags.ts` `byokKeys: false`). The split drives every section: Local keeps chats, memory, projects, and files on the device and fails closed against our-cloud egress (`lib/egressGuard.ts`); Cloud requires a real Clerk auth gate (no demo bypass) and syncs only Managed-Cloud chats via Neon delta-sync. Remote Control is **not** a third trust mode — it is a secure window over a session that keeps running on a host.

## Vision

🔭 Planned. AGI Mobile is the pocket front-end of a private, multi-provider AI workforce: a free on-device assistant for offline work, a polished managed-cloud chat for frontier models, and a secure remote window onto local Desktop/CLI sessions — without becoming the heavy-compute surface or leaking Local data.

## Mission

🔭 Planned. Give every user a trustworthy AI on their phone where the **trust boundary is explicit and visible**: Local stays on-device; Cloud is opt-in and signed-in; nothing crosses silently. Be the most private mobile AI client.

## Product Goals

- ✅ Built — single-source feature gating so cloud-only features stay dark until ready (`lib/v1FeatureFlags.ts`).
- ✅ Built — fail-closed Local privacy: our-cloud egress blocked in Local mode (`lib/egressGuard.ts`).
- 🟡 Partial — on-device model lifecycle: resumable, checksum-verified downloads + `installed_models` table exist (`services/modelDownload.ts`, `storage/installedModels.ts`); the inference-runtime binding that generates from a `gguf/mlx/onnx/pte` model is not yet wired (`storage/types.ts`).
- ✅ Built — Managed-Cloud chat via Clerk-authenticated stream (`services/authSession.ts` → `services/streaming.ts`).

## User Personas

🔭 Planned. (1) **Privacy-first individual** — wants offline/on-device chat, never a managed cloud. (2) **Frontier-model user** — signs in for Cloud chat. (3) **Builder on the go** — runs work on Desktop/CLI and approves/steers it from the phone (remote window). (4) **India value buyer** — Basic at ₹399/mo. None is a BYOK persona on mobile.

## User Stories

- 🟡 Partial — "Download a small model and chat fully offline." Download/storage built; live local generation gap (`services/modelDownload.ts`).
- ✅ Built — "Sign in, open Cloud, chat with a managed model, no key setup." (`services/remoteChatGate.ts`, `services/streaming.ts`.)
- 🔭 Planned — "Pair my phone to my Desktop session and approve a tool call." (See Remote Runtime Overview.)
- ✅ Built — "My Cloud chats appear on web and desktop too." (`services/cloudSyncEngine.ts`.)

## Success Metrics

🔭 Planned (instrumentation target). Local activation (model installed + first on-device turn); Cloud sign-in conversion; D7/D30 retention; cross-device sync adoption; free→Basic/Pro conversion; crash-free sessions; zero Local→cloud egress incidents (hard guardrail, must stay 0).

## Business Goals

🔭 Planned. Revenue follows the canon ladder — **Free $0; Basic $8 (₹399); Pro $20; Max $100 and $200; Enterprise custom**; Local and BYOK are free access modes (BYOK not on mobile). No top-ups. Pro/Max INR are TBD. Engagement: convert privacy-first Local users into signed-in Cloud subscribers without breaking the Local trust promise; billing UI stays gated (`lib/v1FeatureFlags.ts` `billing: false`) until enabled.

## Competitive Analysis

🔭 Planned (positioning). ChatGPT and Claude mobile are single-vendor cloud clients with mandatory accounts and no on-device model. AGI Mobile diverges: **multi-provider** managed cloud (IDs from `packages/types/src/models.json`), a **free on-device Local mode**, **per-surface trust** with no BYOK on mobile, and a **remote window** onto local sessions modeled on Claude Code Remote Control and the Claude mobile companion (compute on host, outbound-only, QR + HMAC, approval-gated). We compete on "your models, no markup, private, everywhere," not on owning a frontier model.

## Product Principles

🔭 Planned. (1) Trust boundary is sacred and visible — never silently route Local to Cloud. (2) Simple home — no suggestion/starter cards. (3) Fail closed — ambiguity blocks egress (`lib/egressGuard.ts`). (4) Don't fake capability — unbuilt features stay dark behind flags. (5) Not the heavy-compute surface — heavy docs and image gen are cloud-backed; delegate long jobs to the host.

## Mobile Architecture

✅ Built (skeleton). Expo Router app tree (`apps/mobile/app/`, groups `(app)`/`(auth)`/`(public)`), feature domains (`src/features/*`), Zustand stores (`stores/*`), SQLCipher/MMKV storage (`storage/*`, `lib/mmkv.ts`), service layer (`services/*`). Network exits through `guardedFetch` → `secureFetch` (mode/host policy, then TLS pinning).

## Cloud Mode Architecture

✅ Built. Cloud chat requires a real auth gate — `remoteChatGate` fails closed when `cloudChat` is off (`services/remoteChatGate.ts`); the signed-in Clerk session is the public-alpha entitlement, bridged into the stream (`services/authSession.ts`). Managed-Cloud chats, memory, and settings delta-sync to Neon (`services/cloudSyncEngine.ts` → `apps/web/app/api/{chat,memory,settings}/sync`); settings sync is allowlist-gated (`services/cloudSettingsMapping.ts`) and lands last. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` remains only as a kill-switch.

## Local Mode Architecture

🟡 Partial. Local is on-device only: model files download into the app sandbox, checksum-verified and Wi-Fi-aware (`services/modelDownload.ts`), tracked in the encrypted `installed_models` table (`storage/installedModels.ts`). Local never reaches our cloud — `egressGuard` blocks our-cloud hosts and treats unknown mode as Local (`lib/egressGuard.ts`). Gap: the inference engine that runs the model is not yet wired. On-device model IDs are managed locally, **not** from `models.json` (cloud models only).

## Remote Runtime Overview

🟡 Partial. The phone is a secure remote **window** over a still-local session (Desktop/CLI host keeps compute), mirroring Claude Code Remote Control: outbound-only, QR + HMAC paired, approval-gated. Companion/dispatch scaffolding exists (`services/companion.ts`, `services/dispatchRealtime.ts`, `services/companionNotifications.ts`, `app/(app)/companion`, `app/(app)/dispatch`) but is feature-flagged off and not wired to task execution (`lib/v1FeatureFlags.ts` `companion: false`, `dispatch: false`). Not a fourth trust mode; never relocates Local data to the cloud.

## Constraints

🔭 Planned/observed. Mobile must not be the first heavy local PDF/PPTX/DOCX/image-gen surface (`apps/mobile/AGENTS.md`); image gen is cloud-backed. Device limits (RAM, battery, thermal, 1–10 GB+ model files) constrain on-device models. Lane contract limits edits to `ios/**`, native modules, shared contracts. Model IDs come only from `packages/types/src/models.json`. Stack is Clerk + Neon + Stripe — never Supabase.

## Risks

- **Trust-boundary leak** (highest): any Local→cloud egress is a P0; mitigated by `lib/egressGuard.ts` fail-closed design — keep regression-tested.
- **On-device inference gap**: Local advertises offline chat before the runtime is wired — keep 🟡 until built.
- **Flag deadlock**: `v1LocalOnly` and `cloudChat` both true silently kills Cloud (`lib/v1FeatureFlags.ts`).
- **Pricing drift**: `billing-catalog.ts` still encodes retired tiers; specs use the canon ladder only.
- **Scope creep** toward BYOK or heavy compute on mobile — out of bounds.

## Repository map

- `apps/mobile/app/` — Expo Router routes (`(app)`, `(auth)`, `(public)`).
- `apps/mobile/src/features/` — chat, onboarding, projects, memory, image, voice, companion, model-picker, settings.
- `apps/mobile/services/` — `remoteChatGate.ts`, `cloudSyncEngine.ts`, `companion.ts`, `dispatchRealtime.ts`, `modelDownload.ts`, `streaming.ts`, `authSession.ts`, `llmGate.ts`, `secureFetch.ts`.
- `apps/mobile/lib/` — `v1FeatureFlags.ts`, `egressGuard.ts`, `mmkv.ts`, `secureStorage.ts`.
- `apps/mobile/stores/`, `apps/mobile/storage/` — Zustand stores; SQLCipher/MMKV (`installedModels.ts`, `types.ts`).
- `apps/mobile/app.config.js`, `apps/mobile/ios/` — Expo config + root iOS project.
- Shared/backend: `packages/types/src/models.json`, `apps/web/app/api/{chat,memory,projects,settings}/sync`.

## Competitor notes

ChatGPT/Claude mobile: account-mandatory, single-vendor cloud, no on-device model, no per-surface trust split, no "remote window" onto a local dev session. AGI's divergence: multi-provider managed cloud, a free on-device Local mode, per-surface trust (Local + Cloud only, **no BYOK on mobile**), and a remote companion that keeps compute on the host. Claude Code Remote Control and the Claude mobile companion are the reference for the remote-window pattern, not for trust architecture.

## Acceptance / Definition of Done

Production-ready when: Local and Cloud are visibly separated with no silent routing; Cloud requires real sign-in; `remoteChatGate` fails closed when Cloud is disabled; egress guard blocks all our-cloud hosts in Local mode; no BYOK affordance exists; all model IDs resolve from `models.json`; pricing UI matches the canon ladder; every advertised capability has a real path or a 🔭 label.

- [ ] Build: `pnpm --filter @agiworkforce/mobile typecheck` and `test` green.
- [ ] Trust: Local produces zero requests to AGI/Neon/Clerk hosts (egress-guard test); Cloud blocked when signed out.
- [ ] Security: no provider-key entry, no Supabase, no hardcoded model IDs.

## Anti-patterns

No BYOK / provider-key UI on mobile. No auto-send or silent routing of Local chats to Managed Cloud. Don't claim on-device inference is shipped while it is 🟡. Don't make mobile the first heavy local PDF/PPTX/DOCX/image-gen surface. Don't hardcode or invent model IDs — read `packages/types/src/models.json`. Never reference Supabase. Never reintroduce "Plus", `pro_plus`, or "Hobby", or invent Pro/Max INR prices. Don't treat Remote Control as a fourth trust mode.
