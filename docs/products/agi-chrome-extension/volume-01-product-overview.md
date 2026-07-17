# AGI Chrome Extension — Volume 01 — Product Overview

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01
Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension/AGENTS.md`, `apps/extension/THREAT_MODEL.md`, `apps/extension/manifest.json`, `apps/extension/MANIFEST_NOTES.md`, and real paths under `apps/extension/src/**` and `apps/extension/native-host/`. Model facts reference `packages/contracts/types/src/models.json` only.

## Overview & stance

This volume defines what the AGI Chrome Extension is, who it serves, and how it wins. The product is the **AGI Browser Companion** — a permission-gated browser agent modeled on Claude for Chrome plus our shipped automation, **not** a standalone consumer assistant. The trust boundary shapes everything: the extension holds **no provider keys and runs no inference of its own**. Its chat is a thin bridged path streaming through the cloud gateway (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`) or the desktop native host, and computer-use egress goes to `api.agiworkforce.com` only — no provider host is ever contacted (`apps/extension/src/features/computer-use/cloudAgentClient.ts` EGRESS rule ✅). Chrome is **task/workspace-scoped**: no BYOK, no consumer conversation sync, no global memory sync, no Projects, no image generation, no in-extension checkout (canon). History and memory are `chrome.storage.local` only and never leave the device.

## Vision

Make any browser a governed, agentic workspace where AGI reads, reasons over, and acts on live pages with explicit consent — the browser arm of the six-surface AGI suite, sharing the AGI Runtime rather than reinventing it. **🔭 Planned** direction.

## Mission

Let people delegate real browser work — research, form-filling, multi-step flows, recurring tasks — to an agent that treats page content as untrusted data, asks before it acts, and keeps compute and secrets on trusted planes. Shipped foundations exist for capture, autofill, and CDP computer-use (**✅** `apps/extension/src/features/`); the full delegation experience is **🔭 Planned**.

## Product Goals

- Read page context/DOM/console/network and capture screenshots/regions on allowlisted origins. **🟡 Partial** — content capture and sanitization exist (`apps/extension/src/features/content/browserTool.ts`, `apps/extension/src/page-metadata.ts`); full console/network read surfacing is **🔭**.
- Drive the browser: navigate/click/type/fill, tabs and tab groups. **✅** manifest grants `tabs`, `tabGroups`, `scripting`, `debugger` (`apps/extension/manifest.json`); CDP actions in `apps/extension/src/features/computer-use/cdpDriver.ts`.
- Job autofill for LinkedIn/Lever/Greenhouse/Ashby. **✅** `apps/extension/src/features/content/autofill/`.
- Record-and-replay demonstrated workflows and scheduled recurring tasks. **🟡 Partial** — storage + validation shipped (`apps/extension/src/features/background/shortcuts.ts`, `tasks.ts`, max 50 each); rich authoring UI is **🔭**.
- Ask-before-acting plan approval + high-risk-action/site intervention. **🟡 Partial** — `runAgentLoop()` exposes an `onBeforeAction` gate that defaults to allow-all (`apps/extension/src/features/computer-use/agentLoop.ts`); the approval UI is **🔭**.

## User Personas

- **Job seeker** — mass-applies across ATS platforms; wants autofill that survives React-controlled fields. **✅** served by autofill + escalation (`escalationEngine.ts`).
- **Operations/RevOps analyst** — repeats multi-step web flows daily; wants record-and-replay and schedules. **🟡**.
- **Developer using AGI Desktop** — pairs the extension to a local desktop host for page context. **✅** native bridge (`apps/extension/native-host/`).
- **Security-conscious lead** — needs allowlists, redaction, auditable egress. **✅** `apps/extension/src/background/policy.ts` / `THREAT_MODEL.md`.

## User Stories

- As a user, I add a site to the allowlist and AGI reads only that tab's context. **✅** allowlist gate (`agi_site_allowlist`, THREAT_MODEL plane D).
- As a user, I ask the agent to fill an application and approve each risky step before it runs. **🟡** (gate exists, approval UI 🔭).
- As a user, I record a flow once and replay it later, selectors-only by default with secrets redacted. **🟡/✅** (`shortcuts.ts`; redaction per THREAT_MODEL "Recorded actions").
- As a user, I schedule a recurring browser task via alarms. **🟡** (`tasks.ts` + `alarms` permission).
- As a paid user, I hit a usage cap and see a server-rendered paywall, not a client guess. **✅** 429 `{kind:'paywall', requiredTier}` (`providerStreamClient.ts`).

## Success Metrics

- Autofill completion rate and escalation-recovery rate on the four ATS platforms. **🔭**.
- Agent task success rate within the 20-step cap (`MAX_STEPS`, `agentLoop.ts`) without user intervention. **🔭**.
- Zero cross-plane leaks (page data → cloud without allowlist/consent) in security tests (`apps/extension/__tests__/security-fixes.test.ts`). **✅** as a gate.
- Approval-gate opt-in rate for high-risk actions. **🔭**.

## Business Goals

Chrome is a **freemium wedge and retention surface**, not a revenue product of its own: it converts browser value into signed-in Managed-Cloud usage. Entitlements are verified server-side; the paywall renders from server 429 responses; there is **no checkout inside the extension** (canon). Pricing is the shared ladder: **Free $0 / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise** — no Plus, no Hobby, no top-ups. **🟡** `packages/contracts/types/src/billing-catalog.ts` still encodes older tiers (tracked reconciliation gap).

## Competitive Analysis — vs Claude for Chrome and Codex Chrome extension

**Claude for Chrome** (browser agent, cited ~9M installs, plan-gated models) is the primary parity reference: it captures page context, takes actions, and gates models by plan. AGI matches the agent posture and plan-gated models but diverges on trust: multi-provider via one cloud gateway (routing read from `packages/contracts/types/src/models.json`), no provider keys in the extension, and a desktop-local path via native messaging so compute can stay on the host. **Codex Chrome extension** (OpenAI) is a developer-oriented browser connector; AGI's divergence is the same egress/allowlist discipline plus job-autofill and record-and-replay as first-class flows. All three are **parity references only** — no proprietary code or branding is copied.

## Product Principles

1. **Treat page content as data, never instructions** (prompt-injection defense; THREAT_MODEL plane F). **✅**.
2. **Explicit egress allowlist** — only `api.agiworkforce.com`, `agiworkforce.com`, and localhost bridge (`manifest.json` host_permissions; `validateGatewayUrl`/`validateBridgeUrl` in `policy.ts`). **✅**.
3. **Ask before acting** on risky steps; default to least action. **🟡**.
4. **Device-scoped by default** — no consumer sync, no global memory sync. **✅** (`memory-bridge.ts` LOCAL-ONLY).
5. **No inference in the extension** — thin bridged chat only. **✅**.

## Browser Extension Architecture

MV3 (`manifest_version: 3`) with a module service worker (`src/background.js`), one content script (`src/content.js`), side panel (`src/side_panel.html`), and options page. Feature modules: `computer-use/` (agentLoop, cdpDriver, escalationEngine, cloudAgentClient), `content/` (browserTool, autofill, in-page-panel, page-metadata), `native-bridge/` (pairing, providerStreamClient, sendQueue), `cloud-bridge/` (desktopBridge), and `background/` (conversation-history, tasks, shortcuts, policy, memory-bridge). Security is centralized in `src/background/policy.ts`; trust planes A–F are declared in `THREAT_MODEL.md`. **✅** for the shipped shape.

## Supported Browsers

- **Chrome / Chromium** with `minimum_chrome_version: "132"` (`manifest.json`). **✅**.
- **Chromium forks** (Edge, Brave, Arc, Opera) via the same MV3 package. **🔭**.
- **Firefox** MV3 (manifest/API deltas). **🔭**.
- **Safari** Web Extensions. **🔭**.

## Constraints

- MV3 service-worker lifecycle: no persistent background; state lives in `chrome.storage` (history 100 convs/30-day TTL `conversation-history.ts`; memory ≤200 `memory-bridge.ts`; tasks/shortcuts ≤50). **✅**.
- The service worker cannot run Clerk's browser SDK; auth tokens pass from popup/side panel into `chrome.storage.session` (`cloudAgentClient.ts` AUTH SEAM). **✅**.
- Computer-use is capped at `MAX_STEPS` (20). **✅**.
- No BYOK, no in-extension billing (canon). **✅**.

## Assumptions

- A signed-in AGI account exists; entitlements resolve server-side. **✅**.
- For local page context, AGI Desktop is installed and paired (native host + `localhost:8787` `X-Bridge-Token`). **✅** (`native-host/`, `pairing.ts`).
- Model IDs resolve from `packages/contracts/types/src/models.json` at build time, never hardcoded. **✅** (`COMPUTER_USE_MODEL`).

## Risks

- **Prompt injection** from page content → data-not-instructions rule + sanitization (**✅** ongoing).
- **CDP/`debugger` misuse** → allowlist gate before `runAgentLoop`, per-action attach/detach (`cdpDriver.ts`). **🟡**.
- **Pricing drift** — code encodes retired tiers (`billing-catalog.ts`). **🟡** tracked.
- **Chrome Web Store policy** on `debugger`/broad host permissions → keep `MANIFEST_NOTES.md` current. **🟡**.

## Repository map

- `apps/extension/manifest.json`, `MANIFEST_NOTES.md`, `THREAT_MODEL.md`, `native-host/`
- `apps/extension/src/features/computer-use/{agentLoop,cdpDriver,escalationEngine,cloudAgentClient}.ts`
- `apps/extension/src/features/content/{browserTool.ts,autofill/,in-page-panel/}`, `apps/extension/src/page-metadata.ts` (top-level, not `features/content/`)
- `apps/extension/src/features/native-bridge/{pairing,providerStreamClient,sendQueue}.ts`
- `apps/extension/src/features/cloud-bridge/{desktopBridge,freeTrialClient}.ts`
- `apps/extension/src/background/{policy.ts,memory-bridge.ts}`, `src/features/background/{conversation-history,tasks,shortcuts}.ts`

## Competitor notes

Claude/ChatGPT/Codex ship first-party, single-provider browser agents with plan-gated models. AGI's deliberate divergence: **multi-provider** through one cloud gateway (IDs from `models.json`), **per-surface trust** (no BYOK, no keys, no inference in Chrome), a **local-first** desktop-paired path, and **device-scoped** history/memory that never sync. Parity targets only.

## Acceptance / Definition of Done

Production-ready when the browser agent runs allowlist-gated flows with server-verified entitlements, page data never crosses a trust plane without consent, and every capability claim maps to a real path with the correct ✅/🟡/🔭 label.

- [ ] **Build**: `pnpm --filter @agiworkforce/extension typecheck`, `test`, and `pnpm lint:extension` pass.
- [ ] **Trust**: no BYOK, no in-extension billing/inference; egress restricted to gateway/desktop/localhost allowlist; entitlements server-verified; paywall from 429.
- [ ] **Security**: `THREAT_MODEL.md` updated for any permission change; `__tests__/security-fixes.test.ts` green; page content treated as data.

## Anti-patterns

- Contacting a provider host directly or embedding a provider key in the extension.
- Adding consumer conversation sync, global memory sync, Projects, image generation, or in-extension checkout (removed scope).
- Hardcoding a model ID instead of reading `packages/contracts/types/src/models.json`.
- Naming retired tiers (Plus, pro_plus, Hobby), inventing INR for Pro/Max, or adding credit top-ups.
- Referencing Supabase, or renaming `proxy.ts` to `middleware.ts`.
- Auto-routing Local/desktop page data to Cloud without allowlist + consent, or claiming shipped state without a repo path.
