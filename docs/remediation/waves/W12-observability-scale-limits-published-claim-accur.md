# W12 — Observability, scale limits, published-claim accuracy, dead code and test integrity

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** Last by design. Test coverage, documentation accuracy and dead-code removal all describe the state of the system, so writing them earlier means writing them twice — the previous eleven waves change what is true. This wave turns the fixed behaviour into standing guards: the skipped-test inventory, per-surface E2E, fault injection, cross-surface contract and continuity tests, link/distribution-state tests (the exact guard that stops false availability claims from returning), and a repaired desktop visual baseline. It also lands the durable-claim work: a machine-readable capability registry so 'current' documents cannot disagree, removal of unsupported traction and enterprise claims, and correction of copy describing controls that were deliberately deleted. Observability and scale limits (SLOs, latency percentiles, tracing, load/soak, N+1 and streaming efficiency, data-volume forecasts and partitioning, unreachable-code inventory, API contract artifact) sit here because meaningful SLOs and forecasts can only be set against the finished system.

**Size.** 62 items (1 critical, 20 high, 33 medium, 8 low); 52 open.

**Done when.** SLOs are published with captured p50/p95/p99 for the primary paths, tracing spans a full request across surfaces, and a load and a soak run are recorded with results; N+1 queries and per-call client construction are eliminated on the hot paths and large transfers stream; data-volume forecasts, retention tiers and partitioning exist for every unbounded table; an unreachable-code inventory is published and each entry is wired or deleted; an authoritative API contract artifact exists with tests comparing routes to it. All 75 skipped/ignored tests are inventoried with a justification or removed, and the counting guard is proven by a deliberately-skipped fixture. Each surface has real E2E coverage that runs in CI, including a desktop WDIO pass above an agreed threshold with no raw i18n keys and a visual baseline captured from the same state CI renders; fault-injection, cross-language contract, version-skew and logout-purge tests exist; link and distribution-state tests fail when a download target 404s or a store listing claims unavailable availability. No test passes without assertions and no test hand-mirrors the module it claims to cover (extension side-panel test imports the real module; regression guards exist for mobile connector catalog, capability handshake, code-execution defaults and desktop fail-open fixes). One machine-readable capability registry is the source for every status claim, THIRD_PARTY_LICENSES and all cited doc paths resolve, unsupported quantified/traction claims and fabricated metrics are gone from production templates, marketing and store copy, enterprise and per-surface capability claims match code in both directions, and the one-PR-per-capability rule is enforced by a gate rather than convention.

