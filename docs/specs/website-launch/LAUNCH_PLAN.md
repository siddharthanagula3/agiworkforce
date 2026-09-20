# Website launch plan

Status: Planned; implementation has not started for this batch
Owner: Website launch coordinator
Last updated: 2026-09-19

## Objective and boundaries

Make the existing localhost website dependable for its defined launch scope: public discovery,
sign-in, explicit Luna chat, saved work, projects/files, appropriate tools and approvals, account
controls, plan limits, billing visibility and Enterprise administration. This is a planning-only
checkpoint requested by the owner. Do not begin application repairs during this turn.

Use the actual repository and the in-app Browser. Preserve uncommitted work. No production
configuration, migrations, deployment, commits, pushes or merges. Native apps, CLI/extension behavior
and full competitor parity remain outside this website task. Only explicit Luna may be used for
in-product inference; no image/video generation. Missing required website behavior must receive an
explicit disposition, not be dismissed as outside scope.

## Evidence baseline and corrections

The frozen re-audit reviewed all 29,115 items: 7,803 done, 9,597 partial, 5,076 missing and 6,639
unverified. These are historical, whole-product outcomes, not current website coverage percentages.
The historical decision remains GLOBAL NO-GO. Do not restart or regenerate the frozen audit.

Current planning baseline: repository `/Users/siddhartha/Desktop/agiworkforce`, branch
`codex/website-launch-preparation-20260919`, HEAD
`9d6005689ee481a60bd6c32cc5bdee9661512c81`, plus the existing dirty working tree. The latest Browser
pass used `http://localhost:3100`, Next development mode, local PostgreSQL and Redis, a Clerk test
identity and a local Enterprise workspace. The server is stopped after QA to release memory.
The last ledger probe reported 272 migrations applied, 0273 pending and checksum drift at 0268.

The prior report's “17 confirmed findings” is too strong. Keep the observations and original attempt
history, but correct interpretation before scheduling repairs:

- `QA-WEB-CHANGELOG-LOCAL-MODELS` is not reproducible in current source. The current changelog already
  describes Desktop as managed cloud. No changelog repair is warranted on the old allegation.
- `WorkspaceIdentityPanels.tsx` has separate “What deprovisioning does” and “Not yet available” blocks.
  The latter lists mandatory SSO and group-scoped entitlements. It does not say deprovisioning is
  unavailable. The earlier flattened accessibility-text interpretation was wrong.
- Supporting SSO sign-in is distinct from requiring SSO. Pricing's SSO claim alone does not establish
  an overclaim. The owner audit failure and effective-policy contradiction remain valid leads.
- An active manual Enterprise subscription and no recorded commercial contract may coexist. Audit
  the explanation and canonical records before treating this as a billing-state defect.
- Zero tokens on settled local usage rows need provenance checks: fixture rows or provider-omitted
  usage differ from lost accounting. Raw member IDs are a separate presentation observation.
- A recorded failed provider call does not prove a current outage. The status check's limited scope
  is confirmed; its top-level wording and treatment of current route health need inspection.
- The esbuild deadlock is an observed process-exit symptom, not yet a proven root cause. Determine
  whether child-process failure, parent termination, memory pressure or launch configuration caused it.
- Model-policy “AVAILABLE” versus “not live,” and zero indexed connectors versus curated top entries,
  may conflate policy eligibility and runtime availability. Verify the distinction before repair.

## Authoritative records

Reuse these owners; create no second task ledger:

- `QA_COVERAGE.json`: scenarios, requirement references, conditions, attempts, evidence validity,
  execution versus reuse, and outstanding assertions.
- `QA_ISSUES.md`: defect reproduction, confidence, cause, related cases, repair attempts and acceptance.
- `LAUNCH_PLAN.md`: this dependency order and work-package acceptance criteria.
- `PROGRESS.md`: compact checkpoint and exact next action.
- `PRODUCTION_REMAINING.md`: only assertions needing the release environment.
- local audit artifact `items.jsonl` (path and fingerprint in [QA_COVERAGE.json](QA_COVERAGE.json)) and `decisions.jsonl`: original requirement IDs, source lines,
  wording and historical decisions. `CORRECTIONS.md` preserves audit limitations and security findings.
