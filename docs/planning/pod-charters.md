# AGI Workforce — Pod Charters

_Created: March 18, 2026_

This document turns `docs/MASTER_PROGRAM_PLAN.md` into execution ownership.

## Purpose

- Give every major program a named pod.
- Define what each pod owns and what it must not own.
- Make dependencies, interfaces, and first deliverables explicit.
- Prevent “everyone is working on everything” from becoming “nobody owns anything.”

## Sources Used

This document is based on:

- AGI Workforce source and planning docs.
- structural patterns from the local clones of Gemini CLI, Codex CLI, and OpenCode.

Those external repos reinforce a few useful organizational truths:

1. **Runtime and clients should be separated.**
   - Gemini splits `cli`, `core`, `sdk`, `a2a-server`, `test-utils`, and `vscode-ide-companion`.
   - Codex splits `cli`, `core`, `connectors`, `execpolicy`, `hooks`, `mcp-server`, `app-server`, and more into separate crates.
   - OpenCode splits `console`, `desktop`, `web`, `ui`, `plugin`, `sdk`, and `enterprise`.

2. **Protocols and policy deserve first-class ownership.**
   - Codex is especially clear here: app-server protocol, hooks, exec policy, and MCP are not side details.

3. **Docs, release, and test infrastructure are product-critical.**
   - Gemini’s release/test/docs machinery is prominent.
   - OpenCode and Codex both treat packaging and multi-surface distribution as first-class work.

4. **IDE companions and desktop/web shells should not be treated as thin wrappers.**
   - Gemini has a dedicated VS Code companion package.
   - OpenCode separates console, desktop, and web.

## Pod Rules

1. Every pod has one engineering owner.
2. Every pod publishes its interfaces and KPIs.
3. Every pod must support weekly shipping.
4. Cross-pod work needs an explicit DRI on both sides.
5. Shared contracts live with platform pods, not inside surface pods.
6. A pod can propose work outside its area; it cannot silently absorb that area.

## Pod Tiers

- **Tier 1** — highest staffing density now
- **Tier 2** — active now, medium staffing density
- **Tier 3** — active now, smaller seed teams with clear interfaces

## Pod Index

### Tier 1

1. Desktop Shell
2. Desktop Agents & Approvals
3. Mobile Companion
4. VS Code Agent & Retrieval
5. API Gateway, Auth & Sync
6. Realtime, Pairing & Push
7. Quality, Release & Observability

### Tier 2

8. Desktop Browser Automation
9. Desktop Workflows
10. Mobile Chat & Projects
11. VS Code Core UX
12. Web Chat & App Shell
13. Web Workforce, Billing & Admin
14. CLI
15. Model Platform
16. Memory & Knowledge
17. Security & Enterprise

### Tier 3

18. Integrations, MCP & Skills
19. Design System & UX
20. Growth, Docs & Distribution

## Pod Charters

### 1) Desktop Shell

- **Tier**: 1
- **Mission**: own the flagship desktop shell and make it reliable, understandable, and fast.
- **Owns**: `apps/desktop/src/App.tsx`, desktop shell navigation, onboarding, auth transitions, workspace layout, startup, settings shell, session restore.
- **Does not own**: tool policy, browser automation semantics, workflow engine semantics.
- **Publishes**: shell navigation contract, startup lifecycle, layout persistence contract.
- **Depends on**: Desktop Agents & Approvals, Model Platform, API Gateway, Design System.
- **Seed team**: 1 lead, 5-7 engineers, shared design.
- **First 6 weeks**:
  - stabilize onboarding/auth/offline recovery;
  - standardize loading and failure states;
  - audit feature-flag exposure and remove dead shell paths.
- **KPIs**: crash-free desktop sessions, startup time, shell task completion, restore success.

### 2) Desktop Agents & Approvals

- **Tier**: 1
- **Mission**: own long-running agents, tool execution, approval flows, cancellation, recovery, and operator control.
- **Owns**: `apps/desktop/src/stores/chat/toolStore.ts`, `apps/desktop/src/stores/backgroundAgentStore.ts`, approval state, task state, execution timelines, takeover semantics.
- **Does not own**: shell navigation, browser automation implementation, mobile pairing transport.
- **Publishes**: approval contract, agent state model, action log schema, task lifecycle.
- **Depends on**: API Gateway, Realtime, Security, Quality.
- **Seed team**: 1 lead, 6-8 engineers, shared PM.
- **First 6 weeks**:
  - harden approval timeout/cancel/pause/resume;
  - add structured recovery states;
  - define shared approval contract for mobile and web.
