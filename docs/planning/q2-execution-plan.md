# AGI Workforce — Q2 2026 Execution Plan

_Created: March 18, 2026_

This is the concrete Q2 execution layer under `docs/MASTER_PROGRAM_PLAN.md` and `docs/POD_CHARTERS.md`.

## Quarter Definition

- **Quarter covered**: April 1, 2026 through June 30, 2026
- **Execution weeks covered here**: Monday April 6, 2026 through Friday June 26, 2026
- **Setup window**: Wednesday April 1, 2026 through Friday April 3, 2026
- **Closeout window**: Monday June 29, 2026 through Tuesday June 30, 2026

This document uses **12 execution weeks** because that is the clearest planning unit for weekly shipping.

## What Success Looks Like By June 26, 2026

By the end of Q2, AGI Workforce must have a stable, demoable, internally trusted flagship loop:

1. a desktop agent can run real work without hanging on approvals;
2. VS Code can hand off context and apply edits using a stronger patch path;
3. mobile can approve, reject, pause, resume, and inspect remote work reliably;
4. web can manage projects, schedules, workforce state, billing, and account flows coherently;
5. CLI is credible enough to use daily for core agentic tasks;
6. shared cloud, model, memory, pairing, and quality infrastructure support all of the above.

## Non-Negotiable End-of-Quarter Gates

Q2 is not complete unless all of the following are true:

1. **Approval reliability gate**
   - no hanging approval path in the flagship desktop/mobile flow;
   - explicit timeout, recovery, and stale-state handling.

2. **Pairing and sync gate**
   - mobile-desktop pairing succeeds reliably;
   - reconnect and session-expiry behavior are explicit and tested;
   - auth and sync failure handling are consistent.

3. **Coding loop gate**
   - VS Code edit flow no longer depends on weak whole-file replacement as the primary path;
   - retrieval is materially stronger than the current lightweight index-only approach;
   - diff accept/reject path is stable.

4. **Workflow gate**
   - visual workflow builder ships in a usable minimum form;
   - workflow execution emits readable logs and artifacts;
   - browser automation debugging is good enough to fix failures.

5. **Quality gate**
   - one cross-surface quality dashboard exists;
   - flagship workflows have deterministic smoke coverage;
   - shallow or skipped tests no longer create false confidence.

6. **Docs and planning gate**
   - product claims, capability docs, and planning docs match the codebase;
   - stale competitive claims that contradict shipped features are corrected.

## Quarter Priorities

### Priority A — Flagship Loop

- Desktop agent runtime
- approvals
- mobile companion
- pairing/reconnect
- VS Code context and edits

### Priority B — Daily Driver Credibility

- mobile chat/project quality
- web management flows
- CLI usability
- model and memory consistency

### Priority C — Operating Discipline

- quality
- release gates
- observability
- docs parity
- explicit pod ownership

## Pod-Level Q2 Deliverables

