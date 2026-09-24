# Website launch working ledger

Status: In progress
Owner: Website launch preparation
Last updated: 2026-09-23

This is the entry point for current work. Historical audit artifacts remain immutable. Their local paths and fingerprints are
recorded in [QA_COVERAGE.json](QA_COVERAGE.json); they are not tracked documentation links.

Read [LAUNCH_PLAN.md](LAUNCH_PLAN.md), [QA_COVERAGE.json](QA_COVERAGE.json),
[QA_ISSUES.md](QA_ISSUES.md), [REFERENCE_INDEX.md](REFERENCE_INDEX.md),
[DEMO_CHAT_FINDINGS.md](DEMO_CHAT_FINDINGS.md), [JEV_ARCHITECTURE.md](JEV_ARCHITECTURE.md),
and [PRODUCTION_REMAINING.md](PRODUCTION_REMAINING.md) before continuing.

## Current state

The 2026-09-23 re-audit reconciled the separately named worktrees and run
directories with current main. None contains an item-level reassessment of the
9,597 historical partial requirements: the 700-row current-verification
overlay covers only the historical unverified cohort. Consequently zero
partial rows currently have a proved completion decision and the completed
total is unknown. The worktree ancestry, broad validation results, persistent
web failures and concrete resolution sequence are maintained in
[ACTIVE_ISSUES.md](../../../ACTIVE_ISSUES.md#checklist-reaudit-2026-09-23).
This does not change the historical counts or grant launch approval.

Source identity and preexisting dirty file hashes: [source-baseline.json](source-baseline.json).
No existing changes discarded. Production migrations 0249–0273 applied on 2026-09-20
with snapshot, local database archive and production-clone rehearsal; 273 applied,
zero pending and zero drift. Application changes and migration evidence pushed to main at833c6d336 with all
pre-push hooks passing; no deployment is claimed.
Audit decisions independently counted: 7,803 done; 9,597 partial; 5,076 missing; 6,639 unverified.
All 29,115 reviewed. Historical GLOBAL NO-GO preserved.
Seven historical drift entries affect Jev tooling/workflow/dependencies and a routing-document date;
none establishes a current website runtime pass. Do not regenerate the snapshot.

Jev selected implementation/QA (0.93) and systematic debugging (1.00), request hash
84b2aae71d999fc6fbe77a7fe2097c08827c4879dc08bb68d36ebf1090186c46.
No private demo data supplied. Product conversation routing unchanged.

## Production migration checkpoint, 2026-09-20

All 13 read-only post-migration checks passed on production and the rehearsal
clone. Active/suspended membership and custody deletion behavior also passed in
a rolled-back clone transaction. Recovery identifiers and evidence are recorded
in [the deployment handoff](../../work/deployment-handoff-2026-09-19.md).
The object-storage backup release gap and historical GLOBAL NO-GO remain.

## Current runtime checkpoint

Fresh isolated PostgreSQL17 and loopback Neon websocket proxy are running. User authorized
creation; no historical demo content was recovered or copied from production. Canonical local
migration apply reached270; zero pending/drift at that verification. All26 live adapter contract
tests passed. Redis now runs on loopback6379. Shared remote cache and telemetry remain disabled
by process-only overrides. Clerk test sign-in and user terms acceptance completed.

Luna returned a correct first answer, persisted across reload, and recalled the synthetic label
after server restart. The user's slow-response report is reproducible on cold startup:17.2s,
including8.7s Next compilation and a2s durable first-event fallback. One distinct warm latency
sample completed in4.1s, compilation53ms, durable first event210ms, model stream-start2208ms,
with no timeout. Keep the development server warm. No timeout or safeguard weakened. These
samples do not establish production latency or capacity. Jev selected warm measurement with
0.97 confidence, hash740ab405206f5192acdfe52defb6697b2a16b5d1c39b8d69520c585b2cd83ec6.

## Repair and validation

Landing skip navigation fixed on the existing main; verified desktop and mobile-width keyboard
focus. Focused lint/format passed; regression discovered, behavior exercised through Browser.
Web typecheck passed. Documentation moved under this existing feature-status exception;
doc registry, reference integrity and model-literal checks pass after focused corrections.
Remaining guard failures concern concurrent em-dash changes, desktop mock exports and feature
baseline, plus the production migration-dependency gate. No guard changed to force a pass.

## Remaining scope

Original demo history is unavailable in this fresh database. Broader workflows, isolated uploads,
durable artifacts, failure/permission paths and production release gates remain open. The user
prioritized response latency over expanding testing. No website launch approval, commit, push,
deployment or production migration has been performed. Historical GLOBAL NO-GO remains intact.

## Catalog latency repair, 2026-09-19

Independent managed-directory, plugin settings, install overrides, authored skills and optional
directory reads now overlap in the canonical skill-catalog service. Shared plugin filtering,
install overrides, draft filtering and merge precedence remain enforced after reads complete.
The deferred-settings regression failed before the change and passed afterward. The final
catalog and request-processor skill-offer suites passed49 tests. Focused ESLint, Prettier and
web typecheck passed. Test fixtures logged unavailable optional database services; these unit
passes do not replace the separately recorded live adapter checks.

Post-change live Luna reply completed correctly without fallback: skill catalog19ms, request
preparation1768ms, provider stream-start1726ms, total4.4s. Prior sample: skill catalog216ms,
preparation1416ms, total4.1s. Single samples with differing cache/load/provider conditions do
not establish an end-to-end improvement. The deterministic regression proves removal of
serial I/O; cold compilation and overall response latency remain open. No timeout, model,
authentication, permission or safety policy changed.

Jev selected overlapping catalog reads with0.91 confidence; request hash
499e71a78efc1aed3a8dcbf65456846df790c47c83cb755fe4f0e7e2e9bb53ab.

## Remaining latency investigation

The provider stream-start span ends at the first iterator event, which can be metadata; it
is not a first-visible-text metric. The completions route duration also excludes client-side
conversation creation, token acquisition and the awaited user-message save in useChatStream.
Measure submit-to-visible-text and submit-to-completion before claiming end-to-end gains.

cloudAgentWorkflow schedules ensureWorkPlanForRun even for ordinary chat, where the step
returns immediately, and clearCloudAgentDevice even without a device declaration. These are
concrete candidates for avoiding workflow round trips before inference. Keep invocation input
validation and all applicable device checks, cancellation, replay and durability. The measured
enqueue plus durable-first-event spans total434 to599ms within preparation; this is not a
promised saving and must not be added again to the preparation total.

The client also awaits prompt persistence before inference. Consider a single authenticated,
idempotent persist-and-start endpoint after the smaller workflow change; never fire-and-forget
the save. Benchmark lower reasoning effort only after checking the actual intermediary route
and quality. These are proposals, not implemented or verified improvements.

Jev chose skipping inapplicable workflow steps with0.95 confidence and production-like
end-to-end measurement with1.00 confidence; hash
103af8f3aab6c7cb66e0e0c96683284a460a5489a48cd2fd3bcb3fe2d14276ef.

## Workflow latency repair checkpoint

Previous goal turn produced source-backed evidence that changed the next action, rather than
only a status restatement. Implemented the selected workflow change: ordinary chat avoids
work-plan initialization/settlement; runs without a device avoid the device-clearance step.
Actual device declarations still revalidate on every invocation. Input validation remains in
the invocation step. Failure handling and durable stream closure remain active.

Two regression assertions failed before the patch. All59 scoped tests passed afterward across
workflow device clearance, input validation, unread stream, permissions and settlement; focused
ESLint passed. Local production build is running to remove development compilation from the
next measurement. Browser verification of this changed path remains pending.

## Continuation setup and launch checkpoint

User requested a real project-scoped Stop hook. Installed desktop runtime is0.154.0-alpha.6.2;
terminal CLI0.147.0. Official hooks documentation reviewed. One synchronous Stop handler plus
Interrupt/UserPromptSubmit control handlers are in .codex/hooks.json. They bind only this
coordinator session and resolved worktree. Existing Browser/Chrome/computer-use cleanup hooks
are preserved. No global config, model, permission, compaction or trust setting changed.

Nineteen harmless fixture tests pass, including concurrent duplicate events and disabled-run
completion rejection. Goal, compact continuation and usage documents are present. Run state is
armed with20 continuation/four-hour ceilings; counters and deadline were not reset. Owner trust
review and a real runtime continuation are NOT yet verified. The owner review question is pending.
See HOOK_USAGE.md for exact /hooks review and pause/disable commands. Do not fabricate activation.

The workflow latency patch passed59 tests and the full local production build passed compilation,
TypeScript and381 static pages. Production-mode startup rejected missing Redis REST credentials,
local HTTP origins and missing EMAIL_HASH_PEPPER. Do not use AGI_ALLOW_INVALID_ENV. Development
server restored on localhost3100, exec session95672. Postgres and Redis remain running; Neon
websocket proxy is session13054. Build session53462 completed successfully; failed start session
71384 was terminated after confirming its listener. Logs are in /tmp/agi-local-production-*.log.

Project UI reached /chat/projects. Source inspection found clearing instructions omitted the
field from JSON; regression confirmed old server instructions survived. Fixed to send null and
normalize only the UI callback.39 project tests pass, focused lint/format pass. Browser lost
connection before create/save/reopen assertions: available browser list was empty after documented
recovery, no alternate driver used. Keep these cases pending runtime verification.

Current changes: skill catalog overlap; landing skip target; conditional workflow steps; project
instruction clearing; project-scoped continuation mechanism and existing launch records. Branch
remains codex/website-launch-preparation-20260919; preserve unrelated dirty work. Evidence summaries
are under evidence/. Existing landing, CTA, auth, synthetic context/persistence passes remain valid
within recorded dependencies; do not replay them merely because this checkpoint was written.

Exact next actions: finish owner trust review and observe one real bounded Stop continuation,
then verify changed workflow/project paths when Browser reconnects. Production boot investigation found the plain Redis sliding-window limiter is intentionally
non-atomic and development-only; the Upstash requirement is justified. Do not relax it.
An isolated production-capable limiter, local HTTPS and email pepper remain setup prerequisites.
Original demo data and isolated upload storage remain missing. Production queue remains separate.

Final hook setup checks:19 fixture tests pass; documentation registry, reference integrity,
model-literal check and scoped diff checks pass. No runtime Stop or matching generated user
prompt has been observed. Owner review remains pending; no trust record was written.
The armed run retains its original start/deadline and zero automatic continuations.

## Reconnected Browser checkpoint

Browser recovered. Project instruction repair now passes create, save, reload, reopen, clear and
reload/reopen assertions. Evidence is in evidence/project-instructions.json. A missing subscription
row blocked the natural new-account path; local Free fixture enabled the bounded test without
changing credits or entitlement logic. Jev selected the fixture with0.45 confidence, hash
8ca3545f65a5fdfd44b65181695c99119aa3e2adf5ea2d556c0978db2161a374.
Next: verify changed chat workflow with the remaining justified test turn, then investigate the
new-account entitlement discrepancy. Hook activation remains unverified; original limits retained.
User reaffirmed tool/testing/migration authorization; routine confirmation questions are unnecessary.

Changed workflow Browser request failed because the configured provider API has no credits.
No repeated paid request, model rotation or quota reset. UI recovered to Response failed with
model-picker/regenerate controls; successful workflow timing remains unverified. Cold dev path
again compiled and fell back after the2s durable budget. evidence/workflow-latency.json records
the attempt. Account/project controls remain independently testable. Canonical entitlement bundle
marks absent subscription entitlement_missing; do not turn the fixture into a policy bypass.

## Temporary-chat privacy repair and plan-test steering

Browser reproduced default temporary on but composer off. Nullable per-chat choice now inherits
the settings default only when unset; explicit false remains false through send creation. Browser
verified banner/menu, off override and fresh-chat reset. Original privacy preference restored off.
Focused tests48 passed, extended creation suite27 passed; lint passed. Evidence in evidence/temporary-chat.json.
Typecheck found concurrent connector audit change bound organizationId in GET instead of upsert;
corrected only those bindings, preserving audit behavior. Typecheck rerun pending. Local migration271
applied after runtime reported missing maturity column:271 applied,0 pending,0 drift.

User now explicitly authorizes local subscription upgrades and credit fixtures and requests Free,
Basic, Pro, Max5x, Max15x limitations in that order. Jev selected canonical-policy matrix1.00,
hash3569ac8db17c57bd567fc24e3eaeceae9f452edff0af8396d9e39577d191c6de.
Provider credit exhaustion is separate; do not pay or repeat failed inference. Next: Free UI and
server limits, then successive local tier fixtures derived from canonical catalog and usage policy.

## Local plan matrix checkpoint

Completed sequential local fixture transitions Free, Basic, Pro, Max5x, Max15x. Free second-project
UI rejection and Basic second-project creation verified. Database resource guard accepts each
finite project cap and rejects overflow; unlimited plans accept the bounded sample. Browser shows
image/AGI Work at Pro and above, video only at Max15x in this matrix. Canonical local credits were
allocated through CreditService, retaining existing usage. Final local account is Max15x.
All24 paid rolling-budget assertions passed (at limit and one microUSD above for session, weekly
and flagship weekly across4 paid tiers); all probe writes rolled back, zero provider calls.
Additional44 policy/permissions,59 managed-usage/durability/run,41 Free/model tests passed.
See evidence/plan-limits.json for limits, source hashes and unverified capabilities. Snapshot of
original local billing rows is /tmp/agi-launch-billing-snapshot.json; no remote billing mutation.
Typecheck next exposed the same misplaced organizationId binding in run cancellation; corrected
GET/cancel bindings while preserving concurrent audit work. Final typecheck running, session12716.
Next: inspect remaining storage/connector/scheduler enforcement gaps without paid inference,
and retain provider credit exhaustion as the generation prerequisite. Hook trust still unverified.

## Validation and isolated upload setup

Web full typecheck passed (NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @agiworkforce/web typecheck; /tmp/agi-launch-typecheck-final.log). Five narrowly corrected audit organizationId bindings preserve concurrent audit work. Additional resource suites passed68 tests across5 files.
Jev selected existing local file-storage fallback with1.00 confidence, request hash d5159b66b94997e66c28ec94abf5153f3b44d2357d13f06ca95d8fffa3c3923c. Restarted only owned local dev server with process storage credentials cleared and provider none. Cleared Google/gateway embedding credential aliases for this run: upload automatically dispatches indexing, so semantic indexing is deliberately unavailable while testing local bytes/extraction. Environment file remains unchanged. Next: upload /tmp/agi-launch-source.txt to synthetic QA project and verify persistence; no paid generation requests.

Local source upload unblocked and verified. Revisions exposed and fixed stale source cards: successful upload now refreshes canonical list, preserving separate retry on read failure. Two regressions failed before;10 tests pass after. Browser version3 shows1 source immediately and DB preserves3 versions/1 current with correct extracted text. Evidence: evidence/project-sources.json. Semantic indexing deliberately unavailable; keyword fallback observed. Next: preview version3, record lint, then select remaining independent launch task from the plan.

Data controls: source download clicked (saved bytes unverified), account export200, source removal/bulk deletion confirmations canceled without mutations. Corrected contradictory permanent-delete copy to match existing soft deletion and Recently deleted label; Jev align_copy1.00. Browser rendered corrected row; focused lint passed.11 export/privacy tests plus5 structural export guards passed. Detailed evidence/data-controls.json. No provider generation retried.

Public claims: pricing individual caps align with tested policy;45 pricing tests pass. Corrected landing every-command-prompts overclaim to describe CLI modes accurately; anonymous HTTP render verifies new copy, lint passed. Keyboard landmark/focus code unchanged; no replay of passing keyboard workflow. Repo organization and doc registry guards pass. Download review found missing HTTP status check that could save error bodies as files; focused regressions now running before repair.

## Owner steering and next inventory

Owner now requests Enterprise testing using the supplied demo account credentials, email/domain validation, professional error messages, layout/caching and broad settings checks. Password stays only in the conversation/browser credential entry, never evidence files. Use Luna only for necessary chat QA; skip image/video generation per owner. Inventory observed errors and unverified areas first, then handle one issue at a time, at most3 repair attempts before recording a blocker and moving on. Existing valid passes remain reusable.
Download recovery repaired and verified:3 regressions pass, Browser404 displays retryable error, restored source retry200. Latest web typecheck passed. Free natural enrollment trace is pending: no-row entitlement deliberately fails closed; personal Free row insertion can shadow organization seats because own row takes precedence, so no speculative enrollment edit made. Existing buildFreeWebsiteSubscription is a generation-specific synthetic subscription and must not be copied as a global authority. Next: create category inventory from current evidence, inspect settings/enterprise validation, then prioritize the raw HTTP400 message.

Project-limit presentation now browser verified in the actual inline Projects form. Both creation paths preserve a helpful canonical allowance explanation without HTTP codes.107 focused tests pass. Max15× local plan restored; credit allocation untouched. Next: Linked devices500; server evidence identifies uuid/text comparison in credential-family lookup. Enterprise and expanded settings inventory remain pending.

Natural Free project creation now browser verified without a subscription fixture: first project succeeds, second is refused. Canonical resolver also covers eligible seats and inactive paid status. Demo identity signed in through supplied password and UI terms gate; original account content absent. Next: seed only a local Enterprise subscription for this authorized demo and exercise workspace creation/domain validation. No model inference used in this batch.

Current checkpoint: raw project HTTP errors, natural Free first-project access, linked-device SQL lookup, settings activity/avatar error wording, and contract-aware Usage presentation repaired with focused regressions. Enterprise local workspace and inactive SSO challenge created through UI; malformed/public domains and missing DNS proof correctly refused. Max15× budgets confirmed. Settings-to-workspace links now reuse existing SettingsPageLink;15 navigation/usage/help tests pass; final recovered-browser click underway. Server esbuild deadlock interrupted verification; restored same isolation overrides in session17327, log /tmp/agi-website-launch-server-recovery.log. Browser tab2 stranded on internal network-error page; recovered tab4 now usable. Local Enterprise account remains selected. Latest full web typecheck running (session50189). Next: finish navigation confirmation, record evidence, continue Help destinations and bounded Enterprise policy/isolation cases. No image/video generation or paid chat inference in this batch.

Latest checkpoint09:54UTC: Settings link closes the modal in recovered Browser tab4. Full web typecheck passed after correcting test fetch mock typing. Help stale-response and excerpt/count repairs pass13 tests; Browser credits search is readable and desktop has no horizontal overflow. Article destinations still need full content access/accuracy review. Jev selected Enterprise tenant/role isolation next (0.98). Continue bounded existing isolation/cache tests and inspect their instruments, no paid inference. Current server17327 and local Enterprise fixture retained. Hook remains untrusted/unverified; original counters/deadline unchanged.

Checkpoint10:04UTC: Enterprise suspended/deprovisioned access repaired, including append-only local migration0272 and canonical workspace/role/seat resolution. Real PostgreSQL proves active46 permissions, suspended/deprovisioned0 with no role/read/write; seat candidate SQL now active1 versus inactive0. Probes roll back fixtures.37 boundary,49 consumer,40 entitlement/sharing tests pass; full web typecheck and migration guard pass. Local272 migrations,0pending/0drift. Matching production release queued. Existing RLS probe now contains the membership regression. Generic timeout recovery copy corrected (14tests).

Runtime: repeated database connection timeout after HMR despite directPG/nativeWebSocket probes succeeding. Jev chose one owned restart (0.82); same process isolation restored session78519, log /tmp/agi-website-launch-server-recovery-2.log. Browser tab4 remains valid. Active Enterprise usage now renders;174ms warm route200 and usage analytics200. No claim that underlying transport cause is fixed. Demo account/workspace remain selected; owner status/license/fixture writes rolled back.

Next selected voice/notification controls (Jev0.99, request7b373c5d90c3fb8300b61dba9947f623fcabc6780945f4a60b7d12de03c42ab4). Five targeted suites running session69578; Browser tab4 navigating /chat. Verify controls without microphone capture/provider calls, preserve existing preferences, then continue unresolved Help article access/mobile layout. No generation this batch. Hook trust/runtime activation still unverified; original20/four-hour limits remain intact, no counter/deadline reset.

Checkpoint10:11UTC: Dictation toggle now actually disables composer/shortcut capture; hook and store cancel pending grants/transcripts safely (46tests,2 regressions failed before). Browser off-state verified; original dictation on restored. Notification preferences serialized with load/save guards, rollback and retry (41settings tests,4 new failures before). Browser save/reload/restoration verified. Generic/read-aloud copy scoped accurately. No audio, image/video or paid inference.1280×720 notification screenshot/DOM has no overflow or clipping; mobile remains unverified. Full web typecheck session38744 running, /tmp/agi-voice-notifications-typecheck.log. Source/evidence in data-controls.json and plan-limits.json. Current tab4 remains on Settings > Notifications; server78519 healthy after one bounded recovery. Next: finish fresh typecheck, then remaining Help article access/content or available viewport layout review. Do not replay passing cases. Retain original hook deadline/counters and unverified trust/activation.

Checkpoint: Help full articles and two source-proven content corrections verified in Browser;22 focused tests,18 corpus tests, corpus check, lint and full web typecheck pass. Generated corpus extra diff is formatting only outside the two changed articles. Evidence in data-controls.json. No generation. Next Jev-selected workspace-selection discrepancy investigation (0.53, dbc17fa7d6d14b590cb42861bdddd1e22949decff89d3e0c1f4f9b3aef906cef). Browser tab4 at /help/voice; server78519. Original hook deadline/counters retained; trust and activation unverified.

Checkpoint10:21UTC: workspace selection fixed and verified both directions in Browser; restored Enterprise.23 route/menu/active-workspace tests, realSQL membership filters, full web typecheck/lint/format pass. Workspace error transport normalized with shared formatter and retained status;10hook/menu tests and lint pass. Existing global toast owns feedback, no duplicate handler. Evidence in plan-limits.json and data-controls.json. Repo organization and doc registry pass; mock-export scan session21503 still running, additional affected guards underway. Next inspect relevant guard findings; no broad replay or paid generation.

Checkpoint10:27UTC: privacy preference race repaired,83 affected tests pass; Browser opt-in/save, opt-out/save/reload verified with original telemetry/temporary false restored. Pending local opt-out prevents stale document/cache consent from resuming collection; account-save retry explicit. Source/evidence data-controls.json. First tsc found two test fixture types, corrected, rerun session54322. Current tab4 Settings>Privacy; server78519. No external telemetry/generation. Remaining provider-funded flows and download bytes unverified; no export artifact found. Hook original20/four-hour bounds retained and trust/runtime activation still unverified.

Checkpoint10:33UTC: independent GET team profile access now uses canonical active membership resolver;38 tests, real SQL active/inactive probe and full web tsc passed. Active Enterprise UI list renders. Profile backfill extended; verified-email-only path tested, existing identity preserved in real SQL. Demo identity lacks verified email and upstream name, confirmed metadata-only via test identity API; no verification changed. Second display-only repair uses existing visible-name fallback; DB now has name, email remains absent.14 final tests pass. Browser tab4 reopening /settings/team; inspect final member name, then fresh final affected checks and next inventory task. Evidence plan-limits/data-controls; no generation or external messages. Original hook bounds/trust status unchanged.

Checkpoint10:36UTC: repeated Neon WebSocket checkout timeout reproduced. Canonical native postgres provider now selected only in owned local dev process;13 live adapter contract passes (Neon13skipped). Server65593 PID89149 log /tmp/agi-website-launch-native-postgres.log, old78519 exited. Same isolation flags, auth/RLS/timeouts. Browser tab4 /chat recovered; one warm reload1148ms to composer, route300ms; cold12.1s mostly10.9s dev compilation. No inference or production latency claim. Final typecheck session7374 and mock-export guard31070 running after latest repairs. Next finish these and continue remaining prioritized local inventory; no replay of previous passes except affected runtime checks.

Checkpoint: Enterprise contract-aware billing presentation verified in Browser;25 Team/BillingSummary and18 Contract/BillingSummary tests pass, focused lint passes. Full web typecheck81428 passed before final optional missing-contract prop. Mock-export guard now passes3368 files after correcting partial import mock;11 affected privacy tests pass. Current server65593 native local PostgreSQL; tab4 workspace billing. Next: focused approval HTTP/auth recovery regression, Jev0.99 request5cdea831b4eb8cb05a5c2d2e2a0eb63d39e7e35679a3fe2c18cdbcf8007514a9. No inference; original hook limits and unverified trust retained.

Checkpoint10:49UTC: approval recovery fixed;42 focused tests plus19 final hook cases pass, lint and full web typecheck55273 pass. Enterprise billing final prop covered. Usage freshness now renders pending settlement/as-of data using canonical type and truthful billing scope;26 API/service plus2 final component tests pass, lint passes. Browser tab4 /workspace/usage,1280px no overflow/clipped main text. Pending count fixture-only; no provider calls. Next narrow usage-hook raw numeric error normalization, then continue inventory. Server65593; hook bounds unchanged and trust/runtime activation still unverified.

Checkpoint10:56UTC: General preferences load guard and ordered save fixed;26 tests, focused lint, full web typecheck49648 pass. Browser Formal immediate save/reload verified then Default restored/reopened; Luna default retained, no inference. Shared SettingsModal desktop close-control overlap fixed;56 tests and Browser8px gap between close bottom and scroll-pane top verify. Intentional sr-only description excluded from clipping report. Usage error7 tests, billing label5 tests pass. Current tab4 General settings, server65593 native local PostgreSQL. Evidence data-controls/plan-limits updated; next select unresolved security/account/workspace inventory, preserve provider/exports/mobile evidence gaps. Original hook run/deadline/counters untouched; trust/runtime activation unverified.

## Release-tree validation checkpoint

The final release-tree web run is retained as red evidence:6914 suites contained22828 passes,
4 failures and5 pending tests. The failures were two legacy auto-title assertions that still
modeled the retired count-query decision and two stale generated-corpus checks after reviewed Help
changes. Tests now model the activation update's affected-row contract and the support corpus was
rebuilt through its canonical command to41 documents/215 chunks. The activation, corpus and direct
project-load rerun passes4 files/48 tests; an independent narrower rerun passes2 files/29 tests.
The original JSON remains `/tmp/agi-web-results-20260919-release-final.json`, SHA-256
`8b4b80a5eafb626d0cacf8d0fa1d877a3589b9aafed4bb9839511a8505806a42`.

A read-only freshness audit found15 stale source-hash references across13 dependencies. No hash was
promoted from drift alone. The dependency-focused web pass now passes191 files/1780 tests and the
complete shared UI package passes69 files/500 tests. All59 source/dependency hash references in the
four launch evidence JSON files match current bytes. Message activation and direct project loading
have explicit evidence pointers in `evidence/data-controls.json`; MarketingLanding's coverage hash
is reconciled with the already-current public-claims evidence. `AFFECTED-VALIDATION` remains pending
until repository-wide, CI, migration and exact-main checks complete. Hardware audio, downloaded
export-byte inspection, provider generation and production behavior remain outside this evidence.

## Workspace cache isolation checkpoint

Jev selected DATA-CONTROLS with 0.99 confidence (request
`59275ffa95c7b4c6d1eeeb5f0284df6009de5ffa08a9b1ccbd0377bf3f096a10`). A focused regression
proved that workspace switching retained the previous effective-policy cache and pending MCP
context selection. One repair adds those keys to the canonical workspace cleanup while preserving
account-level model preferences. Twenty-one Web workspace/cache tests, two Web policy-hook tests
and five client-runtime policy tests pass; focused lint, diff checks and full Web typecheck pass.
No provider request or production-cache mutation was made. DATA-CONTROLS remains pending for its
separately recorded export-byte, hardware, mobile and external-delivery limitations.

## Telemetry privacy-claim checkpoint

Jev selected a narrow claim correction with 0.94 confidence (request
`68eb7f8459af558bcd0e47b7d23062fbd045531c366592aaa5f128d5c9805758`). The prior Settings,
Help and public privacy copy incorrectly implied that all Sentry reporting was browser-consent gated
and that no message or prompt text could enter diagnostics. The revised copy matches the existing
implementation: browser Sentry is consent-gated; configured server and edge reporting is
operational; sensitive request fields are removed; free-text diagnostics can remain after secret
masking. The canonical Help corpus is current. Focused and broader claim suites passed 291 tests,
with focused lint, Web typecheck, i18n parity, docs:check, residual scans and diff validation also
passing. No external telemetry was generated.

## Browser permission-recovery checkpoint

Jev prioritized PERMISSION-RECOVERY with 0.29 confidence (request
`4b4d748cd1459d041831863080ee2295a5110fc46b2da96b574b2e6d26eb9b54`) and selected a
focus/visibility refresh with 0.92 confidence (request
`32ece9512193cee5c85745f5d27018466c1e2bc0fb05502fb66fc37fe075a270`). A regression proved
that restoring notification permission in browser settings left the in-app switch disabled until a
reload. The notification hook now re-reads permission and its subscription when the app regains
focus or becomes visible. Five focused files passed 43 tests, with focused lint, diff validation and
full Web typecheck also passing. No external push notification was sent; real provider/tool execution
remains a separate prerequisite.

## Account-export byte checkpoint

Jev selected DATA-CONTROLS account-export byte inspection with 0.69 confidence (request
`9df31bcbf48b45d8fcbe9b14a70f19515c64debcca25ecbb96bebbe8480d8bca`). A deterministic
fixture read the actual download Response through `arrayBuffer`, decoded its JSON and verified
representative profile/device data, a dated attachment filename, private no-store caching and a
complete status. Fixture Stripe and live device credential fields were absent. Seven export suites
passed 57 tests and focused lint/diff validation passed. No owner export was written to disk;
separate project-source and media download targets remain unverified.

## Mobile Account settings checkpoint

Jev selected the mobile DATA-CONTROLS case with 1.00 confidence (request
`5f72630ebb574a21f3f7eb225525b28aa9ddaa0d9a91e4752ca5d50104b51c4a`) and the
collapsed-metadata repair with 0.79 confidence (request
`17ab1bec62c00f7723960355d22cf91343b184f612cdad3c89f43273cf17f1ee`). At
390×844, the authenticated Account view placed a 597px active-sessions table inside a 388px pane,
putting its action column outside the initial viewport. Account now keeps Device and Actions visible
on phones and moves Location, Created and Last active into the Device cell; the full table remains at
the small breakpoint and above. The regression failed before repair, and four Account suites now pass
24 tests with focused lint and diff validation. Three bounded post-repair browser attempts reached the
local page but lost the in-app browser connection under database/filesystem load, so post-repair pixel
geometry remains open rather than being inferred from the structural test.

## Local latency configuration checkpoint

Jev first selected redacted configuration and direct probes with 1.00 confidence while the
database-versus-compilation priority stayed below the required threshold (request
`8b9986fee0c9c80adb6ac2c2e93d4f2632f3de5ba8be8e3ba2150b80c22ff4d6`). The resulting
evidence showed that localhost pointed to loopback PostgreSQL while selecting the Neon WebSocket
adapter, and used shared remote Upstash despite an available loopback Redis service. With that
evidence, Jev selected persistent local native backends with 0.99 confidence (request
`f1b13e7f515e06f009b9d4dacd644f15de480117ea0046c082f0fa1eaa44d5de`). Both ignored local
env files now select native PostgreSQL and loopback Redis without changing the database URL or
production configuration. Three data-layer files pass 41 tests with 13 Neon-only cases skipped;
two key-value files pass 19 tests; Redis returns PONG. At the user's request the dev server and a
separate 2.6–4.2 GB affected-build tree were stopped, increasing system-reported free memory from
48% to 71%. No full-app rerun followed, so provider-response latency remains blocked and the local
configuration result is limited to direct adapter/factory verification plus the earlier live
process-only measurement of the same native path.

## Download-target byte checkpoint

After an initial priority decision stayed below the required confidence, fresh source evidence
showed the project-source and media routes already formed a complete authenticated download chain.
Jev then selected verification of that chain with 1.00 confidence (request
`9c2907db0ba865596c203fae8a27d0dffc55b6e1e7f764456183398c89dcba12`). Six focused
files pass 46 tests: project source bytes and headers, client refusal of HTTP error bodies and retry,
project export JSON, account-export media links, workspace authorization, exact media SHA-256 and
opaque handling for active document types. No owner file was saved and no production storage was
contacted. The previous project-source/media byte limitation is closed for deterministic local scope;
DATA-CONTROLS remains pending for the separately recorded mobile browser and broader control gaps.

## Mobile Account geometry verification

The native local PostgreSQL and Redis configuration supported a fresh authenticated Browser pass
without the prior connection loss. At 390×844 and 320×700 the repaired session table exactly matches
its horizontal wrapper, action buttons remain inside the viewport, desktop columns are hidden, mobile
metadata is visible and the document has no horizontal overflow. The 320px view exposed a separate
recent-activity label/count ellipsis. Jev selected a stacked phone row with 0.53 confidence (request
`b69a88133482293f17e4093385725052c20125e8f7e0e3936e9aa083f9a10983`); the complete event,
device and timestamp now stack on phones and return to a compact two-column row at the small
breakpoint. The focused regression protects the no-ellipsis contract. Four Account/activity files
pass 17 tests, focused lint/format/diff checks pass, and the final 320px screenshot shows the complete
`Viewed account data ×36` label and timestamp. DATA-CONTROLS remains pending only for its separately
recorded destructive/external behavior gaps; the mobile Account layout limitation is closed.

## Workspace-scoped destructive controls

Jev selected deterministic destructive-data verification with 0.79 confidence (request
`53dba9d7a72be7c89764e0e8fdb74db6e458f753d805740368f2e14ca26403e5`) and then selected
active-workspace copy alignment with 1.00 confidence (request
`8c0720dd70d4304e15dab2bfb11a3ad989db8a418302b4dc3d515f1fad825fbb`). The Privacy UI
promised account-wide archive/delete while both canonical routes were active-workspace scoped, and
Help called recoverable soft deletion permanent. Four regressions failed before repair. Settings,
Archived chats and Help now name the current workspace and Recently deleted restoration without a
purge promise or nonexistent permanent-delete control.

Browser showed the actual count of two and the corrected archive/delete dialogs; both were cancelled.
The UI fits at 390×844 and 320×700. A real PostgreSQL transaction soft-deleted exactly two disposable
workspace conversations, preserved the personal conversation, matched one disposable account
schedule and rolled back with zero residue. Fourteen deletion/account/Help files pass 237 tests and
five Privacy files pass 15 tests; focused lint, formatting, corpus and diff checks pass. DATA-CONTROLS
remains pending because the owner account was not erased, permanent chat erasure is not available
separately from account deletion, and external behavior remains outside this local evidence.

## Tool-loop latency observability

The tool loop already measured first-provider-line latency for route health and routing-decision
outcomes, so the routing layer was not blind. The missing piece was the human-readable diagnostic
event available on the direct streaming path. Jev selected a per-provider-step event with 1.00
confidence (request `215a88533a2e3e1e7dcf177e39a4f6f425988da9236518604f2dcb01fd9fe1b3`).
Each successful tool-loop provider step now emits `llm_ttft_observed` with the actual serving route,
provider, model, request, logical operation and retry attempt, plus `llm_ttft_slo_breach` when the
existing threshold is exceeded. The event explicitly identifies its measurement as first provider
line, which can be text, thinking or a tool call. The focused regression failed before the repair and
now proves an exact 200ms measurement; three observability, route-outcome and failover files pass 19
tests with focused lint and formatting. Provider credits remain unavailable, so a new successful
live-model latency comparison is still blocked and no end-to-end speed improvement is claimed.

## Scheduled account erasure integrity

Jev selected a disposable real-database erasure probe with 1.00 confidence (request
`126b2b59927f74a0735fa3dfd2c257abb11610f51e5b6585a7ffa367a1352d82`). The probe reached a
real defect: account erasure attempted to remove the user from a personal usage-ledger row that had
no organization, violating the ledger rule that every row retain an organization or user. The erasure
stopped before identity and profile removal, and its retry detail named the intentionally retained
profile instead of the failing ledger.

Jev selected row partitioning with 1.00 confidence (request
`4b76b049b807ae180aa8d9dcb2cda4adf8aec89eb6131f3e2af744020672419c`). Personal ledger rows
now leave with the account; organization billing history remains with the user identity removed.
Retry detail now names failed deletion, anonymization, stored-object and cache categories. The same
opt-in PostgreSQL probe now completes the scheduled path, closes the tombstone, deletes subject-owned
rows, anonymizes the retained financial rows and leaves zero synthetic residue. Twelve related files
pass 193 tests with focused lint and formatting. The identity provider was spied, stored-object tables
had no fixture bytes and the signed-in owner was untouched; those external boundaries remain open.

## Browser-first QA checkpoint

The owner changed the execution order to complete Browser discovery before further repairs. The
in-app Browser pass covered authenticated chat, projects, Library, Models, Study, Schedules, every
Settings section, saved-chat search, an existing latency conversation, a failed Work item, public
Pricing/Help/Support/Contact/Security/Status, and the Enterprise overview, members, roles, identity,
policy, models, connectors, Code, MCP, sharing, audit, data, usage and billing surfaces. Desktop,
tablet and phone-sized layouts were inspected. No application source was changed during discovery.

Seventeen confirmed findings are recorded in `QA_ISSUES.md#browser-first-discovery-pass-2026-09-19`.
The highest-priority set is: the Turbopack/esbuild process deadlocked twice during ordinary
navigation; the Enterprise audit trail rejects the signed-in owner as unauthenticated; workspace
policy, identity and overview disagree about what is enforced; public Enterprise pricing overstates
SSO/SCIM/audit readiness; successful chat recovery retains a failed block; Work exposes a raw
provider reason code; status does not exercise inference; and mobile navigation/composer controls
move off-screen or overlap. No repair attempt has started for this batch.

The local migration ledger is now 272 applied, one pending and one drift, invalidating the earlier
zero-pending/zero-drift environment statement. Free through Max 15x limit evidence was not replayed:
its four canonical billing/usage fingerprints still match, including the exact 15× Pro managed-usage
ratios. Public security headers and mobile Pricing layout passed. Provider generation remains blocked
by exhausted credits. The next authorized phase is to repair this consolidated list one issue at a
time, beginning with the runtime and Enterprise audit blockers, while retaining the pass evidence to
avoid unchanged replay.

## Planning-only checkpoint, 2026-09-19

The owner requested a plan before further work. `LAUNCH_PLAN.md` now defines evidence reconciliation,
website requirement accounting, runtime/schema readiness, remaining discovery, security and data
integrity, chat/latency, responsive UI, commercial/integration correctness and targeted acceptance.
No application source, service, schema, account or production setting was changed during planning.

The previous “17 confirmed” summary was overstated. Current source already describes Desktop as
managed cloud, and Identity's “Not yet available” heading concerns mandatory SSO and group-scoped
entitlements, not deprovisioning. Those allegations are withdrawn. Billing-contract, zero-token and
status observations require qualification before claiming runtime defects. The earlier broad QA pass
is partial until website requirement accounting and remaining workflow dispositions are complete.
The issue and coverage records now carry these corrections without changing the frozen audit.

Next action: complete requirement-to-scenario mapping and remaining-discovery dispositions, then
investigate the local runtime exits and schema/configuration prerequisites. Follow the plan's gates;
do not begin product repairs simply because one page has been inspected.

## Historical unverified-cohort verification, 2026-09-19

The owner requested verification of the exact 6,639 historical unverified rows.
Current overlay: 132 requirement/source assessments (5 done, 102 partial, 17
missing, 8 still unverified); 568 additional prerequisite-only checks remain
unverified; 5,939 rows are not yet assessed. Across the entire cohort, 6,515 remain
unverified. This is an incomplete verification checkpoint, not completion of the
audit or launch approval. Frozen original decisions and GLOBAL NO-GO are preserved.

Checkpoint, row evidence and accounting:
local audit artifact `CURRENT_VERIFICATION.md` (path and fingerprint in [QA_COVERAGE.json](QA_COVERAGE.json)), `current-verification.jsonl`
and `current-verification-state.json`. The directory is locally excluded from Git;
artifacts are saved on disk, not committed. No exclusion was changed.

New confirmed local defects: draft loss after Projects/Back, a false send-failure
restoration when clearing a reloaded draft, and orphan Mermaid diagnostic nodes
remaining in accessibility after navigation. Canonical IDs/repair actions are in
`ACTIVE_ISSUES.md` and `known-flaws.md`; QA_ISSUES points to them. Main-branch
protection is absent in read-only live GitHub inspection, and the pre-existing live
erasure test's direct pg import fails the package-boundary guard. No repairs or
production mutations were performed.

233 fresh targeted tests pass; the local RLS identity probe passes 26 assertions,
and the reservation probe passes 19 including verified overlapping database lock
waiters. The 33-table RLS probe also passed. Browser rendering/keyboard/paste/search
passes are retained; synthetic database fixtures were cleaned up. Original scoped
QA evidence was reused only after 104 recorded source fingerprints matched.

The existing bound run's four-hour deadline expired at 2026-09-19 12:49:41 UTC.
Checkpoint without changing its counters/deadline or creating another run. This is
not BLOCKED: independent local QA remains actionable. Exact next batch: untouched
Chat attachment/lifecycle and identity/workspace acceptance cases joined by stable
ID; do not replay the unchanged passes above or start repairs ahead of QA.

Checkpoint cleanup: temporary Browser tab closed, viewport reset, synthetic fixture
removed and the batch-owned Next server stopped; port 3100 has no listener. Existing
PostgreSQL/Redis and unrelated applications were preserved. Documentation diff check passes.

## QwenCloud Free model selector, 2026-09-19

The owner clarified that the models belong in the composer selector. The misplaced
read-only /models quota panel is removed. Chat > Change model > Free now provides
search and modality filters, persists exact offering choices and dispatches directly
through the configured QwenCloud user key. Jev approved the explicit selector route
and local user-key boundary; ordinary Managed Cloud vendor restrictions remain intact.

The owner signed into the shared browser. All 272 exact identities are resolved from
the live Benefits table. The local key matches the console's local-testing key. Current
account-bound, user-bound verification admits 94 connected offerings:79 chat,14 image,
1 video. The other172 require protocol/input integration;4 active allocations have
quota-only protection off and2 expired. Those178 remain visibly disabled. Connected
is not a claim that every offering has been live-tested. Account verification expires
after one hour; it is private local state, not authorization inferred from screenshots.

Three synthetic experiments passed through the actual Free selector: chat returned
“42 Free selector verified” (route1.5s), one image rendered a blue paper boat (4.8s),
and one two-second video returned a provider result (30.3s). Reload preserved the
messages, image, video link and selected offering. A fourth request verified the newly
connected GLM chat family (route1.4s). Benefits records1 image and2 seconds
consumed; the dashboard still displays$0.00. Browser policy blocked external video
playback, so playback is unverified; no bypass or replacement generation was attempted.

The repairs prevent an explicit Free selection from entering automatic or armed paid
media routes, skip paid automatic titles for these conversations, and preserve named
output links that citation cleanup previously removed. No paid fallback or automatic
provider resubmission occurs. Workspace model, BYOK, region and retention policies
still apply, and production requests to this development endpoint are rejected.

A follow-up official protocol review (Jev confidence0.98) connected15 additional
chat/vision offerings and removed6 incompatible generic-chat entries. Required
reasoning is now enabled with a128-token thinking cap, while translation variants
remain unavailable until language controls exist. The CLI refuses required-thinking
models because they require the composer streaming path.

Validation:66 focused web tests in8 files and17 Qwen adapter tests in3 files pass.
Web, Qwen and factory typechecks pass. Focused ESLint, generated-catalog sync,
model-catalog integrity, model-ID literals and free-pool checks pass (the free-pool
guard retains unrelated pre-existing terms warnings). Expiry, insufficient allocation,
wrong key/user, duplicate claims, concurrency, quota exhaustion and workspace refusal
have targeted tests. Structural tests do not replace the three actual browser results.

The tested conversation remains open with the free chat offering selected and the
local Next server running. Remaining work is explicitly tracked as
QWEN-FREE-QUOTA-REMAINING; do not rerun unchanged passing generations. See
[evidence/qwen-free-quota.json](evidence/qwen-free-quota.json) for counts, results,
limits, source hashes and remaining gaps. Historical GLOBAL NO-GO is unchanged.

## Free quota capability experiments, 2026-09-19

Jev selected the bounded capability matrix (confidence 1.00). Sixteen direct-provider
requests covered 13 capability areas across seven verified quota-only offerings.
JSON extraction, generated JavaScript (five independent runtime assertions), corrected
conversation context, quoted-instruction handling, retrieval across 160 synthetic rows,
function-call arguments, concise reasoning, translation, receipt OCR, embeddings and
reranking passed their narrow expectations. Speech recognition transcribed an independent
local speech fixture exactly. These are representative cases, not model benchmarks.

The initial reasoning answer hit the 128-token output cap. A concise-answer prompt
returned the correct FINAL=12 without increasing that cap. Speech generation returned
5.12 seconds of PCM, but its order number was misrecognized by the ASR model. The
same error remained after correcting the WAV header and sending the same PCM as
base64; independent local speech passed. This isolates an audio-dependent quality gap,
not a general ASR outage. Human listening and the precise acoustic cause remain unverified.
The provider also returned an HTTP audio link and an oversized WAV frame declaration;
HTTPS GET succeeded without credentials, while signed HEAD returned403. No security
check was disabled and no HTTP download was used.

The calls reported 4,740 tokens,70 synthesized characters and14 ASR seconds. Direct
request durations ranged from0.785 to3.702 seconds (median1.765 seconds); these are
not localhost or production latency measurements. The provider header displayed$0.00,
but allocation counters lagged, so final billing reconciliation is not claimed. Each
named probe was claimed once; no automatic paid fallback or submission retries occurred.

Current Free selector accounting remains94 connected offerings. Direct API success does
not enable speech, translation, embedding, ranking, attachment or tool controls in the
composer. Prior image/video generation passes were preserved without replay. Realtime
voice, voice cloning, media editing/input and all272 models individually remain untested.
See evidence/qwen-free-quota.json#capabilityExperiments for inputs, expectations, outputs,
usage, fixture hashes, limits and the two remaining speech observations. Do not requeue
unchanged passing cases. Historical GLOBAL NO-GO remains unchanged.

## Free quota through the Browser, 2026-09-19

Four requests were entered and sent through the actual Free composer selector in a
new conversation, /chat/e022da46-67bd-4071-ac59-313c5b01ff89. JSON extraction, a Spanish
follow-up correcting Monday to Friday, a JavaScript code block with exact clipboard
copy, and a switch to the required-thinking offering returning FINAL=14 passed.
Reload after the first three replies preserved their text/code and the Free selection.
Speech, embedding and reranking controls correctly remain disabled pending integration.
No direct API submissions or new media generations were made in this browser batch.

Two display issues are now registered: WEB-FREE-PROVENANCE-RELOAD-2026-09-19 and
WEB-CHAT-ANGLE-TEXT-2026-09-19. The former loses the streamed free-pool label on reload;
the latter hides an angle-bracket placeholder in the rendered user message while the
editor retains the original. No repair claimed. The browser conversation remains open.
Evidence: evidence/qwen-free-quota.json#browserCapabilityExperiments.

## Chat and image QA pack browser batch, 2026-09-19

The owner excluded speech, embeddings and ranking. Jev chose the bounded rendering/image
batch (confidence1.00). The pasted350-case overview supplied test inputs, not prior passes;
its linked expanded ZIP and fixtures are unavailable locally. Only the two selected
text/image offerings received fresh live quota-only verification. No global run limits
were reset and no answer budget was increased.

Fifteen browser submissions produced13 chat replies, one1024×1024 HELLO QA poster and
one deliberately stopped request. Ten compact prompt cases passed; TB02 failed numeric
alignment, SA01 promoted requested inert code to an artifact preview, and MD09 returned
200 rather than240 characters. The poster survived reload but Library > Images remained
empty (PL06 gap). Individual case IDs, exact observations, conversation paths and partial
UI coverage are in evidence/qwen-free-quota.json#qaPackBrowserBatch.

Confirmed passes include nested-quote closure, mixed-format boundaries, six code languages,
second-code-block copying, math, an actual Mermaid artifact with source/fullscreen controls,
missing-image honesty, multilingual glyphs, edit Cancel/Save/version pairing and reload,
empty-input refusal, image content and cancellation persistence. At390px the actual long
string wrapped without page overflow. Full width/device, stream-failure and provider-side
abort behavior are not claimed. Synthetic draft clearing reproduced the existing restore
issue; the free-pool reload-label issue also remains. Combined browser helper timing made
early reload observations ambiguous; isolated later reloads passed, so no redirect defect
was registered. Provider spend still displayed$0.00 and image quota recorded one extra use.

No product repair was made during this discovery pass. The generated poster remains open;
viewport restored. Next work: consolidate/fix the confirmed canonical renderer and media
integration findings, then rerun only their affected cases. Unlisted pack cases remain
NOT RUN. Historical GLOBAL NO-GO is unchanged.

### 2026-09-19: Login completion refinement

User-requested refinement of `/login/complete`: reused the canonical AuthLayout and
AuthStepFrame, added a “Finish signing in” heading and explanation, improved consent
spacing and keyboard focus, and added an explicit Continue action. The login gate
requires a fresh checkbox selection and Continue before mounting the existing recorder.
Legal wording, durable acceptance checks, CSRF handling, retry behavior and redirect
validation are preserved. Login recording now uses sign-in-specific progress copy.

Validation: 18 tests passed across the login completion page, TermsGate, signup agreement
and acceptance recorder suites. Focused ESLint, web typecheck (8 GB heap), CSS token guard
and git diff whitespace validation passed. Browser checks used a temporary development-only
preview generated from the actual page markup with the real auth/gate components and an
inert recorder, because the signed-in account had already accepted the current terms.
The real completion route correctly skipped the gate for that account. Preview checks
covered 320, 390, 1024 and 1440 px in dark and light themes without horizontal overflow;
checkbox keyboard toggling, visible link focus, disabled/enabled Continue, and child mount
only after Continue passed. No live consent record was changed. The preview was removed,
viewport and dark theme restored, and the signed-in app reopened. This focused change does
not close the earlier QA findings or change the historical GLOBAL NO-GO.

### 2026-09-20: Free model quota exhaustion

Chat, image and video provider-confirmed free-quota exhaustion now share the
`free_quota_exhausted` response and direct users to choose another model in Free.
The existing local quota authorization module records exhaustion atomically in its
cache, scoped to account, credential, offering and verification timestamp. The
catalogue marks those entries exhausted and the selector disables them. Reopening
or reloading retains the state; a fresh account verification supersedes the marker.
A verified zero balance also blocks sends. Unrelated accounts, credentials and
models do not inherit exhaustion. Server-side repeated sends stop before dispatch.
Generic Try again/start a new chat guidance and same-model regeneration are removed
for this error, including persisted error metadata for continuation failures.

Validation uses simulated provider failures, never deliberate quota depletion:
156 tests passed across completion routes, catalogue responses, durable state,
selector, stream hook and transcript actions. Focused ESLint and diff whitespace
checks passed. Live provider depletion was not attempted and is not claimed.
Web typecheck passed after correcting index-signature property access. Browser smoke
verification confirmed the reopened Free section remains expanded, with category/search
controls loaded and no catalogue loading error. Exhaustion UI itself was verified with
fixtures, not by consuming the live allocation.

### 2026-09-21: Ecosystem continuity scope correction

The owner clarified that serial surface delivery is a release sequence, not six
independent products. The current target is one account and one effective suite
entitlement across all clients. Web, Mobile Cloud, Desktop Cloud and eligible Chrome
Managed Cloud form the account continuity domain for chats/messages, memory, projects,
Cloud files/artifacts, connected tools/apps, OAuth connection metadata, settings,
personalization and entitlement state. Desktop Code, CLI and VS Code form the host-owned
developer continuity domain for local session identity/transcripts, tools/extensions,
permissions, repositories/files and credential references. Desktop participates in both;
crossing between them remains an explicit provenance-preserving handoff.

Canonical product definition, requirements, suite, commercial model and experience
contract now state this topology. Stale wording that made the public Desktop entirely
cloud-only was corrected: consumer Desktop chat remains Managed Cloud, while Desktop Code
must use the same host developer runtime as CLI and VS Code. Local credentials stay in the
OS credential store/host broker and are not copied into Cloud sync. A dated official-source
comparison of ChatGPT/Codex, Claude and Perplexity continuity patterns is recorded in
`docs/research/cross-surface-continuity-2026-09-21.md`.

Website remains the only active implementation and launch surface. Later surface phases
must consume the canonical owners and prove create/update/delete convergence, revocation,
account switching, offline recovery, conflict behavior and explicit handoff rather than
receive copied chat, memory, tool, OAuth, subscription, session or file implementations.

### 2026-09-21: Official-doc rebaseline and literal angle-text closure

First-party ChatGPT and Claude documentation was re-verified through September 21. The
chronology and current ecosystem requirements are recorded in
`docs/research/chatgpt-claude-ecosystem-delta-2026-09-21.md`. Product definition,
requirements, suite, commercial, experience, decisions, trust boundaries and current work
records now consume that baseline. Dated July-to-September competitor and repository
observations are explicitly historical instead of claiming to be current. The current target
uses one account/effective entitlement, one Cloud continuity domain, one host developer
continuity domain and an explicit Desktop handoff. Managed Free remains available after
sign-in; paid upgrades remain waitlist/access-code gated. Custom GPT/GPT Store parity is
replaced by reusable plugin/workflow packages, and a separate Cowork-branded product is not
an AGI target: direct answers and durable work share one product home.

`WEB-CHAT-ANGLE-TEXT-2026-09-19` is closed. The shared Markdown renderer now has an explicit
literal-HTML preprocessing mode, and Web enables it only for user-authored message text.
Assistant Markdown keeps the existing HTML policy. Focused shared-renderer and Web message
tests passed; shared-package lint/typecheck, Web lint and Web typecheck passed. The full Web
suite passed 26,024 tests with six skipped across 2,405 passing files and four skipped files.
A temporary, exactly tagged local conversation exercised the shipping `/chat/[id]` route with
`FINAL=<number> and literal <script>alert(1)</script>`: all text remained visible and inert
before and after full reload. The temporary conversation and cascading message were deleted
and absence was verified. The open-flaw and active-issue rows were removed; historical QA
evidence remains in this ledger and the earlier evidence file.

### 2026-09-21: Markdown table alignment closure

`WEB-MARKDOWN-TABLE-ALIGN-2026-09-19` is closed. A failing shared-renderer regression first
reproduced the loss of GFM left, center and right alignment. The custom header and cell
renderers now map only the supported alignment values emitted through `style.textAlign` to
static presentation classes; arbitrary inline styles are not forwarded. Citation handling,
escaping and the existing local overflow wrapper are unchanged.

The focused shared-renderer regression passed 11 tests. The complete shared UI package passed
2,122 tests across 182 files, plus package lint and typecheck. The Web message consumer passed
108 tests, the development probe passed focused lint, and Web typecheck passed. Live localhost
verification confirmed `left`, `center` and `right` computed styles for both headers and cells
at wide and 390 px viewports. At 390 px, the table remained within its 342 px scroll region
with readable wrapping. The open-flaw and active-issue rows were removed; the historical QA
evidence remains preserved.

### 2026-09-22: Inert HTML code and explicit artifact closure

`WEB-INERT-CODE-ARTIFACT-2026-09-19` is closed. New Web assistant turns use the
`explicit-v1` artifact-derivation policy: fenced HTML, SVG and Mermaid remain ordinary visible
source unless the response carries the format-specific artifact marker. Explicit diagram,
chart, vector and HTML-artifact requests receive that output contract as a hidden system
instruction, so it never becomes part of the authored user transcript. Historical messages
without the policy retain legacy derivation. The same policy now reaches direct saves, bulk
saves, sync, branching and server Library indexing, so transcript and Library behavior do not
diverge. Iframe script and network restrictions are unchanged.

The canonical artifact package passed 42 tests and typecheck. Nine focused Web files passed
233 tests; focused ESLint and Web typecheck passed. The isolated Playwright streaming-artifact
case passed and proved a marked fence grows in the side panel without leaking into transcript
prose. The full eight-case streaming file remains four-pass/four-fail: three unrelated existing
height, announcer and Mermaid timing assertions failed, while the first artifact run exposed
and led to correction of a generic-word routing edge case before the artifact case passed in
isolation.

Live Free-model localhost verification showed the exact requested
`<script>alert("INERT_ARTIFACT_CHECK")</script>` fence visibly before and after reload, with no
artifact button and no alert. Separate explicit HTML-artifact prompts opened sandboxed previews
and persisted across reload. A second prompt after the hidden-instruction repair displayed only
the user's authored text while its preview rendered `HIDDEN_DIRECTIVE_CHECK`; the earlier
diagnostic turn remains historical test content. The open-flaw and active-issue rows were
removed; the original QA batch evidence remains preserved.

### 2026-09-22: Free generated media Library closure

`WEB-FREE-MEDIA-LIBRARY-2026-09-19` is closed. The Free quota media branch no longer emits a
provider-hosted artifact URL into a durable chat. It downloads through the guarded media fetcher,
validates the returned media type, applies the same generated-output moderation floor, and sends
the bytes through the canonical generated-file persistence owner. The resulting owner/workspace-
scoped private asset carries prompt, provider, model, conversation, checksum and AI-generated
provenance metadata. Chat receives only its authenticated same-origin `/api/files/{id}` URI, the
same catalog row Library reads. Failed persistence and blocked output expose neither provider URLs
nor uncatalogued bytes. Hosted Free media is offered only when private generated-media storage is
configured; the existing local development storage remains eligible.

Six focused route, catalogue, persistence, storage and Library files passed 119 tests. Focused
ESLint and Web typecheck passed. Live localhost verification used a one-pixel synthetic PNG through
the shipping private persistence path, not another provider generation: it appeared in Library
All and Images, survived full reload, and opened through the authenticated file viewer. The probe
row and bytes were then soft-deleted and permanently removed; reload returned to the original
empty Library. The historical IG04 conversation is unavailable in the current fresh database, so
the provider image was not regenerated. Route tests instead verify that a successful Free image
result is downloaded, moderated, persisted with the admitted owner/workspace/conversation scope,
returned by authenticated URI, and never leaks the provider URL; persistence failure and moderation
refusal paths are covered. The open-flaw and active-issue rows were removed while the original QA
batch observation remains preserved.

### 2026-09-22: Free-route provenance reload closure

`WEB-FREE-PROVENANCE-RELOAD-2026-09-19` is closed. The response header already identified the
lane during a live stream, and server assistant-turn attribution already carried the requested
lane, but the client's post-stream metadata save rebuilt its payload without the lane and the
reload projection read only the transient message field. Both assistant-turn writers now persist
the canonical `routeLane` metadata field. The bounded metadata projector treats it as essential,
conversation hydration restores it, and the transcript can also recover the older explicit
`requestedRoute.lane` attribution. Unknown, malformed and absent lane evidence remains unlabeled.

Four focused Web files passed 53 tests, the Cloud message-metadata projection passed 10 tests,
focused ESLint passed, and Web typecheck passed. Live localhost verification used a tagged
synthetic conversation under the authenticated account with `routeLane: free`; the assistant
displayed the configured free router with “via free pool” before and after a full Browser reload. No model
request or quota was used. The exact synthetic conversation and its cascade messages were then
deleted, and the Browser returned to the pre-existing localhost chat. The open-flaw and
active-issue rows were removed while the original discovery evidence remains historical.

### 2026-09-22: Mermaid diagnostic DOM cleanup closure

`WEB-MERMAID-ERROR-DOM-LEAK-2026-09-19` is closed. Both transcript diagrams and artifact previews
now render through a component-owned temporary host instead of Mermaid's default `document.body`
target. The host is removed in `finally` after success or failure, and Mermaid error rendering is
suppressed at configuration level. The visible source-preserving fallback is unchanged. A source
change owns a separate temporary child, so a cancelled older render cannot remove the newer one.

Eight focused shared-UI files passed 159 tests, focused ESLint passed, and the unified-chat package
typecheck passed. Live localhost verification used the development renderer probe with Mermaid
11.17.2: two valid diagrams rendered, the invalid diagram retained its visible source fallback,
and there were zero Mermaid-id or “Syntax error in text” nodes outside the probe. After navigation
to an empty New Chat, the document contained zero Mermaid nodes and zero stale syntax-error nodes.
The Browser then returned to the user's pre-existing localhost chat. The open-flaw and active-issue
rows were removed while the original discovery evidence remains historical.

### 2026-09-22: Scheduled-erasure harness boundary reconciliation

`QA-ERASURE-HARNESS-BOUNDARY-2026-09-19` is closed as a stale register entry. Commit `053729ff8`
on 2026-09-20 replaced the harness's direct `pg` client with the exported
`PostgresDatabaseAdapter` from `@agiworkforce/data-layer`. The vendor-adapter allowlist still names
the data-layer adapter as the sole `pg` owner, and the current repository boundary scan does not
report the erasure harness.

The opt-in live test compiles and skips cleanly without its destructive environment gate. Three
available focused data-layer adapter assertions passed, 26 environment-gated adapter cases skipped,
and the data-layer typecheck passed. The overall `pnpm check:boundaries` command remains red only
for a separate current `@clerk/nextjs` import in `CommandPalette.tsx`; this closure neither changes
nor suppresses that finding. The open-flaw and active-issue rows for the erasure harness were
removed while the original audit evidence remains historical.

### 2026-09-22: Theme bootstrap documentation and dead-helper closure

- Closed `WEB-127` from the canonical Web public-release audit.
- Removed `getSystemTheme` and `applyThemeToDocument`; repository search showed
  that production never called them and their only consumers were tests of the
  helpers themselves.
- Corrected the bootstrap contract to match the root layout: the blocking
  inline script is the first child of `<body>`, while the App Router owns
  `<head>`. The script remains byte-checked against the disclosed public
  artifact.
- Verification: focused ThemeProvider and theme-init tests, focused ESLint,
  Web typecheck, repository search, and documentation integrity guards.

### 2026-09-22: Operator support-queue audit reconciliation

- Closed stale Web audit row `WEB-125`. The operator dashboard's Support tab
  directly renders both `SupportHandoffQueuePanel` and
  `SupportTicketQueuePanel`; operators do not need to discover the separate
  `/operator/support` route.
- Git history attributes the support integration to September 21 commits
  `24c11782d` and `75e47aca4`. This was documentation reconciliation, not a new
  implementation claim.
- Verification: current implementation read, repository-wide reference search,
  focused operator tab tests, and documentation integrity guards.

### 2026-09-22: Workspace artifact localization closure

- Closed Web audit row `WEB-142` at its actual root. The organization-shared
  artifact label no longer depends on an inline English fallback.
- Added `artifactPublish.sharedWithWorkspace` to all 12 maintained `chat`
  locale catalogs and made the component consume the catalog key directly.
- Verification: `check:i18n-parity` passed with 1,277 keys in each of 12
  locales, the focused published-artifact suite passed 10 tests, focused ESLint
  passed, Web typecheck passed, and documentation integrity guards passed.

### 2026-09-22: Offline-status error and color closure

- Closed `WEB-113`. The earlier raw-error path was already routed through
  `toUserMessage`; the remaining green, blue, yellow and red utility ramps are
  now semantic success, info, warning and danger design tokens.
- The retry control uses the same destructive surface and readable danger-text
  tokens as the error banner. No status depends on a literal color family or a
  dark-mode override.
- Verification: the focused error-privacy and token-class regression passed,
  focused ESLint passed, `check:css-tokens` passed, and
  `check:theme-text-colours` passed with the unpaired count reduced from 114 to 113.

### 2026-09-22: Dynamic public-route 404 closure

- Closed `WEB-141`. Both `/blog/[slug]` and `/use-cases/[slug]` now own a
  segment `not-found.tsx` that delegates to the canonical not-found page instead
  of relying on framework fallback placement.
- Raw localhost requests to unknown slugs returned HTTP 404 and contained the
  canonical “That page is not here” heading plus its explanatory copy; the
  content does not require hydration to appear.
- Verification: both raw HTTP responses, Web typecheck, and documentation
  integrity guards passed.

### 2026-09-22: Sidebar browser-locator closure

- Closed `WEB-060`. Four Playwright steps now locate a conversation row's
  actions button by its rendered accessible-name pattern, “More options for
  …”, instead of the deleted “Conversation actions” label.
- The owning `SessionItem` suite continues to assert that the current label is
  present and the deleted label is absent.
- Verification: the owning UI suite passed 10 tests, Playwright discovered all
  nine affected browser cases across both specs, focused ESLint passed, and a
  targeted search found no stale label in either file.

### 2026-09-22: Share-request cancellation reconciliation

- Closed stale audit row `WEB-057`. The current share hook owns each request
  with an `AbortController` and `SHARE_CONVERSATION_CLIENT_DEADLINE_MS`, aborts
  on timeout, dismissal and unmount, and discards late failures after the
  dialog closes.
- The dialog's Cancel action remains enabled while creation is in flight and
  calls the cancellation path before closing. The implementation originated in
  release integration commit `c4097d64a` on September 19; this pass reconciled
  the later audit row with that current code.
- Verification: the focused hook and dialog suites passed 14 tests, including
  never-resolving cancellation and timeout/retry cases, and focused ESLint
  passed.

### 2026-09-22: Transcript renderer warm-up closure

- Closed `WEB-056` while preserving the markdown renderer's code split.
- Pointer or keyboard intent inside the composer now starts one cached import of
  `@agiworkforce/unified-chat`; the later `next/dynamic` transcript render uses
  the browser's already-requested module instead of waiting until the first
  assistant text reaches the DOM.
- Verification: the cached-loader and composer-intent regressions passed with
  the full editor-arm suite, 32 focused tests total, and focused ESLint passed.

### 2026-09-22: Raw-error guard reconciliation

- Closed stale audit row `WEB-059`. The current guard parses TypeScript and TSX
  instead of matching one regex shape, detects direct, multiline and nested raw
  messages in arbitrary error setters and toast sinks, and also checks rendered
  failure-result fields.
- The zero baseline is current: no raw exception message remains in the scanned
  Web and shared-UI production roots.
- Verification: all 23 adversarial guard tests passed and the repository scan
  passed with zero remaining findings. Git attributes the final tool-result
  coverage to September 21 commit `49e1924d8`.

### 2026-09-22: Global substring-layout closure

- Closed `WEB-051`. Deleted the global selectors that rewrote any class name
  containing `sidebar`, `composer`, or `send-button`; the owning sidebar and
  composer components now control their own responsive layout. The bounded
  menu/listbox viewport-width rule remains.
- Live signed-in localhost verification at 390×844 measured a 390px document
  with no horizontal overflow, a row-direction composer, and a conversation
  menu at x=73…265 with active pointer events, wholly inside the viewport.
- Three focused composer/mobile/menu files passed nine tests and
  `check:css-tokens` passed. `check:web-ui-invariants` ran its 24 guard tests
  successfully but the repository scan remains red on unrelated untracked
  `DesktopUpdateNotice.tsx` using `z-[100]`; this closure did not touch or
  suppress that other work.

### 2026-09-22: Primary coarse-pointer target closure

- Closed `WEB-067` at the remaining current scope. The product already had
  coarse-pointer sizing on notices, model controls and follow-up actions, so
  the old claim that it had none was stale; Send, Stop, Queue, conversation
  rows, and their row action controls were the unresolved 32–36px targets.
- The Web composer and shared sidebar now expand those controls to 44px only
  for coarse pointers, preserving their compact mouse-and-keyboard layout.
- The browser target-size suite retains the WCAG 2.2 24px floor across product
  routes and adds a touch-enabled 390×844 check for the stricter 44px composer
  and sidebar contract.
- Verification: 28 focused Web send-button tests and 20 shared-sidebar tests
  passed; Web and shared-UI typechecks passed; Playwright discovered all three
  target-size cases. In the signed-in localhost UI, a coarse-pointer emulation
  measured the Send control at 44×44px, the conversation row at 213×44px and
  its action button at 44×44px. The browser was returned to its original
  desktop viewport with the draft cleared.

### 2026-09-22: Hand-drawn dialog keyboard closure

- Closed `WEB-040`. Web dialogs that own custom layouts now delegate focus
  entry, Tab containment, Escape and opener-focus restoration to
  `useDialogKeyboard` or `useOverlayDialog`; their local document-level Escape
  listeners were removed.
- This includes the three desktop-host dialogs, project source and file-preview
  modals, generated-media sharing, the image lightbox, narrow support, all
  three gallery overlays and the mobile artifacts panel. The latter no longer
  keeps a private copy of the overlay focus algorithm.
- Extended the modal invariant suite so any Web source that claims
  `aria-modal` without one of the shared keyboard owners fails.
- Verification: 85 focused tests passed across the affected panels and guard,
  focused ESLint and Web typecheck passed. A live localhost gallery drawer
  moved focus to its Close control, kept focus inside after ten Tab presses,
  closed on Escape and returned focus to the exact gallery card that opened it.

### 2026-09-22: Flagship stylesheet ownership closure

- Closed `WEB-064` against the current code rather than the stale 86-rule
  count. The live files contained 101 byte-identical `agi-fl-*` rules and five
  root-context selector conflicts.
- `legacy-pages.css` now owns shared flagship rules. `legacy-landing.css`
  retains only landing-specific declarations; the homepage hero carries an
  `agi-fl-hero--flagship` modifier for its 22px CTA spacing and inherited hero
  variables. Shared device masks moved to the canonical page rules.
- Added a parser-backed ownership regression that fails if the same flagship
  selector is declared in both stylesheets under the same responsive context.
- Verification: the ownership regression passed; 35 focused marketing,
  device-mockup and hero-accessibility tests passed; focused ESLint passed. A
  localhost `/web` visual check showed the hero, device mockup and CTA layout
  rendering normally after hot reload.

### 2026-09-22: Documentation-route design-system closure

- Closed `WEB-062`. `/docs` now uses the same `PageHero`, `Section`, `Stack`,
  `Prose` and `Ledger` primitives as the rest of the public site, replaces the
  icon-card wall with semantic link ledgers, and restores the shared marketing
  footer.
- Deleted the now-unused `agi-docs*` CSS block instead of leaving a retired
  sixth visual system in the global stylesheet.
- Verification: the focused route regression passed; the combined docs and
  marketing batch passed 36 tests; Web typecheck, focused ESLint and formatting
  passed. Localhost `/docs` returned 200 and exposed the shared footer. At
  390×844 the document and viewport both measured 390px wide, with the `h1`
  wholly inside the viewport and no retired card nodes.

### 2026-09-22: Flagship hero contract closure

- Closed `WEB-063`. The landing hero now requires the confirmed public
  signature: a line-based headline, an italic amber emphasis and a named
  Local/BYOK/Cloud mode ribbon. The visual brand lockup is no longer a second
  heading, so the page retains one semantic `h1`.
- Renamed the landing-only section exports with a `Landing*` prefix. A
  regression compares the two module export sets and fails if the flagship and
  reusable surface systems publish the same runtime component name again.
- Verification: both focused hero tests and the existing flagship
  accessibility regression passed; Web typecheck, focused ESLint and
  formatting passed. An unauthenticated request to `localhost:3100/` returned
  200 with the new headline, all three trust modes and exactly one `h1`. The
  rendered hero was inspected at the default desktop viewport and at 390×844;
  after its entrance animation settled, the mobile layout showed the headline,
  lede, wrapped mode ribbon and both CTAs without horizontal overflow.

### 2026-09-22: Focus and secondary-accent ownership closure

- Closed `WEB-065`. Foundation `--focus-ring` now feeds Tailwind's generic
  ring, the chat ring, the global outline and shared sidebar controls. Web and
  unified-chat focus states no longer use primary or secondary accent colours,
  and the global outline now sits in the base layer instead of overriding a
  component's explicit outline utility.
- Removed the Web-only terracotta `--chat-accent-secondary` override. Web now
  inherits the shared teal solid and soft secondary roles while retaining its
  amber primary action family.
- Added a source regression that scans Web, shared UI and unified chat for the
  retired focus-role forms and pins the canonical aliases. Verification: 363
  focused Web tests, 149 shared-sidebar tests and 49 affected unified-chat
  tests passed; all four affected typechecks, focused/package lint and
  `check:css-tokens` passed. Live dark chat resolved both focus tokens to
  `#7aa0f0`, the secondary accent to `#21808d`, and visibly painted the focused
  composer with the canonical boundary.

### 2026-09-22: Responsive chat-shell closure

- Closed `WEB-050`. `/chat` now uses the shared compact/tablet/regular shell
  resolver instead of a private 768px media query. Tablet portrait and any
  tablet-sized chat with a secondary panel use the 52px rail; its expand
  control opens full navigation as an overlay.
- Work, Research and Artifacts share one active right-side slot. A newly opened
  panel replaces the previous one, including transcript-driven and shortcut
  openings, while an automatic Work-dock open does not displace a panel the
  user is reading.
- Added 820 and 1024 to the responsive sweep plus a signed-in panel hand-off
  case. Verification: 20 focused and 99 broader chat tests passed; Web
  typecheck, focused ESLint and formatting passed. Live localhost geometry
  changed from a panel ending at x=900 in an 820px viewport and stacked panels
  ending at x=1180 in a 1024px viewport to exact-width, one-panel layouts at
  820×1180, 820×640 and 1024×768. The tablet rail's navigation overlay was also
  opened live and correctly made the covered chat inert.

### 2026-09-22: Client chat-latency instrumentation

- Closed `WEB-020`. Managed-cloud chat turns now record bounded T0 submit, T1
  fetch, T7 first-chunk, T8 first-paint-proxy, T9 first-sentence and T10 done
  marks plus interval measures. Abandoned and failed turns cancel instead of
  recording a false completion, and old traces are evicted after twenty turns.
- Each measured request sends a W3C `traceparent` through the existing server
  correlation boundary. `x-request-id` remains the separate request identity;
  no private header or second trace owner was added.
- Verification: five focused latency and correlation files passed 28 tests; all
  16 `useChatStream` test files passed 178 tests; focused ESLint and the Web
  typecheck passed. A successful live-provider baseline remains open, so this
  work establishes an instrument rather than a latency or capacity claim.

### 2026-09-22: Durable user-turn admission without a browser save round trip

- Closed `WEB-054`. Persistent managed-cloud turns now send the user-message
  identity, metadata and branch parent with the completion request. The request
  processor persists that turn before provider dispatch and fails closed with a
  user-facing save error if durability is unavailable.
- Extracted conversation-message persistence into one server owner consumed by
  both the standalone messages route and completion admission. Branch lineage,
  conversation activation, title generation and artifact indexing therefore do
  not have parallel implementations. Temporary, local and regeneration flows
  retain their prior contracts; assistant persistence is unchanged.
- Verification: the focused admission/refactor batch passed 89 tests; all 14
  message-route/helper files passed 76 tests; all 37 request-processor files
  passed 357 tests; and all 16 `useChatStream` files passed 178 tests. Focused
  ESLint and the Web typecheck passed. The failure regression proves that a
  failed user write dispatches no provider request.

### 2026-09-22: Connector-free chat request fast path

- Closed `WEB-055` for Web without removing default-on connector behavior. Once
  the composer has successfully loaded the account connector list, it reports
  when no connector remains enabled for that conversation. A loading or failed
  list sends no hint, and older or non-Web clients keep the existing discovery
  path.
- A no-tool turn with that negative hint skips the user connector catalogue,
  connector verdicts, approval-policy read and the extra scoped-database
  acquisition. Enabled connectors still receive the complete catalogue and
  permission gates. Platform tools such as Web search still load approval
  policy even when no connector is enabled.
- Verification: the six-file client/server fast-path batch passed 122 tests;
  six broader route files passed 53 tests; all 37 request-processor files passed
  357 tests; and all 16 `useChatStream` files passed 178 tests. Focused ESLint
  and the Web typecheck passed. The route regressions prove both the zero-read
  fast path and retained platform-tool policy enforcement.

### 2026-09-22: Public-root bundle isolation

- Closed `WEB-010`. Capability, query, settings and app runtime providers now
  mount from product route layouts, while pricing receives only its query
  runtime. The public root no longer mounts the identity provider; identity-aware
  routes still receive it. The disabled
  support widget has no root mount under the Web v1 email-first support
  decision.
- Root UI consumers use published `@agiworkforce/ui` subpaths. The final large
  dependency edge was the browser CSRF helper importing the full
  `@agiworkforce/cloud-contracts` barrel for five request-header helpers; the
  new `client-request` subpath owns that narrow browser contract without
  pulling the model registry or billing catalogue into waitlist and support.
- A successful Next 16.3.5 production build measured `/terms` at 24 scripts,
  405,616 encoded bytes and 1,292,551 decoded bytes, down from the already
  improved 35 scripts / 678 KB / 2,201 KB checkpoint and from the original
  47 scripts / 1,594 KB / 6,442 KB audit baseline. No loaded script contained
  the model-registry, billing-plan, Clerk-provider or support-widget
  implementation markers, and no cross-origin request was made.
- Verification: 461 cloud-contract tests, 38 bundle-boundary and shell
  ownership tests, focused provider/waitlist/CSRF/proxy/identity tests,
  cloud-contract lint, three affected typechecks, `check:boundaries`, and the
  production build passed. The measurement's three 503s were framework link
  prefetches to `/` and `/login` under deliberately missing local identity and
  database credentials; `/terms` itself rendered successfully.

### 2026-09-22: Existing-chat composer geometry

- Closed `WEB-052`. The active-chat composer now follows the measured
  ChatGPT/Claude parity contract already owned by the design skill: plus,
  textbox and trailing controls share one non-wrapping 50px card. The larger
  new-chat home composer remains two rows with the same greeting-only content.
- Removed three global CSS layout overrides that had silently forced the field
  to a full line and the controls below it. The component now owns the explicit
  active-versus-home layout, and a source regression refuses those global
  selectors if they return.
- Verification: five focused files passed 118 tests. An authenticated
  Playwright run against the configured `localhost:3100` server passed at
  1440×900 and 390×844: the active composer stayed within 48–52px, remained
  baseline-aligned, and had no horizontal overflow. Web typecheck, focused
  ESLint and formatting passed.

### 2026-09-22: Strict CSP rendering disposition

- Closed `WEB-058`. The duplicate error-message implementation is gone, public
  requests no longer perform an account-consent database read, and the
  remaining dynamic rendering has an explicit release decision rather than a
  partially resolved label.
- Decision 25 keeps the per-request nonce CSP and Turbopack for Web v1. The
  official Next.js 16.3.5 CSP guide, the installed guide and the installed
  config schema were checked on 2026-09-22: nonce CSP requires dynamic
  rendering; App Router SRI is now documented without the old webpack-only
  restriction, but remains experimental and cannot cover dynamically generated
  scripts. `unsafe-inline` and a security-driven bundler switch are rejected.
- The static hash-CSP path can be revisited only after it is stable and a
  production measurement shows material value, with CSP, hydration, identity,
  consent and public-route caching verified together. No runtime or security
  control changed in this disposition.

### 2026-09-22: Web v1 support scope and two-click entry

- Closed `WEB-031`. Decision 26 makes the help centre, signed-in tickets and
  direct `contact@agiworkforce.com` email the Web v1 support product. The
  incomplete AI/live-handoff widget remains unmounted and outside the public
  root bundle; source presence is not treated as a shipped capability.
- The one shared account menu now has a translated Email support item using the
  canonical legal contact helper. `/help` owns documentation search and routes
  unresolved questions to `/support`; `/support` owns channels and plan
  commitments. Free through Max retain no response-time promise.
- The authenticated localhost Playwright check passed: account menu then Email
  support activated the canonical mailto in exactly two clicks and found no
  support-widget mount. The two shell-ownership suites passed 105 tests.
  Human monitoring of the mailbox cannot be proven in code and is recorded as
  an explicit founder-operated Web launch gate.

### 2026-09-22: Live chat latency and response-protocol disposition

- Closed `WEB-053`. Three opt-in, zero-cost configured free-router turns used the
  signed-in localhost composer and the real completion route. The cold
  development sample measured fetch-to-first-chunk at 6,135ms. Two warm
  samples measured 1,124ms and 813ms; their submit-to-first-paint proxies were
  2,635ms and 2,016ms, and submit-to-done was 2,718ms and 2,264ms.
- Decision 27 keeps the direct adapter's first-provider-chunk peek because it
  preserves real HTTP error status and pre-commit failover. The standard chat
  path already opens its durable response independently of visible model text,
  so replacing those errors with in-band SSE frames has no measured launch-path
  benefit. These localhost development samples are not production latency or
  capacity claims.
- The opt-in Playwright instrument requires an explicitly selected catalog
  model with zero input/output cost and streaming support, and refuses retries
  and repeats. Web typecheck, focused ESLint, deterministic latency tests and
  the live run passed.

### 2026-09-22: Selected-route transport-provider repair

- The live probe exposed a separate background failure: utility calls received
  canonical route provider `open_router`, while the server adapter registry is
  keyed by dispatch provider `openrouter`. Conversation-title generation fell
  back to a truncated title instead of using the selected route.
- The existing route-ID owner now resolves the dispatch provider for a selected
  route. Title generation, follow-ups, context compaction, memory extraction,
  support AI, scanned-document OCR, code review, scheduled agents and rollout
  shadow traffic use that value only at adapter/wire boundaries; policy,
  pricing, reservation, cache and ledger records retain the canonical provider.
- Twelve focused files passed 127 tests, including a catalog-derived OpenRouter
  title regression. Web typecheck and focused ESLint passed. A fresh live chat
  returned 200 for completion and message persistence, the title job reached
  its cache-miss/provider path, and the former unregistered-provider error did
  not recur.

### 2026-09-22: Offline composer recovery

- Closed `WEB-097`. The active composer consumes the shared ecosystem
  online-status hook. Offline state disables Send, exposes the exact reason to
  assistive technology, preserves the unsent draft and blocks Enter submission;
  reconnect restores Send without changing the draft.
- The composer regression passed nine tests and the shared hook regression
  passed. An authenticated Chromium run toggled the browser context offline and
  online on `localhost:3100`, verified the disabled reason and draft on the
  disconnected state, then verified the control recovered on reconnect.

### 2026-09-22: Streaming liveness and immediate reveal

- Closed `WEB-100` without racing two provider executions. Plain managed chat
  now allows 500ms for the durable workflow's first event, cancels it before an
  inline fallback and uses the existing shared cooldown so a cold durable path
  is not charged to every request. `AGI Work` keeps its durable contract.
- Closed `WEB-101`. Assistant text that has reached the browser is coalesced for
  one animation frame and then rendered in full; the old 280ms presentation
  pace no longer delays a burst the provider already delivered.
- Closed `WEB-102`. Every chat SSE endpoint consumes the canonical response
  headers with `X-Accel-Buffering: no`, and the idle heartbeat interval is 2s.
- Eleven focused files passed 143 tests. Focused ESLint and the Web typecheck
  passed. An authenticated zero-cost configured free-router run on
  `localhost:3100` asserted the real anti-buffering header and measured a 26ms
  durable first event, 331ms route response, 375ms fetch-to-first-chunk,
  2,087ms submit-to-first-paint and 2,137ms submit-to-done. The first browser
  attempt also exposed a harness race where completion could be observed before
  the scheduled paint mark; the probe now waits for both rather than reporting
  that valid next-frame paint as missing.

### 2026-09-22: One identity and balance read per managed-chat request

- Closed `WEB-103`. The completion route now turns the bearer verified by the
  auth gate into one request-scoped database adapter. Request processing,
  cloud-agent admission and tool permissions reuse that adapter instead of
  verifying the same credential again.
- Paid routing and credit availability checks reuse the balance snapshot that
  request processing already loaded. The atomic reservation remains the final
  spending authority; no entitlement or allowance behavior changed.
- Forty-four request, route and service test files passed 420 tests. The new
  regressions reject a mismatched verified bearer and prove that a supplied
  balance snapshot causes no database query. Focused ESLint and Web typecheck
  passed. An authenticated configured free-router run on `localhost:3100`
  completed successfully with a 6ms identity phase, 34ms durable first event,
  500ms admitted chat turn and 614ms browser fetch-to-first-chunk.

### 2026-09-22: Bounded transcript work during streaming

- Closed `WEB-104`. Linear transcript updates use a cached message-id index and
  replace one row. The Web projection carries that patch forward, rebuilding
  one `ChatMessage`; grouping rebuilds one affected group; the list-level memo
  compares the message-array identity instead of walking the transcript.
- Structural changes, id or role changes and branched transcripts fall back to
  the complete projection and grouping path so the optimization cannot hide a
  real transcript change.
- Three 500-message regressions prove that 499 store messages, projected
  messages and message groups retain identity after a last-row stream patch. A
  500-patch local profile measured 0.0029ms median and 0.0061ms p95 through the
  store, projection and grouping pipeline. Twenty-seven broader stream, store
  and message files passed 368 tests; focused ESLint and Web typecheck passed.
  An authenticated localhost stream still completed, reaching first paint in
  1,716ms and completion in 1,770ms.

### 2026-09-22: Stable tables, remounts and code highlighting

- Closed `WEB-105`. While content is streaming, a prospective GFM table header
  and partial delimiter remain out of the visible Markdown DOM until the
  delimiter is valid. A finished non-table pipe line still renders as prose.
- Message entrance animation is consumed by stable message ID, so a
  virtualized unmount and remount does not replay the vertical/opacity motion.
  The recent-ID cache is bounded at 20,000 entries.
- The 32-entry Shiki cache now keys on a compact length plus two hashes rather
  than embedding the full code block in the map key. Each bucket retains the
  exact source for collision-safe lookup.
- Five shared Markdown files passed 67 tests and four Web message files passed
  206 tests. Shared and Web typechecks, focused ESLint and an authenticated
  localhost streaming run passed; that run reached first paint in 2,260ms and
  completion in 2,326ms.

### 2026-09-22: Mobile keyboard keeps the transcript tail visible

- Closed `WEB-106`. `ChatMessageList` now consumes the same canonical
  visual-viewport keyboard inset as the composer. On browsers that overlay the
  keyboard instead of resizing layout, the transcript owner shrinks by that
  inset and a bottom-pinned reader is re-anchored after the resize. A reader who
  intentionally scrolled up is not forced back to the tail.
- The first browser geometry run exposed that applying the height to
  react-window's child was ineffective because the library retained full outer
  sizing. Moving the inset to the transcript's owning container fixed the real
  overlap rather than weakening the probe.
- Ninety-nine transcript and keyboard tests passed. An authenticated Chromium
  run at 390×844 with a synthetic 336px iOS-style overlay verified zero overlap
  between the transcript and lifted composer and zero remaining distance from
  the pinned tail. Focused ESLint and Web typecheck passed.

### 2026-09-22: Shared Projects search accessible name

- Closed the local `PROJECTS-SEARCH-ACCESSIBILITY` source defect in the shared
  ProjectGallery. Its search field relied on placeholder text and appeared as
  an unnamed searchbox. It now has a stable `aria-label` without changing the
  compact toolbar layout.
- The focused regression failed on the old input, then passed. ProjectGallery
  and Web Projects-page suites passed 19 tests; shared typecheck, targeted
  ESLint and formatting passed. The available localhost Browser session was
  signed out and redirected `/chat/projects` to `/login`, so the signed-in
  accessibility tree and production deployment remain unverified. Jev selected
  the direct `aria-label` correction at confidence 1.00, request
  `893ff52ce53ae5910c35194f97c7a2485b9f6caf8ce89b02cf12e8a8699dae3a`.

### 2026-09-22: Hosted status signal scope

- Closed the local `STATUS-EXECUTION-SIGNAL` presentation gap without claiming
  end-to-end inference. The public `/status` hero and summary now identify
  dependency and route checks; the Chat and Voice rows are explicitly routing
  checks, and the hero says a passing result does not verify a usable model
  answer. No health probe, provider request or provider-cost policy changed.
- The status-page regression failed before the correction and passed eight
  tests afterward. Web typecheck and targeted ESLint passed. The settled
  `localhost:3100/status` accessibility tree showed the new labels and scope
  above the detailed rows. It also showed a failing local Work queue check
  and local 30-day Chat SLO of 93.69% over 111 events; these development
  readings do not establish a production outage or a Free-user launch pass.
- The separate authenticated Free-chat response gate remains open. Jev
  selected the scoped-signal approach at confidence 0.93, request
  `47caf48ae64cb7dcc4a4bc7646ac8efddc693f2e9bce03d9812c561d498d7067`.

### 2026-09-22: Local Work queue signal attribution

- A read-only query against the isolated localhost database found exactly two
  queued `media-generation.image-attempt` jobs, both created on Sep 22 with
  zero attempts, no worker lease and no recorded error. Their due times had
  passed by more than 22 hours when inspected. No payload or user content was
  read or printed.
- `vercel.json` declares the production drain endpoint every five minutes;
  the running `next dev` server does not establish that a scheduler invokes
  it locally. The local Work failure is therefore consistent with an
  undrained development queue, not evidence of a production queue failure.
  The old jobs were not dispatched or altered because draining would execute
  provider work. Live local media-generation completion and production queue
  health remain unverified.

### 2026-09-22: Workspace audit interactive authentication candidate

- The Enterprise owner's audit page sent a Clerk session token as a bearer
  credential. The audit route deliberately treats any bearer as a workspace API
  key, so it rejected that token instead of using the signed-in browser session.
  The audit export already used the cookie-backed route correctly.
- The audit query now uses a same-origin credentialed request without an
  Authorization header. This preserves the route's API-key path for callers
  that explicitly provide an API key and its fail-closed handling of invalid
  bearers. A regression failed before the change; the hook, route and caller
  suites passed 39 tests afterward. Web typecheck, targeted lint and formatting
  passed.
- `ENTERPRISE-AUDIT-AUTH` remains pending. The available browser session is
  signed out; a signed-in Enterprise owner must verify the rendered trail and
  authorization behavior before the launch case can pass. No deployment or
  production verification is claimed.

### 2026-09-22: Browser QA runtime non-reproduction and evidence limit

- The existing `localhost:3100` Next server and its esbuild child were observed
  alive before and after five in-app Browser navigations: `/pricing`,
  `/enterprise`, `/help`, `/web`, and `/chat` (which redirected to sign-in).
  `/status` still returned 200. This signed-out route sample does not reproduce
  either earlier development-server exit or cover the authenticated Enterprise
  route sequence.
- The earlier issue file records the esbuild fatal-deadlock signature and lost
  connection, but not the complete stack, exact navigation sequence or parent
  process exit reason. An esbuild panic can also be a secondary effect of an
  upstream process exit; the current evidence cannot assign root cause. The
  runtime QA case remains pending rather than being closed or patched on a
  speculative compiler diagnosis.

### 2026-09-22: Responsive drawer current-state check

- Added a signed-in browser regression for the primary chat drawer actions at
  390px and 320px. On the current localhost:3100 build, New chat, AGI Code and
  Search all rendered within the viewport; the focused Chromium test passed.
- This narrows the historical `RESPONSIVE-CHAT-NAV-WORK` evidence, but does not
  close the case. The 360px model/reasoning controls and 768px Work dock still
  need live geometry and interaction checks, including the dock-close state.