- `ACTIVE_ISSUES.md` and `docs/agent-context/known-flaws.md`: canonical unresolved defect ownership.
  Link or update existing IDs rather than create duplicates.

## Planned sequence

| Order | Work package                                | Work and dependency                                                                                                                                                                                                                                                                                                                                                                        | Acceptance before moving forward                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | Reconcile scope and evidence                | Correct the above misclassifications. Index website-relevant requirements from Parts 2–10, browser-visible 11–14, 15–16, relevant 17 controls and 18 launch criteria. Classify each as local, partial-local, production-only, blocked, outside website scope or non-browser verification. Preserve IDs and wording.                                                                        | Every applicable requirement has a disposition and scenario/evidence pointer; exact website denominator is known. Missing mappings stay NOT_RUN. No unsupported coverage percentage.                                                                                                                   |
| 1     | Stabilize the local test environment        | Capture launch command, redacted effective configuration, dirty-tree fingerprints, process exit code, memory and bounded logs. Investigate the two dev-server exits and differing startup validation. Resolve local OAuth-origin mismatch and schema drift through the canonical owners. Review 0273 before any local apply; never rewrite an applied migration or its checksum.           | The previously failing navigation sequence completes without unexplained process exit; local data/cache targets are verified; schema state is explicitly reconciled; sensitive environment values never enter reports. A restart alone is not a fix.                                                   |
| 2     | Finish missing discovery and qualify causes | Use the matrix below to execute only untested locally reachable assertions. Investigate existing failures enough to identify their canonical owner. Map related symptoms into small repair groups, without assuming one common root cause.                                                                                                                                                 | Each reachable area is covered or has a specific blocker, prerequisite and next action. Each repair candidate has a reproducible case, source boundary and acceptance test.                                                                                                                            |
| 3     | Security, identity and data integrity       | Address the Enterprise owner audit failure and verify active/inactive/foreign-workspace boundaries. Resolve the effective-policy overview discrepancy. Reassess the frozen audit's untrusted-source approval, legal-hold, eDiscovery cascade and audit-table erasure findings against current code, including 0272/0273 and existing repairs. Review the canonical connector-policy issue. | Positive authorized reads and negative tenant/role cases pass; audit/auth failures have useful recovery; legal holds and deletion semantics remain correct; no policy bypass or cross-workspace disclosure. Historical security findings are individually verified fixed, open or release-conditional. |
| 4     | Core chat, saved work and latency           | Repair stale failed state above successful answers and raw provider codes through existing state/error owners. Complete stream/stop/retry/reopen and draft/ordering checks. Separate cold compilation, request preparation, provider first event, first visible text and persistence timing.                                                                                               | One coherent terminal state; no duplicate message or charge from retry; drafts/history survive expected transitions; errors are actionable. A successful explicit-Luna sample must verify actual route/model, response and reopening before claiming end-to-end latency improvement.                   |
| 5     | Responsive navigation and accessibility     | Address mobile drawer controls, composer overlap and tablet Work-dock collapse as separate acceptance cases, merging repairs only if source proves a shared cause. Name Projects search and correct the workspace grammar.                                                                                                                                                                 | Existing content works at 360, 390, 768 and 1024 widths; drawer controls, model/reasoning controls and Close/Back remain reachable; no accidental clipping or scroll trap; keyboard focus and accessible names pass. Test only affected desktop behavior.                                              |
| 6     | Usage, billing and availability             | Resolve genuine accounting/display gaps after inspecting record provenance. Clarify manual subscription versus contract state. Reconcile model-policy and connector-directory labels with their canonical meanings; revisit the status wording and public claims using corrected evidence.                                                                                                 | Spend/turn/token views faithfully explain recorded data; meaningful member/provider labels; billing pages agree; current eligibility is distinct from availability. Free, Basic, Pro, Max5x, Max15x and Enterprise gates remain enforced.                                                              |
| 7     | Integrations and deferred functional cases  | Finish locally supported files, artifact persistence, connector lifecycle, approvals, schedules, notification and voice-interface assertions from package 2. Use harmless isolated fixtures; respect login handoff. External/provider-dependent cases remain explicitly blocked.                                                                                                           | Actual outputs and bytes exist and reopen; permission/cancel/retry states are correct; failures never become empty-state success; required integration cases have either valid evidence or named prerequisites.                                                                                        |
| 8     | Targeted acceptance and handoff             | Revalidate repaired failures and precisely invalidated passes. Run required affected checks. Reconcile the ledger and produce the minimal production verification queue.                                                                                                                                                                                                                   | No open local P0/P1 in the agreed launch scope; remaining lower-priority defects explicit; every required local assertion passed/reused or clearly blocks acceptance. Local readiness never implies production approval.                                                                               |