- **KPIs**: task completion, approval latency, recovery success, takeover success.

### 3) Desktop Browser Automation

- **Tier**: 2
- **Mission**: own browser sessions, action execution, replay, inspection, and automation debugging.
- **Owns**: `apps/desktop/src/stores/browserStore.ts`, browser session lifecycle, screenshots, DOM/session artifacts, automation replay, execution traces.
- **Does not own**: generic agent policy, workflow template UX, mobile remote control.
- **Publishes**: browser session contract, action event schema, replay artifact format.
- **Depends on**: Desktop Agents & Approvals, Desktop Workflows, Quality.
- **Seed team**: 1 lead, 4-6 engineers.
- **First 6 weeks**:
  - harden session lifecycle and stream-end paths;
  - define replay and artifact rules;
  - add automation debugging primitives.
- **KPIs**: automation success rate, replay fidelity, browser action failure rate.

### 4) Desktop Workflows

- **Tier**: 2
- **Mission**: own workflows, schedules, triggers, execution visibility, and workflow-builder productization.
- **Owns**: `apps/desktop/src/stores/workflowStore.ts`, workflow CRUD, scheduling, triggers, execution logs, workflow templates, builder UX.
- **Does not own**: raw browser action engine, shell layout, push delivery.
- **Publishes**: workflow schema, run state model, schedule/trigger contract.
- **Depends on**: Desktop Agents & Approvals, Desktop Browser Automation, Realtime, API Gateway.
- **Seed team**: 1 lead, 4-6 engineers.
- **First 6 weeks**:
  - define minimum workflow schema and guarantees;
  - harden run logs and artifacts;
  - ship the first usable builder slice.
- **KPIs**: workflow creation-to-run conversion, workflow success rate, scheduled run success.

### 5) Mobile Chat & Projects

- **Tier**: 2
- **Mission**: make mobile independently useful for chat, files, project-aware work, and scheduling.
- **Owns**: `apps/mobile/stores/chatStore.ts`, `apps/mobile/components/chat`, `apps/mobile/stores/scheduleStore.ts`, search, attachments, edit/retry, conversation organization, project context on mobile.
- **Does not own**: pairing transport, remote agent command transport, shared model policy.
- **Publishes**: mobile chat state contract, attachment/upload UX contract, schedule UX requirements.
- **Depends on**: API Gateway, Model Platform, Memory & Knowledge, Design System.
- **Seed team**: 1 lead, 4-6 engineers, shared design.
- **First 6 weeks**:
  - harden attachments/search/edit-retry;
  - tighten project context handling;
  - clean up stale docs that understate shipped capability.
- **KPIs**: WAU, attachment success, search success, conversation completion, schedule usage.

### 6) Mobile Companion

- **Tier**: 1
- **Mission**: own remote approvals, agent oversight, desktop health visibility, and paired-device control.
- **Owns**: `apps/mobile/app/(app)/companion`, `apps/mobile/services/companion.ts`, `apps/mobile/stores/agentStore.ts`, approval UI, heartbeat flows, remote command UX.
- **Does not own**: core agent execution logic, signaling server internals, generic mobile chat.
- **Publishes**: mobile approval UX contract, remote command schema, paired-device state model.
- **Depends on**: Realtime, API Gateway, Desktop Agents & Approvals, Quality.
- **Seed team**: 1 lead, 5-7 engineers.
- **First 6 weeks**:
  - harden pairing refresh/heartbeat/approval flows;
  - instrument approval round-trip;
  - add explicit disconnect and stale-state recovery UX.
- **KPIs**: approval round-trip time, paired-device retention, remote intervention success.

### 7) VS Code Core UX

- **Tier**: 2
- **Mission**: own extension activation, chat surfaces, context panels, commands, diagnostics review UI, and day-to-day editor ergonomics.
- **Owns**: `apps/extension-vscode/src/extension.ts`, extension activation wiring, commands, panels, diagnostics UI, bridge UX, model selection UX.
- **Does not own**: retrieval ranking, agent patch semantics, core desktop runtime.
- **Publishes**: extension command surface, panel contracts, IDE UX patterns.
- **Depends on**: VS Code Agent & Retrieval, Model Platform, API Gateway.
- **Seed team**: 1 lead, 4-5 engineers.
- **First 6 weeks**:
  - harden activation and bridge failure handling;
  - standardize command flows and error surfaces;
  - improve editor-native daily usability.
- **KPIs**: command success rate, extension reliability, DAU/WAU, panel engagement.

### 8) VS Code Agent & Retrieval