| Pod                              | Q2 deliverable                                                                          | Proof at end of quarter                                           |
| -------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Desktop Shell                    | stable shell states, startup, session restore, auth/onboarding cleanup                  | desktop shell walkthrough without broken transitions              |
| Desktop Agents & Approvals       | no hung approvals, action history, recovery states, takeover clarity                    | desktop-to-mobile approval demo with retries and timeout behavior |
| Desktop Browser Automation       | stable browser sessions, replay artifacts, debugging primitives                         | reproducible automation run with replay trace                     |
| Desktop Workflows                | usable minimum workflow builder, clearer run logs, schedule/trigger stability           | workflow created in UI and executed with readable artifacts       |
| Mobile Chat & Projects           | hardened attachments, search, edit/retry, schedules, stronger project-aware mobile chat | mobile demo covering attach, search, edit, retry, schedule        |
| Mobile Companion                 | reliable pairing, heartbeat, approvals, remote commands, push path                      | phone controls desktop agent away from desk                       |
| VS Code Core UX                  | stable activation, better bridge UX, cleaner command and panel flows                    | extension demo with stable connect/use/recover flow               |
| VS Code Agent & Retrieval        | patch-oriented edits, stronger retrieval, edit correctness benchmarks                   | coding task demo with accepted patch flow                         |
| Web Chat & App Shell             | coherent app shell, web chat entry, stable auth/loading states                          | web user can enter, navigate, and work without state confusion    |
| Web Workforce, Billing & Admin   | reliable billing, projects, schedules, workforce/admin flows                            | admin demo from account to billing to workforce action            |
| CLI                              | credible beta for daily sessions, tools, permissions, session resume                    | terminal walkthrough of agent task from prompt to resume          |
| API Gateway, Auth & Sync         | canonical auth/sync/upload contracts, reliability instrumentation                       | cross-surface sync/error behavior is documented and measurable    |
| Realtime, Pairing & Push         | explicit state machine, reconnect handling, approval delivery metrics                   | pairing and reconnect demo with observability                     |
| Model Platform                   | canonical model catalog, provider health and fallback basics                            | all surfaces read from one model truth source                     |
| Memory & Knowledge               | shared retrieval direction, stronger project/context behavior, instrumentation          | context quality demo beats current baseline                       |
| Integrations, MCP & Skills       | inventory, packaging rules, trust/review flow, first marketplace-ready pipeline         | one documented path from skill/integration definition to use      |
| Security & Enterprise            | audit event contract, policy model, device trust and enterprise MVP control spec        | admin/security review can trace critical actions                  |
| Quality, Release & Observability | quality dashboard, release gates, golden-path smoke suite                               | weekly release readiness no longer depends on guesswork           |
| Design System & UX               | shared terminology and common state patterns                                            | desktop/mobile/web/extension states read as one product family    |
| Growth, Docs & Distribution      | docs parity, launch checklists, surface-specific onboarding/distribution plan           | product messaging and install/run docs match reality              |

## Pod Clusters Used In This Plan

To keep weekly execution readable, the pods are grouped into five delivery clusters.

### 1) Desktop Cluster

- Desktop Shell
- Desktop Agents & Approvals
- Desktop Browser Automation
- Desktop Workflows

### 2) Mobile Cluster

- Mobile Chat & Projects
- Mobile Companion

### 3) Coding Cluster

- VS Code Core UX
- VS Code Agent & Retrieval
- CLI

### 4) Web, Design & Growth Cluster

- Web Chat & App Shell
- Web Workforce, Billing & Admin
- Design System & UX
- Growth, Docs & Distribution

### 5) Platform, Trust & Quality Cluster

- API Gateway, Auth & Sync
- Realtime, Pairing & Push
- Model Platform
- Memory & Knowledge
- Integrations, MCP & Skills
- Security & Enterprise
- Quality, Release & Observability

## Release Trains

### Train 1 — Foundation and Risk Removal

- **Weeks 1-4**
- goal: remove ambiguity, fix highest-risk reliability gaps, lock contracts

### Train 2 — Productization and Integration

- **Weeks 5-8**
- goal: ship usable product slices across all surfaces and integrate them together

### Train 3 — Hardening and Proof

- **Weeks 9-12**
- goal: turn integrated slices into repeatable, supportable, demo-stable product behavior

## 12-Week Execution Calendar

### Week 1 — April 6, 2026 to April 10, 2026

**Theme**: owners, contracts, baselines

- **Desktop cluster**
  - lock shell recovery, approval state, browser session, and workflow run contracts;
  - identify every open blocker tied to approval timeout, stream-end behavior, and workflow logging.
- **Mobile cluster**
  - lock pairing, heartbeat, attachment, search, and schedule flows;
  - audit every stale capability claim in mobile planning docs.
- **Coding cluster**
  - freeze the patch-edit contract for VS Code;
  - define the replacement path for lightweight retrieval limits;
  - define CLI beta success criteria.
