# AGI Workforce — Master Program Plan

_Created: March 18, 2026_

This is the canonical all-program planning document for AGI Workforce.

## What This Document Does

- Plans every major product and platform program already visible in the repo.
- Treats every program as active from day one.
- Defines sequencing without omitting any surface.
- Establishes one planning system so `VISION.md`, `ROADMAP.md`, competitive audits, and scorecards stop drifting.

## Planning Rules

1. **Nothing is deferred.** Every program below has active work in the first 30 days.
2. **Sequencing is not omission.** Programs get different staffing and dependency order, not different existence rights.
3. **One program, one owner, one dashboard.** No shared accountability.
4. **No feature claim without proof.** Shipped capability must be backed by code, telemetry, tests, or a live release.
5. **Every cross-surface workflow needs recovery.** Pairing, sync, approvals, takeover, retries, and audit logs are not optional.
6. **Planning is hierarchical.** `VISION.md` explains why, this document explains what and how, `ROADMAP.md` tracks current release execution.

## Product Thesis

AGI Workforce should not position itself as another AI chat app. The codebase is strongest as a **vendor-neutral agent operating system** across:

- native desktop execution,
- IDE-native coding workflows,
- web-based control and workforce management,
- mobile oversight and approvals,
- terminal-native usage,
- cloud services that keep those surfaces in sync.

## Current Code Reality

The repo already supports a broad platform, not a prototype:

- **Desktop** already has a real shell, unified chat, tool approvals, background agents, browser sessions, and workflow state.
- **Mobile** already has attachments, local search, message edit/retry, schedules, project-aware chat, and a desktop companion.
- **VS Code** already has chat, context building, diagnostics review, inline diff actions, desktop bridge, and agent mode.
- **Web** already has a substantial route surface for chat, billing, workforce, schedules, projects, media, support, and settings.
- **CLI** already has one-shot mode, REPL mode, tools, sessions, skills, permissions, and team/subagent primitives.
- **Services** already include an API gateway, WebSocket layer, pairing routes, mobile routes, and signaling infrastructure.

This plan assumes the company is already building a multi-surface product suite and should operate accordingly.

## Canonical Planning Stack

- `VISION.md` — product thesis and market argument.
- `docs/MASTER_PROGRAM_PLAN.md` — all-program execution plan.
- `docs/POD_CHARTERS.md` — pod ownership, interfaces, and staffing shape.
- `docs/Q2_2026_EXECUTION_PLAN.md` — quarter-level dates, weekly outcomes, and release trains.
- `docs/CANONICAL_CAPABILITY_MATRIX.md` — shipped, partial, in-progress, and blocked status baseline.
- `ROADMAP.md` — active release train and near-term shipping board.
- `docs/*_AUDIT.md`, `docs/*_SCORECARD.md` — capability and parity tracking.

If a lower-level document conflicts with this one, update the lower-level document.

## Company-Level Objectives

1. Make AGI Workforce the best cross-surface agent control plane.
2. Make each surface independently credible for daily use.
3. Build shared cloud, model, memory, and sync infrastructure once and reuse it everywhere.
4. Eliminate planning drift between product claims and shipped code.
5. Build release and reliability discipline strong enough to support aggressive parallel execution.

## Program Map

The company should run the following programs in parallel.

1. Desktop Shell & Core UX
2. Desktop Agent Runtime, Approvals & Safety
3. Desktop Browser, Computer Use & Workflow Automation
4. Mobile Chat, Search, Projects & Scheduling
5. Mobile Companion & Remote Agent Control
6. VS Code Extension
7. Web Control Plane & Workforce App
8. CLI
9. Cloud Platform: Auth, Sync, Uploads, Billing & APIs
10. Realtime Platform: Pairing, Presence, Push & Signaling
11. Model Platform & Routing
12. Retrieval, Memory & Knowledge
13. Integrations, MCP, Skills & Marketplace
14. Security, Governance & Enterprise
15. Quality, Release, Observability & Performance
16. Growth, Documentation & Distribution

## Program Charters

### 1) Desktop Shell & Core UX

**Mandate**

Make desktop the flagship execution environment: stable, fast, understandable, and safe for long-running work.