- **Tier**: 1
- **Mission**: make the extension strong enough for real daily coding work.
- **Owns**: `apps/extension-vscode/src/providers/agentModeProvider.ts`, `apps/extension-vscode/src/providers/diffDecorationProvider.ts`, `apps/extension-vscode/src/services/workspaceIndexer.ts`, `apps/extension-vscode/src/services/contextBuilder.ts`, retrieval, patch application, edit correctness.
- **Does not own**: generic extension shell, cloud auth, desktop shell UX.
- **Publishes**: code retrieval contract, patch/edit contract, diff artifact model.
- **Depends on**: Memory & Knowledge, Model Platform, Desktop Agents & Approvals, Quality.
- **Seed team**: 1 lead, 6-8 engineers.
- **First 6 weeks**:
  - replace weak whole-file replacement paths with patch semantics;
  - raise retrieval quality above the current lightweight limits;
  - benchmark edit correctness against flagship tasks.
- **KPIs**: edit accept rate, edit correctness, task completion, coding retention.

### 9) Web Chat & App Shell

- **Tier**: 2
- **Mission**: own web chat, main dashboard shell, navigation, and entry-point product coherence.
- **Owns**: `apps/web/features/chat`, `apps/web/app/chat`, `apps/web/app/dashboard` shell/navigation, session entry flows, app-level loading and auth transitions.
- **Does not own**: billing logic, workforce/admin domain logic, shared auth backend.
- **Publishes**: web shell navigation, app layout conventions, chat app UX contract.
- **Depends on**: API Gateway, Model Platform, Design System.
- **Seed team**: 1 lead, 4-5 engineers, shared design.
- **First 6 weeks**:
  - define primary web journeys;
  - tighten shell consistency and auth/loading behavior;
  - align vocabulary with desktop/mobile.
- **KPIs**: web activation, chat completion, bounce rate on app shell flows.

### 10) Web Workforce, Billing & Admin

- **Tier**: 2
- **Mission**: own business and management flows in the web app.
- **Owns**: `apps/web/app/dashboard/workforce`, `apps/web/app/dashboard/billing`, `apps/web/app/dashboard/projects`, `apps/web/app/dashboard/schedules`, `apps/web/app/dashboard/settings`, `apps/web/app/dashboard/connectors`, `apps/web/app/dashboard/support`, admin/business workflows.
- **Does not own**: generic web shell, CLI product, realtime signaling internals.
- **Publishes**: account/billing/workforce management UX contracts.
- **Depends on**: API Gateway, Realtime, Security & Enterprise, Growth.
- **Seed team**: 1 lead, 4-6 engineers.
- **First 6 weeks**:
  - harden billing and account-state reliability;
  - tighten workforce/project/schedule management flows;
  - define admin-level MVP for team operations.
- **KPIs**: billing conversion, admin task success, workforce weekly active teams.

### 11) CLI

- **Tier**: 2
- **Mission**: own terminal-native product experience end to end.
- **Owns**: `apps/cli/src/main.rs`, `apps/cli/src/repl.rs`, `apps/cli/src/output.rs`, `apps/cli/src/tools.rs`, `apps/cli/src/subagent.rs`, session UX, terminal permissions UX, install/run docs.
- **Does not own**: web billing flows, VS Code retrieval logic, shared cloud auth backend contracts.
- **Publishes**: CLI command surface, REPL/session semantics, tool-permission UX contract.
- **Depends on**: Model Platform, Integrations/MCP/Skills, Quality, Growth.
- **Seed team**: 1 lead, 4-6 engineers.
- **First 6 weeks**:
  - benchmark CLI against core coding and ops tasks;
  - tighten session resume/fork/search ergonomics;
  - harden permission and tool confirmation behavior.
- **KPIs**: weekly active CLI users, session resume rate, task completion, install-to-first-task time.

### 12) API Gateway, Auth & Sync

- **Tier**: 1
- **Mission**: own the shared cloud contract for auth, sync, uploads, billing state exposure, and cross-surface APIs.
- **Owns**: `services/api-gateway/src/index.ts`, auth routes, sync routes, chat routes, desktop/mobile API contracts, upload and usage APIs.
- **Does not own**: realtime transport internals, surface-specific presentation logic, model routing policy.
- **Publishes**: auth contract, sync contract, upload contract, usage/billing API contract.
- **Depends on**: Realtime, Security & Enterprise, Quality.
- **Seed team**: 1 lead, 5-7 engineers.
- **First 6 weeks**:
  - normalize auth/sync error semantics;
  - define canonical route contracts;
  - instrument sync and upload reliability.