- **Web, design & growth cluster**
  - define primary web user journeys;
  - normalize product vocabulary across web, docs, onboarding, and shell labels.
- **Platform, trust & quality cluster**
  - lock auth/sync, pairing, model catalog, retrieval, and release-gate contracts;
  - publish the first cross-surface KPI dashboard spec.
- **Exit criteria**
  - every pod has an owner;
  - every cluster has a Q2 scoreboard;
  - every critical cross-surface contract has a written owner.

### Week 2 — April 13, 2026 to April 17, 2026

**Theme**: highest-risk reliability fixes

- **Desktop cluster**
  - ship approval timeout behavior;
  - ship stream-end hardening;
  - add explicit recovery states for paused, cancelled, expired, and failed tasks.
- **Mobile cluster**
  - fix auth `401` handling in mobile-desktop sync;
  - fix offline queue sync callbacks;
  - harden attachment upload edge cases.
- **Coding cluster**
  - harden extension activation and bridge failure handling;
  - stabilize current diff and command flows before introducing deeper edits.
- **Web, design & growth cluster**
  - increase web regression coverage on current critical paths;
  - document current shell and account-state failure cases.
- **Platform, trust & quality cluster**
  - instrument sync failures, pairing failures, approval delivery failures, and upload failures;
  - publish the first release gate draft.
- **Exit criteria**
  - no known hung approval path remains unresolved;
  - baseline telemetry exists for sync, pairing, uploads, and approvals.

### Week 3 — April 20, 2026 to April 24, 2026

**Theme**: first integrated alpha

- **Desktop cluster**
  - connect action history to agent runs;
  - make browser and workflow runs emit consistent logs and artifacts.
- **Mobile cluster**
  - add explicit stale approval, disconnected desktop, and expired session UX;
  - complete mobile search and edit/retry hardening.
- **Coding cluster**
  - land the first patch-application path in VS Code;
  - build the first retrieval v1 target beyond the current lightweight file/symbol cap behavior;
  - tighten CLI session resume/fork/search UX.
- **Web, design & growth cluster**
  - align web shell, dashboard, and docs terminology with the new canonical vocabulary;
  - define onboarding flows for desktop, web, mobile, extension, and CLI.
- **Platform, trust & quality cluster**
  - publish pairing and reconnect state machine;
  - publish auth/sync error taxonomy;
  - stand up the first quality dashboard implementation.
- **Exit criteria**
  - first end-to-end alpha exists: desktop run, mobile approval, extension context handoff, web visibility, observable backend events.

### Week 4 — April 27, 2026 to May 1, 2026

**Theme**: Train 1 release

- **Desktop cluster**
  - complete shell failure-state cleanup;
  - lock browser session debug artifacts;
  - finalize workflow minimum schema.
- **Mobile cluster**
  - ship mobile companion reliability alpha;
  - lock mobile chat attachment/search/edit core paths.
- **Coding cluster**
  - stabilize patch/diff loop enough for internal daily use;
  - define the CLI beta branch and release notes format.
- **Web, design & growth cluster**
  - ship web shell and app-state cleanup on critical paths;
  - update docs to reflect actual shipped feature baseline.
- **Platform, trust & quality cluster**
  - enable Train 1 release gate;
  - publish first incident review and defect taxonomy.
- **Exit criteria**
  - Train 1 ships internally with explicit known-issue list and owners.

### Week 5 — May 4, 2026 to May 8, 2026

**Theme**: usable product slices

- **Desktop cluster**
  - ship the first usable visual workflow builder slice;
  - improve browser upload/download behavior and debugging.
- **Mobile cluster**
  - start push notification delivery for companion actions;
  - improve project-aware mobile chat and schedule controls.
- **Coding cluster**
  - expand patch application coverage;
  - improve context gathering and retrieval ranking;
  - tighten CLI tool-confirmation and output ergonomics.
- **Web, design & growth cluster**
  - harden billing, workforce, projects, and schedules management flows;
  - define launch page and install path copy from the real product.