| ID                    | Sev      | Item                                                                                                                                                                         | Effort |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [INFRA-25](#infra-25) | CRITICAL | No SLOs, no captured latency percentiles, near-absent tracing, and no load or soak testing                                                                                   | XL     |
| [DESK-26](#desk-26)   | HIGH     | Desktop visual-regression baseline captures a different app state than CI renders, and the threshold cannot catch a full-layout regression                                   | M      |
| [DESK-27](#desk-27)   | HIGH     | Desktop native E2E has never honestly run: first real WDIO run passed 3 of 32 specs, surfacing raw i18n keys and a cold-start budget breach                                  | L      |
| [DOCS-06](#docs-06)   | HIGH     | Unsupported quantified and traction claims remain published                                                                                                                  | M      |
| [DOCS-07](#docs-07)   | HIGH     | Enterprise capability claims are inaccurate in both directions at once                                                                                                       | M      |
| [DOCS-09](#docs-09)   | HIGH     | Twenty present-tense stub controls remain in production surfaces and no rule enforces against them                                                                           | M      |
| [DOCS-11](#docs-11)   | HIGH     | Audit ledgers are not kept current with code state, and the one-PR capability rule is a convention rather than a gate                                                        | M      |
| [DOCS-12](#docs-12)   | HIGH     | No single machine-readable capability registry exists, so every 'current' document disagrees                                                                                 | L      |
| [DOCS-20](#docs-20)   | HIGH     | Help, support and takedown process documentation describes processes that do not exist                                                                                       | M      |
| [INFRA-27](#infra-27) | HIGH     | Data-access efficiency is unverified: N+1 queries, unstreamed transfers and per-call client construction                                                                     | L      |
| [INFRA-34](#infra-34) | HIGH     | No data-volume forecasts, retention tiers or partitioning for the tables that grow unbounded                                                                                 | L      |
| [INFRA-37](#infra-37) | HIGH     | Large volumes of unreachable code are never inventoried, wired or deleted                                                                                                    | XL     |
| [INFRA-58](#infra-58) | HIGH     | No external uptime monitor — every outage detector runs inside the deployment being measured                                                                                 | S      |
| [MOB-01](#mob-01)     | HIGH     | Mobile legal and help copy makes false App Store / Google Play availability and rating claims                                                                                | M      |
| [TEST-01](#test-01)   | HIGH     | 75 skipped or ignored tests are uninventoried and unjustified, and the guard that counts them was itself broken                                                              | M      |
| [TEST-02](#test-02)   | HIGH     | Per-surface E2E coverage is incomplete and was not executed at the last stop gate                                                                                            | XL     |
| [TEST-03](#test-03)   | HIGH     | Tests that pass without testing anything: no assertions, hand-written mirrors, and redundant screenshots                                                                     | M      |
| [TEST-05](#test-05)   | HIGH     | No cross-language or cross-surface contract tests exist                                                                                                                      | L      |
| [TEST-06](#test-06)   | HIGH     | No fault-injection testing for any failure mode the system is expected to survive                                                                                            | L      |
| [TEST-14](#test-14)   | HIGH     | Essentially every COMPLETE verdict for authenticated product surfaces rests on reading source, never on observing a signed-in render                                         | L      |
| [TEST-20](#test-20)   | HIGH     | Wave 1+2 remediation residue: ~37 task IDs came back sound=false, including 45 inert-code findings and a false-reachability citation                                         | L      |
| [AI-11](#ai-11)       | MEDIUM   | No router-quality eval corpus exists, and sources disagree on whether any evals harness landed                                                                               | L      |
| [CLI-09](#cli-09)     | MEDIUM   | TurnHostAdapter's MCP and subagent logic was verified only by verbatim-move comparison, never live-tested                                                                    | M      |
| [CLI-22](#cli-22)     | MEDIUM   | CLI surface has structurally thin audit coverage — no dedicated inventory, no TUI-vs-benchmark comparison, and a gap count that reflects audit time rather than surface area | L      |
| [CLI-23](#cli-23)     | MEDIUM   | CLI parity rows (REPL/TUI, slash commands, permissions, subagents, MCP/plugins/skills, sessions/worktrees, voice) all remain Partial with no per-row closure evidence        | L      |
| [DESK-65](#desk-65)   | MEDIUM   | Desktop capability toggles and cloud-sync error handling need regression guards after their fail-open fixes                                                                  | S      |
| [DOCS-02](#docs-02)   | MEDIUM   | Dozens of documents cite paths that no longer resolve, and two guards cite deleted files to stay green                                                                       | M      |
| [DOCS-03](#docs-03)   | MEDIUM   | All eight expected spec artifacts are missing and their directory does not exist                                                                                             | L      |
| [DOCS-05](#docs-05)   | MEDIUM   | README and package metadata are not release-grade and contain several counted inaccuracies                                                                                   | M      |
| [DOCS-08](#docs-08)   | MEDIUM   | Capabilities that are permanently 'coming soon' or decorative are not downgraded in copy                                                                                     | M      |
| [DOCS-10](#docs-10)   | MEDIUM   | Fabricated metrics remain in production templates, demos and marketing paths                                                                                                 | S      |
| [DOCS-14](#docs-14)   | MEDIUM   | Marketing copy describes a manual web-search toggle that was deliberately deleted from the product                                                                           | S      |
| [DOCS-15](#docs-15)   | MEDIUM   | Surface-specific documentation overclaims what several clients can do                                                                                                        | M      |
| [DOCS-16](#docs-16)   | MEDIUM   | Product copy names labels, formats and behaviours the UI and services do not provide                                                                                         | M      |
| [DOCS-17](#docs-17)   | MEDIUM   | SECURITY.md may misstate audit-log immutability status                                                                                                                       | S      |
| [DOCS-18](#docs-18)   | MEDIUM   | Retired tier names and a stale Team price persist in legal, policy and pricing copy                                                                                          | S      |
| [DOCS-19](#docs-19)   | MEDIUM   | Localization debt: sources disagree on whether the shared UI package is wired for i18n at all                                                                                | XL     |
| [DOCS-24](#docs-24)   | MEDIUM   | /agi-work marketing page describes a separate, unshipped Desktop dispatch product — a naming collision with the shipped composer mode                                        | S      |
| [DOCS-26](#docs-26)   | MEDIUM   | A doc-staleness sweep deleted four load-bearing files selected only by metadata                                                                                              | S      |
| [EXT-36](#ext-36)     | MEDIUM   | VS Code parity rows (editor context, diff review/apply, cloud-local continuation, settings) remain Partial with no per-row closure evidence                                  | L      |
| [INFRA-48](#infra-48) | MEDIUM   | No authoritative API contract artifact and no contract tests comparing routes to a published spec                                                                            | M      |
| [INFRA-55](#infra-55) | MEDIUM   | Eleven legacy/dead database tables and an authored-but-unapplied drop migration are correctly gated but untracked as a group                                                 | S      |
| [MOB-14](#mob-14)     | MEDIUM   | Mobile connector catalog was faked once and needs a standing regression guard                                                                                                | S      |
| [MOB-21](#mob-21)     | MEDIUM   | Mobile source-only patches awaiting device verification: prompt echo, table clipping, CSV card title, artifact thumbnails, settings exit                                     | S      |
| [MOB-38](#mob-38)     | MEDIUM   | Mobile capability handshake and code-execution defaults need standing regression guards                                                                                      | S      |
| [SEC-95](#sec-95)     | MEDIUM   | Desktop native crash-dump upload was removed with no consent-safe replacement, so native crashes are unreportable                                                            | L      |
| [TEST-07](#test-07)   | MEDIUM   | No cross-surface continuity tests for version skew or logout purge                                                                                                           | M      |
| [TEST-08](#test-08)   | MEDIUM   | No link or distribution-state tests, the exact guard that would stop false availability claims returning                                                                     | S      |
| [TEST-09](#test-09)   | MEDIUM   | Test infrastructure is flaky and environment-dependent across CLI, mobile and desktop                                                                                        | M      |
| [TEST-10](#test-10)   | MEDIUM   | Automated accessibility coverage exists for five web routes and no other surface                                                                                             | M      |
| [TEST-17](#test-17)   | MEDIUM   | No automated lock-step check that a shipped settings panel has a reachable nav entry — six historical instances of the same authoring bug                                    | M      |
| [UI-63](#ui-63)       | MEDIUM   | Recurring authoring pattern: settings panels ship with no nav entry, and no CI lock-step test exists outside the VS Code extension                                           |        |
| [UI-88](#ui-88)       | MEDIUM   | Recurring authoring pattern: settings panels shipped with no nav entry; only the VS Code schema/nav lock-step test defends against it                                        | M      |
| [UI-95](#ui-95)       | MEDIUM   | Dedicated accessibility component directory is entirely dead code, including a mocked audit panel that always reports 'all checks passed'                                    | S      |
| [DOCS-22](#docs-22)   | LOW      | 'Chat is genuinely shared, not duplicated' is stated without its primary-vs-secondary qualifier in two headline documents                                                    | S      |
| [DPDP-33](#dpdp-33)   | LOW      | The public /enterprise page understates SSO and SCIM readiness relative to the internal admin console                                                                        | S      |
| [EXT-08](#ext-08)     | LOW      | Extension test file reimplements side-panel logic by hand instead of importing the real module, producing fake coverage                                                      | S      |
| [EXT-09](#ext-09)     | LOW      | VS Code marketplace description was reverted away from the locked provider-count copy                                                                                        | S      |
| [EXT-35](#ext-35)     | LOW      | packages/tools/browser-tool is dead code and apps/extension/package.json still declares it as a workspace dependency                                                         | S      |
| [INFRA-54](#infra-54) | LOW      | No error-tracking or APM on the backend services, and api-gateway exposes no /metrics endpoint                                                                               | S      |
| [INFRA-56](#infra-56) | LOW      | packages/tools/browser-tool is dead code with a stale workspace dependency still declared by the Chrome extension                                                            | S      |
| [MOB-23](#mob-23)     | LOW      | Mobile UI parity pass against the 87 reference screenshots has not been rechecked since the source patches                                                                   | M      |

---

### INFRA-25 — No SLOs, no captured latency percentiles, near-absent tracing, and no load or soak testing

`CRITICAL` · infra/ci · effort XL

**What.** SCALE-VER-001 triage: the tools/load directory is absent and there is no load.yml workflow — VERIFIED, both still absent — and tooling that briefly existed was deliberately reverted in wave 4 rather than landed half-built, since a non-running load suite reads as coverage while providing none. ExecutionPlan #81 (REVERTED) confirms this and adds that no k6, artillery, autocannon, locust, JMeter, gatling or vegeta exists, and there is no Lighthouse CI or web-vitals anywhere. SCALE-IO-001: no captured p50/p95/p99 for chat TTFT, token stream, retrieval, tool loops, upload, artifact, sync, billing or agent runs. SCALE-VER-007: availability, TTFT, completion, task success, approval wait, sync lag, queue age, scan latency and notification delivery all lack defined SLOs. SCALE-VER-006 is 'cannot tell' — the ledger found exactly one module referencing a tracer/span, and current source shows apps/web/lib/observability/span.ts now has at least 3 additional production importers, so coverage has grown, but breadth across model, retrieval, tool, approval, task, billing and external-call spans is unconfirmed. ENT-004 records the downstream cost: audit-export trace correlation is blocked because there are no traces to correlate against.

**Done when.** Defined SLOs exist for the named journeys, spans cover the model, retrieval, tool, approval, task and billing paths, percentiles are captured continuously, and a load suite actually runs in CI.

**Where.** `apps/web/lib/observability/span.ts`, `apps/web/lib/cost-tracker.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts`

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** SCALE-VER-001 No continuous performance/load test suite; SCALE-VER-006 Near-total absence of production tracing spans; SCALE-VER-007 No defined SLOs; SCALE-IO-001 Hot paths are not profiled; ExecutionPlan #81 No load, stress, or soak testing; ENT-004 audit export/trace correlation blocked

### DESK-26 — Desktop visual-regression baseline captures a different app state than CI renders, and the threshold cannot catch a full-layout regression

`HIGH` · desktop · effort M

**What.** The baseline was captured with in-app sign-in configured (developer machine) while CI renders the unconfigured fallback card, so the two images are different application states, not drifted renders. Worse, a full-page-different score of only 3.13% against a 3.0% ceiling shows the threshold cannot catch a full-layout regression — the gate reads as protection and is not. Blocks every CI run touching desktop scope. Compounding: after 7 false-pass tests were fixed, two remaining nav targets (AGI, Automation) do not exist in the current v3 sidebar so those tests re-capture the same default chat screen.

**Done when.** Regenerate the baseline in the exact CI state, tighten the diff threshold to a value that actually fails on a layout change, and retarget or delete the two tests aimed at nonexistent nav destinations.

**Where.** `apps/desktop/e2e/visual-regression.spec.ts`

**From.** docs/agent-context/known-flaws.md (DESKTOP-VISUAL-BASELINE-WRONG-STATE, DESKTOP-VISUAL-REGRESSION-COVERAGE-01); known-flaws.md

**Folded in.** DESKTOP-VISUAL-REGRESSION-COVERAGE-01: visual-regression suite is honest but redundant/low coverage; The desktop visual baseline captures a different app state than CI renders, and its threshold cannot catch a full-layout regression

### DESK-27 — Desktop native E2E has never honestly run: first real WDIO run passed 3 of 32 specs, surfacing raw i18n keys and a cold-start budget breach

`HIGH` · desktop · effort L

**What.** The first honest native WDIO run (32 spec files) passed only 3 and failed 29 with real assertion errors. Still-open product findings from it: raw untranslated i18n keys render as UI text (sidebar.noConversations, sidebar.showArchived), cold start exceeded SHELL_STARTUP_BUDGET_MS, and the project-memory store fails to open under a non-default DB key. Onboarding is one-shot per profile, so at most one onboarding-dependent spec can pass per run. Separately, one WDIO spec had zero expect() assertions and reported PASSED unconditionally against a selector matching 0 elements — one test was fixed, the file still needs a broader assertion pass. Playwright DOM E2E has no webServer config and Local vs Cloud suites need mutually exclusive env vars, so both cannot pass under one server config.

**Done when.** Fix the underlying product defects (i18n key rendering, startup budget, project-memory DB key), make onboarding resettable per spec, sweep the WDIO file for assertion-free tests, and split the Playwright config per app mode.

**Where.** `apps/desktop/wdio/specs/sidebar-navigation.spec.ts`, `apps/desktop/e2e/`

**From.** docs/agent-context/known-flaws.md (DESKTOP-NATIVE-E2E-NEVER-RAN-01, DESKTOP-WDIO-NO-ASSERTIONS-01, DESKTOP-DOM-E2E-MODE-DEPENDENCY)

**Folded in.** DESKTOP-WDIO-NO-ASSERTIONS-01: WDIO spec file needs broader assertion pass; DESKTOP-DOM-E2E-MODE-DEPENDENCY: no webServer config; Local and Cloud suites cannot both pass

### DOCS-06 — Unsupported quantified and traction claims remain published

`HIGH` · docs · effort M

**What.** DOC-026: unsupported quantified claims — '19 live providers', 'unlimited', 'six live apps', traction and moat claims — remain and are not confirmed removed. These are the highest-risk class because they are externally verifiable and currently false: INFRA-15 records that two of the claimed live surfaces have no download at all, and ExecutionPlan founder item 14 records 45 lifetime downloads across every public release with 0 stars, forks or watchers. DOC-022 (stale competitive-baseline claims) is the same class pointed outward. BIZ-038's '40% gross margin' claim published without a live calculation is the billing-slice instance of the identical defect.

**Done when.** Every published quantity is either derived from a live source the reader could check or removed, so no external claim can be falsified by loading the page it describes.

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** DOC-026 Unsupported quantified claims; DOC-022 Stale competitive-baseline claims

### DOCS-07 — Enterprise capability claims are inaccurate in both directions at once

`HIGH` · docs · effort M

**What.** DOC-024: enterprise-ready and security-control claims are published without working identity or governance and without an external audit, and are not confirmed downgraded to match ENT-001..008 reality. DOC-011: AdminConsole SSO/SCIM 'schema ready' claims may overstate readiness. But phase4 PP-27 found the inversion too: the public /enterprise page tells prospects SSO and SCIM status is unknown ('ask us') while the internal admin console correctly says they are 'Implemented — entitlement-gated' — so the public page is pessimistic relative to what shipped while other copy is optimistic relative to what did not. known-flaws records the hard constraint underneath: enterprise SSO has never been verified against a live Clerk instance, so the marketing claim 'SAML 2.0 and OIDC... Okta, Azure AD, Google Workspace' must not be described as verified until a live connection exists.

**Done when.** One capability source drives both the public page and the admin console, so enterprise claims are neither overstated nor understated and every claim names its verification status.

**Where.** `apps/web/app/enterprise/page.tsx:86-99`, `apps/web/features/admin/pages/AdminConsolePage.tsx:68-78`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; known-flaws.md

**Folded in.** DOC-024 Enterprise-ready claims without working identity/governance; DOC-011 AdminConsole SSO/SCIM 'schema ready' claims; phase4 PP-27 /enterprise page pessimism inversion

### DOCS-09 — Twenty present-tense stub controls remain in production surfaces and no rule enforces against them

`HIGH` · docs · effort M

**What.** SCALE-FIN-002 triage (2026-08-09): 20 'coming soon' / 'not implemented' / 'TODO: implement' markers remain across production web surfaces excluding tests — each a reachable user control that does not do what it says, the exact rule SCALE-FIN-005 forbids; the work is triaging each into ship, label-as-planned, or delete. SCALE-FIN-005 is unenforced: a production control may still return 501, toast 'coming soon', or silently no-op without being labelled preview or planned before the user acts. DOC-029 triage: scripts/check-marketing-models.mjs exists and passes in the guard chain, but it covers only model-ID claims, not the broader present-tense-planned-feature check the rule implies. This register is full of instances — AI-24 (Run code no-op), AI-28 (triggers with a green Active badge that never fire), INFRA-30 (a cancel route with no caller) — so the missing enforcement is the higher-leverage fix.

**Done when.** A guard rejects present-tense copy on any control that returns 501, no-ops, or toasts 'coming soon', and the existing 20 markers are each shipped, relabelled or removed.

**Where.** `scripts/check-marketing-models.mjs`

**From.** AuditRemediationLedger.md

**Folded in.** SCALE-FIN-002 20 stub markers remain in production web surfaces; SCALE-FIN-005 No-present-tense-stub rule not enforced; DOC-029 'No present-tense planned feature' lint is narrower than intended

### DOCS-11 — Audit ledgers are not kept current with code state, and the one-PR capability rule is a convention rather than a gate

`HIGH` · docs · effort M

**What.** SCALE-PURE-005: fixed items, open items, code state and docs must agree in the same change, and this is not enforced. DOC-009: known-flaws entries are not reconciled immediately when fixes land. DOC-030 triage: .github/pull_request_template.md references the capability-state and known-flaws requirement, but nothing in CI blocks a capability-state change that does not touch code, test, docs and changelog together. The cost is visible throughout this register — CRIT-002, CRIT-010, SCALE-GROW-004, item #29 and MATCH-008 all carry verification notes reading 'appears fixed' or 'ledger stale' against rows still marked open, and the phase4 audit exists chiefly because ledger status could not be trusted. CLAUDE.md's own rule that audit markdown is a triage queue rather than remediation is the policy this gap violates.

Also recorded by a later audit (ui-gaps.csv rows GAP-051/GAP-205 (QuickChips) are marked Done but the feature was deliberately deleted; also parity's '190 missing rows untriaged'): Two concrete instances of the ledger-vs-code drift. (1) Commit 2a37d81da (2026-08-07, ancestor of HEAD) deleted quick-start suggestion chips from every surface on an explicit 2026-08-06 founder decision; neither QuickChips.tsx nor a quickChipAvailability prop exists anywhere outside audit files, yet GAP-051/GAP-205 remain 'Done', implying a feature a reader will look for and not find. Correct status is 'Superseded'. (2) parity-implementation-matrix.md records that 46 of the 190 'missing' ledger rows arrived by reclassification out of partial/stub/unwired rather than being built, so they are not automatically out of scope.

**Done when.** A capability-state change lands code, tests, docs and ledger together or CI blocks it, so a ledger row's status can be trusted without re-verifying it against source.

**Where.** `.github/pull_request_template.md`, `docs/agent-context/known-flaws.md`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** SCALE-PURE-005 Audit ledgers not guaranteed to stay current; DOC-009 known-flaws entries not reconciled when fixes land; DOC-030 One-PR capability-state-change rule is a convention

### DOCS-12 — No single machine-readable capability registry exists, so every 'current' document disagrees

`HIGH` · docs · effort L

**What.** gap-audit §9, flagged as dangerous for an autonomous coding loop: the repository has many 'current' documents — generated inventories, gap CSVs, known-flaw ledgers, audit reports, README claims, code comments — that do not always agree, so an agent can spend hours rebuilding something already shipped, or preserve a false 'Done' because a component file exists but is not mounted. The proposed generated CapabilityRecord registry (state, productionMounts, runtimeEntryPoints, tests, liveProof, owner) that README, parity, gap-CSV, release-notes and backlog views would all derive from does not exist. DOC-027 states the same requirement: public capability tables are not generated from a canonical capability registry. DOC-008 (parity matrices may misclassify shipped or removed features) and DOC-010 (docs may falsely claim the source-of-truth audit was removed while live audit artifacts remain) are two symptoms. This register replacing eleven overlapping documents is itself evidence of the gap.

Also recorded by a later audit (audit/inventory.json ledger falsely claims zero partial/stub/unwired/broken (parity-implementation-matrix.md, 2026-08-01 Completion Standard)): Arithmetic proof the register can cite: inventory.json claims partial=0 / stub=0 / unwired=0 / broken=0 against a baseline of 62/13/30/10, so 46 items were reclassified rather than built — and independent sweeps keep finding live counterexamples. This is the sharpest single instance of 'every current document disagrees' and of the completion standard being met on paper only.

**Done when.** One generated capability registry records state, production mounts, runtime entry points, tests, live proof and owner, and every public table, parity matrix and backlog view is derived from it rather than maintained beside it.

**Where.** `docs/agent-context/repo-map.json`, `docs/current/parity-implementation-matrix.md`

**From.** gap-audit-2026-08-08.md; AuditRemediationLedger.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** gap-audit §9 No single trustworthy machine-readable capability registry; DOC-027 Public capability tables not generated from a registry; DOC-008 Parity matrices may misclassify features; DOC-010 Docs may falsely claim the source-of-truth audit was removed

### DOCS-20 — Help, support and takedown process documentation describes processes that do not exist

`HIGH` · docs · effort M

**What.** PP-30: community-support claims are undecided, there is no DMCA or contact process for public content, and model/provider license and resale constraints are not tracked in the registry or release process (see DOCS-01). phase4 PP-30 (SHIP) verifies the takedown gap concretely: grepping report, copyright, abuse and dmca across all three public viewers (share, shared, shared-artifact) returns zero hits; DELETE /api/share/[token] is owner-only; and apps/web/app/api/admin/ contains only security, sso and directory-sync with no takedown route — so a rights holder has no in-page control and must independently discover /copyright and email, while the founder receiving that notice has no admin control to unpublish the share. PP-24 adds that there is no real Help route at all.

**Done when.** Public content carries a reporting control, an operator can unpublish reported content, and every support and licensing process the documentation describes has a working path behind it.

**Where.** `apps/web/app/api/share/[token]/route.ts:5,115`, `apps/web/app/api/admin/`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md

**Folded in.** PP-30 Help/legal/support: community-support claims, DMCA process; phase4 PP-30 no copyright/DMCA takedown execution path

### INFRA-27 — Data-access efficiency is unverified: N+1 queries, unstreamed transfers and per-call client construction

`HIGH` · infra/ci · effort L · **in-progress**

**What.** Four systemic arms, none of which has had a verification pass. SCALE-IO-003: no query tracing, index audit, batching or pagination review covering conversations, messages, projects, memory, files, tasks, approvals, audit and usage. SCALE-IO-004: uploads, downloads, media and results are not confirmed to stream with size limits, backpressure, cancellation and checksums. SCALE-IO-005: HTTP and provider clients are not confirmed pooled per worker rather than per event. SCALE-IO-002: independent retrieval, tool and preflight operations are not systematically parallelised with bounded concurrency.

Re-verified against the tree 2026-08-17; the ExecutionPlan instances this row used to quote are all closed and regression-locked, so they are no longer evidence. The chat preflight runs its ownership/safety and hydration/memory legs concurrently (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1465,1491`). The RLS preamble is folded to two statements, so a user-scoped read costs four Postgres round trips and not six, and pool reuse across `withUser` is asserted (`packages/platform/data-layer/src/__tests__/neon-adapter.test.ts:382-425,449-473`). Migration 0101 replaced the single-column cloud-sync delta indexes with owner-scoped composites and added pg_trgm GIN indexes for the leading-wildcard ILIKE searches. The chat sync pull's three independent delta reads were serial — 12 RLS round trips where 3 concurrent legs do — and now run under one `Promise.all`, guarded by a peak-in-flight assertion in `apps/web/app/api/chat/sync/__tests__/route.contract.test.ts`.

One concrete arm is verified still open: `web_messages` carries no `user_id`, so its delta pull joins through `web_conversations` and walks other tenants' rows above the cursor. Migration 0101 records this and defers it to a denormalization plus backfill.

**Done when.** Hot data paths are traced and proven free of N+1 and unbounded reads, large transfers stream with backpressure and checksums, and clients are pooled rather than constructed per call.

**Where.** `apps/web/app/api/chat/sync/route.ts:92`, `apps/web/db/neon/0101_sync_and_search_indexes.sql:56-67`

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** SCALE-IO-002 Unnecessary serial work is not removed; SCALE-IO-003 N+1 and unbounded DB access; SCALE-IO-004 Large transfers are not streamed; SCALE-IO-005 Clients/connections are not reliably reused

### INFRA-34 — No data-volume forecasts, retention tiers or partitioning for the tables that grow unbounded

`HIGH` · infra/ci · effort L

**What.** SCALE-GROW-001: messages, events, tool logs, files, embeddings, audit, usage, notifications and media all lack forecasts and retention tiers. SCALE-GROW-003 triage (2026-08-09): only one migration mentions partitioning, and messages, usage, audit, agent-events and notifications — the tables that actually grow unbounded — are not covered by it. SCALE-GROW-002: archival and deletion propagation may not reach the primary DB, object storage, search/vector indexes, caches, backups and analytics — this arm overlaps the compliance slice, which owns erasure completeness (DPDP O-13 records that retention has no maximum age for waitlist emails, support tickets, billing rows or data_rights_requests, and that two lifecycle cron routes exist but are not registered in vercel.json so they never run). SCALE-GROW-004 is the one satisfied arm: zero OFFSET-based pagination remains under apps/web/app/api.

**Done when.** Every high-growth table has a forecast, a retention tier and a partitioning or archival strategy, and the lifecycle jobs that enforce them are actually registered and running.

**Where.** `vercel.json:13`, `apps/web/db/neon/`

**From.** AuditRemediationLedger.md; DPDP_PROGRESS.md

**Folded in.** SCALE-GROW-001 No data-volume forecasts or retention tiers; SCALE-GROW-002 Archival/deletion propagation incomplete; SCALE-GROW-003 Partitioning/index strategy insufficient; DPDP O-13 lifecycle crons not registered

### INFRA-37 — Large volumes of unreachable code are never inventoried, wired or deleted

`HIGH` · infra/ci · effort XL

**What.** ExecutionPlan #66 (BLOCKED, not a wiring bug but a per-directory route-or-delete product decision): 20 desktop feature directories — roughly 94,513 LOC across 537 modules, 35% of the surface — are unreachable from the shell, including mcp, git, dynamic-canvas, roi-dashboard, teams, reminders, analytics, notifications, messaging and agent-collaboration; an orphan ratchet exists but does not run in CI. SCALE-FIN-001: zero-import/zero-caller production modules are not classified WIRE/REMOVE/test-only/generated-entry-point. SCALE-FIN-003: unreachable duplicate implementations remain for reasoning UI, approvals, checkpoints, browser replay, notification center, memory manager and artifact publishing. SCALE-FIN-004: background services with zero production callers are neither finished nor deleted — the desktop background-tasks listener continuously writes events into agentStore on every session start while its only reader is unmounted. ExecutionPlan records check:knip red repo-wide with 746 unused files, and phase4 PP-32 counts ~2,025 unreachable lines in the desktop notification-center stack alone. SCALE-PURE-003 is the enforcement half: check-module-reachability.mjs catches newly orphaned modules but nothing enforces dead-code deletion after replacement.

Also recorded by a later audit (check-module-reachability TypeScript gate — 276 unreachable modules seeded as a baseline): Quantifies the desktop half: a new enforcing gate walks the desktop renderer's import graph from main.tsx and its first run found 276 unreachable modules, seeded as a ratcheting baseline with the explicit note 'The 276 are debt to drain, not approvals.' Complements the knip figure (760 unused files repo-wide, configured but deliberately not made a blocking gate because a gate failing with hundreds of untriaged findings gets skipped).

Also recorded by a later audit (check-module-reachability reports 276 unreachable TypeScript modules as a seeded baseline; knip reports 748-760 unused files with the gate deliberately non-enforcing): Two quantified instances. (1) The new enforcing check-module-reachability gate walks the desktop renderer's import graph from main.tsx; its first run found 276 unreachable modules, seeded as a ratcheting baseline — the ledger is explicit that 'the 276 are debt to drain, not approvals'. (2) knip is configured but deliberately NOT a required gate because its first run reports 760 unused files (748 in a later count), mostly config-tuning artifacts but not fully triaged — the stated reasoning being that a gate failing with hundreds of untriaged findings gets skipped, and a skipped gate looks like coverage that is not there. Both numbers are the concrete size of INFRA-37's 'large volumes of unreachable code'.

**Done when.** Every zero-caller production module is classified and either wired or deleted, the orphan ratchet runs in CI, and replacing an implementation requires deleting the one it replaced.

**Where.** `apps/desktop/src/App.tsx`, `apps/desktop/src/features/experimental/`, `apps/desktop/src/features/notifications/index.ts`, `scripts/check-module-reachability.mjs`

**From.** ExecutionPlan.md; AuditRemediationLedger.md; known-flaws.md; phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** ExecutionPlan #66 20 desktop feature directories unreachable; SCALE-FIN-001 Zero-import production modules not inventoried; SCALE-FIN-003 Unreachable duplicate implementations not removed; SCALE-FIN-004 Background services with zero callers; SCALE-PURE-003 Dead code deletion not systematically enforced; check:knip red with 746 unused files; Desktop V3 orphan inventory; Desktop background-tasks producer with zero consumer

### INFRA-58 — No external uptime monitor — every outage detector runs inside the deployment being measured

`HIGH` · infra/ci · effort S

**What.** docs/runbooks/incident-response.md Open gaps: 'No external uptime monitor. Every detector above runs inside the deployment being measured, so a deployment that fails to boot, a DNS failure, or a Vercel region outage is invisible to all of them. An external monitor polling /api/health from outside is the only detector that survives the platform being down, and it needs no code — /api/health is public and already returns 503 when core checks fail.' Distinct from INFRA-24 (no paging vendor) — this is about detection, not notification.

**Done when.** Provision an external uptime monitor polling /api/health from outside the platform; no code change required, only vendor setup.

**Where.** `apps/web/app/api/health/route.ts`

**Blocked by.** founder action / vendor selection

**From.** docs/runbooks/incident-response.md#open-gaps

### MOB-01 — Mobile legal and help copy makes false App Store / Google Play availability and rating claims

`HIGH` · mobile · effort M

**What.** No confirmed store listings exist, yet legal and help copy claims store availability and ratings, and no release-state registry gates store links or badges. The copy removal (DOC-003) is tracked as dependent on this. Compounding: zero link or distribution-state tests exist under apps/web/**tests**, which is exactly the guard that would stop this claim from silently returning.

**Done when.** Drive every store link, badge and availability claim from a release-state registry, and add distribution-state tests that fail when copy outruns the registry.

**Where.** `apps/web/app/mobile/legal/page.tsx`

**From.** AuditRemediationLedger.md (CRIT-007, DOC-003, DOC-028)

**Folded in.** DOC-003: False Mobile store/rating copy and links not yet removed; DOC-028: No link or distribution-state tests exist

### TEST-01 — 75 skipped or ignored tests are uninventoried and unjustified, and the guard that counts them was itself broken

`HIGH` · testing · effort M

**What.** BASE-008 and the Phase-9 9C run: a prior audit found many Desktop visual, settings and GDPR tests silently skipping; the stop-gate run measured 75 skipped or ignored tests (40 Rust #[ignore], 35 .skip) still uninventoried and unjustified. Critically, that count only became visible after fixing a comment-line bug in check-llm-failure-guardrails.mjs that had been hiding bare #[ignore] entries — so the guard designed to surface skipped tests was itself under-reporting. The Phase-9 run named these 75 as the blocking next_task under rule 10 (no stop with skipped gates).

**Done when.** Every skipped or ignored test carries a recorded reason and an expiry, the guard counts them accurately, and the count is a tracked, ratcheting number rather than a discovery.

**Where.** `scripts/check-llm-failure-guardrails.mjs`

**From.** AuditRemediationLedger.md

**Folded in.** BASE-008 Skipped/ignored tests not inventoried; Phase-9 9C 75 skipped/ignored tests

### TEST-02 — Per-surface E2E coverage is incomplete and was not executed at the last stop gate

`HIGH` · testing · effort XL

**What.** SCALE-VER-002: Web, Desktop, Mobile, CLI, VS Code and Chrome each need real happy-path, failure, auth, reconnect and upgrade coverage and none has it. The Phase-9 stop-gate run records that E2E is correctly blocking in e2e-tests.yml (with an explicit no-continue-on-error comment) but was not executed in that session, along with desktop/mobile/CLI/VS Code/Chrome release builds and the load suite — and INFRA-02 explains structurally why: every E2E lane sits behind the one failing check job. ExecutionPlan #80 records the highest-value missing case, since fixed: signup → checkout → entitlement had zero end-to-end coverage on any surface, which is the exact class of defect that produced the Team seat-reconciliation bug.

Also recorded by a later audit (All six surfaces need screenshot/e2e-style UI verification for launch-critical flows, not only typecheck/build (source-of-truth.md GAP-12)): Preserves GAP-12 as the trail-back id and states the acceptance bar: 'not only typecheck/build'. Closely related to TEST-13 (verdicts derived from source reading rather than observation) — GAP-12 is the standing requirement, TEST-13 is the measured shortfall against it.

**Done when.** Each surface has an executed E2E suite covering happy path, failure, auth, reconnect and upgrade, and a stop gate cannot pass while any of them was skipped.

**Where.** `.github/workflows/e2e-tests.yml`

**From.** AuditRemediationLedger.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** SCALE-VER-002 E2E coverage per surface incomplete; Phase 9 stop-gate: per-surface E2E and load suite not run

### TEST-03 — Tests that pass without testing anything: no assertions, hand-written mirrors, and redundant screenshots

`HIGH` · testing · effort M

**What.** DESKTOP-WDIO-NO-ASSERTIONS-01: the Local/Cloud toggle test had zero expect() assertions and reported PASSED unconditionally even against a stale selector matching 0 elements; one test was fixed and the file still needs a broader pass. EXT-MIRROR-TEST-FAKE-COVERAGE-01: two test files reimplement side-panel markdown-rendering logic as hand-written mirrors instead of importing the real module, which let a real fix silently drift out of the live module while the tests kept passing; one file was redirected and security-fixes.test.ts is still tracked. DESKTOP-VISUAL-REGRESSION-COVERAGE-01: after fixing 7 false-pass tests that were all screenshotting an unauthenticated sign-in page, two remaining nav targets (AGI, Automation) do not exist in the current v3 sidebar so those tests re-capture the same default chat screen. SCALE-VER-003 states the rule: visual tests should render real active routes and fail on unexpected absence. ExecutionPlan #79 records the worst instance, since fixed: the GDPR e2e suite had 15 tests but 38 test.skip calls including six tautological guards where the guard was followed by an assertion of the same predicate.

**Done when.** Every test asserts against the real module or the real rendered surface, and a test that cannot fail is treated as a defect rather than as coverage.

**Where.** `apps/desktop/wdio/specs/sidebar-navigation.spec.ts`, `apps/extension/__tests__/security-fixes.test.ts`, `apps/desktop/e2e/visual-regression.spec.ts`

**From.** known-flaws.md; AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** DESKTOP-WDIO-NO-ASSERTIONS-01; EXT-MIRROR-TEST-FAKE-COVERAGE-01; DESKTOP-VISUAL-REGRESSION-COVERAGE-01; SCALE-VER-003 Skipped visual tests not replaced with real assertions

### TEST-05 — No cross-language or cross-surface contract tests exist

`HIGH` · testing · effort L

**What.** SCALE-VER-004: routes, event envelopes, the model registry, permissions, limits and trust modes do not round-trip through TS, Rust, SQL and clients in tests. The ledger's own findings show what this misses: MATCH-001 (a TS contract permitted a surface value the SQL enum rejected at INSERT, with migration tests not asserting the column), ExecutionPlan #42 (the signaling contract omitted four server-sent message types that both desktop and mobile silently dropped via default:break, killing mobile reconnect state-sync), and ExecutionPlan #44 (four incompatible AgentMode vocabularies, so the shared client could not succeed). BIZ-007 is the entitlement instance: Web, Desktop, Mobile, CLI, VS Code and Chrome are not proven to reach the same entitlement decision for the same account and capability.

Also recorded by a later audit (No confirmed CI gate runs both sides of the TS/Rust cloud-sync fixture-replay parity test together (CROSS-SURFACE-011)): Partially contradicts TEST-05's 'no cross-language contract tests exist': packages/client/sync IS the canonical TS delta-sync logic and desktop's cloud_sync.rs independently reimplements the same rules, with parity nominally kept honest via shared golden fixtures replayed against both suites (packages/client/sync/src/**fixtures**/cursor-compare.json). What was explicitly flagged NEEDS_VALIDATION and never confirmed is whether CI actually runs the TS vitest suite and the Rust cfg(test) suite together on every relevant change. Fix: locate the workflow(s), confirm both execute when either the fixtures or cloud_sync.rs change, and add a path-based trigger requiring both to pass together if they are independent.

**Done when.** Shared contracts round-trip through every language and surface in tests, so a value one layer produces cannot be rejected or silently dropped by another.

**Where.** `packages/contracts/types/src/signaling.ts:67-121`

**From.** AuditRemediationLedger.md; ExecutionPlan.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** SCALE-VER-004 No cross-language/cross-surface contract tests; ExecutionPlan #42 signaling contract omits server-sent types; BIZ-007 no cross-surface entitlement contract tests

### TEST-06 — No fault-injection testing for any failure mode the system is expected to survive

`HIGH` · testing · effort L

**What.** SCALE-VER-005: provider outage, DB timeout, duplicate webhook, queue replay, network loss, expired token, disk full, worker crash and partial stream are all untested. Every INFRA item about resilience — retries (INFRA-31), idempotency (INFRA-29), cancellation (INFRA-30), leases and DLQ (INFRA-28) — is unverifiable without this. GATEWAY-STREAM-RESILIENCE-01 shows the cost of not having it: the OpenAI-compatible streaming route flushed 200 before provider iteration and converted errors into ordinary stop chunks plus [DONE], silently masking provider errors as clean stops until someone noticed.

**Done when.** Each named failure mode is injected in a test and the system's response is asserted, so resilience claims are demonstrated rather than assumed.

**From.** AuditRemediationLedger.md; known-flaws.md

### TEST-14 — Essentially every COMPLETE verdict for authenticated product surfaces rests on reading source, never on observing a signed-in render

`HIGH` · testing · effort L

**What.** AuditCompleteness.md §3.3 — the audit's own largest self-identified coverage gap. No signed-in web session was ever driven, by a human or tooling, in that round; the only a11y CI gate touching the real app stays signed-out by design. web-route-sweep-findings.md's closing note: '33 routes were only observed redirecting; their contents were not exercised… a 200 with a rendered shell says nothing about whether the controls inside it work.' Billing is the sharpest case: 'real Stripe checkout' is classified COMPLETE but no checkout flow was ever run end to end — the claim describes well-formed code, not an observed success. Distinct from TEST-02 (E2E coverage not executed at the stop gate): this is about verdicts in the ledger being source-derived rather than observed.

**Done when.** Run one seeded/mocked-session Playwright or MCP-browser pass across /chat with a populated thread, the Settings modal (all sections), one Stripe test-mode checkout, /admin, and one dynamic route in valid/invalid states — upgrading dozens of COMPLETE verdicts from source-verified to observed.

**Where.** `audit/parity-2026-08-15/inventory/web-route-sweep-findings.md`, `audit/parity-2026-08-15/CurrentProductInventory.md:117`

**From.** audit/parity-2026-08-15/AuditCompleteness.md §3.3

### TEST-20 — Wave 1+2 remediation residue: ~37 task IDs came back sound=false, including 45 inert-code findings and a false-reachability citation

`HIGH` · testing · effort L

**What.** HANDOFF.md §5-6. Across two waves ~65% of repairs came back sound=false from adversarial verification; ~37 task IDs were touched and each needs its claim narrowed or its gap closed. The two dominant failure modes were inert code (a symbol with no production consumer — one wave alone produced 45 such findings) and false reachability (an agent cited App.tsx:998 as a model-picker onChange when it is a plain store call). The individual task IDs are not enumerated in HANDOFF.md; they exist only in the workflow journals under .claude/projects/\*\*/subagents/workflows/, so the trail is at risk when that document is retired.

**Done when.** Pull the individual task IDs and sound=false verdicts from .claude/projects/\*\*/subagents/workflows/ into a tracked list; for each, either narrow the over-claimed completion text or close the remaining gap. Wire each of the 45 inert symbols to a real production consumer or delete it. Re-trace any claimed call path independently before trusting it.

**Where.** `.claude/projects/**/subagents/workflows/`, `App.tsx:998`

**From.** docs/agent-context/HANDOFF.md §5, §6

**Folded in.** HANDOFF-wave-residue; HANDOFF-inert-code-45; HANDOFF-false-reachability

### AI-11 — No router-quality eval corpus exists, and sources disagree on whether any evals harness landed

`MEDIUM` · testing · effort L · **unclear**

**What.** PLAN.md follow-on slice 3 states flatly: 'There is no eval corpus and no evals directory in the repo today; this is net-new and is a hard prerequisite for live routing' — 8-12 task families with graders and risk labels are needed. ExecutionPlan item #83 contradicts this, recording that 'No AI output quality evals of any kind' was fixed 2026-08-09 (c6dc19e52) with an evals harness at tools/evals/, noting that of 1,746 test files none measured answer quality and the 5 live-model tests were gated off and ran in none of the 17 CI workflows. VERIFIED: tools/evals/ exists with datasets/, src/, **tests**/ and a README, and .github/workflows/evals.yml exists. What cannot be verified from the documents is whether the landed harness contains the task-family corpus with graders and risk labels the router work requires, or only a generic scaffold.

**Done when.** A named eval corpus covering the router's task families, with graders and risk labels, runs in CI and produces a quality signal the routing work can be measured against — and the two ledgers agree on its existence and scope.

**Where.** `tools/evals/datasets`, `.github/workflows/evals.yml`

**From.** PLAN.md; ExecutionPlan.md

**Folded in.** PLAN.md follow-on slice 3 eval corpus; ExecutionPlan #83 No AI output quality evals of any kind

### CLI-09 — TurnHostAdapter's MCP and subagent logic was verified only by verbatim-move comparison, never live-tested

`MEDIUM` · cli · effort M

**What.** The JSONL byte-identity gate exercises only the demo/fallback ladder; the bulk of dispatch, hooks, plan-gate, subagent-batch and MCP logic in crates/agiworkforce-agent-core is characterized only by fixture comparison, not by a live turn.

**Done when.** Run live-turn tests covering dispatch, hooks, plan gate, subagent batching and MCP against the extracted crate.

**Where.** `crates/agiworkforce-agent-core`, `apps/cli/src/agent/chat.rs`

**From.** docs/agent-context/known-flaws.md (RUST-AGENTCORE-LIVE-TURN-VERIFY-01)

### CLI-22 — CLI surface has structurally thin audit coverage — no dedicated inventory, no TUI-vs-benchmark comparison, and a gap count that reflects audit time rather than surface area

`MEDIUM` · cli · effort L · **unclear**

**What.** AuditCompleteness.md §3.1: every other surface has a dedicated inventory file (web-frontend.md, mobile.md, desktop-tauri.md); the CLI's only source is one ~85-line section of runtime-infra.md plus a raw enum Command read. No screenshot evidence of a competitor CLI/TUI exists in the 288-screenshot research corpus, CLI carries only 3 of 168 filed gaps (0 P0 / 1 P1 / 2 P2) — the joint-thinnest surface — and CapabilityMatrix.md has no CLI-specific section at all (3 incidental hits in 297 lines). Every CLI verdict elsewhere in the register therefore rests on thinner evidence than the other surfaces.

**Done when.** Commission a dedicated CLI domain pass: an inventory/cli.md walking every top-level command and TUI overlay screen against apps/cli/src/tui/\*.rs, cross-referenced control-by-control against benchmark CLI descriptions.

**Where.** `audit/parity-2026-08-15/inventory/runtime-infra.md`, `audit/parity-2026-08-15/CapabilityMatrix.md`, `apps/cli/src/tui/`

**From.** audit/parity-2026-08-15 AuditCompleteness.md §3.1; audit/parity-2026-08-15/AuditCompleteness.md §3.1

**Folded in.** CLI surface has structurally thin audit coverage — no dedicated inventory, no TUI-vs-competitor comparison, gap count reflects audit time not surface area

### CLI-23 — CLI parity rows (REPL/TUI, slash commands, permissions, subagents, MCP/plugins/skills, sessions/worktrees, voice) all remain Partial with no per-row closure evidence

`MEDIUM` · cli · effort L

**What.** parity-implementation-matrix.md CLI And AGI Code section: every row is marked Partial — interactive REPL/TUI; slash commands (some wired 2026-08-05); permissions (allow/ask/deny/workspace/network/bypass modes, per-tool audit); subagents (read-only /subagents and /task list views added 2026-08-05, full user/project subagent management still Partial); MCP/plugins/skills; sessions/worktrees (resume/fork/branch, PR creation/review, diff preview); voice. Only the subagent and voice rows have any specific closure evidence recorded; the rest carry no per-row detail and no owner.

**Done when.** Decompose each Partial CLI row into a concrete missing-behaviour list during the dedicated CLI audit pass (CLI-22), then close or explicitly decline each; do not leave a matrix of undifferentiated 'Partial' as the CLI's only status record.

**Blocked by.** CLI-22 (no dedicated CLI inventory exists to decompose against)

**From.** docs/current/parity-implementation-matrix.md CLI And AGI Code

### DESK-65 — Desktop capability toggles and cloud-sync error handling need regression guards after their fail-open fixes

`MEDIUM` · desktop · effort S · **in-progress**

**What.** Two fail-open defects were fixed but carry no standing guard: is*enabled returned unwrap_or(true) and settingsStore.ts swallowed sync failures to console.error while still showing success, so terminalAccess/fileOperations/codeExecution stayed live after being turned off (fixed ac20a2962); and cloud_sync.rs discarded every local write error via `let * = conn.execute(...)` with messages_failed hardcoded to 0 (fixed 46e81e69f). Neither has a test asserting the closed behaviour.

**Done when.** Add regression tests asserting capability toggles fail closed on sync failure and that cloud-sync surfaces a non-zero failure count when a local write errors.

**Where.** `apps/desktop/src/stores/settingsStore.ts:1594-1603,1707-1714`, `apps/desktop/src-tauri/src/data/cloud_sync.rs:327-334`

**From.** ExecutionPlan.md (items #32, #59)

### DOCS-02 — Dozens of documents cite paths that no longer resolve, and two guards cite deleted files to stay green

`MEDIUM` · docs · effort M

**What.** BASE-003 unwired gate: check:reference-integrity and docs:check fail on 43 undeclared doc references, mostly ExecutionPlan.md citing paths that no longer resolve. DOCS-RESTRUCTURE-PLAN-DELETED-DANGLING-CITATIONS-01: a commit deleted docs/plans/monorepo-restructure-2026-07-08.md and rust-engine-extraction-2026-07-09.md while PLAN.md and docs/current/technical-architecture.md:9 still cite them, so the active restructure has no readable detailed plan and no guardrail catches dangling doc citations. REPO-CODEOWNERS-TODOMD-GHOST-ENTRY-01 is the sharpest case: .github/CODEOWNERS:12 and scripts/check-codeowners-contract.mjs:37 both still require a deleted root TODO.md, so the guardrail stays green only while both halves stay wrong in the same direction — they must be dropped in one change. DOC-004 records the same class in repo maps and surface docs.

**Done when.** Every document reference resolves, the reference-integrity gate has no legacy allowlist hiding dangling citations, and no guard passes by asserting the existence of a file that was deleted.

**Where.** `PLAN.md`, `docs/current/technical-architecture.md:9`, `.github/CODEOWNERS:12`, `scripts/check-codeowners-contract.mjs:37`

**From.** AuditRemediationLedger.md; known-flaws.md

**Folded in.** BASE-003 43 undeclared doc references; DOCS-RESTRUCTURE-PLAN-DELETED-DANGLING-CITATIONS-01; REPO-CODEOWNERS-TODOMD-GHOST-ENTRY-01; DOC-004 Deleted-path entries remain in repo maps

### DOCS-03 — All eight expected spec artifacts are missing and their directory does not exist

`MEDIUM` · docs · effort L

**What.** BASE-003 unwired gate: engineering_rules, feature_matrix, competitor_matrix, implementation_map, dependency_graph, release_checklist, roadmap and architecture_report are all missing and the expected directory does not exist. VERIFIED: docs/spec does not exist while scripts/check-spec-artifacts.mjs is present and expects them. So the gate is red on eight absent artifacts rather than on drift.

**Done when.** Either the eight spec artifacts exist and are generated or maintained, or the gate is retired — the check does not stay red asserting documents nobody intends to write.

**Where.** `scripts/check-spec-artifacts.mjs`

**From.** AuditRemediationLedger.md

### DOCS-05 — README and package metadata are not release-grade and contain several counted inaccuracies

`MEDIUM` · docs · effort M

**What.** P2-006: the README claims 60 models while the current source-of-truth regeneration records 34; the root package.json points to the wrong GitHub repository owner; the README references missing root documents (ARCHITECTURE.md, AGI_WORKFORCE.md, CONTRIBUTING.md, BUILD.md); the reference-integrity gate tolerates a large legacy dangling-reference allowlist (see DOCS-02); the README says screenshots and demos will be added; its serial surface order is superseded by newer parity docs; and it labels Desktop a 'full feature set' while the parity matrix records partial and missing behaviour — a claim INFRA-15 shows is doubly wrong, since Desktop has no reachable download at all.

**Done when.** The README states counts derived from the catalog, links only to documents that exist, points at the correct repository, and describes each surface at the maturity the parity matrix records.

**Where.** `README.md`, `package.json`

**From.** gap-audit-2026-08-08.md

### DOCS-08 — Capabilities that are permanently 'coming soon' or decorative are not downgraded in copy

`MEDIUM` · docs · effort M

**What.** A family of unconfirmed downgrades: DOC-018 (Desktop artifact cloud publish is a permanent 'coming soon' per PP-11 but copy not downgraded), DOC-019 (image region editing, per PP-18 disabled 'coming soon'), DOC-020 (artifact versioning always reports version 1), DOC-021 (Design/Science/Security vertical products, per PP-31), DOC-023 (placeholder MCP directory presented as a registry), and DOC-025 (router freshness and benchmark-learning claims). phase4 adds the opposite error on the same family — /features/artifacts still says 'Managed publishing is rolling out' when the publish endpoint, revocation and public viewer all ship — so the copy is stale in both directions.

**Done when.** Copy for each capability matches its actual state, with planned and preview features labelled before a user acts on them and shipped features not undersold.

**Where.** `apps/web/app/features/artifacts/page.tsx:99-102`

**From.** AuditRemediationLedger.md; phase4-capability-audit.md

**Folded in.** DOC-018 Desktop artifact cloud publish not downgraded; DOC-019 Image region editing not downgraded; DOC-020 Artifact versioning not downgraded; DOC-021 Design/Science/Security verticals not downgraded; DOC-023 Placeholder MCP directory not downgraded; DOC-025 Router freshness/benchmark-learning claims; phase4 /features/artifacts undersells publishing

### DOCS-10 — Fabricated metrics remain in production templates, demos and marketing paths

`MEDIUM` · docs · effort S

**What.** SCALE-PURE-004: test fixtures are not guaranteed to be unmistakable from real metrics, so fabricated or sample values may remain in production templates and marketing paths. DOC-005 states it directly: fabricated metrics remain in template automations and demos, not confirmed removed. PP-14 names a concrete case — desktop automation templates have no consumers and carry fabricated performance metrics. ExecutionPlan #65 records a related fixture defect since fixed: mock-data.ts asserted a pricing table with 3 of 5 model IDs absent from the catalog.

**Done when.** Sample and fixture data is unmistakably synthetic by construction, and no production template or demo surface displays a fabricated metric as real.

**From.** AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** SCALE-PURE-004 Fabricated/sample metrics may remain in production; DOC-005 Fabricated metrics in template automations and demos; PP-14 automation templates with fabricated performance metrics

### DOCS-14 — Marketing copy describes a manual web-search toggle that was deliberately deleted from the product

`MEDIUM` · docs · effort S

**What.** phase4 PP-03 (NOT_SUPPORTED): /features/ai-chat and /features/deep-research still describe a 'one-tap' manual web-search toggle, while web search is ambient by deliberate design — ChatComposerNew.tsx carries the comments 'Managed Web search is ambient (ChatGPT automatic-search behavior)' and 'Removed from + menu: ... automatic Web search'. The audit also notes the composer lacks any persistent indicator of whether ambient search is active for the current model (activeToolLabels pushes 'Web search' but is consumed only by a transient queued-follow-up chip), so a user can neither find the promised toggle nor tell whether search ran.

**Done when.** Copy describes ambient search as it actually works, and the composer shows whether search is active for the resolved model so the behaviour is observable rather than only documented.

**Where.** `apps/web/app/features/ai-chat/page.tsx:55-57`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:717-725,1342-1346,3120`

**From.** phase4-capability-audit.md

**Folded in.** phase4 PP-03 marketing copy describes deleted toggle; phase4 PP-03 no persistent ambient-search indicator

### DOCS-15 — Surface-specific documentation overclaims what several clients can do

`MEDIUM` · docs · effort M

**What.** A family of unconfirmed corrections: DOC-012 (browser-tool README consumer claims may be inaccurate), DOC-014 (CLI browser-control docs may overclaim capability), DOC-015 (VS Code 'cloud-only' and mode-description conflicts unresolved), DOC-013 (connector descriptions may not match actual adapters and actions — overlaps the integrations slice), and DOC-007 (AGI Work docs may misstate dispatch and schedule availability, which AI-28 and INFRA-33 show is materially overstated). VSCODE-CLOUDONLY-DESC-CONFLICT-01 adds a traced instance needing a product call: a locked decision set the marketplace description to 'Multi-provider AI coding assistant - 10+ providers' but current HEAD reads 'Multi-provider AI coding assistant for VS Code' with the provider-count claim removed by a later commit, so the locked decision and the shipped listing disagree.

**Done when.** Each surface's documentation and marketplace listing is reconciled against what that client actually does, and a locked copy decision is either honoured or formally superseded rather than silently reverted.

**Where.** `apps/extension-vscode/package.json`

**From.** AuditRemediationLedger.md; known-flaws.md

**Folded in.** DOC-012 Browser-tool README consumer claims; DOC-013 Connector descriptions may not match adapters; DOC-014 CLI browser-control docs overclaim; DOC-015 VS Code cloud-only/mode-description conflicts; DOC-007 AGI Work docs misstate dispatch/schedule availability; VSCODE-CLOUDONLY-DESC-CONFLICT-01

### DOCS-16 — Product copy names labels, formats and behaviours the UI and services do not provide

`MEDIUM` · docs · effort M

**What.** phase4 collected several precise instances: /features/tools promises Ready / Request access / Planned availability labels while the UI renders only 'Ready', 'Not available here' or 'Phase N'; /agent-permissions still promises 'spreadsheet' generation although managed-office-file-service.ts's discriminated union accepts only docx and pptx (the model-facing preamble was already corrected, the public page was not); the desktop project-knowledge copy claims 'AGI searches this content and references the most relevant parts' while format_project_scope_prompt takes the first 10 files in stored order with no ranking (see AI-12); and apps/cli/src/voice.rs:41 pins a literal model id behind a comment falsely claiming it is absent from models.json, contradicted by the catalog and by the guard test at model_catalog.rs:1893-1918 — a comment that would mislead the next person to touch it.

Also recorded by a later audit (Desktop mobile-pairing instructions name a menu item ('Desktop Companion') that does not exist in the Mobile app (SHELL-NAV-IA-004 / CROSS-SURFACE-007 / GAP-210)): Concrete instance with refs: QRPairingCard.tsx:113-117 tells the user to open 'AGI Workforce -> Desktop Companion'; the literal string 'Desktop Companion' appears nowhere as user-facing Mobile text (only in a code comment). The real Mobile entry points are labelled 'Remote' (DrawerContent.tsx:94-99) or 'Desktop control' (Settings > Capabilities). GAP-210 was marked Done in ui-gaps.csv but the done-claim verification pass re-confirmed the copy drift survived — verified PARTIALLY_DONE. Fix: change the copy to 'Remote' and add a co-located test asserting the string Desktop prints matches a value Mobile's navigation exports.

**Done when.** Copy and code comments state what the implementation does, with availability labels drawn from the same source the UI renders.

**Where.** `apps/web/app/features/tools/page.tsx:57`, `apps/web/app/agent-permissions/page.tsx:31-33`, `apps/web/lib/services/managed-office-file-service.ts:51-64`, `apps/cli/src/voice.rs:41`

**From.** phase4-capability-audit.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** phase4 PP-16 /features/tools availability labels; phase4 PP-12 /agent-permissions spreadsheet claim; phase4 PP-06 desktop project-knowledge semantic-search claim; phase4 PP-20 CLI voice.rs false doc comment

### DOCS-17 — SECURITY.md may misstate audit-log immutability status

`MEDIUM` · docs · effort S

**What.** DOC-017: the SECURITY.md audit-log immutability status may be inaccurate and is not confirmed corrected. The underlying capability did change — AUDIT-IMMUT-01 records that security_audit_logs was freely mutable and deletable by app_rls until migration 0043 was applied to production, after which app_rls was verified INSERT+SELECT-only — so the document must be checked against that outcome rather than assumed either way. DPDP §7.1 shows exactly this class of error recurring elsewhere: the 0113 consent ledger was documented as append-only when its INSERT/SELECT grant prevented nothing, and app_rls actually held UPDATE and DELETE until 0116 revoked them. Overlaps the security slice for the claim's subject matter.

Also recorded by a later audit (Audit log immutability (AUDIT-IMMUT-01) — REVOKE plus SECURITY DEFINER retention/erasure functions shipped): docs/agent-context/risk-map.json (enterprise-control-plane) resolves DOCS-17's 'SECURITY.md may misstate audit-log immutability status' with verified facts (checked 2026-08-09 against source): apps/web/db/neon/0043_audit_log_immutability.sql revokes UPDATE,DELETE on public.security_audit_logs from app_rls and converts cleanup_old_security_logs() and delete_user_data(text) to SECURITY DEFINER so 90-day retention and GDPR erasure still purge; known-flaws records AUDIT-IMMUT-01 Fixed 2026-07-17, applied to prod Neon after a disposable-branch rehearsal, with app_rls verified INSERT+SELECT-only. Explicit instruction: 'Do NOT re-derive the REVOKE — it exists.' Note the two residues filed separately as SEC-88 and SEC-89, which SECURITY.md must not claim away.

**Done when.** Every published immutability or retention claim is verified behaviourally against the live grants, the way the consent ledger was, before it is stated.

**Where.** `SECURITY.md`, `apps/web/db/neon/0043_audit_log_immutability.sql`

**From.** AuditRemediationLedger.md; known-flaws.md; DPDP_PROGRESS.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### DOCS-18 — Retired tier names and a stale Team price persist in legal, policy and pricing copy

`MEDIUM` · docs · effort S

**What.** WEB-TIER-NAMING-HOBBY-STALE-01: the billing source of truth defines free/basic/pro/max/enterprise with no 'hobby', yet the privacy, terms and refund-policy pages still name a nonexistent 'Hobby' tier, and models/route.ts's tier taxonomy diverges as well. DOC-016 and BIZ-002 record the price half: stale Team pricing ($30) may still exist alongside the current $25/seat pricing, with older decisions and snapshot tests needing removal. ExecutionPlan #92 confirms the same staleness reached the app stores — the human-readable listing still advertised 'Hobby — $5/mo' with BYOK and computer-use flags hardcoded false, since corrected. Primary home is copy accuracy; the pricing correctness itself belongs to the billing slice.

**Done when.** Tier names and prices in legal, policy, pricing and store copy are derived from the billing catalog, so a renamed or repriced tier cannot survive anywhere it is quoted.

**Where.** `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/app/refund-policy/page.tsx`, `packages/contracts/types/src/billing-catalog.ts`

**From.** known-flaws.md; AuditRemediationLedger.md; ExecutionPlan.md

**Folded in.** WEB-TIER-NAMING-HOBBY-STALE-01; DOC-016 Team price conflict and stale tier names

### DOCS-19 — Localization debt: sources disagree on whether the shared UI package is wired for i18n at all

`MEDIUM` · docs · effort XL · **unclear**

**What.** known-flaws records 2,075 missing translation keys with packages/ui at 0 of 154 files wired for i18n, noting that packages/ui/unified-chat is consumed by both web and desktop so every surface inherits hardcoded English regardless of locale until it is wired; es is 38 keys short and other languages 183-206 keys short each; and legal and policy pages need per-locale legal review rather than translation. ExecutionPlan #72-#78 contradicts this, claiming the shared UI package, web, desktop, mobile, Chrome, VS Code and CLI i18n work all landed 2026-08-09 along with the i18n key-parity guardrail (2,075 findings) and 15 mobile hex-colour findings. DPDP O-15 independently confirms at least part of the debt survives: legal pages are hardcoded English JSX with no i18n, which mechanically blocks the DPDP Eighth Schedule language requirement (L-6/F-5).

Also recorded by a later audit (Full-localization requirement: LanguageSelector is a false control, hi is missing 4 of 7 bundles, check:i18n-parity is red (parity-implementation-matrix.md)): Resolves the register's 'sources disagree' status with hard numbers: the hi locale is missing 4 of 7 bundles (auth, chat, models, pricing), and only 5 of 490 TSX component files use i18n at all — so the settings LanguageSelector currently changes a small fraction of visible text, which the founder's completion standard classifies as a false control. `pnpm check:i18n-parity` is currently RED on hi (scripts/check-i18n-parity.mjs). Separately, mobile and desktop carry i18n dependencies with unaudited coverage and the same requirement applies per surface. Overlaps UI-21 (shared UI package i18n wiring) and MOB-28.

**Done when.** One measurement establishes actual i18n coverage per package, the key-parity guard runs on it, and the legal pages are localizable — with the ledgers agreeing on the result.

**Where.** `packages/ui/i18n/locales`, `apps/web/app/privacy/page.tsx:77`, `scripts/check-i18n-parity.mjs`

**Blocked by.** Eighth Schedule legal translations require counsel (DPDP F-5)

**From.** known-flaws.md; ExecutionPlan.md; DPDP_PROGRESS.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** i18n translation debt: 2,075 missing keys; DPDP O-15 legal pages hardcoded English

### DOCS-24 — /agi-work marketing page describes a separate, unshipped Desktop dispatch product — a naming collision with the shipped composer mode

`MEDIUM` · docs · effort S

**What.** parity-implementation-matrix.md, tracked as CAP-048: '/agi-work marketing page describes a separate, unshipped Desktop dispatch product (waitlist CTAs) — a naming collision to resolve.' The shipped AGI Work is a composer mode in chat; the page advertises a different product whose build is CAP-049, itself blocked on the host-relay contract (AI-55).

**Done when.** Rename one of the two, or rewrite /agi-work to describe the shipped composer mode and move the unshipped dispatch product behind its own honestly-labelled page.

**Where.** `apps/web/app/agi-work/page.tsx`

**Blocked by.** CAP-049 / AI-55 (dispatch product not built)

**From.** docs/current/parity-implementation-matrix.md CAP-048

### DOCS-26 — A doc-staleness sweep deleted four load-bearing files selected only by metadata

`MEDIUM` · docs · effort S · **unclear**

**What.** HANDOFF.md §5 trap 8: 'A doc sweep deleted four load-bearing files (7214d0c70) — a pyproject.toml readme, a file a test reads, and both .agents READMEs. Selecting docs by staleness metadata cannot see that a build manifest, a test, or a shell script depends on one.' The source does not confirm whether the four files were restored.

**Done when.** Confirm whether the four files deleted in 7214d0c70 were restored; if not, restore them, and add a check preventing a doc-staleness sweep from deleting a file referenced by a manifest, test or script.

**Where.** `commit 7214d0c70`

**From.** docs/agent-context/HANDOFF.md §5 trap 8

### EXT-36 — VS Code parity rows (editor context, diff review/apply, cloud-local continuation, settings) remain Partial with no per-row closure evidence

`MEDIUM` · extension · effort L

**What.** parity-implementation-matrix.md VS Code Extension section: editor context (@file picker, diagnostics/problems, terminal capture, images), diff review/apply (preview patch, accept/reject hunks, checkpoint/stash, apply cloud task locally), cloud/local continuation (cloud task delegation with local handoff/consent) and settings (models, approval mode, endpoint/provider, permissions, shortcuts) are each marked Partial with no detail on what specifically is missing. EXT-10/11/12 cover the composer, session-history and account/usage rows; these four have no corresponding register entry.

**Done when.** Decompose each remaining Partial VS Code row into concrete missing behaviours and close or explicitly decline each; the diff review/apply row should be sequenced against EXT-31's checkpoint blocker.

**From.** docs/current/parity-implementation-matrix.md VS Code Extension

### INFRA-48 — No authoritative API contract artifact and no contract tests comparing routes to a published spec

`MEDIUM` · infra/ci · effort M

**What.** GAP-P1-008: docs/api/openapi.yaml is referenced but not present in the tree — VERIFIED absent — and the API surface is instead documented ad hoc in docs/api/rate-limits.md and route contracts, with no contract tests comparing routes to a published spec. apps/web/public/openapi.json does exist (VERIFIED), so there are two competing candidate artifacts and no declared owner. PP-29 records the downstream consequence: structured outputs are advertised as compatible but hard-rejected, an embedding catalog is unused, retired /api/agents paths remain in clients and docs, and there is no explicit OpenAPI-compatibility matrix.

**Done when.** One published OpenAPI artifact is the contract, generated from or verified against the real routes by a contract test, so an advertised capability cannot diverge from what the API accepts.

**Where.** `apps/web/public/openapi.json`, `scripts/config/reference-integrity-allowlist.json`

**From.** gap-audit-2026-08-08.md; AuditRemediationLedger.md

**Folded in.** GAP-P1-008 Public/developer API lacks one authoritative OpenAPI artifact; PP-29 no explicit OpenAI-compatibility matrix

### INFRA-55 — Eleven legacy/dead database tables and an authored-but-unapplied drop migration are correctly gated but untracked as a group

`MEDIUM` · infra/ci · effort S

**What.** BACKEND-RUNTIME-013 / DEAD-CODE-006. Nine tables — agent_tools, agent_tool_executions, agent_approval_requests, chat_messages, chat_folders, message_bookmarks, message_reactions, user_shortcuts, messaging_connections — are touched only by the GDPR/DPDP account-erasure sweep (account-erasure.ts:60-91). Two more (referrals, cloud_waitlist) have zero application-code references at all. Migration 0058_drop_legacy_teams.sql for teams/team_members is fully written but its header states it is founder-gated and not applied. Legitimate, correctly-managed debt, but the pending migration and the dead-table list are not consolidated anywhere, so the founder-run drop step would require re-discovery.

**Done when.** Add a single tracked line item (known-flaws.md or a schema-debt doc) listing all 11 tables and the pending 0058 migration together; add a schema-level comment on the 9 erasure-only tables recording why they are kept; delete referrals and cloud_waitlist outright.

**Where.** `apps/web/lib/server/account-erasure.ts:60-91`, `apps/web/db/neon/0058_drop_legacy_teams.sql:1-30`, `apps/web/lib/services/waitlistService.ts:10-12`

**From.** audit/parity-2026-08-15/gaps/domain-backend-runtime.json BACKEND-RUNTIME-013; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-006

**Folded in.** BACKEND-RUNTIME-013; DEAD-CODE-006

### MOB-14 — Mobile connector catalog was faked once and needs a standing regression guard

`MEDIUM` · mobile · effort S

**What.** All three mobile chat entry points into connectors once rendered a fake hardcoded 11-item catalog (fixed 2026-07-11), and HARD-017 asks for verification that Mobile no longer maintains an independent hardcoded connector array plus a regression test — not confirmed done. Verified: apps/mobile/services/connectors.ts now declares a ConnectorSource union including 'custom', so the server-typed shape is in use.

**Done when.** Add a test asserting the mobile connector list is server-derived and failing if a literal catalog array is reintroduced.

**Where.** `apps/mobile/services/connectors.ts`

**From.** AuditRemediationLedger.md (HARD-017); docs/agent-context/known-flaws.md (MOBILE-CONNECTORS-ROUTE-THEATER-01)

### MOB-21 — Mobile source-only patches awaiting device verification: prompt echo, table clipping, CSV card title, artifact thumbnails, settings exit

`MEDIUM` · mobile · effort S · **in-progress**

**What.** Five defects were patched in source without a Metro/Simulator run, so the prior visual reproductions remain the acceptance cases: stripLeadingCurrentPromptEcho now removes only an exact turn-scoped echo; MessageContentRenderer places tables in an explicit horizontal ScrollView with bounded cell widths; durable generated-file descriptors now win over duplicate fenced-data artifacts and retain the server filename; the artifacts grid resolves the same authenticated image source as Library/detail with explicit fallbacks; and the top-level settings header gained a visible Close control.

**Done when.** Run one device pass reproducing each original defect and record pass/fail per item.

**Where.** `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx`

**From.** ExecutionPlan.md (Mobile test pass 2026-08-13, Mobile second sweep)

**Folded in.** Prompt echoed into the reply on Mobile; Markdown table clipping on Mobile; Generated CSV card title on Mobile; Artifacts image thumbnails on Mobile; Settings root exit on Mobile

### MOB-38 — Mobile capability handshake and code-execution defaults need standing regression guards

`MEDIUM` · mobile · effort S · **in-progress**

**What.** Three coupled defects were fixed but carry no guard: grantedCapabilities started empty and refreshTier() early-returned when appMode!=='cloud' (the app always launches Local) with every failure swallowed, so the first Cloud send treated a not-yet-arrived handshake as a denial and silently dropped Web Search and file creation; office_creation had zero occurrences anywhere in mobile so file creation was impossible by construction; and features.codeExecution defaulted false with its only toggle buried in Settings.

**Done when.** Add tests asserting that an absent capability handshake never denies, that office_creation is sent whenever code execution is enabled, and that the default is on.

**Where.** `apps/mobile/src/features/billing/store.ts:122`, `apps/mobile/app/_layout.tsx:375-381`, `apps/mobile/src/stores/chatExecutionStore.ts:1606`

**From.** ExecutionPlan.md (Phase 1 mobile tool capabilities)

### SEC-95 — Desktop native crash-dump upload was removed with no consent-safe replacement, so native crashes are unreportable

`MEDIUM` · security · effort L

**What.** wire-or-cut.md 2026-07-30 Crash-reporting Runtime Boundary: the optional Rust Sentry feature was compiled out of every release and initialized before renderer-owned consent state was available, so both native egress paths were removed. A future native uploader requires a typed runtime consent bridge, Managed-mode enforcement, packaged configuration, symbol upload and end-to-end release verification — none of which exists. Product crash reporting for Web and the Desktop renderer remains wired and fails closed.

**Done when.** Build the typed runtime consent bridge and Managed-mode enforcement before re-introducing any native crash upload; until then, record that native desktop crashes are unreported.

**From.** docs/adr/wire-or-cut.md 2026-07-30 Crash-reporting Runtime Boundary

### TEST-07 — No cross-surface continuity tests for version skew or logout purge

`MEDIUM` · testing · effort M

**What.** REL-007 triage (2026-08-09): zero tests cover version skew or logout purge across surfaces, even though logout purge itself was fixed in this period (commit 46e81e69f clears credentials and query cache on web and desktop) — only the regression test is missing, so the fix is unprotected. ExecutionPlan #35 records what was actually broken: web logout called a no-op authService.logout() instead of clearing tokens, and desktop logoutCleanup.ts missed three or more keys that had no writer. FoundersAssistance item 14 records the untested half that matters most commercially: exact-package Chrome presentation and signed-in cross-surface chat continuity and deletion have never been verified with a real profile.

**Done when.** Regression tests cover logout purge and version skew across surfaces, so a credential or cached record surviving sign-out fails a test rather than being rediscovered.

**From.** AuditRemediationLedger.md; ExecutionPlan.md; FoundersAssistance.md

**Folded in.** REL-007 No cross-surface continuity tests; FoundersAssistance #14 exact-package Chrome continuity unverified

### TEST-08 — No link or distribution-state tests, the exact guard that would stop false availability claims returning

`MEDIUM` · testing · effort S

**What.** DOC-028 triage (2026-08-09): zero link or distribution-state tests exist under apps/web/**tests** — and the ledger names this as precisely the guard that would stop DOC-003 (false store availability) and DOC-026 (traction and 'six live apps' claims) from silently returning. INFRA-15 is the live instance this guard would have caught: /download and /cli claim 'Released' while the release endpoint 404s.

**Done when.** Tests assert that every advertised download, store listing and marketplace link resolves and that the claimed release state matches a probe of the real artifact.

**From.** AuditRemediationLedger.md

### TEST-09 — Test infrastructure is flaky and environment-dependent across CLI, mobile and desktop

`MEDIUM` · testing · effort M

**What.** CLI-FLAKY-PATH-SECURITY-TEST: validate_workspace_path_allows_registered_additional_root passes in isolation but fails under full-suite parallel execution because a sibling test mutates shared process-global registered-roots state. MOBILE-TEST-INFRA-SECURESTORE: jest.setup.js lacks an expo-secure-store mock, so src/lib/time.test.ts fails independently of any product change because its module graph loads a SecureStore-backed store. DESKTOP-DOM-E2E-MODE-DEPENDENCY: desktop Playwright DOM e2e has no webServer config and the Local and Cloud suites need mutually exclusive env vars for the same dev server, so they cannot both pass under one configuration; v3-agent-activity.spec.ts's 'Desktop Cloud activity spine' test fails in both modes. DESKTOP-NATIVE-E2E-NEVER-RAN-01: the first honest native WDIO run (32 spec files) passed 3 and failed 29 with real assertion errors, and onboarding is one-shot per profile so at most one onboarding-dependent spec can pass per run. MOBILE-IOS-BUILD-BLOCKED: expo run:ios exits 65 on a missing generated safeareacontext file, blocking the Maestro smoke.

**Done when.** Test suites are hermetic — no shared process-global state between tests, mocks present for every native module in the graph, and a harness configuration under which every suite can pass in one run.

**Where.** `apps/mobile/jest.setup.js`, `apps/desktop/e2e/`, `scripts/qa/maestro-dev-smoke.yaml`

**From.** known-flaws.md

**Folded in.** CLI-FLAKY-PATH-SECURITY-TEST; MOBILE-TEST-INFRA-SECURESTORE; DESKTOP-DOM-E2E-MODE-DEPENDENCY; DESKTOP-NATIVE-E2E-NEVER-RAN-01 findings; MOBILE-IOS-BUILD-BLOCKED

### TEST-10 — Automated accessibility coverage exists for five web routes and no other surface

`MEDIUM` · testing · effort M

**What.** phase4 PP-32 (NOT_SUPPORTED): apps/web/scripts/a11y-audit.mjs covers only /, /chat, /pricing, /features/agents and /download, gated on web_changed in CI, and no axe suite exists for desktop, mobile or CLI; only two reduced-motion assertions exist repo-wide. PP-32 states the product-side gap: there are no keyboard, screen-reader, focus, reduced-motion, high-contrast, zoom or responsive tests on active surfaces. DPDP_PROGRESS §7.3 adds an accuracy caveat worth preserving — an audit claim that contrast, focus and screen-reader support were unsupported was refuted by a11y-report.json showing zero violations; the real defect was that those rows read as site-wide when the scan covers only five routes in two colour schemes, and the rows have since been scoped with their limits published.

Also recorded by a later audit (Automated accessibility CI gates only ever visit unauthenticated/marketing screens (DESIGN-SYSTEM-003)): Adds the desktop side that TEST-10 records only as 'no other surface': desktop's e2e/accessibility-audit.spec.ts:1-42 audits exactly one screen — the signed-out sign-in route — with a comment stating the signed-out choice keeps the audit 'deterministic'. Web's scripts/a11y-audit.mjs:22-28 visits exactly 5 unauthenticated routes (Home, marketing Chat, Pricing, Features, Download). Neither gate ever authenticates, so Settings (38 nav destinations), a real chat thread, Artifacts, Research and Connectors are never audited. Fix: add a signed-in fixture (Clerk test user / mocked session) for web opening a seeded chat plus the Settings modal plus one dialog, and a second desktop Playwright spec that boots past onboarding into the main chat shell.

Also recorded by a later audit (Automated accessibility CI gates only visit unauthenticated/marketing screens (DESIGN-SYSTEM-003)): Corrects the register's 'five web routes and no other surface': desktop DOES have one a11y gate — e2e/accessibility-audit.spec.ts:1-42 audits exactly one screen, the signed-out sign-in route, with a comment stating the signed-out choice keeps the audit 'deterministic'. Web's a11y:audit visits 5 unauthenticated routes (a11y-audit.mjs:22-28). Neither gate ever authenticates, so Settings (38 nav destinations), a real chat thread, Artifacts, Research and Connectors are never audited on any surface. Fix: add a signed-in Clerk test-user fixture for web and a second desktop Playwright spec that boots past onboarding. CI refs: .github/workflows/ci.yml:719-800.

**Done when.** Automated accessibility checks cover the active routes of every shipped surface, and any published accessibility claim states the scope it was measured over.

**Where.** `apps/web/scripts/a11y-audit.mjs:22-28`, `.github/workflows/ci.yml:643,702`, `apps/web/reports/a11y-report.json`

**From.** phase4-capability-audit.md; AuditRemediationLedger.md; DPDP_PROGRESS.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** phase4 PP-32 accessibility automated coverage; PP-32 no accessibility test coverage on active surfaces

### TEST-17 — No automated lock-step check that a shipped settings panel has a reachable nav entry — six historical instances of the same authoring bug

`MEDIUM` · testing · effort M

**What.** SETTINGS-010. Four historical plus two new instances of settings panels shipped with no nav entry (apps/web/app/settings/voice/page.tsx was real content absent from SETTINGS_NAV_GROUPS_WEB, reachable only via a miswired icon; /settings/byok and /settings/sync remain in that state). The VS Code extension's config-key/schema lock-step test is the only place this class of drift is already automated.

**Done when.** Generalize the VS Code extension's automated schema/nav lock-step test pattern to web and desktop so a shipped-panel-with-no-nav-entry regression fails CI.

**Where.** `packages/ui/ui/src/settings-nav.ts`, `apps/extension-vscode/src/__tests__/`

**From.** audit/parity-2026-08-15/gaps/domain-settings.json SETTINGS-010

### UI-63 — Recurring authoring pattern: settings panels ship with no nav entry, and no CI lock-step test exists outside the VS Code extension

`MEDIUM` · ui · effort ?

**What.** SETTINGS-010: apps/web/app/settings/voice/page.tsx was real content absent from SETTINGS_NAV_GROUPS_WEB and reachable only via a miswired icon (WEB-37), /settings/byok and /settings/sync remain in the same state (WEB-50), and desktop's setSendShortcut is the store-side seed of the same pattern. The VS Code extension's config-key/schema lock-step test is the only place this drift class is automated.

**Done when.** Generalize the VS Code extension's schema/nav lock-step test to web and desktop so a shipped-panel-with-no-nav-entry regression fails CI.

**Where.** `packages/ui/ui/src/settings-nav.ts`

**From.** audit/parity-2026-08-15 — SETTINGS-010

### UI-88 — Recurring authoring pattern: settings panels shipped with no nav entry; only the VS Code schema/nav lock-step test defends against it

`MEDIUM` · ui · effort M

**What.** SETTINGS-010: four historical plus two new instances of the same class — apps/web/app/settings/voice/page.tsx was real content absent from SETTINGS_NAV_GROUPS_WEB and reachable only via a miswired icon, and setSendShortcut is the seed example of the same pattern in Desktop's store. The VS Code extension's automated config-key/schema lock-step test is the only place in the repo where this class of drift is already caught automatically.

**Done when.** Generalize the VS Code extension's automated schema/nav lock-step test pattern to web and desktop so a shipped-panel-with-no-nav-entry regression fails CI.

**Where.** `packages/ui/ui/src/settings-nav.ts`

**From.** audit/parity-2026-08-15 SETTINGS-010

### UI-95 — Dedicated accessibility component directory is entirely dead code, including a mocked audit panel that always reports 'all checks passed'

`MEDIUM` · ui · effort S

**What.** DESIGN-SYSTEM-009 (prior GAP-275). 8 files (650 lines) under apps/web/shared/components/accessibility/ have zero imports anywhere under app/features/components — including SkipLink/SkipLinks, so app/layout.tsx has no skip-to-content link at all. Worse, AccessibilityAudit.tsx:1-50 wires its entire display to a hardcoded object whose own comment reads 'Mock accessibility service … since monitoring was archived'; runAudit() always resolves score:95/failed:0 and generateReport() always returns a canned 'All checks passed!' string regardless of actual page state — a fake-passing quality signal, not just dead code.

**Done when.** Add <SkipLink href="#main-content"> (already built, just unmounted) to layout.tsx. Delete AccessibilityAudit.tsx and the other unused wrappers, or wire AccessibilityAudit.tsx to real axe results before any dev-tools surface exposes it.

**Where.** `apps/web/shared/components/accessibility/AccessibilityAudit.tsx:1-50`, `apps/web/shared/components/accessibility/SkipLink.tsx`, `apps/web/app/layout.tsx`

**From.** audit/parity-2026-08-15/gaps/domain-design-system.json DESIGN-SYSTEM-009

**Folded in.** DESIGN-SYSTEM-009; GAP-275

### DOCS-22 — 'Chat is genuinely shared, not duplicated' is stated without its primary-vs-secondary qualifier in two headline documents

`LOW` · docs · effort S

**What.** AuditCompleteness.md §4.2. CrossPlatformArchitectureAudit.md:196 states 'Chat is genuinely shared between Tauri-desktop and web, not duplicated' — true only for web's secondary Work/Code mode, and false for web's primary chat route, which the same document's §1 correctly qualifies nine lines earlier ('Web (primary)… No — 3 named imports only'). CurrentProductInventory.md:279 makes the same unqualified claim. SurfaceParityMatrix.md avoids the trap by stating the distinction inline every time. Directly contradicts the measured fork recorded as UI-25.

**Done when.** Qualify the claim in both locations with the same primary-vs-secondary distinction SurfaceParityMatrix.md already uses.

**Where.** `audit/parity-2026-08-15/CrossPlatformArchitectureAudit.md:196`, `audit/parity-2026-08-15/CurrentProductInventory.md:279`, `audit/parity-2026-08-15/inventory/desktop-electron.md:324-332`

**From.** audit/parity-2026-08-15/AuditCompleteness.md §4.2

### DPDP-33 — The public /enterprise page understates SSO and SCIM readiness relative to the internal admin console

`LOW` · compliance/dpdp · effort S

**What.** /enterprise tells prospects that SSO/SCIM status is unknown ('ask us') while apps/web/features/admin/pages/AdminConsolePage.tsx correctly says they are 'Implemented — entitlement-gated'. The public page is the pessimistic one relative to what actually shipped — a messaging inversion, not a technical gap. DOC-011 separately warns the AdminConsole 'schema ready' claims may overstate readiness, so both directions need one reconciled source.

Also recorded by a later audit (Enterprise pricing copy calls a shipped capability 'roadmap' (SSO/SCIM)): G12 (models-reasoning-quotas domain): packages/ui/i18n/locales/en/pricing.json:110 called SSO/audit/data-retention 'roadmap' while AdminConsolePage.tsx:71-78,130-145 documents SSO and SCIM as 'Implemented — entitlement-gated' with live routes. FIXES-APPLIED.md (2026-08-15) reports this fixed: 'The enterprise page stopped calling shipped, gated capabilities "roadmap" — each row was re-verified against real code.' DPDP-33 may now be closable; verify the pricing.json string and /enterprise copy on the current branch before closing, and reconcile against DPDP-32 (SSO never verified against a live instance) so the corrected copy does not overclaim in the other direction.

**Done when.** Derive both the public page and the admin console from one capability-state record so they cannot disagree, and set that record to the verified state after DPDP-32 closes.

**Where.** `apps/web/app/enterprise/page.tsx:86-99`, `apps/web/features/admin/pages/AdminConsolePage.tsx:68-78`

**From.** docs/agent-context/phase4-capability-audit.md PP-27; AuditRemediationLedger.md DOC-011; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** /enterprise page tells prospects SSO/SCIM status is unknown while the admin console says implemented

### EXT-08 — Extension test file reimplements side-panel logic by hand instead of importing the real module, producing fake coverage

`LOW` · extension · effort S · **in-progress**

**What.** Two test files reimplemented side-panel markdown-rendering logic as hand-written mirrors instead of importing the real module, which let a real fix silently drift out of the live module while the tests kept passing. One file was redirected to the real module; security-fixes.test.ts is still tracked.

**Done when.** security-fixes.test.ts imports and exercises the production module, so a change to the live code can fail the test.

**Where.** `apps/extension/__tests__/security-fixes.test.ts`

**From.** known-flaws.md (EXT-MIRROR-TEST-FAKE-COVERAGE-01)

### EXT-09 — VS Code marketplace description was reverted away from the locked provider-count copy

`LOW` · extension · effort S

**What.** A locked decision set the description to 'Multi-provider AI coding assistant - 10+ providers'; current HEAD reads 'Multi-provider AI coding assistant for VS Code' with the provider-count claim gone, traced via git log -S to a later commit that reverted it. Needs a product-direction call on which copy is correct.

**Done when.** package.json carries the intended marketplace description and a guard prevents it drifting back.

**Where.** `apps/extension-vscode/package.json`

**From.** known-flaws.md (VSCODE-CLOUDONLY-DESC-CONFLICT-01)

### EXT-35 — packages/tools/browser-tool is dead code and apps/extension/package.json still declares it as a workspace dependency

`LOW` · extension · effort S

**What.** CROSS-SURFACE-013 and DEAD-CODE-019: the package's own README states it has zero consumers repo-wide, and its only prior importer in apps/extension was deleted with its bridge in commit bfce749b3 because the bridge had no caller. apps/extension/package.json:41 still lists @agiworkforce/browser-tool, which knip confirms as an unused dependency.

**Done when.** Remove @agiworkforce/browser-tool from apps/extension/package.json via the package manager (not a standalone edit, per the repo's lockfile-edit hook), and archive the package or file a concrete adoption ticket.

**Where.** `packages/tools/browser-tool/README.md`, `apps/extension/package.json:41`

**From.** audit/parity-2026-08-15 CROSS-SURFACE-013; audit/parity-2026-08-15 gaps/domain-dead-code DEAD-CODE-019

**Folded in.** CROSS-SURFACE-013; DEAD-CODE-019 (browser-tool half)

### INFRA-54 — No error-tracking or APM on the backend services, and api-gateway exposes no /metrics endpoint

`LOW` · infra/ci · effort S

**What.** BACKEND-RUNTIME-012. services/signaling-server exposes real Prometheus-format metrics at /metrics (src/metrics.ts:1-13); services/api-gateway has only /health and /ready, confirmed by grep. Neither service's package.json references Sentry or any error-tracking SDK. Narrower and more concrete than INFRA-25 (SLOs/latency/tracing) — this is two named services with no instrumentation at all.

**Done when.** Add a /metrics endpoint to api-gateway using signaling-server's prom-client pattern, and wire a Sentry (or equivalent) DSN into both services' error handlers.

**Where.** `services/api-gateway/package.json`, `services/signaling-server/src/metrics.ts:1-13`

**From.** audit/parity-2026-08-15/gaps/domain-backend-runtime.json BACKEND-RUNTIME-012

### INFRA-56 — packages/tools/browser-tool is dead code with a stale workspace dependency still declared by the Chrome extension

`LOW` · infra/ci · effort S

**What.** CROSS-SURFACE-013 / DEAD-CODE-019. The package's own README states it has zero consumers repo-wide; its only prior importer in apps/extension was deleted with its bridge in commit bfce749b3 because the bridge had no caller. apps/extension/package.json:41 still lists @agiworkforce/browser-tool as a workspace dependency despite nothing importing it, and knip confirms it as an unused dependency.

**Done when.** Remove @agiworkforce/browser-tool from apps/extension/package.json via the package manager (not a standalone Edit, per CLAUDE.md's lockfile-edit hook), and archive the package or file a concrete adoption ticket.

**Where.** `packages/tools/browser-tool/README.md`, `apps/extension/package.json:41`

**From.** audit/parity-2026-08-15/gaps/domain-cross-surface.json CROSS-SURFACE-013; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-019

**Folded in.** CROSS-SURFACE-013; DEAD-CODE-019 (browser-tool half)

### MOB-23 — Mobile UI parity pass against the 87 reference screenshots has not been rechecked since the source patches

`LOW` · mobile · effort M · **in-progress**

**What.** Source patches exist for suggestion chips, cold-start mode and Settings-exit gaps, but they remain in the next device pass until rendered behaviour is rechecked against the 87 reference screenshots. Two confirmed P3 visual defects are outstanding: the Library IMAGE badge is clipped at the tile's top-left corner, and the scroll-to-bottom FAB overlaps the message action row.

**Done when.** Run the reference-screenshot comparison pass on device and fix the two known clipping/overlap defects.

**Where.** `apps/mobile/src/features/library/index.tsx`

**From.** ExecutionPlan.md (Mobile media generation TODO, Mobile second sweep)

**Folded in.** P3: Library IMAGE badge clipped at tile's top-left corner; P3: Scroll-to-bottom FAB overlaps the message action row