- **KPIs**: API success, sync success, auth support volume, upload success.

### 13) Realtime, Pairing & Push

- **Tier**: 1
- **Mission**: own device pairing, presence, push, approval delivery, and realtime session reliability.
- **Owns**: `services/api-gateway/src/routes/pair.ts`, `services/api-gateway/src/routes/mobile.ts`, `services/signaling-server`, push orchestration, presence state.
- **Does not own**: mobile companion UI, agent runtime semantics, billing.
- **Publishes**: pairing state machine, presence contract, approval delivery contract, push event model.
- **Depends on**: API Gateway, Mobile Companion, Desktop Agents & Approvals, Quality.
- **Seed team**: 1 lead, 5-7 engineers.
- **First 6 weeks**:
  - define the exact pairing/reconnect state machine;
  - add metrics for pairing, delivery, reconnect, expiry;
  - harden stale-session and disconnect handling.
- **KPIs**: pairing success, reconnect success, approval delivery success, push latency.

### 14) Model Platform

- **Tier**: 2
- **Mission**: own model catalog, provider health, routing policy, fallback, and cost control across all surfaces.
- **Owns**: canonical model catalog, provider availability, routing rules, health dashboards, default model policy, cost attribution surfaces.
- **Current code anchors**: `apps/mobile/lib/models.ts`, mobile model picker, CLI provider/model selection, web/desktop model selection paths.
- **Does not own**: surface-specific UI details, retrieval quality, tool execution policy.
- **Publishes**: model catalog API, provider health API, routing policy contract.
- **Depends on**: API Gateway, CLI, web/mobile/desktop surfaces.
- **Seed team**: 1 lead, 4-6 engineers.
- **First 6 weeks**:
  - create one canonical model catalog;
  - define provider health/fallback telemetry;
  - eliminate inconsistent model naming across surfaces.
- **KPIs**: routed task success, fallback success, cost per successful task, provider outage impact.

### 15) Memory & Knowledge

- **Tier**: 2
- **Mission**: own context quality, memory reuse, project knowledge, and retrieval across surfaces.
- **Owns**: `apps/extension-vscode/src/services/workspaceIndexer.ts`, `apps/extension-vscode/src/services/contextBuilder.ts`, project context injection, knowledge-base primitives, future shared retrieval services.
- **Does not own**: surface rendering, model routing, billing.
- **Publishes**: memory model, retrieval contract, project context format, knowledge artifact schema.
- **Depends on**: VS Code Agent & Retrieval, Mobile Chat & Projects, API Gateway, Model Platform.
- **Seed team**: 1 lead, 4-6 engineers.
- **First 6 weeks**:
  - define shared retrieval and memory architecture;
  - identify and replace weakest context bottlenecks;
  - add retrieval/debug instrumentation.
- **KPIs**: retrieval usefulness, repeat-task success, memory reuse rate, context precision.

### 16) Integrations, MCP & Skills

- **Tier**: 3
- **Mission**: own external tools, MCP connectivity, skills system, and marketplace readiness.
- **Owns**: CLI MCP/skills paths, future mobile/web MCP proxying, skill packaging/discovery, integration compatibility, marketplace ingestion rules.
- **Does not own**: core model routing, surface shells, enterprise governance.
- **Publishes**: integration contract, skill package contract, marketplace intake/review rules.
- **Depends on**: API Gateway, CLI, Security & Enterprise, Growth.
- **Seed team**: 1 lead, 3-5 engineers.
- **First 6 weeks**:
  - inventory current MCP/skill capability;
  - define portable skill and integration packaging rules;
  - design marketplace review and trust model.
- **KPIs**: connected tools per active account, skill reuse, external action success.

### 17) Security & Enterprise

- **Tier**: 2
- **Mission**: own policy, governance, audit, enterprise controls, and high-trust deployment requirements.
- **Owns**: auth policy boundaries, device trust rules, approval governance, audit event standards, enterprise admin requirements, secret handling review.
- **Current code anchors**: API gateway middleware and rate-limit paths, pairing/mobile security boundaries, desktop runtime boundary review.
- **Does not own**: generic product UX, surface-specific feature delivery, release operations.
- **Publishes**: policy model, audit event schema, device trust model, enterprise requirements.
- **Depends on**: API Gateway, Realtime, Desktop Agents & Approvals, Growth.
- **Seed team**: 1 lead, 4-5 engineers.
- **First 6 weeks**:
  - define canonical audit and policy contracts;
  - close obvious trust-boundary mismatches;
  - define enterprise MVP controls.
- **KPIs**: policy enforcement success, audit coverage, security incident rate, enterprise readiness.