- **Platform, trust & quality cluster**
  - land model catalog unification work;
  - improve upload and sync contracts used by mobile and web.
- **Exit criteria**
  - each cluster has at least one clear user-facing product slice, not just plumbing.

### Week 6 — May 11, 2026 to May 15, 2026

**Theme**: integration depth

- **Desktop cluster**
  - connect workflow builder to real workflow run artifacts;
  - tighten task timelines and operator notes.
- **Mobile cluster**
  - improve remote queue control, pause/resume/cancel flows;
  - add better approval preview details.
- **Coding cluster**
  - make VS Code edit correctness measurable;
  - tighten extension bridge reconnection;
  - harden CLI beta install/run docs.
- **Web, design & growth cluster**
  - improve admin-level management flows and account-state reliability;
  - run cross-surface UX consistency review.
- **Platform, trust & quality cluster**
  - publish canonical model catalog API;
  - publish retrieval and context debugging hooks;
  - publish first support-facing failure playbook.
- **Exit criteria**
  - integrated beta path exists for desktop, mobile, extension, web, and backend.

### Week 7 — May 18, 2026 to May 22, 2026

**Theme**: team and management readiness

- **Desktop cluster**
  - improve account, team, device, and project visibility in desktop shell;
  - tighten workflow and automation operator views.
- **Mobile cluster**
  - improve paired-device management and push-open handling;
  - harden schedule management and project organization.
- **Coding cluster**
  - improve daily-driver coding workflow: search, patch, review, rerun;
  - benchmark CLI and VS Code against a fixed task set.
- **Web, design & growth cluster**
  - improve workforce dashboard, billing, schedules, and admin flows for team use;
  - update onboarding and evaluation docs for teams.
- **Platform, trust & quality cluster**
  - add team-aware policy hooks where approvals and audit will need them;
  - improve release and defect reporting by pod.
- **Exit criteria**
  - team/operator story is coherent across desktop, mobile, web, and backend.

### Week 8 — May 25, 2026 to May 29, 2026

**Theme**: Train 2 release

- **Desktop cluster**
  - ship Train 2 desktop beta with workflow builder, stronger runtime recovery, and better automation debugging.
- **Mobile cluster**
  - ship Train 2 companion beta with push and stronger remote control flows.
- **Coding cluster**
  - ship Train 2 coding beta with patch edit flow and retrieval v1 improvements.
- **Web, design & growth cluster**
  - ship Train 2 web/admin beta with tighter billing/workforce/project flows and updated docs.
- **Platform, trust & quality cluster**
  - enforce Train 2 release gates and review KPI movement from Train 1 to Train 2.
- **Exit criteria**
  - Train 2 ships internally or to controlled beta with known gaps clearly listed.

### Week 9 — June 1, 2026 to June 5, 2026

**Theme**: hardening the differentiators

- **Desktop cluster**
  - improve browser replay, run artifacts, and operator drill-down;
  - improve workflow traceability and schedule visibility.
- **Mobile cluster**
  - improve agent dashboards, run artifacts, and remote observability;
  - improve paired-device resilience under reconnect scenarios.
- **Coding cluster**
  - improve diff review clarity and patch acceptance confidence;
  - improve CLI team mode and complex session flows.
- **Web, design & growth cluster**
  - improve shared control-plane visibility in web;
  - document flagship demos by surface.
- **Platform, trust & quality cluster**
  - add stronger reconnect, stale-session, and approval-delivery resilience;
  - tighten model fallback and provider health visibility.
- **Exit criteria**
  - the product’s actual differentiators are observable and demoable, not implied.

### Week 10 — June 8, 2026 to June 12, 2026

**Theme**: supportability and trust

- **Desktop cluster**
  - reduce operator confusion in failure handling, recovery, and takeover.
- **Mobile cluster**
  - improve push escalation, pending-approval handling, and failure recovery.