**Current proof in repo**

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/services/featureFlags.ts`

**0-30 days**

- Finish shell-level gaps in onboarding, auth transitions, offline/session restore, and error states.
- Audit every enabled feature flag and remove dead or misleading exposure paths.
- Define startup, navigation, and recovery SLOs for the desktop app.

**30-90 days**

- Standardize panel behavior, layout persistence, focus handling, and shell keyboard ergonomics.
- Unify loading, streaming, and failure states across desktop workspaces.
- Complete a desktop-wide design system pass for visual consistency.

**90-180 days**

- Add advanced windowing, docking, and multi-workspace behavior.
- Ship first-class account, device, sync, and project management flows.

**180-365 days**

- Mature desktop into the primary command center for operators and teams.

**Primary KPI**

- Crash-free sessions, startup time, shell task completion, session restore success.

### 2) Desktop Agent Runtime, Approvals & Safety

**Mandate**

Make desktop agents trustworthy, inspectable, resumable, and operationally safe.

**Current proof in repo**

- `apps/desktop/src/stores/chat/toolStore.ts`
- `apps/desktop/src/stores/backgroundAgentStore.ts`

**0-30 days**

- Stabilize tool execution, approval timeouts, cancellation, pause/resume, and takeover behavior.
- Add structured action history and explicit recovery states for all long-running agents.
- Define approval policy primitives shared with mobile and web.

**30-90 days**

- Add checkpointing, resumable plans, richer task state, and better failure classification.
- Improve agent observability: per-run logs, timelines, artifacts, and operator notes.
- Expand policy controls for trusted tools, auto-approval scopes, and team visibility.

**90-180 days**

- Add multi-agent task orchestration, delegation controls, and operator intervention tools.
- Add queueing, priorities, and concurrency controls for larger workloads.

**180-365 days**

- Make the agent runtime enterprise-ready with durable execution and policy inheritance.

**Primary KPI**

- Successful agent completion rate, approval latency, unsafe action escape rate, operator takeover success.

### 3) Desktop Browser, Computer Use & Workflow Automation

**Mandate**

Turn desktop into the highest-leverage automation surface in the product.

**Current proof in repo**

- `apps/desktop/src/stores/browserStore.ts`
- `apps/desktop/src/stores/workflowStore.ts`

**0-30 days**

- Harden browser session lifecycle, action replay, screenshots, and stream-end paths.
- Define the minimum workflow schema and execution guarantees.
- Standardize how browser sessions and workflow runs emit logs, artifacts, and approvals.

**30-90 days**

- Ship a usable visual workflow builder on top of the existing workflow state.
- Add reliable file upload/download automation, replay, and debugging.
- Build better inspection tools for browser state, DOM snapshots, and execution traces.

**90-180 days**

- Add reusable workflow templates, triggers, schedules, and environment bindings.
- Add automation benchmarking and golden-path regression suites.

**180-365 days**

- Expand from browser automation into broader computer-use orchestration and enterprise workflow operations.

**Primary KPI**

- Workflow success rate, automation run reliability, replay fidelity, browser action failure rate.

### 4) Mobile Chat, Search, Projects & Scheduling

**Mandate**

Make mobile independently useful, not just a companion shell.

**Current proof in repo**

- `apps/mobile/stores/chatStore.ts`
- `apps/mobile/components/chat/AttachmentButton.tsx`
- `apps/mobile/stores/scheduleStore.ts`

**0-30 days**

- Harden attachments, uploads, search, edit/retry, and schedule flows.
- Clean up stale planning assumptions that say these features do not exist.
- Define mobile activation and retention funnels around daily utility, not novelty.

**30-90 days**

- Add stronger project management, chat organization, conversation filtering, export, and search UX.
- Add biometric unlock, widget surfaces, and higher-confidence offline handling.
- Tighten model picker clarity and provider health handling.

**90-180 days**

- Expand voice, documents, projects, notifications, and scheduled-task management into a complete mobile workflow layer.
- Improve mobile-first composition for long-form and work-oriented tasks.

**180-365 days**

- Make mobile a true second primary surface for operators, not just a remote notification device.

**Primary KPI**

- Weekly active mobile users, conversation completion, search success, attachment success, schedule execution rate.

### 5) Mobile Companion & Remote Agent Control

**Mandate**

Own the remote oversight loop for agents running away from the desk.

**Current proof in repo**

- `apps/mobile/app/(app)/companion/index.tsx`
- `apps/mobile/services/companion.ts`
- `apps/mobile/stores/agentStore.ts`

**0-30 days**

- Harden pairing, heartbeat, approval delivery, refresh flows, and command reliability.
- Define explicit failure modes for disconnected desktop, stale approvals, expired sessions, and partial sync.
- Instrument approval round-trip metrics end to end.

**30-90 days**

- Add richer agent dashboards, action previews, run artifacts, and operator drill-down.
- Add push notifications for pending approvals, failures, and completed runs.
- Improve remote queue control, takeover, and emergency stop behavior.

**90-180 days**

- Add team-aware approvals, escalation rules, and policy-based routing of approvals.
- Add remote observability for workflow runs, browser sessions, and agent health.

**180-365 days**

- Make remote control a clear category differentiator: “agents continue working when the operator leaves the desk.”

**Primary KPI**

- Approval round-trip time, push-to-open rate, remote intervention success, paired-device retention.

### 6) VS Code Extension

**Mandate**

Make the extension credible against top coding tools, while staying tightly connected to the desktop runtime.

**Current proof in repo**

- `apps/extension-vscode/src/extension.ts`
- `apps/extension-vscode/src/providers/agentModeProvider.ts`
- `apps/extension-vscode/src/providers/diffDecorationProvider.ts`
- `apps/extension-vscode/src/services/workspaceIndexer.ts`
- `apps/extension-vscode/src/services/desktopBridge.ts`

**0-30 days**

- Harden the desktop bridge, diagnostics flows, agent mode invocation, and diff accept/reject paths.
- Replace weak whole-file replacement assumptions with a patch-oriented edit contract.
- Define a stronger retrieval strategy than the current lightweight index limits.

**30-90 days**

- Ship better context quality, project retrieval, patch application, and edit confidence.
- Tighten the daily coding loop: search, explain, patch, review, run, and recover.
- Improve test and benchmark coverage around edit correctness.

**90-180 days**

- Add stronger semantic retrieval, PR review assistance, codebase memory, and deeper autonomous loops.
- Improve team workflows and desktop-extension coordination.

**180-365 days**

- Make the extension strong enough to retain heavy daily developers, not just curious evaluators.

**Primary KPI**

- Suggested edit accept rate, task completion, edit correctness, daily active developer retention.

### 7) Web Control Plane & Workforce App

**Mandate**

Use the web app as the broadest-access management surface for chat, workforce operations, billing, and projects.

**Current proof in repo**

- `apps/web/app`
- `apps/web/features/chat/README.md`

**0-30 days**

- Audit the current route surface and define which web flows are primary, secondary, and admin-only.
- Align marketing, app navigation, and dashboard concepts around one product vocabulary.
- Harden billing, settings, projects, schedules, and workforce management flows.

**30-90 days**

- Improve web chat parity, workforce management, connectors, and project operations.
- Tighten API integration, loading behavior, and account-state reliability across the app.
- Define the web surface as the primary non-native entry point for teams.

**90-180 days**

- Expand media, support, mission-control, and collaboration surfaces into a coherent operator workspace.
- Add stronger admin, audit, and account-management features.

**180-365 days**

- Make web the default shared workspace for teams that do not live entirely in desktop or mobile.

**Primary KPI**

- Web activation, billing conversion, admin task completion, workforce/project weekly active usage.

### 8) CLI

**Mandate**

Make the CLI a serious terminal-native product, not a side utility.

**Current proof in repo**

- `apps/cli/src/main.rs`
- `apps/cli/src/repl.rs`
- `apps/cli/src/tools.rs`
- `apps/cli/src/subagent.rs`
- `apps/cli/src/skills.rs`

**0-30 days**

- Define the CLI’s exact positioning relative to Claude Code, Gemini CLI, and Codex-like workflows.
- Harden permissions, session management, REPL ergonomics, and tool confirmation logic.
- Benchmark model/provider routing and terminal task completion against the flagship flows.

**30-90 days**

- Improve team mode, subagent ergonomics, memory handling, hooks, and streaming UX.
- Expand documentation and install flows for terminal-native adoption.
- Tighten project initialization, config, and reproducible session behavior.

**90-180 days**

- Add stronger coding workflows, CI-oriented output modes, and remote/runtime integrations.
- Make CLI and desktop interoperable for shared sessions and task handoff.

**180-365 days**

- Make CLI strong enough to stand alone as a serious product line.

**Primary KPI**

- Weekly active CLI users, task completion, session resume rate, tool-confirmation abandonment.

### 9) Cloud Platform: Auth, Sync, Uploads, Billing & APIs

**Mandate**

Build one cloud substrate that all surfaces can trust.

**Current proof in repo**

- `services/api-gateway/src/index.ts`
- `services/api-gateway/src/routes/chat.ts`
- `services/api-gateway/src/routes/mobile.ts`

**0-30 days**

- Define canonical auth, sync, upload, and billing contracts across surfaces.
- Audit route ownership, rate limits, and error semantics.
- Establish versioning rules and API compatibility guarantees.

**30-90 days**

- Stabilize mobile-desktop sync, chat sync, uploads, billing state, and usage accounting.
- Add stronger internal service observability and API consumer dashboards.
- Eliminate inconsistent auth and sync behavior across web, mobile, and desktop.

**90-180 days**

- Add tenant-aware usage, quotas, entitlements, and team infrastructure.
- Expand upload and artifact infrastructure for workflows, agents, and reports.

**180-365 days**

- Make the platform strong enough to support enterprise contracts and large shared workloads.

**Primary KPI**

- API success rate, sync success rate, upload success rate, billing error rate, auth-related support volume.

### 10) Realtime Platform: Pairing, Presence, Push & Signaling

**Mandate**

Make cross-device connectivity reliable enough to be invisible.

**Current proof in repo**

- `services/api-gateway/src/routes/pair.ts`
- `services/signaling-server`

**0-30 days**

- Define the exact state machine for pairing, reconnect, expiration, and approval delivery.
- Add reliability metrics for pairing creation, confirmation, heartbeat, and disconnect recovery.
- Clarify signaling vs API gateway responsibilities.

**30-90 days**

- Add durable session handling, stronger reconnect semantics, and push notification orchestration.
- Improve presence, desktop health visibility, and approval delivery resilience.

**90-180 days**

- Add higher-volume reliability features: fan-out, queueing, durability, and operational tooling.
- Support team presence and policy-aware approval routing.

**180-365 days**

- Make real-time orchestration a platform capability that supports every surface cleanly.

**Primary KPI**

- Pairing success, reconnect success, approval delivery success, push latency, stale-session rate.

### 11) Model Platform & Routing

**Mandate**

Turn multi-model support into an operational advantage, not just a marketing bullet.

**Current proof in repo**

- `apps/mobile/lib/models.ts`
- `apps/web/features/chat/README.md`
- `apps/cli/src/main.rs`

**0-30 days**

- Build a canonical model catalog and routing contract shared across surfaces.
- Define provider health, fallback, budget, and routing telemetry.
- Remove inconsistencies in model naming and availability across apps.

**30-90 days**

- Add routing policies for task type, latency, price, and reliability.
- Add provider health dashboards and operator overrides.
- Define default models by workflow, not by surface.

**90-180 days**

- Add cost governance, rate-limit handling, and quality benchmarking loops.
- Add model evaluation pipelines for production workflows.

**180-365 days**

- Make model routing a measurable performance moat for the product suite.

**Primary KPI**

- Successful routed task rate, fallback success, cost per successful task, provider outage impact.

### 12) Retrieval, Memory & Knowledge

**Mandate**

Improve context quality across every surface.

**Current proof in repo**

- `apps/extension-vscode/src/services/contextBuilder.ts`
- `apps/extension-vscode/src/services/workspaceIndexer.ts`
- `apps/mobile/stores/chatStore.ts`

**0-30 days**

- Define one memory and retrieval strategy for code, projects, chat, and user preferences.
- Identify where current retrieval is intentionally lightweight and insufficient for flagship use.
- Establish truth sources for project context, conversation context, and workspace context.

**30-90 days**

- Improve workspace retrieval, project context injection, and conversation memory quality.
- Add better indexing, search relevance, and context debugging tools.
- Start measuring context usefulness instead of just context size.

**90-180 days**

- Add durable project memory, team memory, semantic retrieval, and knowledge browsing.
- Support agent reuse of prior context across surfaces and sessions.

**180-365 days**

- Make memory and retrieval a cross-surface advantage rather than a patchwork of local heuristics.

**Primary KPI**

- Retrieval precision, context usefulness score, repeat-task success, memory reuse rate.

### 13) Integrations, MCP, Skills & Marketplace

**Mandate**

Turn external tools and domain specialization into ecosystem leverage.

**Current proof in repo**

- `apps/cli/src/repl.rs`
- `apps/cli/src/skills.rs`
- `ROADMAP.md`
- `VISION.md`

**0-30 days**

- Define a canonical integration model: local tools, MCP, partner apps, skills, and future marketplace entries.
- Audit what is already shippable vs what is only described in planning docs.
- Define packaging, trust, review, and discovery requirements for marketplace-grade extensions.

**30-90 days**

- Expand MCP coverage where it unlocks mobile, web, and team workflows.
- Improve skill discoverability, invocation, and compatibility across surfaces.
- Build the first marketplace-ready ingestion and review path.

**90-180 days**

- Launch partner integrations and curated extension discovery.
- Add usage analytics, permission scopes, and compatibility contracts.

**180-365 days**

- Make integrations and skills a distribution and retention flywheel.

**Primary KPI**

- Connected tools per active account, successful external action rate, skill reuse, marketplace activation.

### 14) Security, Governance & Enterprise

**Mandate**

Support high-trust use cases without weakening product velocity.

**Current proof in repo**

- `services/api-gateway/src/index.ts`
- `services/api-gateway/src/routes/mobile.ts`
- `services/api-gateway/src/routes/pair.ts`
- `apps/desktop/src/lib/tauri-mock.ts`

**0-30 days**

- Define enterprise-grade policy boundaries for auth, device trust, approvals, rate limits, and audit trails.
- Audit which security assumptions are documented vs actually enforced.
- Close obvious runtime gaps between desktop mocks, real native behavior, and production failure handling.

**30-90 days**

- Add stronger device governance, approval policy, role boundaries, and audit capture.
- Standardize secret handling, policy visibility, and administrative controls across surfaces.

**90-180 days**

- Add organization controls, compliance-facing exports, and richer audit workflows.
- Build enterprise readiness around identity, governance, and supportability.

**180-365 days**

- Make governance a buying reason, not just a checklist.

**Primary KPI**

- Security incident rate, audit coverage, policy enforcement success, enterprise deployment readiness.

### 15) Quality, Release, Observability & Performance

**Mandate**

Build the release machine required to support aggressive parallel execution.

**Current proof in repo**

- `apps/desktop/package.json`
- `apps/mobile/package.json`
- `apps/web/package.json`

**0-30 days**

- Define per-surface release gates, smoke suites, crash reporting, and golden-path end-to-end tests.
- Eliminate false confidence from skipped or shallow tests.
- Establish one cross-surface quality dashboard.

**30-90 days**

- Increase deterministic test coverage for the flagship workflows: agent run, approval, pairing, sync, diff apply, and workflow execution.
- Add performance budgets for startup, streaming, search, and sync operations.
- Add artifact capture for failures across CI and production.

**90-180 days**

- Build full release trains with staged rollouts, rollback tooling, and observability by feature.
- Add benchmark suites for desktop automation and coding workflows.

**180-365 days**

- Make reliability boring.

**Primary KPI**

- Release failure rate, crash-free sessions, regression escape rate, mean time to detect, mean time to recover.

### 16) Growth, Documentation & Distribution

**Mandate**

Turn product breadth into discoverable, adoptable, and sellable motion.

**Current proof in repo**

- `ROADMAP.md`
- `PLAN.md`
- `docs`
- `apps/web/app`

**0-30 days**

- Clean up product messaging so the suite has one clear story.
- Define distribution priorities per surface: desktop, web, mobile, VS Code, CLI, API.
- Establish one canonical documentation stack and retire stale planning assumptions.

**30-90 days**

- Improve onboarding, docs, pricing clarity, install flows, and evaluation paths.
- Tighten store/listing readiness and product marketing alignment with actual capability.
- Build a credible launch loop for each surface.

**90-180 days**

- Add lifecycle messaging, usage education, and self-serve upgrade paths.
- Improve partner distribution, community content, and referral loops.

**180-365 days**

- Make product understanding and adoption scale without founder bottlenecks.

**Primary KPI**

- Activation rate, time to first successful task, conversion, retained teams, support deflection through docs.

## First 30 Days: Non-Negotiable Company Work

Every program starts now. The first 30 days should still be structured around a few hard requirements:

1. **Create one shipped-capability inventory**
   - Audit every major surface against actual code.
   - Update stale competitive and planning docs, especially where they contradict shipped capability.

2. **Define cross-surface contracts**
   - Auth
   - session identity
   - model catalog
   - approvals
   - pairing
   - uploads
   - sync
   - artifact references
   - policy and audit events

3. **Instrument the flagship loop**
   - desktop agent run
   - VS Code context handoff
   - mobile approval
   - sync recovery
   - web visibility

4. **Establish release discipline**
   - one quality dashboard
   - one incident process
   - one release checklist per surface
   - staged rollout rules

5. **Clarify product language**
   - Decide the company-wide vocabulary for agent, workforce, task, workflow, project, employee, companion, and mission control.

## Execution Model

All programs run in parallel. They do not run with equal staffing.

### Recommended Pod Structure

1. Desktop Shell
2. Desktop Agents & Approvals
3. Desktop Browser Automation
4. Desktop Workflows
5. Mobile Chat & Projects
6. Mobile Companion
7. VS Code Core
8. VS Code Agent & Retrieval
9. Web Chat & Dashboard
10. Web Workforce, Billing & Admin
11. CLI
12. API Gateway & Auth
13. Signaling, Push & Realtime
14. Model Platform
15. Memory & Knowledge
16. Integrations & Marketplace
17. Security & Enterprise
18. Quality, Release & Observability
19. Design System & UX
20. Growth, Docs & Distribution

### Pod Shape

- 1 engineering lead
- 4-7 engineers
- 1 product manager for multi-quarter pods
- 1 designer shared across 2-3 product pods
- dedicated QA/SDET support from the quality program

### Practical Headcount Guidance

- The useful near-term scale for this plan is roughly **150-250 people**, not 10,000.
- More people only helps when interfaces, ownership, and quality gates are already clear.
- If the company scales beyond that, additional headcount should flow into:
  - partner engineering,
  - enterprise delivery,
  - QA and release,
  - documentation,
  - support,
  - GTM,
  - trust and safety,
  - operational tooling.

## Company Operating System

### Weekly

- One program review per major program.
- One company release readiness review.
- One metrics review for activation, reliability, and cost.

### Monthly

- One planning reconciliation pass: code, docs, claims, and roadmap must agree.
- One architecture review for cross-surface contracts.
- One incident and quality review.

### Quarterly

- Re-rank staffing density, not program existence.
- Refresh competitive scorecards from shipped capability, not assumptions.
- Reset KPI targets using real usage and quality data.

## Year-One Outcome Targets

By the end of the first year, AGI Workforce should have:

- a flagship desktop agent runtime that is trustworthy under sustained use,
- a mobile companion that reliably handles remote approvals and oversight,
- a VS Code extension that is credible for daily development,
- a web control plane that supports teams, billing, projects, and workforce operations,
- a CLI that stands as a serious terminal-native product,
- shared cloud, model, memory, and realtime infrastructure that all surfaces reuse,
- a quality and release system capable of supporting aggressive parallel shipping.

## Tracking Metrics

### Product

- successful task completion rate
- weekly retained active users by surface
- time to first successful task
- approval round-trip latency
- paired-device retention

### Reliability

- crash-free sessions by surface
- sync success rate
- workflow success rate
- edit correctness rate
- reconnect success rate

### Business

- paid conversion
- retained teams
- expansion by active account
- support burden by failure class
- cost per successful task

## Immediate Follow-On Documents

This document should be followed by:

1. updates to stale audits and parity docs that contradict the codebase.

## Final Rule

This plan does not grant permission to build everything at the same depth at the same time.

It requires the opposite:

- everything is planned,
- everything is owned,
- everything starts,
- and the highest-leverage loops get the highest staffing density until they are undeniably strong.