### 18) Quality, Release & Observability

- **Tier**: 1
- **Mission**: make every surface shippable every week without guessing.
- **Owns**: CI policy, release gates, smoke suites, regression suites, crash reporting, telemetry quality, performance budgets, rollout rules.
- **Current code anchors**: per-surface package scripts, test surfaces, release readiness discipline, benchmark and e2e ownership.
- **Does not own**: feature prioritization, business pricing, surface UX design.
- **Publishes**: release gate checklist, test policy, observability standards, incident process.
- **Depends on**: every pod.
- **Seed team**: 1 lead, 5-7 engineers/SDET/release staff.
- **First 6 weeks**:
  - define one cross-surface quality dashboard;
  - remove false-positive confidence from skipped/shallow tests;
  - instrument flagship workflows end to end.
- **KPIs**: release failure rate, regression escapes, crash-free rate, MTTD, MTTR.

### 19) Design System & UX

- **Tier**: 3
- **Mission**: create one coherent interaction language across desktop, web, mobile, and extension surfaces.
- **Owns**: shared interaction patterns, visual language, copy system, component standards, design debt tracking, UX research across surfaces.
- **Does not own**: platform contracts, backend reliability, release operations.
- **Publishes**: design tokens, shared interaction standards, terminology system, UX review standards.
- **Depends on**: every product surface pod.
- **Seed team**: 1 design lead, 2-4 product designers, 1 design technologist.
- **First 6 weeks**:
  - normalize vocabulary;
  - define common states for loading/streaming/error/approval;
  - establish shared design review across surfaces.
- **KPIs**: task clarity, UX consistency score, support tickets caused by UX confusion.

### 20) Growth, Docs & Distribution

- **Tier**: 3
- **Mission**: own product understanding, onboarding, launch surfaces, store readiness, and documentation coherence.
- **Owns**: `VISION.md`, `ROADMAP.md`, product messaging, landing/onboarding clarity, app/store packaging readiness, docs strategy, launch loops, support content.
- **Does not own**: surface implementation, core platform APIs, retrieval quality.
- **Publishes**: product vocabulary, launch calendar, docs information architecture, store readiness checklist.
- **Depends on**: every surface pod, Quality, Design System.
- **Seed team**: 1 lead, 3-5 engineers/content/GTM operators.
- **First 6 weeks**:
  - reconcile docs with shipped capability;
  - define one product story and per-surface distribution plan;
  - standardize onboarding and install/run documentation.
- **KPIs**: activation, time to first successful task, conversion, docs deflection, store readiness.

## Cross-Pod Interfaces

These interfaces must be treated as formal contracts:

1. **Approval contract**
   - owned by Desktop Agents & Approvals
   - consumed by Mobile Companion, Web, Realtime, Security

2. **Pairing and presence contract**
   - owned by Realtime, Pairing & Push
   - consumed by Mobile Companion, Desktop Shell, API Gateway

3. **Model catalog**
   - owned by Model Platform
   - consumed by all product surfaces

4. **Retrieval and context contract**
   - owned by Memory & Knowledge
   - consumed by VS Code, Mobile, Desktop, CLI

5. **Auth and sync contract**
   - owned by API Gateway, Auth & Sync
   - consumed by all stateful surfaces

6. **Release gate policy**
   - owned by Quality, Release & Observability
   - enforced on every pod

## First Hiring Sequence

All pods start now. Staffing density should still follow this order:

### Wave A

- Desktop Agents & Approvals
- Mobile Companion
- VS Code Agent & Retrieval
- API Gateway, Auth & Sync
- Realtime, Pairing & Push
- Quality, Release & Observability

### Wave B

- Desktop Shell
- Desktop Browser Automation
- Desktop Workflows
- Mobile Chat & Projects
- VS Code Core UX
- Model Platform
- Memory & Knowledge

### Wave C

- Web Chat & App Shell
- Web Workforce, Billing & Admin
- CLI
- Security & Enterprise
- Integrations, MCP & Skills
- Design System & UX
- Growth, Docs & Distribution

This is staffing order, not existence order.

## Required Weekly Artifacts

Every pod publishes:

- one weekly ship log,
- one KPI snapshot,
- one risk list,
- one dependency list,
- one next-2-weeks commitment list.

## Immediate Follow-On Work

After this document:

1. create `docs/Q2_2026_EXECUTION_PLAN.md`;
2. create `docs/CANONICAL_CAPABILITY_MATRIX.md`;
3. update stale competitive audits that conflict with actual code;
4. assign named owners to each pod.
