# Website launch working ledger

Status: In progress
Owner: Website launch preparation
Last updated: 2026-09-19

This is the entry point for current work. Historical audit artifacts remain immutable. Their local paths and fingerprints are
recorded in [QA_COVERAGE.json](QA_COVERAGE.json); they are not tracked documentation links.

Read [LAUNCH_PLAN.md](LAUNCH_PLAN.md), [QA_COVERAGE.json](QA_COVERAGE.json),
[QA_ISSUES.md](QA_ISSUES.md), [REFERENCE_INDEX.md](REFERENCE_INDEX.md),
[DEMO_CHAT_FINDINGS.md](DEMO_CHAT_FINDINGS.md), [JEV_ARCHITECTURE.md](JEV_ARCHITECTURE.md),
and [PRODUCTION_REMAINING.md](PRODUCTION_REMAINING.md) before continuing.

## Current state

Source identity and preexisting dirty file hashes: [source-baseline.json](source-baseline.json).
No existing changes discarded. No push, deployment, production migration, or original-chat mutation.
Audit decisions independently counted: 7,803 done; 9,597 partial; 5,076 missing; 6,639 unverified.
All 29,115 reviewed. Historical GLOBAL NO-GO preserved.
Seven historical drift entries affect Jev tooling/workflow/dependencies and a routing-document date;
none establishes a current website runtime pass. Do not regenerate the snapshot.

Jev selected implementation/QA (0.93) and systematic debugging (1.00), request hash
84b2aae71d999fc6fbe77a7fe2097c08827c4879dc08bb68d36ebf1090186c46.
No private demo data supplied. Product conversation routing unchanged.

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