- **Coding cluster**
  - improve correctness and recovery around failed edits and partial context.
- **Web, design & growth cluster**
  - improve support, settings, and admin workflows that reduce manual intervention.
- **Platform, trust & quality cluster**
  - finalize audit event schema, policy model, and quality dashboards;
  - ensure every critical path has a support/debug entry point.
- **Exit criteria**
  - support and trust workflows are defined well enough for external users.

### Week 11 — June 15, 2026 to June 19, 2026

**Theme**: bug scrub and documentation parity

- **Desktop cluster**
  - close high-severity runtime and UX defects.
- **Mobile cluster**
  - close high-severity pairing, approval, upload, search, and schedule defects.
- **Coding cluster**
  - close high-severity edit, retrieval, and bridge defects.
- **Web, design & growth cluster**
  - reconcile marketing, docs, onboarding, and dashboard copy with actual shipped capability.
- **Platform, trust & quality cluster**
  - close high-severity sync, reconnect, auth, and release-process defects;
  - publish the canonical capability matrix.
- **Exit criteria**
  - no severe mismatch remains between code, docs, and product claims.

### Week 12 — June 22, 2026 to June 26, 2026

**Theme**: Train 3 release and quarter close

- **Desktop cluster**
  - finalize runtime, workflow, and automation release notes and demo flows.
- **Mobile cluster**
  - finalize companion and mobile productivity demo flows and readiness list.
- **Coding cluster**
  - finalize extension and CLI beta story with proof tasks and remaining gap list.
- **Web, design & growth cluster**
  - finalize web/admin readiness, docs, onboarding, and distribution artifacts.
- **Platform, trust & quality cluster**
  - finalize quality scorecards, reliability metrics, and Q3 carryover list.
- **Exit criteria**
  - Train 3 ships;
  - Q2 KPI review is complete;
  - Q3 starts with explicit carryovers instead of vague backlog spill.

## Weekly Required Artifacts

Every week, every pod must publish:

1. completed work;
2. next-week commitments;
3. KPI snapshot;
4. top 3 risks;
5. blocked dependencies;
6. released artifacts or proof demos.

## Weekly Review Structure

### Monday

- pod commitment review
- dependency check
- release-risk review

### Wednesday

- integration review across clusters
- defect and telemetry review

### Friday

- ship review
- KPI review
- decision log update

## Known Q2 Risks

1. **Approval timeout and stale approval behavior**
   - owner: Desktop Agents & Approvals + Mobile Companion + Realtime

2. **Mobile-desktop auth and sync fragility**
   - owner: API Gateway, Auth & Sync + Mobile Chat & Projects

3. **VS Code edit robustness**
   - owner: VS Code Agent & Retrieval + Memory & Knowledge

4. **Workflow builder scope creep**
   - owner: Desktop Workflows

5. **Browser upload/replay reliability**
   - owner: Desktop Browser Automation

6. **Docs drifting from shipped reality**
   - owner: Growth, Docs & Distribution

7. **False confidence from shallow tests**
   - owner: Quality, Release & Observability

## Explicit Carry-In From Current Roadmap

The following currently visible roadmap items are pulled directly into Q2:

- approval timeout behavior
- mobile auth `401` handling
- offline queue sync callbacks
- stream-end hardening
- visual workflow builder
- push notifications
- memory sync
- scheduled tasks
- MCP tool proxying via API Gateway
- VS Code inline and edit quality work
- CLI productization

## What This Document Does Not Allow

This document does not allow:

- vague “ongoing” work without weekly exit criteria;
- shipping claims without proof artifacts;
- hidden dependencies between pods;
- treating platform, docs, design, or release work as optional support work.

## Immediate Follow-On

After this document:

1. assign named owners to all 20 pods;
2. write `docs/CANONICAL_CAPABILITY_MATRIX.md`;
3. update stale audits that conflict with the codebase;
4. convert Week 1 into a task tracker by pod.