A serious data exposure or integrity issue found at any point interrupts its affected path and takes
priority over the sequence. An external blocker does not stop independent local work. Each package
is a series of small reviewable changes, with one active issue and one writer for shared owners.

## Discovery gaps that must be accounted for

The last Browser pass inspected many pages and several interactions. It did not exhaust every
workflow below; a rendered page is not a functional pass.

| Area                          | Reuse where conditions match                                                                                | Remaining discovery or prerequisite                                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth/account                  | Existing demo login, session display, natural Free project allowance, account export byte tests             | New signup/email challenge, recovery/MFA boundaries and session expiry; user takeover when needed; real identity-provider erasure remains separate.                                                                    |
| Chat/history                  | Arithmetic/recall/reopen, search result navigation, saved responses                                         | Stop/edit/regenerate/branch, draft survival, streaming order, pinned Luna after transitions, retry idempotency and useful rich-content rendering. Paid generation blocked by provider prerequisite.                    |
| Projects/files/Library        | Instruction clear/save, revisions, source/media byte and authorization tests, empty/filter states           | Instance-specific upload validation, preview/retrieval/citations, artifact existence/reopen and relevant scope transitions. Distinguish fixture tests from actual storage.                                             |
| Tools/Work/Research/Code      | Approval hook/route recovery tests and saved failed Work state                                              | Browser approvals/cancel/resume, consequential action idempotency, actual tool evidence; browser-visible Code and Research flows were not comprehensively exercised. No native-surface testing.                        |
| Connectors/MCP/skills/plugins | Directory/settings reads and known policy tests                                                             | Discovery versus available catalog, install/enable/disable, expired/revoked authorization, workspace policy enforcement and useful failure states. Disposable external accounts/configuration required for live OAuth. |
| Settings/privacy/memory       | Existing serialization/privacy, preference, workspace-cache and account-layout evidence                     | Remaining setting-specific persistence, failed-read versus empty distinction, memory consent/scope and isolated cache invalidation.                                                                                    |
| Voice/notifications/schedules | Dictation-toggle enforcement, notification recovery, schedule validation and empty state                    | Hardware permissions/cancel, scheduler persistence and execution accounting, real delivery. Do not invoke non-Luna voice generation or external notifications just to inflate coverage.                                |
| Commercial/Enterprise         | Existing tier gates, real-DB quota probes, Max15x ratios, domain rejection, inactive membership checks      | Contract-aware usage provenance, owner audit, role-specific isolation, SCIM/SSO lifecycle and billing webhook reconciliation with isolated prerequisites.                                                              |
| Public/accessibility          | Help search/full article, Pricing controls, security headers, skip-link and prior account responsive passes | Relevant remaining public links/claims; keyboard/zoom/theme/reduced motion and landscape assertions affected by failures. Resized desktop Browser is not physical-device or screen-reader proof.                       |

No new inference is needed merely to inspect saved content at another width. The four canonical
billing/usage hashes still matched in the previous pass; preserve that evidence until relevant code,
schema or conditions change. Max15x means 15× Pro managed-usage budgets in monthly, weekly and
five-hour windows, not 15× every limit or a fixed prompt count across differently priced models.

## Initial requirement anchors

These verified IDs seed the mapping; they are not the complete website denominator. Source lines
refer to the frozen `checklist.md` represented in `items.jsonl`.

| Requirement ID         | Source location         | Requirement                                                                            | Planned coverage                                                                           |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `850b498116f00e91db37` | line 19141, §4.308      | Composer works on desktop, mobile and tablet.                                          | RESPONSIVE-CHAT-NAV-WORK, package 5                                                        |
| `605ba570978fb49f8064` | line 185184, §18C2A.491 | mobile drawer/major navigation broken.                                                 | No-go condition; drawer acceptance, package 5                                              |
| `e40f3ae0f02298879c66` | line 19139, §4.308      | Retrying consequential tools cannot duplicate side effects.                            | PERMISSION-RECOVERY and retry cases, packages 3–4                                          |
| `6669a22c8041aa7db019` | line 14478, §4.2        | Retention/legal hold rules override physical deletion where required.                  | DATA-CONTROLS, package 3                                                                   |
| `66905af47081f4fda557` | line 114801, §16A.0     | every settlement must reconcile to a reservation or documented unreserved usage event. | Usage provenance/reconciliation, package 6                                                 |
| `5e9f5c6d887234c85063` | line 119662, §16A.608   | settlement can happen twice.                                                           | No-go condition; duplicate settlement must be prevented, package 6                         |
| `6f4ce1271cb15e1e1faf` | line 181805, §18C2A.0   | New users must be able to see service status.                                          | STATUS-EXECUTION-SIGNAL; accessibility separate from inference health                      |
| `0da485fee68853bd7a77` | line 185153, §18C2A.490 | account export falsely claims completion.                                              | No-go condition; retain byte-level evidence and external limits                            |
| `98d7538c0694c3c6b483` | line 185154, §18C2A.490 | account deletion falsely claims completion.                                            | No-go condition; retain local erasure evidence, external identity/storage still unverified |

Keep requirement polarity: a checklist row describing an anti-pattern or no-go condition is not a
request to implement that behavior. Historical `done` status does not establish current runtime proof.

## Repair and verification contract

For each issue: confirm evidence → trace canonical owner → select bounded approach through Jev →
implement → run focused checks → observe affected Browser acceptance → update the same ledger.
Use systematic-debugging for failures and the existing frontend/Browser review workflow for visible
acceptance. Load a security skill only for a relevant confirmed boundary investigation. No workers
are started by this plan.

Record OPEN, FIX_IMPLEMENTED, VERIFIED_FIXED, STILL_FAILING or BLOCKED independently of the test
outcome. Preserve earlier failures. Cap repairs at three attempts per issue; after repeated failure,
change hypothesis or checkpoint and select independent useful work. Never retry an unchanged paid
failure or change Luna to bypass it.

Before reusing a pass, check source/configuration and relevant role, plan, workspace, data, input and
viewport conditions. Before invalidating one, name the dependency change and smallest affected
assertion. Unit tests do not substitute for the repaired Browser interaction; repeated screenshots
and timestamps are not substantive progress.

Latency acceptance first requires a valid measurement instrument and a successful bounded sample.
Use repository SLOs if defined; otherwise report observed timing and its cold/warm/provider limits
without inventing a threshold or claiming statistical reliability. Keep build/typecheck and Browser
work separate under memory pressure. Stop owned heavy processes at a checkpoint.

## Completion gates and exact next action

Discovery gate: website requirement accounting is complete and every reachable missing scenario has
been executed or has a specific documented blocker. Until then, the broad pass is partial.

Local acceptance gate: applicable critical requirements have functional evidence; no open P0/P1 is
hidden by a generic “passed” page label; output persistence, authorization, quotas and graceful
recovery are verified. A required blocked scenario prevents LOCAL_SCOPE_VERIFIED. Preserve GLOBAL
NO-GO until the separately authorized release process resolves production assertions.

Production handoff: intended build/domain, real auth origins/cookies, minimal Luna stream and reopen,
actual upload/download path, deployed schema/grants, billing/webhooks, queues/indexing/schedules,
notifications, monitoring and relevant cache transitions. Execute none of this during localhost work.

Exact next action after planning: reconcile the current issue dispositions and extend the existing
coverage ledger with original website requirement references and explicit NOT_RUN/BLOCKED areas.
Then investigate the runtime exit and local schema/configuration prerequisites before resuming the
missing Browser workflows. Do not start with cosmetic repairs or replay the passing suite.

Planning decision: Jev selected `evidence_gate_then_risk_order`, confidence 1.00, and
`bounded_debug_and_browser`, confidence 0.55; request
`d4f3c33e95fbe13537fe9e409679806c6943b7283429ed1bc1805769fd4fabe7`.
The existing developer helper contract and installed skill were used; live TypeSafe documentation
was unavailable through the web tool. No new integration or undocumented API was introduced.
