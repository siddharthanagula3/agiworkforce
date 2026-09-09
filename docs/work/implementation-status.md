# Parity Implementation Matrix

Status: Current
Owner: Founder + platform lead
Last updated: 2026-09-07

This is the implementation-facing parity matrix for AGI. It turns the high-level source of truth into feature, option, component, contract, and surface requirements that technical agents can execute without inventing their own product.

Use this with `docs/product/definition.md`. If they conflict, update both in the same change.

## Web workflow audit, 2026-09-06

Scope: the web product, including its server routes and shared owners consumed
by web. This is a source and isolated-test audit of 26 workflow groups, not a
production certification or a new claim of competitor parity. The reviewed
working tree included other ongoing edits, including the model catalogue;
the base revision recorded during the audit was `7b870e977`. Earlier dated
tables below remain historical evidence where their web status differs from
this section. No other surface has been re-audited here.

The completion standard is
[experience-contract.md, section 16.1](../product/experience-contract.md#161-web-workflow-acceptance-criteria).
That document owns acceptance criteria; this section owns audit evidence and
the remaining execution queue. The previous conversational estimate of
250–500 hours is not a scoped implementation commitment: this pass found
substantial existing code in several areas previously labeled unverified.

### Evidence vocabulary

- **Implemented; live verification open:** a mounted/consumed code path was
  traced, with relevant tests where listed. It has not passed full live
  acceptance in this audit.
- **Partial:** a concrete limitation exists relative to the acceptance target.
- **Defect:** an observed incorrect behavior with reproduction or a traced
  failure path. Defects are recorded in the known-flaw ledger, not counted
  again as new features to build.
- **Intentional boundary:** the product explicitly does not execute the action
  in a browser. An honest handoff is valid behavior.
- **Unverified:** the audit lacks evidence. This does not mean missing.

### Workflow inventory and remaining work

All source paths in this table are relative to `apps/web/`. The W identifiers
map directly to section 16.1 of the experience contract. B1–B6 refer to the
test batches recorded below. A passing mocked test is never a live pass.

| ID  | Workflow and owner paths                                                                                                                                | Audit status / evidence                                                                                                                                                                                          | Remaining work before acceptance                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W01 | Identity/onboarding: `app/welcome/page.tsx`, `features/onboarding/components/OnboardingWizard.tsx`, `features/onboarding/lib/onboarding-preferences.ts` | Defect: late seed response overwrites edited name; reproduced. Completion/save tests and logout cleanup pass in B1.                                                                                              | Fix dirty-field/seed ownership and cover initial read failure. Then verify login return targets, fresh-account completion/skip, expired sessions, and account switching in a real browser.                                  |
| W02 | Chat: `features/chat/pages/WebChatPage.tsx`, `lib/hooks/useChatStream.ts`                                                                               | Defects: older archived restore can announce success without restoring the sidebar entry; bulk-delete/publication cleanup can remain incomplete after a successful retry. B6 passes existing lifecycle fixtures. | Fix restore upsert and transactional/retryable publication revocation. Prove create/send/stop/edit/branch/retry/archive/delete with delayed uploads and reconnects against durable storage.                                 |
| W03 | Model catalogue: `features/chat/lib/use-model-catalogue.ts`, `app/api/models/catalogue/route.ts`                                                        | Defect carried forward: status-driven effect repeatedly fetches after failure; earlier same-conversation probe reproduced it and current source still has the transition.                                        | Bound fetch/retry lifecycle; then verify UI admission matches plan/deployment/route policy and actual fallback across the advertised route matrix.                                                                          |
| W04 | Attachments: `features/chat/services/chat-attachment-upload.ts`, `app/api/files/[id]/route.ts`                                                          | Implemented; generated-file pipeline B1 uses an in-memory object store.                                                                                                                                          | Verify each advertised file format with real storage, extraction failure, size/count rejection, unauthorized download, retry, and conversation switching.                                                                   |
| W05 | Project knowledge: `lib/services/project-context-service.ts`                                                                                            | Partial plus carried-forward defect: file-level substring ranking and leading excerpts; ASCII-only query terms lose non-Latin relevance. Earlier probe reproduced omitted Russian evidence.                      | Add language-aware passage retrieval and a fixed answer-position/language evaluation set; validate shared project permissions and extraction states. Truncation disclosure already exists and is not a new missing feature. |
| W06 | Memory: `lib/services/managed-memory-context-service.ts`                                                                                                | Partial relevance selection (pinned/recency rather than current-question ranking), plus reproduced memory-save and client-status defects in the follow-up. Prior review passed project-scope tests.              | Fix failed/out-of-order privacy saves and stale status first. Evaluate older relevant recall, exclusions, provenance, import, delete and temporary chats.                                                                   |
| W07 | Search: `features/chat/services/global-search-service.ts`, `app/api/search/route.ts`                                                                    | Implemented search/history routes; existing pagination defect also reproduced in Archived chats after restoring a loaded row. Deleted chats has the same source pattern.                                         | Reconcile pagination after row removal. Verify filters, ranking, message anchoring, permission changes and empty/error states on real seeded data.                                                                          |
| W08 | Research: `app/api/llm/v1/chat/completions/lib/research-loop.ts`, `features/chat/components/research/ResearchReportView.tsx`                            | Implemented planning/gathering/synthesis/recovery path; prior research tests passed. Fine-grained source steering and real citation quality remain unverified.                                                   | Fixed source/citation evaluation; verify source controls, interrupted resume, report export, and provider usage reconciliation. Do not infer quality from loop iteration counts.                                            |
| W09 | Artifacts: `features/chat/components/artifacts/ArtifactPreview.tsx`, `features/chat/services/artifact-cloud-sync.ts`                                    | Implemented preview/edit/version/restore/publish/sync; partial editing ergonomics (textarea source editor). Prior sync tests passed.                                                                             | Validate revision/restore and sync conflict behavior across fresh browser contexts; improve focused change inspection and editing to meet W09.                                                                              |
| W10 | Sharing: `app/api/share/route.ts`, `app/api/share/[token]/route.ts`, `features/chat/components/share/ShareConversationDialog.tsx`                       | Sharing paths exist; B1 passed link fixtures. September 7 probe reproduced a publication remaining readable after failed bulk-delete cleanup and a success-reporting retry.                                      | Fix deletion/revocation atomicity and reject public access to deleted-source content. Verify separate-browser revoke/expiry, associated files, workspace policy and snapshot/fork behavior.                                 |
| W11 | Library: `app/chat/library/page.tsx`, `app/api/library/route.ts`, `app/api/files/[id]/route.ts`                                                         | Implemented download/listing paths; B1/B5 file fixtures pass. Known Library offset drift remains in the current removeFromPage implementation (source rechecked September 7).                                    | Fix pagination after mutations and verify real file bytes, storage failures, download authorization, expired references and restore/delete behavior.                                                                        |
| W12 | Media: `app/api/media/video/generate/route.ts`, `lib/services/video-job-reconciliation-service.ts`                                                      | Implemented durable job/admission/reconciliation paths; image/video generate/status/cancel tests pass in B2.                                                                                                     | Real-provider generation and download, refresh during submission uncertainty, delayed callback, storage outage, and accounting reconciliation. No live media purchase occurred in this audit.                               |
| W13 | Voice: `features/chat/hooks/use-voice-session.ts`, `app/api/llm/v1/audio/transcriptions/route.ts`                                                       | Implemented, with completed-text-to-speech limitation; capture/voice/transcription suites pass in B2.                                                                                                            | Measure first audio and interruption latency on actual devices/browsers; validate permission loss and cleanup. Realtime audio is a separate enhancement, not a correction to a fake voice feature.                          |
| W14 | Connectors: `lib/connectors/mcp-context-service.ts`, `lib/connectors/oauth-store.ts`, `lib/user-connector-tools.ts`                                     | Implemented; B1 exercises authorization, stored grants, tool discovery/use, refresh, revoke, reconnect, and deconfiguration with mocked services.                                                                | Repeat lifecycle with disposable real connectors and source permissions. Tests mocking auth/egress do not establish real boundary enforcement.                                                                              |
| W15 | Skills/plugins: `features/skills/services/skills-catalog.ts`, `features/plugins/server/directory/install.ts`, `app/api/plugins/installations/route.ts`  | Implemented with runtime/source gates; catalog, CRUD, install, and API suites pass in B3.                                                                                                                        | Verify installed content is used on the next turn; disable/uninstall/update and unavailable runtime/credentials must remain honest in a real browser.                                                                       |
| W16 | Tasks/approvals: `features/tasks/components/TasksPage.tsx`, `lib/workflows/cloud-agent-workflow-stream.ts`                                              | Implemented task history and rerun handoff; task page and code approval suites pass in B1. Approval tests cover replay/concurrent decision rejection.                                                            | Close-tab continuation against a real durable runner; verify cancel/deny prevents new actions and a fresh browser reconstructs the same task.                                                                               |
| W17 | Schedules/notifications: `features/schedules/components/SchedulesPage.tsx`, `lib/services/schedule-service.ts`, `app/api/cron/run-schedules/route.ts`   | Implemented scheduling paths; B1/B4 pass. Follow-up reproduced skipped browser push revocation when the server removal request rejects.                                                                          | Fix logout revocation failure. Verify real contention/DST, cron lag, and opt-in delivery/account switching. Mobile opt-in does not authorize browser notifications.                                                         |
| W18 | Code/notebooks: `app/code/page.tsx`, `features/code/CloudCodePage.tsx`, `app/api/code/sessions/[sessionId]/notebook/execute/route.ts`                   | Mounted at `/code`; `/chat/code` redirects. Code page/approval/notebook suites pass in B1/B3. Deployment, storage and plan gates exist.                                                                          | Real sandbox task/cell/diff, resume/expiry, limits, denied approvals, and sandbox egress. External repository writes need a disposable repository.                                                                          |
| W19 | Settings/privacy: `app/settings/_lib/preferences-client.ts`, `app/api/settings/preferences/route.ts`                                                    | Defects reproduced: Memory saves hide failure and concurrent capability writes can restore an earlier value. Read/write scope tests pass in B2/B4/B5.                                                            | Make acknowledged state, errors/retry and save ordering consistent; propagate successful changes to mounted consumers. Exercise account/workspace cache reset.                                                              |
| W20 | Billing/usage: `app/api/checkout/route.ts`, `app/api/stripe-webhook/lib/`, `lib/services/managed-usage-request-service.ts`                              | Implemented; checkout and unpaid-entitlement suites pass in B1.                                                                                                                                                  | Payment test-mode round trip, duplicate/out-of-order webhook delivery, invoice/usage reconciliation, concurrent reservation settlement, cancellation and supported refund flows. No financial mutation was made.            |
| W21 | Export/deletion: `app/api/user/export/route.ts`, `app/api/user/delete-account/route.ts`                                                                 | Two export defects: incomplete sections report success and private object keys lack usable download references. Scope/deletion suites pass in B1/B2/B5.                                                          | Fail or explicitly mark partial export when any section fails; demonstrate usable private-file references. Verify seeded multi-workspace export and full purge/cancel behavior without touching real user data.             |
| W22 | Workspace admin: `app/api/settings/team/`, `app/api/settings/organization/`                                                                             | Implemented; shared-resource isolation, invite lifecycle, team isolation and preference scope suites pass in B1/B4. Existing enterprise browser specs were inspected, not run.                                   | Real owner/admin/member requests and policy propagation; role changes, seat races, member removal, sharing gates and audit records.                                                                                         |
| W23 | Accessibility/responsive UI: `shared/components/accessibility/`, `e2e/qa-*.spec.ts`                                                                     | Source assertions pass in B2; no fresh rendered audit.                                                                                                                                                           | Keyboard, screen reader, zoom, narrow layouts, actual contrast, reduced motion, overlays and long transcripts on release-supported browsers.                                                                                |
| W24 | Performance/release: `playwright.config.ts`, `lib/workflows/durable-stream-liveness.ts`                                                                 | Defensive mechanisms and existing test infrastructure; live SLOs, concurrency, rollback and deployment readiness unverified.                                                                                     | Record measured budgets and task outcomes against a known revision; execute real limiter/load and migration/rollback checks separately from scaled UI tests.                                                                |
| W25 | Device entry: `app/pair/pair-body.tsx`, `app/api/settings/devices/route.ts`                                                                             | Intentional boundary: browser tells the user pairing must start in Desktop and finish in the phone app. Device/code validation suites pass in B4.                                                                | Validate truthful handoff and owned device revoke UI; physical pairing is an external-surface dependency, not an absent browser pairing implementation.                                                                     |
| W26 | Support/feedback: `features/support/components/SupportWidgetMount.tsx`, `app/api/support/ask/route.ts`, `app/api/feedback/route.ts`                     | Widget is deployment-gated; ask/action suites pass in B4. Feedback route has validation and storage handling; delivery not exercised.                                                                            | Confirm availability copy, input recovery, source-backed answers/abstention, scoped action confirmation, and test-recipient delivery where enabled.                                                                         |

### Remaining work in execution order

1. **Correctness fixes:** prioritize misleading Memory privacy state, logout
   push revocation and incomplete publication revocation, then archived restore,
   mutation-safe pagination, capability save ordering, stale memory status, usable
   export references, and the tracked catalogue retry loop, non-Latin project
   query handling, onboarding seed overwrite and partial-export success.
   Each fix needs a regression assertion for correct behavior, not a test that
   merely reproduces the defect.
2. **Data and authorization release gates:** W04/W10/W11/W21/W22 with seeded
   accounts, real isolated database/object storage, and browser/API assertions.
   Resolve usable export references and incomplete-export disclosure before
   presenting export as complete.
3. **Durable task and billing release gates:** W02/W12/W16/W17/W18/W20 with
   controlled provider failures, concurrent requests, test-mode billing and a
   fresh browser. Confirm acknowledged state and charges independently of UI.
4. **Competitive depth:** W05 passage retrieval, W06 relevant recall, W08
   source controls and citation evaluation, W09 revision ergonomics. These are
   scoped enhancements; existing CRUD, loops and sync should be reused.
5. **Usability/performance:** W01/W03/W07/W13/W19/W23/W24, then the enabled
   integration/support flows W14/W15/W25/W26. Voice architecture changes depend
   on measured latency and the intended product promise.

### Validation run in this audit

**655 existing tests passed across 44 suites**, in four batches. Two temporary
probes separately reproduced onboarding overwrite and incomplete export;
they were removed afterward. The export probe also reran its copied scoped
fixture tests, which are not counted again in the 655. Earlier in this
conversation, 73 tests and two other probes covered research, memory scope,
artifact sync, concurrent attachments, catalogue failure and Cyrillic
retrieval; those are separate earlier evidence, not part of this run total.

All paths below are relative to `apps/web/`. Each batch was invoked with
`pnpm --filter @agiworkforce/web test` followed by the listed paths. Individual
paths containing brackets should be shell-quoted when rerunning.

| Batch | Result                       | Exact test paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1    | 19 suites / 255 tests passed | `features/onboarding/components/OnboardingWizard.test.tsx`; `shared/stores/authentication-store.logout-cleanup.test.ts`; `app/api/checkout/route.test.ts`; `app/api/stripe-webhook/lib/__tests__/unpaid-checkout-entitlement.test.ts`; `app/api/share/route.test.ts`; `app/api/share/[token]/route.test.ts`; `app/api/user/export/__tests__/export-covers-personal-data.test.ts`; `app/api/user/delete-account/__tests__/route.test.ts`; `app/api/user/delete-account/cancel/__tests__/route.test.ts`; `lib/services/schedule-service.test.ts`; `features/schedules/components/SchedulesPage.test.tsx`; `app/api/cron/run-schedules/route.test.ts`; `features/tasks/components/TasksPage.test.tsx`; `features/code/CloudCodePage.test.tsx`; `lib/services/__tests__/cloud-code-agent-approval-service.test.ts`; `lib/connectors/__tests__/oauth-connector-lifecycle.contract.test.ts`; `app/api/library/__tests__/route.test.ts`; `app/api/files/[id]/__tests__/generated-file-pipeline.integration.test.ts`; `app/api/settings/organization/shared/__tests__/route.cross-org-isolation.test.ts` |
| B2    | 12 suites / 271 tests passed | `__tests__/api/media-image-generate.test.ts`; `__tests__/api/media-video-generate.test.ts`; `__tests__/api/media-video-status.test.ts`; `__tests__/api/media-video-cancel.test.ts`; `lib/services/video-job-reconciliation-service.test.ts`; `app/api/llm/v1/audio/transcriptions/route.test.ts`; `features/chat/hooks/use-voice-session.test.tsx`; `features/chat/services/__tests__/global-search-service.test.ts`; `features/chat/components/share/ShareConversationDialog.test.tsx`; `app/api/user/export/__tests__/route.scoped-db.test.ts`; `shared/components/accessibility/accessibility-surface.test.ts`; `app/settings/__tests__/settings-routes-reachable.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| B3    | 5 suites / 47 tests passed   | `features/skills/services/skills-catalog.test.ts`; `app/api/skills/__tests__/skill-crud.test.ts`; `features/plugins/server/directory/__tests__/install.test.ts`; `app/api/plugins/installations/__tests__/route.test.ts`; `app/api/code/sessions/[sessionId]/notebook/execute/route.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| B4    | 8 suites / 82 tests passed   | `lib/services/__tests__/schedule-notification-service.test.ts`; `lib/validations/__tests__/device-pairing-codes.test.ts`; `app/api/settings/devices/__tests__/route.test.ts`; `app/api/support/actions/__tests__/routes.test.ts`; `app/api/support/ask/route.test.ts`; `app/api/settings/team/invitations/__tests__/route.lifecycle.test.ts`; `app/api/settings/team/__tests__/route.cross-org-isolation.test.ts`; `app/api/settings/preferences/__tests__/rls-scoped.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Follow-up failure audit, 2026-09-06

Five additional findings are recorded in
[the known-flaw ledger](../agent-context/known-flaws.md#2026-09-06-web-workflow-audit-nine-open-correctness-findings):
misleading Memory state after rejected saves, browser push revocation skipped
on transport failure, out-of-order capability saves, unusable private-media
export references, and stale client memory status. As of September 6 this brought the audit's
tracked findings to nine; it is not a count of every open repository defect.

B5: **9 existing suites / 81 tests passed**, invoked with the same web test
command and these paths: `features/settings/sections/__tests__/MemorySection.test.tsx`;
`features/settings/sections/__tests__/CapabilitiesSection.test.tsx`;
`features/notifications/lib/__tests__/web-push-client.test.ts`;
`lib/services/__tests__/web-push-service.test.ts`;
`app/api/web-push/__tests__/route.test.ts`;
`app/api/user/export/__tests__/route.scoped-db.test.ts`;
`lib/server/media-storage.test.ts`;
`shared/stores/authentication-store.logout-cleanup.test.ts`;
`app/api/files/[id]/__tests__/generated-file-pipeline.integration.test.ts`.
Some repeat earlier coverage; this total is separate from the initial 655.

Seven new reproduction/control cases also passed across five temporary probe
files: rejected Memory save with remount, reverse-order successful saves with
remount, push transport rejection, an HTTP-error unsubscribe control, private
key export output, failed-read cache recovery after explicit reset, and the
mounted composer's stale Memory off indicator after a preference-save event.
The two probe invocations reported 24 and 7 assertions because they reused
existing fixture tests; those totals are not additional unique regression
coverage. Temporary files were removed after recording the reproducible steps.

These probes execute real UI/helpers/handlers with controlled dependencies.
The save-order double applies namespace snapshots when each pending operation
completes, matching the traced preference PUT behavior; it does not prove live
PostgreSQL timing. The composer probe uses an already-persisted per-chat memory
opt-out and the real save-event name, not a browser interaction with Settings.
Browser push delivery after logout and downloading exported production media
were source-traced only. The memory-status result does not establish a server
policy bypass. Production code was not changed.

### Deletion and restore continuation, 2026-09-07

Two new findings were reproduced: bulk-delete publication cleanup cannot
recover through the same bulk action after its first attempt partially commits,
and an archived chat absent from the loaded sidebar slice is not added there
when restore succeeds. The audit now tracks **11 new findings across its
initial and follow-up passes**. The previously known pagination defect was
also reproduced on Archived chats and source-traced in Deleted chats; its
existing ledger entry was updated instead of adding another count.

B6: **9 existing suites / 68 tests passed** with the web test command and:
`features/settings/sections/ConversationDataSections.test.tsx`;
`features/settings/services/conversation-data-service.test.ts`;
`app/api/chat/conversations/bulk/route.test.ts`;
`app/api/chat/conversations/[id]/restore/route.test.ts`;
`app/api/chat/conversations/route.archived-filter.test.ts`;
`lib/services/published-artifact-service.test.ts`;
`app/api/settings/sessions/route.test.ts`;
`app/api/settings/sessions/[sessionId]/route.test.ts`;
`features/settings/sections/AccountSection.sessions.test.tsx`.

Three additional probe cases passed in two temporary files: partial bulk delete
plus retry and public-token access, restore with an empty sidebar store, and
restore-before-pagination against a mutable archived-row fixture. The invocation
reported 10 assertions because seven existing component tests were copied as
fixture coverage. These temporary files were removed after recording the steps.

The publication probe used the real route and publication service with a
stateful database double; direct unpublish made the same token unreadable as
a control. Source inspection established separate scoped statements and no
soft-delete publication trigger. The existing bulk-delete test only checks the
500 response, which cannot establish rollback. This is not a live PostgreSQL
or anonymous-browser result. The archive probe used the canonical page-size
constant and asserted that the skipped row remained in its server fixture;
passing over an actually empty result set could not produce its finding.

No additional account-session defect was established in this continuation.
Provider-side session invalidation and real browser recovery remain acceptance
work. Production code was not changed.

Instrument qualifications:

- `test/setup.ts` points database variables to an unroutable local port and
  sets `AGI_KV_PROVIDER=none`; unit tests cannot establish live database policy
  or deployed limiter behavior. It also mocks CSRF by default, so a passing
  route suite must not be reported as CSRF proof unless it restores that owner.
- The connector lifecycle fixture mocks OAuth/MCP/auth/egress. The generated
  file pipeline fixture uses in-memory assets/object storage. These prove
  application orchestration under their inputs, not third-party availability.
- Export inventory and accessibility-surface tests inspect source text. Export
  scope tests execute the handler with a mocked database; actual PostgreSQL RLS
  and retrieval of exported file bytes remain unverified.
- B1 schedule execution emitted notification warnings because its database
  stub did not supply notification preference rows. That warning was not
  classified as a production defect. The dedicated notification suite passed
  in B4. An initially supplied notification test filter omitted `__tests__`
  and matched no file in B2; the 12-suite count above excludes it.
- Playwright loads `.env.local`; its server overrides Redis credentials and
  scales rate limits but does not replace the database/identity/provider
  configuration. Some authenticated specs mint a ticket for a designated QA
  account. Reusing an existing server can also bypass server setup. No browser
  sweep was run without first establishing a separate test environment.
- No full build, whole-web typecheck, production mutation, payment, provider
  generation, message to another person, load test or physical-device run was
  performed. Live acceptance for all 26 groups remains open until evidence is
  attached to the specific criteria; this audit itself is complete at the
  source/isolated-test level.

### Wave 3 continuation, 2026-09-07 evening

Scope: the founder's completion mandate for the web product, run as a lead plus
four executors on the shared checkout, starting from the register above and
W01 to W26. Revision at the start of the wave: `bfa4db827`. This section is
the execution queue and evidence for that wave; the audit tables above stay
as the evidence they were.

Status vocabulary in the matrix below: **verified complete** (a live run or a
production check behind it), **implemented; live verification open** (a
traced code path with tests, no live acceptance yet), **partial** (a concrete
limitation remains), **confirmed defect** (a register row still open),
**missing required capability**, **intentional platform boundary**, and
**unknown** (no evidence either way). A mocked test never promotes a row past
"implemented".

#### Schema

Migration `0175_plugin_marketplace_uploads.sql` (a `kind` on plugin sources, a
nullable repository url constrained by kind, and `plugin_marketplace_entry_files`
under owner row level security) was rehearsed on a branch cloned from
production, where the apply ran clean and the row level security probe passed
33 tables, then applied to production and recorded against `129c33946`.
Production is at 175 applied, 0 pending, 0 drift; `/api/health`, `/`, `/login`
and `/pricing` answered 200 afterwards. The dependency guard carries an
allowlist row for the one module that references the new column.

#### Matrix, rows that changed in this wave

| Workflow                     | Expected outcome                                                                                                                                           | Current evidence                                                                                                                                                                                                                                          | Status                              | Root cause and owner                                                                                    | Acceptance criteria | Verification                                                                              | Remaining dependency                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| W01 sign-in and onboarding   | A lapsed session lands on a recovery page that explains itself and returns the user where they were; a delayed profile read never overwrites a typed name. | Seven protected layouts and two gated pages redirect through one helper to `/session-expired`; the wizard keeps edited fields when the seed resolves late.                                                                                                | Implemented; live verification open | Layouts redirected to bare sign-in (`7fba1e305`); seed callback assigned unconditionally (`b9d9fe8e6`). | W01                 | Component and guard tests; no browser run with a real expired cookie.                     | Live expiry against Clerk in a real browser.                                                              |
| W02 chat lifecycle           | Two near-simultaneous sends start one billed run; a failed send keeps the draft; stopping a stream keeps what arrived.                                     | Per-conversation advisory lock in a new admission owner, 409 to the loser with the reservation refunded (`956f648fc`); composer restores text and attachments on failure (`5679154d6`); interrupted artifact persisted as such (`3e3b9a773`).             | Implemented; live verification open | Two statements under read committed both saw no active run.                                             | W02                 | Route test drives two concurrent posts through a transaction-aware fake; component tests. | Browser run firing two sends within 100 ms against the running server, with the billing ledger read back. |
| W06 memory                   | "Never remember" terms apply to every write.                                                                                                               | One write gate in `memory-write-service.ts`; manual create, edit, import commit and cross-device sync all pass through it; a structural test pins every route under `app/api/memory` to the gate (`af1bf499a`).                                           | Implemented; live verification open | Only auto-captured facts were filtered.                                                                 | W06, W19            | Route tests with the gate's read stubbed.                                                 | A turn in an open tab after adding a term.                                                                |
| W07 search and history       | Sidebar recents page past fifty.                                                                                                                           | Not landed in this wave; executor item 5 pending behind the screenshot gate.                                                                                                                                                                              | Confirmed defect                    | WEB-WEB-CHAT-PAGE-SIDEBAR-RECENTS-LIST-HARD-01.                                                         | W07                 | none                                                                                      | turn-integrity-executor item 5.                                                                           |
| W10 public sharing           | Shared transcripts never carry local paths.                                                                                                                | Scrubber walks tool calls recursively (`cb3e9c6b1`).                                                                                                                                                                                                      | Implemented; live verification open | The only scrubbed field was one no caller populated.                                                    | W10                 | Route tests on the stored payload.                                                        | Signed-out browser read of a share with tool calls.                                                       |
| W12 image and video          | Provider failures reach the user as app copy, never upstream text.                                                                                         | Category to copy map with one generic fallback (`34c5deb86`).                                                                                                                                                                                             | Implemented; live verification open | Fallback branch echoed the raw message.                                                                 | W12                 | Route test with a credential-shaped upstream body.                                        | Real provider failure.                                                                                    |
| W15 skills and plugins       | A user can bring a plugin as a zip and see its skills in the composer.                                                                                     | Migration 0175 applied; upload route validates with the existing manifest parsers and ceilings, stores files durably, installs through the existing service (`990f57f41`, `5dc0c6158`). Authored plugins, upload skill and the Add menus are in progress. | Partial                             | Sources required a github url and skill bodies lived in a public ninety day cache.                      | W15                 | Route and service tests; browser evidence pending the Add menu gate.                      | plugins-executor items C to E.                                                                            |
| W16 work tasks and approvals | A tool blocked mid-run is refused on the next dispatch; a push notification opens the run it names.                                                        | Permission re-read on every durable dispatch with a persisted refusal event (`8e858426c`); tasks page reads the run parameter the worker writes (`0d45f9f49`).                                                                                            | Implemented; live verification open | Permission read once per run; page ignored the parameter.                                               | W16, W17            | Workflow and page tests.                                                                  | Close-tab continuation and a real push click.                                                             |
| W19 settings and privacy     | Consent withdrawal stops the next analytics event in the open tab; concurrent capability saves keep the last intent.                                       | Withdrawal reaches the analytics gate (`f823bb6b1`). The preferences precondition and capability save ordering are in progress.                                                                                                                           | Partial                             | Withdrawal wrote a record the gate never read.                                                          | W19                 | Component test on the gate.                                                               | privacy-executor item 4.                                                                                  |
| W20 billing and usage        | A fleet-wide reset ledgers what it cleared.                                                                                                                | Update joins a locked snapshot and returns the pre-update balance (`6d29e38d2`).                                                                                                                                                                          | Implemented; live verification open | `returning` read the zero it had just written.                                                          | W20                 | Service test simulating returning semantics.                                              | An operator run against a seeded database.                                                                |
| W21 export and deletion      | An export says when it is incomplete and how to retry.                                                                                                     | Completeness ledger on every section read; json reports success only when complete; download carries a status header (`6978ca9ca`).                                                                                                                       | Implemented; live verification open | Failed reads returned empty arrays under a success response.                                            | W21                 | Four route tests.                                                                         | Seeded-account export with a forced section failure.                                                      |
| W22 workspace administration | Leaving or being deprovisioned closes the same access; deleting a directory sync connection revokes what it granted.                                       | Self-leave runs the admin deprovision and reports what it could not revoke (`d37a3d30b`); directory sync deletion revokes memberships and credentials with an audit row (`0db44e9f3`).                                                                    | Implemented; live verification open | Two offboarding paths ended in two states.                                                              | W22                 | Route tests plus the coverage guard listing every removal path.                           | Two-workspace browser run with real roles.                                                                |
| W25 device entry points      | Pairing initiation is protected like every other cookie-authenticated mutation.                                                                            | Csrf gate on the route and the coverage guard matches the identity helper (`f1c86148d`).                                                                                                                                                                  | Verified complete at the unit level | Route used a helper the guard did not match.                                                            | W25                 | Coverage guard plus route suites.                                                         | none                                                                                                      |
| Public catalogue             | Deprecated and not-live models are distinguishable.                                                                                                        | Lifecycle block on every entry (`66e41ea14`).                                                                                                                                                                                                             | Implemented; live verification open | No field carried status.                                                                                | W03                 | Route test against the catalogue source.                                                  | none                                                                                                      |
| Desktop download             | The standard installer reads the same repository every other release route reads.                                                                          | Download route and trusted asset allowlist resolve through the release repository owner (`32e2fcad7`).                                                                                                                                                    | Implemented; live verification open | Two private defaults disagreed.                                                                         | W24                 | Route test with the override cleared.                                                     | A production download.                                                                                    |
| Sync                         | A dirty conversation keeps only the fields its push will send.                                                                                             | Per-field merge on the dirty set (`6e18f829b`).                                                                                                                                                                                                           | Implemented; live verification open | Pull discarded every remote field.                                                                      | W02                 | Package tests.                                                                            | Two-device edit.                                                                                          |
| Transcript                   | Thinking blocks label their own region; a clarify card shows it is busy.                                                                                   | Ids from the react id hook (`ce8437510`); in-flight flag from the card block (`711763c10`).                                                                                                                                                               | Implemented; live verification open | Content-derived ids; fire-and-forget submit.                                                            | W23                 | Component tests.                                                                          | none                                                                                                      |

#### Register delta

Rows closed in this wave, each in or beside its fixing commit:
WEB-OPERATOR-METRICS-FLEET-WIDE-USAGE-RESET-01, WEB-ROUTE-DEVICE-PAIRING-POST-BYPASSES-01,
WEB-ROUTE-SHARE-PAYLOAD-PATH-REDACTION-01, WEB-ROUTE-IMAGE-GENERATION-ECHOES-RAW-01,
WEB-ONBOARDING-SEED-OVERWRITE-01, WEB-EXPORT-PARTIAL-SUCCESS-01,
WEB-ROUTE-APP-API-DOWNLOAD-DEFAULTS-01, WEB-PAGE-SESSION-EXPIRED-RECOVERY-FULLY-01,
WEB-ROUTE-REMEMBER-EXCLUSION-TERMS-ENFORCED-01, WEB-ROUTE-SELF-LEAVE-DEPROVISIONS-DEPARTING-01,
WEB-ROUTE-NEAR-SIMULTANEOUS-TURNS-SAME-01, WEB-SW-WEB-PUSH-DEEP-LINK-01,
WEB-ROUTE-PUBLIC-MODEL-CATALOG-ENDPOINT-01, WEB-THINKING-BLOCK-THINKINGBLOCK-DERIVES-01,
WEB-CLARIFY-CARD-SEND-SKIP-BUTTONS-GIVE-01, WEB-CONSENT-CENTRE-ANALYTICS-WITHDRAWAL-01,
WEB-CLOUD-AGENT-WORKFLOW-TOOL-BLOCKED-RUN-01, WEB-ROUTE-DELETING-DIRECTORY-SYNC-CONNECTION-01,
WEB-CHAT-COMPOSER-NEW-WIPES-USER-MESSAGE-01, WEB-USE-STREAMING-ARTIFACT-INTERRUPTING-01,
WEB-CONVERSATIONS-PULL-SIDE-RECONCILIATION-01.

Intentional boundary recorded rather than built: the web product is
subscription-backed Managed Cloud and does not expose BYOK, so
WEB-WEB-SETTINGS-SECTIONS-BYOK-PAGE-PROVIDER-01 is not a missing feature; the
honest fix is to remove the unreachable page and endpoint from the web bundle,
which stays queued.

#### Verification actually performed

Every fix carries a regression test that was run in its own suite, and the
touched suites were rerun: operator metrics, csrf coverage and its two sibling
security suites, share, image generation (66), onboarding wizard, export (4
suites), desktop release routes, protected layouts guard, models route, tasks
page in both packages, thinking block, interactive card block (25). The web
typecheck was clean on the lead's files at each commit; the only errors on the
tree were executors' in-flight files. The pre-push guard chain ran green from a
clean worktree at `0d45f9f49`. CI on `8ce285a50` was cancelled by the next push;
CI on `0d45f9f49` is the run of record for this batch.

Not performed: no browser run against a real expired session, no two-device
sync run, no seeded two-workspace administration run, no payment test-mode
round trip, no provider failure injected live, no load test. Those remain open
under the criteria they belong to.

#### Live verification still open, in priority order

1. W02 concurrent send against the running server with the billing ledger read back.
2. W15 upload, authored and skill-upload paths in the browser behind the screenshot gate.
3. W19 capability save ordering and the preferences precondition (in progress).
4. W22 two-workspace role run through direct api requests and the ui.
5. W21 seeded export with a forced section failure and a media byte comparison.
6. W01 real expiry in a browser.

#### External dependencies

- Production deploy of this batch is gated on founder approval of the
  production-web job, as every deploy is.
- GitHub App installation revocation (authz item 3) needs the app's
  credentials in the environment to be exercised live; the code path can only
  be unit tested here.

#### Next implementation priority

turn-integrity item 5 (sidebar pagination), privacy item 4 (preferences
precondition and capability save ordering), authz items 3 to 7 (GitHub
revocation, shared project capabilities, the dead mcp route, ownership
transfer ui, takedown and erasure queues), plugins items C to E, then the
support live chat, whose server side (create, status, messages, claim,
presence) exists with no visitor or agent thread in the ui.

### Waves 4 and 5, 2026-09-07 night to 2026-09-08 morning

Scope: the founder's two follow-on directives after wave 3. First, "complete AGI
Code in website" with the lead reviewing every gate and walking the surface
(TEAM-BRIEF-4, D-37). Second, three production frames from 22:43 local on
2026-09-07: a turn on the free router stuck on "Connecting to OpenRouter Free
Auto", a reload rendering "The model returned no response for this turn", and
that banner spanning the transcript instead of sitting above the composer
(TEAM-BRIEF-5). Revision at the start of wave 4: `5129d08e8`'s parent; the
waves end at the commit named in the change record below.

#### Schema

Migrations 0176 (repository sessions: working branch, base branch, pull
request, cancel request, context tokens) and 0177 (the base branch a session
is measured against) were each rehearsed on a branch cloned from production
and then applied to production with the CLI and recorded. Production is at
177 applied, 0 pending, 0 drift. Two allowlist rows cover the modules that
reference the new columns.

#### What the production logs established about the free-route stall

The founder's turn created a durable workflow run 180 ms after the route's
last log line, so it took the durable agentic path, not the plain streaming
one. The durable provider step was already bounded at 210 s. What ran to the
platform's 800 s limit was the workflow writing to a stream whose only reader
died with the chat function at 300 s: the settle that transitions the run,
persists the assistant row and releases the reservation sat behind that write,
and the replay ceiling could not bind because the provider operation's unsafe
branch returned before the attempt check and a platform kill never counted as
an attempt. Nine runs had been stuck in `running` since 2026-09-03, replaying
at 800 s every few minutes (122 timeouts in twelve hours); the lead cancelled
them through the Workflow REST API. The client's "no response" banner was an
inference from a trailing user row older than 45 s, made while the server
still had minutes of budget.

#### Matrix, rows that changed in these waves

| Workflow                       | Expected outcome                                                                                                                                                                                                  | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Status                              | Root cause and owner                                                                                                            | Acceptance criteria | Verification                                                                                                                                                                                     | Remaining dependency                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| W18 AGI Code, repository work  | Pick a repository from a connected GitHub account or a URL, work on a branch of the session's own, read the real diff against the base branch, open one pull request idempotently, stop a turn, manage a session. | Repository listing and repository-backed creation, a working branch per session with the base branch recorded, changes and pull-request routes, cancel, rename, archive, hard delete, context accounting, a reaper for turns whose run died, and a durable turn behind `AGI_DURABLE_CODE_TURNS` (`378e5e184` to `fe55ffde0`, `5129d08e8`). UI: repository picker with first-run state, chips, Changes panel with per-file hunks, Create pull request, stop, session menu, archived banner, usage ring, transcript view (`fe55ffde0`). | Implemented; live verification open | The surface had no repository, branch, diff, pull request, stop or lifecycle path at all.                                       | W18                 | Route tests for every code route (eleven files), service suites, 111 component tests, six screenshot gates; the lead's own walk cloned octocat/Hello-World by URL, ran a turn and read the diff. | A GitHub App installation on the QA account for the private-repository, push and pull-request steps; the durable flag switch-on. |
| W18 AGI Code, session URL      | A session has its own URL that survives a reload and can be copied; an unknown or foreign id lands on the home with a stated reason.                                                                              | `/code/[sessionId]` route, navigation from the rail and creation, copy link, missing-session flag in the URL (`69c70313f`).                                                                                                                                                                                                                                                                                                                                                                                                           | Verified complete                   | Session lived in component state only.                                                                                          | W18                 | Seven component tests; the lead's rewalk reloaded the session URL on localhost.                                                                                                                  | none                                                                                                                             |
| W18 AGI Code, failure copy     | A failed turn never shows the provider's body or request id; every persisted failure sentence is app copy.                                                                                                        | Loop and service classify through the shared classifier and persist reader copy, raw body to the log (`6cd054e82`, `715ebe291`).                                                                                                                                                                                                                                                                                                                                                                                                      | Verified complete                   | The loop kept an error chunk's message verbatim; the service persisted any thrown message.                                      | W18, W12            | Nine loop tests, service test with a credential-shaped throw; the lead's rewalk read the rendered row.                                                                                           | none                                                                                                                             |
| W18 AGI Code, notices          | The page's error notice sits directly above the composer at its width; nothing lingers under a finished turn.                                                                                                     | Notice moved into the composer column (`e1cb27e90`); the idle brand mark that read as a spinner removed (`95f2d442f`).                                                                                                                                                                                                                                                                                                                                                                                                                | Verified complete                   | Notices rendered above the page's main column with no max width; a static copy of the spinner glyph was drawn after every turn. | W18, W23            | Placement tests, measured boxes at 1440 and 390, gates REVIEW-5 and REVIEW-6.                                                                                                                    | none                                                                                                                             |
| W02 chat, silent route         | A route that never speaks fails fast with an honest reason, on both dispatch paths, and rotates where a candidate exists.                                                                                         | Per-attempt first-token deadline and a turn budget under the client's grace, inline (`0c63a0395`) and in the tool loop (`633f5110c`), one shared race (`18372cc7c`).                                                                                                                                                                                                                                                                                                                                                                  | Implemented; live verification open | No deadline anywhere before the first byte; rotation only ever fired on a thrown error.                                         | W02                 | Route, helper and tool-loop deadline suites.                                                                                                                                                     | A turn on the free router against localhost with the stall reproduced by a stub, then production.                                |
| W02 chat, durable settle       | A durable run reaches a terminal state even when its reader is gone; a dead claimant cannot shelter an operation; the replay ceiling governs provider steps; an orphan is swept and told why.                     | Journal, then settle, then a bounded write (`601744607`); heartbeat-based dead-holder reclaim and the unsafe branch under the cap (`de6b745f9`, `e11c3b852`); quarter-hourly reaper with a reader-facing reason (`4353703a0`, `2898ef8d6`).                                                                                                                                                                                                                                                                                           | Implemented; live verification open | Settle gated behind an unread stream write; lease renewal masked a kill; unsafe branch returned before the attempt check.       | W02, W16            | Seven never-draining-writable tests, lease and cap suites, reaper suite; guard allowlist row with its reason.                                                                                    | A production run left to die on purpose and watched settle; the reaper's first production sweep.                                 |
| W02 chat, honest progress      | The step under "Working" says what the turn is waiting for, with elapsed time, and names a route switch.                                                                                                          | Connecting and waiting states with a counter, a switch row that does not drop the placeholder (`8f805d57c`).                                                                                                                                                                                                                                                                                                                                                                                                                          | Verified complete                   | The placeholder label was stamped before the fetch and never revised.                                                           | W02, W23            | Hook and label suites; gate REVIEW-1 at 1280 and 390, both themes.                                                                                                                               | none                                                                                                                             |
| W02 chat, reload during a turn | A reload reads the turn's outcome from the server: a recorded failure, a still-running run to re-attach to, or a real absence; "no response" is never inferred while the server is still working.                 | Pre-first-byte failure recorded as a truncated assistant row (`b59b5c718`); conversation-scoped active-run lookup and mount-time recovery (`93319cf86`).                                                                                                                                                                                                                                                                                                                                                                              | Implemented; live verification open | Chat runs were invisible to the only runs endpoint; the client inferred failure from a trailing user row.                       | W02                 | Route test for the filter, recovery hook suite, variants suite.                                                                                                                                  | A reload during a live turn on localhost.                                                                                        |
| W23 transcript, error banner   | The turn error banner sits directly above the composer at the composer's width on every width and theme; per-turn notices align to the message column; every notice action clears 44px on touch.                  | Notice resolved once and mounted in the composer column (`63e1e6ee4`); remaining notices aligned and targets raised (`7d33ce898`); a stopped empty turn no longer reads as a failure still starting (`dd0b3254f`).                                                                                                                                                                                                                                                                                                                    | Verified complete                   | Rendered in the virtualised footer with the pane's padding.                                                                     | W23                 | Placement and alignment tests, measured edges, gates REVIEW-1 to REVIEW-3.                                                                                                                       | none                                                                                                                             |
| W22 workspace plan             | A workspace whose Stripe anchor no longer matches a subscription resolves through its owner's live subscription; the pane and every server gate agree.                                                            | Owner branch opens when the anchor joins to nothing (`8c625e4bd`); Team pane administers the QA workspace on Enterprise at 1280 and 390.                                                                                                                                                                                                                                                                                                                                                                                              | Verified complete on localhost      | The resolver treated a present anchor as authoritative.                                                                         | W22                 | Resolver and admin-access suites; gate REVIEW-7. Production has no organizations yet, so no stale anchor exists there.                                                                           | Invitation and leave walks need a second member.                                                                                 |
| Trust page                     | The route counts match the tree.                                                                                                                                                                                  | Re-measured after the callerless routes were deleted (`9cdc55ff1`) and once more at the end of the waves.                                                                                                                                                                                                                                                                                                                                                                                                                             | Verified complete                   | Ten routes deleted, two cron routes added.                                                                                      | W24                 | `app/trust/rls-coverage-claim.test.ts`.                                                                                                                                                          | none                                                                                                                             |

#### Register delta

The web section of `docs/agent-context/known-flaws.md` now holds one row,
WEB-SEO-PROBE-404-01 (an extension surface). The three routing-preference and
non-streaming rows this section used to list were closed: the us_only overlay
is threaded into the resolver as of the 2026-09-08 stabilization pass
(ACTIVE_ISSUES.md AGI-8). The rows closed in these waves were removed in or
beside their fixing commits.

#### Verification actually performed

Every fix carries a regression test that was red first. The lead reviewed every
gate against its frames and walked AGI Code twice against localhost:3100: once
before the UI landed (a real clone by URL, a turn, the diff in the Changes
panel) and once after (the failure row rendered as app copy, the session URL
surviving a reload). The Team pane was driven on the workspace the QA account
owns. Production was read, not guessed: the runtime logs for the founder's
request, the Workflow REST listing of running runs, and a query showing zero
organizations. CI reds on `cbfc6698c` and `6a443f462` were each fixed forward
in a lead commit.

Not performed: no repository push or pull request against GitHub (no
installation on the QA account); no durable code turn (flag off everywhere);
no reload during a genuinely live turn; no production stall reproduced after
the deadline landed.

#### Live verification still open, in priority order

1. A free-router turn on production after deploy, watching the first-token deadline and the honest step.
2. A reload during a live durable turn on localhost, then production.
3. The repository journey with a real installation: private clone, push, pull request, idempotent second call, stop mid-turn.
4. The reaper's first production sweep and the Workflow REST listing staying empty.
5. W02 concurrent send, W22 two-member walk, W21 seeded export, W01 real expiry (carried from wave 3).

#### External dependencies

- Production deploy of these waves (founder-approved production-web job).
- GitHub App credentials in the local environment and an installation on the QA account.
- The `AGI_DURABLE_CODE_TURNS` switch-on decision, then `AGI_DURABLE_INITIAL_TURNS` as the kill switch.
- Routing preference rows (D-34).

#### Next implementation priority

Deploy, then the production free-router turn and the live reload; then the
repository journey once the installation exists; then the register's two
routing rows when the founder lifts D-34.

## How To Use

Each implementation agent should:

1. Pick one row or one tightly related group of rows.
2. Inspect the listed AGI paths before editing.
3. Verify competitor behavior from the listed source or the reference libraries at
   `/Users/siddhartha/Desktop/references-2`,
   `/Users/siddhartha/Desktop/claude_reference`, and
   `/Users/siddhartha/Desktop/chatgpt_reference` when the row depends on UI
   parity.
4. Implement the smallest end-to-end slice: UI control, state/store, backend/runtime path, persistence, permission/trust label, and test.
5. Mark incomplete behavior as a tracked gap. Do not claim parity from placeholder UI or passing typecheck alone.

The cross-product capability intake is tracked separately in
`audit/capability-gaps.csv`. It captures runtime and enterprise gaps that are
not necessarily visible UI differences and records explicit defer/decline
decisions so screenshot comparison does not silently expand product scope.

Status labels:

- `Present`: code exists and is wired enough to verify.
- `Partial`: code exists but is incomplete, placeholder, stale, or not end-to-end.
- `Missing`: no reliable implementation found in this audit.
- `Gated`: intentionally hidden behind feature flag, waitlist, invite, or trust-boundary control.

Surface abbreviations:

- `W`: Web
- `D`: Desktop
- `M`: Mobile
- `CLI`: terminal/agent CLI
- `VSC`: VS Code extension
- `CHR`: Chrome extension

## 2026-07-16 Mounted Frontend Reconciliation

The detailed current frontend contract is `docs/product/experience-contract.md`.

The table below records production mounts and end-to-end reality found by the 2026-07-16 source audit. It supersedes older optimistic row text elsewhere in this file when they conflict. A source file, mock route, feature flag, or component is not capability evidence without a production mount and runtime path.

| Capability                        | W                    | D                                                                                                                          | M                          | CLI                                                                                                                                  | VSC                                       | CHR                                      |
| --------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------- |
| Primary shell                     | Present              | Present                                                                                                                    | Present                    | Present                                                                                                                              | Present                                   | Present                                  |
| Chat/history                      | Present              | Present across Local/BYOK/Cloud, Cloud path still incomplete                                                               | Present across Local/Cloud | Developer sessions, not consumer history                                                                                             | Developer sessions through CLI app-server | Separate browser-task history            |
| AGI Work run (composer mode)      | Present              | Present                                                                                                                    | Present                    | N/A                                                                                                                                  | N/A                                       | Workflow UI is not Cloud Work            |
| Standalone Cowork session surface | Missing              | Missing                                                                                                                    | Missing                    | N/A                                                                                                                                  | N/A                                       | N/A                                      |
| Projects                          | Present              | Present                                                                                                                    | Present                    | Workspace only                                                                                                                       | Workspace only                            | N/A                                      |
| General file ingestion            | Partial              | Partial/Present                                                                                                            | Partial                    | Developer files                                                                                                                      | Developer context                         | Images/screenshots only                  |
| Artifacts/viewers                 | Present/Partial      | Present/Partial                                                                                                            | Partial                    | Developer files/diffs only                                                                                                           | Developer files/diffs only                | Missing                                  |
| Search/research                   | Present/Partial      | Present/Partial                                                                                                            | Partial                    | Tool-driven                                                                                                                          | Workspace search                          | Page operations, no research run         |
| Tools/approvals                   | Present/Partial      | Present/Partial                                                                                                            | Present/Partial            | Present                                                                                                                              | Present                                   | Present/Partial                          |
| Voice                             | Dictation input only | Composer voice; system-wide dictation honestly gated off (corrected 2026-08-09, cell was stale "broken system-wide claim") | Voice conversation present | Present (REPL voice: cpal capture, Whisper API/local binary, Local-mode egress gate, corrected 2026-08-05, cell was stale "Missing") | Missing                                   | Speech input only                        |
| Remote developer control          | Missing              | Companion components unmounted                                                                                             | Missing                    | Host relay missing                                                                                                                   | Host relay missing                        | Native bridge is not Code Remote Control |

Critical evidence:

- Web production chat is `apps/web/features/chat/pages/WebChatPage.tsx`; `UnifiedChatPage.tsx` and `features/chat/v3/WebShellV3.tsx` are unmounted alternatives.
- Desktop production shell is `apps/desktop/src/features/v3/DesktopShellV3.tsx`. AGI Code (`CodeWorkspace`, 3-pane IDE) was mounted into it on 2026-08-04, Local-only. CORRECTED 2026-08-05: `cowork` is no longer "a placeholder", the restructure removed it entirely (`V3Mode` is literally `'chat'`); a Cowork mode is future scope, not a mounted stub. SPLIT 2026-08-06: the old single "First-class Work/Cowork run" row scored Missing on all three consumer surfaces, which conflated two different things. **AGI Work**: the composer-mode dispatch, is Present and wired end to end: `apps/web/lib/workflows/start-cloud-agent-workflow.ts` with durable server-side execution, `apps/web/app/tasks/page.tsx`, `apps/mobile/app/(app)/agents/index.tsx`, and `DesktopShellV3.tsx:24-34,774`, plus the desktop scheduler (`sys/commands/scheduler.rs`, registered `lib.rs:808-845`; `AgiWorkScheduled.tsx` mounted at `DesktopShellV3.tsx:811`) and mobile→desktop dispatch (`services/coworkDispatch.ts`, invoked `App.tsx:627`; `v1FeatureFlags.ts:87,92` default-true). What remains Missing is only the **standalone Cowork session surface**, a dedicated resumable async workspace rather than a mode inside chat. Its real sub-gaps are tracked under Section 14 of `audit/master-checklist-gap-audit-2026-08-05.md`, not by scoring the whole capability Missing.
- Mobile no longer advertises the hardcoded-empty Code Sessions surface. Managed
  Cloud code execution remains available inside chat and generated output remains
  available through Artifacts; cross-device developer-session control is missing.
- VS Code's primary chat uses the CLI app-server while code-action/provider-stream settings retain a second execution path.
- Chrome's production `apps/extension/src/side_panel.ts` is a 9,359-line ownership hotspot (count refreshed 2026-08-05; the split remains open tracked debt, the 2026-08-05 Class-1 pass fixed its 9 user-facing defects without attempting the split). Quick mode's previously cosmetic persistence is fixed: outgoing turns carry the preference and the Managed Cloud boundary applies the admitted `auto-economy` route without mutating the saved picker selection. The monolith split remains open.
- Chrome restricted-page UX now keeps Managed Cloud chat usable, shows an accessible restriction notice, and disables only page context/browser automation instead of silently removing the visible state.
- `packages/ai/model-registry/catalog/harnesses.json` remains the authority for `wired`, `partial`, and `unwired` runtime capability states.

## 2026-08-01 Founder Scope Decisions (Mobile Missing Surfaces)

Decided by the founder on 2026-08-01 against the 22 missing-surface findings of
the mobile parity audit (backlog: `~/Desktop/mobile-parity-backlog-2026-08-01.md`
§Missing Surfaces; P0/P1 remediation tracked in CHANGELOG and PLAN.md). These
decisions add tracked scope; none of it is built until its row says so.

**Build (11):** Apple Health vertical (MS-1, needs HealthKit plugin +
entitlements, external gate), Parental account linking (MS-19, needs a new
account-linking server contract), Trusted contact flow (MS-20, real enrolment
replaces the dead announcement card), StoreKit purchase + restore (MS-5,
external gate: App Store Connect products; billing flag stays honest until the
flow is real), Location capability (MS-6, expo-location + coarse-location
preference, strictly excluded from Local Mode), Background/lock-screen voice
(MS-13, UIBackgroundModes audio + surviving session), Safety model fallback
(MS-16, retry path first, then the toggle), Code sessions (MS-3, blocked on a
real host-relay contract, build the contract, not a placeholder screen),
Remote-control device grants (MS-18, requires promoting session keys to
revocable device grants), Per-site browser permissions (MS-17, scoped to the
real in-app browser path), Live video/screen share in voice (MS-4, needs a
streaming media contract; screen capture never available in Local Mode without
explicit egress consent).

**Not built:** Finances hub (MS-21), recorded as an unbuilt reference
capability, no empty destination ships.

**Resolved concept:** Plugins on mobile is permanently the Connectors surface
(MS-2); the drawer gains a Connectors entry point (MS-22) and the Plugins
matrix row scopes mobile out by decision, not omission.

**Superseded 2026-08-09:** the founder now requires skills, plugins, and
connectors to have explicit working outcomes on Web, Mobile, Desktop, CLI, and
VS Code. Mobile may reuse a common discovery/settings shell, but it may no
longer treat Plugins or Skills as out of scope merely because Connectors is
present. The ordered release gate is: Max 15x image/video on Web/Mobile/both
Desktop shells; tool loop + artifact rendering + web search on
Web/Mobile/Desktop; then skills + plugins + connectors on all five named
surfaces. Competitive behavior is measured against official ChatGPT releases
from 2026-07-09 through 2026-08-09.

**Also decided the same day:** the model picker stays in the "+" sheet and the
stacked control row, it does NOT need to be persistently visible (founder
reversed the earlier always-stack call the same evening; the composer keeps
its compact single-line pill). Low/medium effort on the catalog-selected
Anthropic balanced model is catalog-correct (economy route, `3044350c5`) and the desktop tests follow the
catalog (resolved same day). Priority shifted the same evening: desktop Cloud
mode parity with web, verified through the wdio e2e harness, outranks the
remaining mobile P1/P2 queue.

## 2026-08-01 Completion Standard (Founder)

Goal, superseding the reference-parity goal: across the six shipping surfaces
**nothing is unwired, zero stubs, zero partial features**. Scope decisions
taken with it:

- **Surfaces held to the bar:** Web, Desktop, Mobile, CLI, VS Code, Chrome.
  the canonical six. `apps/slack-app` and `apps/github-app` are inventoried but
  not driven to zero in this program.
- **The 190 `missing` ledger rows:** build the ones that leave a dead end or a
  half-experience in a flow users actually reach. Purely un-started
  capabilities remain tracked scope, not defects. (46 of those rows arrived by
  reclassification out of `partial`/`stub`/`unwired`, so they are not
  automatically out of scope.)
- **Server contracts:** when a client fix needs a route, schema field, or auth
  shape that does not exist, build **both sides**, the `apps/web` contract and
  the client wiring, so the feature is end-to-end rather than an honest half.
  This authorizes, for example, making `/api/settings/sessions` bearer-aware
  for Desktop and adding a mobile content-report intake route.
- **Order:** Desktop to zero first (it is the demo surface), then the rest.
- **`audit/inventory.json` is not evidence.** It currently claims
  `partial=0/stub=0/unwired=0/broken=0` against a baseline of `62/13/30/10`;
  the arithmetic shows 46 items were reclassified rather than built, and
  independent sweeps keep finding live counterexamples. The ledger is corrected
  to match verified code at the end of this program, and the checker then
  enforces reality.

## 2026-08-05 Class-1 Closure Status (autonomous pass, fastest-first)

Per-item detail and evidence live in `docs/agent-context/known-flaws.md`
(dated 2026-08-05 sections); this records surface status only. Every closure
was independently verified (build + tests + code-read; web additionally driven
live via Playwright).

- **CLI, autonomous Class-1 at zero** (7/7: dead composable router cut per
  Decision #23/OQ-1; `/worktree` `/approve` `/raw` `/subagents` `/task` wired;
  verbose/debug real; session archive/unarchive/delete with confirmation;
  MCP add/remove/enable/disable with input validation; 1,838 tests green).
- **Chrome, autonomous Class-1 at zero** (9/9 user-facing fixed/cut; 1,429
  tests green; monolith split remains tracked debt, not a defect).
- **Web, autonomous Class-1 at zero** (theme toggle re-verified working.
  earlier "dead control" report retracted as a render-timing false alarm;
  Team-yearly wired fail-closed pending Stripe Price; `/agi-work` rewritten to
  the shipped feature).
- **Desktop, batch-1 at zero** (honest local-whisper gating, dead speech
  module cut, memory-decay bridge fixed, PdfEditor + Google Batch fully cut,
  symbol indexer cut, customize-nav premise stale/locked with test; `/git`
  slash panel NOT actionable, surface archived, product decision pending).
  Batch-2 (Fn-dictation honesty, progressive artifact streaming, CAP-032
  orphan sweep) in flight.
- **Mobile, autonomous Class-1 at zero** (7/7 incl. notification dead-end
  repoint, canonical provider-switch gate, privacy-manifest correction
  [code-read only, verify on next prebuild], rgba sweep + lint enforcement,
  TTS dead-state migration, content-report intake end-to-end, real fork/branch
  relation). Remaining Mobile items are external-gated (StoreKit, HealthKit,
  background-voice entitlement, device-grants host-relay, connector OAuth
  backend).
- **VS Code, autonomous side complete** (the one stub is unreachable and
  fail-closed by design, annotated in-code 2026-08-05; the substantive gap is
  the signed-CLI-distribution/bootstrap story, release infrastructure, not
  extension code).

Open cross-surface blockers awaiting the consolidated founder decision round
are tracked in the Class-1 task ledger, not re-listed here.

## 2026-08-05 Founder Decisions (Sequencing, Scope, Work-Run Correction)

Decided by the founder on 2026-08-05:

- **Ordering supersession:** the six surfaces are completed
  shortest-remaining-work-first, estimate remaining Class-1
  (partial/unwired/stub/broken) work per surface, complete the fastest surface
  first, then the next fastest, until all six are at zero. Supersedes this
  file's 2026-08-01 "Desktop to zero first" bullet and Decision #20's old
  serial order. The routing substrate (registry dated pricing + OpenAI
  cache-write billing, ExecutionPlan/CPST design doc, CPST telemetry,
  rules-based router) completes before surface closure begins.
- **Electron cloud-only shell is in scope** for the completion bar alongside
  Tauri (kept per the "one surface, two shells" architecture).
- **Class-2 scope:** dedicated deep research and a hosted plugin registry are
  approved builds (`audit/capability-gaps.csv` CAP-045/CAP-046), starting after
  Class-1 closure; in-chat commerce/checkout is declined (CAP-047). The
  2026-08-01 mobile Build list (incl. Apple Health MS-1) stands.
- **Work-run row correction (2026-08-05 code audit; runtime verification
  pending):** the 2026-07-16 "First-class Work/Cowork run: Missing" W cell is
  stale. Web AGI Work is production-mounted and substantially working: the
  composer Chat|AGI Work toggle in `ChatComposerNew.tsx` is gated by the
  `agi_work` billing capability client- and server-side; `applyWorkMode()`
  (request-processor.ts) forces web_search/web_fetch/code_execution into the
  real tool loop; durable initial turns are on by default; run history is
  mounted at `/tasks` backed by `cloud_agent_runs`; approvals UI exists inline
  and on Tasks; deliverables surface in `WorkSessionPanel`; Mobile and Desktop
  consume the same contract. Remaining gaps: no structured goal-intake UI; the
  visible "plan" is generic phase text, not a model-authored editable plan;
  custom E2B execution stays staged behind `AGI_E2B_EXECUTION` per Decision
  #22 (provider-native sandboxes serve by default); the `/agi-work` marketing
  page describes a separate, unshipped Desktop dispatch product (waitlist
  CTAs), a naming collision to resolve. The row flips to Present/Partial only
  after runtime/UI verification per the Definition Of Done.
- **AGI Work scope (founder, 2026-08-05):** complete the Work shape on Web.
  structured goal-intake UI, model-authored editable plan surface, `/agi-work`
  naming-collision fix (executes within the web Class-1 pass, CAP-048), AND
  build the Desktop dispatch/scheduled-routines product the `/agi-work` page
  advertises (CAP-049, after Class-1; depends on the host-relay/remote-control
  contract MS-3/MS-18).
- **Creation-four approvals (founder, 2026-08-05, all after Class-1):**
  Sites-style publishing (CAP-015 resolved as Wire: CloudPublisher + public
  serving route + web share UI on the existing `publishArtifact` service);
  Live artifacts (CAP-050); Design workspace v1, mount the orphaned
  `CanvasWorkspace` whiteboard (CAP-051; full artboard/layers/prototype/deck
  parity remains a separate future decision); AI-powered artifacts (CAP-052.
  approved despite security sensitivity;
  `docs/security/artifact-runtime-bridge-review.md`
  is that security design review and is a hard precondition: its §4
  conditions 1-7 and its §5 red-team items RT-1..RT-4 plus RT-5(a) are the
  open-condition set that must close. Condition 5 carries the original clause.
  WEB-13, the 2026-05-19 `apps/web` iframe-sandbox-escape finding closed by the
  cross-origin renderer origin, `connect-src 'none'`, and the same-origin
  refusal in `isThisAppsOwnOrigin()`, must stay closed through the bridge. The
  review currently returns NO-GO, so the precondition is unmet and no build
  starts).
- **Full-localization requirement (founder, 2026-08-05):** switching the app
  language must translate the ENTIRE surface, every user-facing string routes
  through i18n, every supported locale carries every bundle and key, no
  hardcoded UI literals. Audit at decision time (web): locales en/es/hi; es is
  key-complete vs en; hi is missing 4 of 7 bundles (`auth`, `chat`, `models`,
  `pricing`); only 5 of 490 TSX component files use i18n at all, so the
  settings LanguageSelector currently changes a small fraction of visible text
  - a false control under the completion standard. Mechanical guard added:
    `pnpm check:i18n-parity` (scripts/check-i18n-parity.mjs) enforces
    bundle/key parity per locale (currently red on hi, truthfully); hardcoded
    literals need the Class-1 i18n wiring pass plus a jsx-no-literals-style lint
    scoped to user-facing components. Mobile and desktop carry i18n dependencies
    with unaudited coverage, same requirement applies per surface.
    confirmed by founder same day):\*_ Team is $25/seat/mo and $240/seat/yr
    (Decision #22, founder-confirmed 2026-08-05, superseding the earlier
    $30/$299 figure and the Pro-pinned $20 working-tree value). Yearly checkout
    is not yet wired: add `STRIPE*PRICE_TEAM_YEARLY*_`support end-to-end in the
web Class-1 pass, and verify the Stripe dashboard unit_amount behind`STRIPE_PRICE_TEAM_MONTHLY_USD` is $25.00 (catalog/Stripe mismatch fails
    checkout closed). Team INR remains founder-undecided (₹1,999 currently
    configured; flag, not a contradiction).

## Global Product Rules

| Rule                                             | Applies to             | Required implementation behavior                                                                                                                                                                                                                                               | AGI anchors                                                                                               |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| One AGI suite, six surfaces                      | W, D, M, CLI, VSC, CHR | Every feature must declare the surfaces it supports and the sync/trust boundary it crosses.                                                                                                                                                                                    | `packages/contracts/types/src/suite-contracts.ts`, `docs/agent-context/repo-map.json`                     |
| One chat, not split file-chat vs normal-chat     | W, D, M                | The same conversation accepts normal prompts, selected files, reference files, images, project context, tools, artifacts, and generated files. File-focused work is a conversation state, not a separate product.                                                              | `apps/web/features/chat`, `apps/desktop/src/features/v3`, `packages/ui/unified-chat`                      |
| Local/BYOK/Managed are separate trust boundaries | All                    | Local never silently routes to BYOK/Managed. Local to BYOK is explicit fork with selection, scan, preview, label, and consent. Managed cloud is public alpha, open by default (2026-06-27; env kill-switch only); it stays subscription/entitlement-gated, not waitlist-gated. | `packages/contracts/types/src/suite-contracts.ts`, `apps/cli/src/agent/mod.rs`, `apps/mobile/stores/chat` |
| Model IDs are catalog-owned                      | All                    | UI selectors, tests, route defaults, provider adapters, and docs read from `packages/contracts/types/src/models.json` and capability metadata. No invented/hardcoded current model IDs.                                                                                        | `packages/contracts/types/src/models.json`, `packages/contracts/types/src/model-catalog.ts`               |
| Feature completion requires an end-to-end path   | All                    | A feature is not complete unless user action reaches service/runtime, returns a visible result, persists when required, and has test/visual verification.                                                                                                                      | `docs/agent-context/commands.json`, `docs/agent-context/known-flaws.md`                                   |

## Chat Shell And Empty State

| Component / option        | Surfaces               | Competitive target                                                                                                           | AGI requirement                                                                                                                                               | Current AGI status                                                                                             |
| ------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Empty chat input          | W, D, M                | ChatGPT/Claude empty state with central message box and quick action affordances.                                            | Input box must be first screen, with plus, file attach, model selector, mic, send/stop, and visible mode/provider label.                                      | Partial: Desktop v3 composer has input/plus/model/mic/send; Web/Mobile need parity pass.                       |
| Plus menu                 | W, D, M, CHR           | ChatGPT plus opens upload/tools/apps; Claude add menu opens Files/Skills/Connectors/Plugins in Cowork references.            | Plus menu must expose file, image/photo/screenshot where supported, tools/apps/connectors, skills, project sources, and safe unavailable states.              | Partial: Desktop has composer controls and connector work, but not complete unified plus menu across surfaces. |
| File symbol / attachments | W, D, M, CLI, VSC, CHR | ChatGPT supports file uploads; Claude projects/artifacts support files; Codex/Claude Code accept file refs/images.           | Attachments must carry privacy mode, source surface, size/type, redaction/scan status, and storage scope.                                                     | Partial: generated-file contracts exist; one-chat reference-file flow incomplete.                              |
| Model dropdown            | W, D, M, CLI, VSC      | ChatGPT/Claude/Codex expose model switchers and effort/thinking controls.                                                    | Dropdown reads catalog/capabilities, shows provider, mode, model, context/tool/image capabilities, local availability, BYOK key state, and managed gate.      | Partial: shared model catalog and Desktop popover exist; hardcoded drift still exists in some tests/providers. |
| Mic / voice               | W, D, M, CLI, CHR      | ChatGPT voice supports mobile/web/desktop voice, separate/integrated modes, voices, background behavior, retention controls. | Mic must distinguish dictation vs live voice conversation; include voice choice, speed, subtitles/transcript, retention/training controls, and privacy label. | Partial: CLI voice and extension side-panel voice code exist; suite-wide voice settings incomplete.            |
| Send / stop               | W, D, M, CLI, VSC, CHR | All major chat/code products support send, streaming, stop/cancel, retry.                                                    | Send creates a typed request with mode/provider labels; stop cancels stream/tool execution and records interrupted state.                                     | Partial: chat streams exist; cross-surface stop semantics need audit.                                          |
| Recent chats              | W, D, M                | ChatGPT/Claude sidebars show history/search/projects; desktop refs show recents.                                             | Sidebar shows recent conversations, temporary chats, project chats, pinned/moved/deleted states, and sync status.                                             | Partial.                                                                                                       |
| Account menu              | W, D, M                | User initials/name/account with settings/help/logout/language/feedback.                                                      | Account chip must show initials, name, workspace/account, feedback, settings, language, help, learn more, logout.                                             | Partial: settings/account exist, IA incomplete.                                                                |

Sources: ChatGPT capabilities and file/voice/tool overview, ChatGPT macOS Chat Bar, ChatGPT projects, Claude artifacts/projects, OpenAI Codex IDE features, Claude Code overview, local Claude reference folder.

## Messages And Conversation Actions

| Component / option             | Surfaces               | Competitive target                                                                                                | AGI requirement                                                                                                                                        | Current AGI status                                    |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| User/assistant message bubbles | W, D, M, CLI, VSC, CHR | ChatGPT/Claude message stream with Markdown/code/math/media/tool traces.                                          | Message renderer supports Markdown, code, tables, math, citations, attachments, artifacts, tool calls, provider labels, and privacy labels.            | Partial.                                              |
| Streaming states               | W, D, M, CLI, VSC, CHR | Streaming text, thinking/tool progress, stop button, retry on failure.                                            | Persist stream lifecycle: queued, running, tool_wait, completed, interrupted, failed.                                                                  | Partial.                                              |
| Message actions                | W, D, M                | Copy, edit, regenerate/retry, branch, feedback, share, save to project/source.                                    | Actions must preserve provenance, branch/fork semantics, and trust boundary.                                                                           | Partial.                                              |
| Temporary chat                 | W, D, M                | ChatGPT temporary chat avoids memory/history reference/update.                                                    | Temporary conversations must not update memory, sync only when policy allows, and visibly carry temp label.                                            | Partial: Web temporary-store bug fixed in this audit. |
| Branch/fork conversation       | W, D, M, CLI, VSC      | Claude edit/fork and Codex follow-up/cloud continuation.                                                          | Branching must record source, selected context, redaction/preview hash when crossing trust boundary.                                                   | Partial.                                              |
| Feedback                       | W, D, M                | Thumbs/reason feedback and account-level feedback entry.                                                          | Capture rating, reason, optional text, message ids, provider/model, privacy mode, no raw local content unless consented.                               | Partial.                                              |
| Structured result tables       | W, D, M, CLI           | Claude desktop references show sortable/paginated structured results; ChatGPT data analysis returns tables/files. | Tool/model tabular output should render as a sortable table with pagination when large, export/download where allowed, and visible source/trust label. | Missing/Partial.                                      |

## Models, Providers, And Routing

| Component / option        | Surfaces          | Competitive target                                                              | AGI requirement                                                                                                                                                                                                                                                                                  | Current AGI status                                                                      |
| ------------------------- | ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Local model mode          | D, M, CLI, VSC    | AGI differentiator; Claude/OpenAI do not make this first-class in consumer app. | Detect local providers such as Ollama/LM Studio/local runtime, show installed/running state, never require AGI account for local.                                                                                                                                                                | Partial: CLI/provider dispatch and mobile local gates exist; Desktop needs complete UX. |
| BYOK mode                 | D, CLI, VSC       | AGI differentiator.                                                             | Provider key setup, encrypted/local storage where applicable, direct provider label, usage/cost disclosure, explicit Local-to-BYOK fork. Web and Mobile v1 do not expose BYOK.                                                                                                                   | Partial: Desktop Models/Keys and developer surfaces need hardening.                     |
| Managed cloud mode        | W, D, M, CLI, VSC | ChatGPT/Claude/Codex managed compute baseline.                                  | Public alpha, open by default (2026-06-27); subscription/entitlement-gated, not waitlist-gated. Ledgering/abuse/billing controls keep pace but no longer gate access. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is a kill-switch only. UI should label public alpha and not over-claim full GA/SLA. | Public alpha.                                                                           |
| Mid-chat model switch     | W, D, M, CLI, VSC | ChatGPT/Claude/Codex allow model changes in composer/session.                   | Switching within same trust boundary is allowed; crossing Local to BYOK/Managed requires fork/preview/consent.                                                                                                                                                                                   | Partial.                                                                                |
| Reasoning/thinking/effort | W, D, M, CLI, VSC | Claude thinking/effort; Codex low/medium/high effort.                           | Expose only when model/provider capability supports it; persist per message/session; show cost/speed tradeoff.                                                                                                                                                                                   | Partial: Desktop thinking badge; broader routing incomplete.                            |
| Capability-aware tools    | All               | Frontier apps expose tools only when model/tool/runtime can support them.       | Tool options must reflect provider capabilities: function calling/tool use, vision, image generation, search, code execution, file creation, structured output.                                                                                                                                  | Partial.                                                                                |
| Auto-routing              | All               | Competitors route internally; AGI must be explicit.                             | Auto-routing must explain chosen provider/model, ask before trust-boundary crossing, and never silently substitute from Local.                                                                                                                                                                   | Partial/Gated.                                                                          |

Code anchors: `packages/contracts/types/src/models.json`, `packages/contracts/types/src/model-catalog.ts`, `packages/contracts/types/src/suite-contracts.ts`, `packages/ai/providers`, `apps/web/core/ai/llm`, `apps/cli/src/models`, `apps/desktop/src/features/settings/tabs/ModelsKeys`.

## Files, Artifacts, Canvas, And Generated Outputs

| Component / option              | Surfaces               | Competitive target                                                                                                            | AGI requirement                                                                                                                                                                                                                                              | Current AGI status                                                                        |
| ------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| File upload / local file select | W, D, M, CLI, VSC, CHR | ChatGPT file upload; Claude project knowledge; Codex image/file refs.                                                         | Support file select, drag/drop, screenshot/photo where native, type/size limits, virus/secret scan where relevant, preview, remove, and storage label.                                                                                                       | Partial.                                                                                  |
| Reference files in one chat     | W, D, M                | User explicitly wants no separate reference-file chat.                                                                        | Attach/reference existing files inside normal chat; allow per-message and conversation-level context chips.                                                                                                                                                  | Missing/Partial.                                                                          |
| Project files / sources         | W, D, M                | ChatGPT and Claude projects group files/instructions/chats.                                                                   | Project sources include files, links, saved responses, app links/connectors, and instructions; project memory respects project boundary.                                                                                                                     | Partial.                                                                                  |
| Generated files                 | W, D, M                | ChatGPT data analysis/output files; Claude artifacts export; Codex generated file previews.                                   | Every generated file has `ComputeSession`, `GeneratedFile`, `ArtifactManifest`, checksum, MIME, TTL/retention, owner, privacy/provider mode, and deletion behavior.                                                                                          | Present/Partial: shared contracts and Desktop document paths exist; UI parity incomplete. |
| Artifact side panel             | W, D, M                | Claude artifacts open in right-side dedicated window, with source/preview/copy/download/version/error-fix.                    | Sidecar/panel must support preview/source, copy/download, open deep workspace, version/history, multi-artifact list, and error-fix prompt.                                                                                                                   | Partial: Web sidecar and Desktop artifact workbench exist.                                |
| Canvas/document editing         | W, D, M                | ChatGPT Canvas for co-writing/code editing; Claude artifacts for standalone content.                                          | AGI should support editable writing/code canvases, inline suggestions, versioning, and export.                                                                                                                                                               | Partial/Missing depending surface.                                                        |
| Visual design workspace         | W, D, M                | Local Claude reference shows Claude Design-style canvas, artboards, prototype mode, files/assets, and deck/design generation. | AGI-owned workspace with pan/zoom canvas, artboards, layers/assets/files, properties panel, prototype/deck preview, versioning, selected-object iteration, export, and artifact trust labels. Mobile can start with preview/share only if explicitly scoped. | Missing/Gated.                                                                            |
| AI-powered artifacts            | W, D                   | Claude AI-powered artifacts and artifact MCP/storage.                                                                         | Gate by capability and trust mode; artifacts that call models/tools require user/auth/permission and clear usage billing mode.                                                                                                                               | Missing/Gated.                                                                            |
| Persistent artifact storage     | W, D                   | Claude artifact storage personal/shared.                                                                                      | Define storage scope, quota, retention, publication state, personal/shared isolation, delete/unpublish behavior.                                                                                                                                             | Partial.                                                                                  |

Sources: Claude artifacts official help, ChatGPT capabilities, ChatGPT projects, OpenAI Codex app/IDE features.

## Search, Research, And Citations

| Component / option            | Surfaces          | Competitive target                                                | AGI requirement                                                                                                   | Current AGI status                                                           |
| ----------------------------- | ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Web search                    | W, D, M, CLI, VSC | ChatGPT Search; Codex web_search; Claude web/research references. | Search tool must show query, status, result list, citations, freshness, provider/source, and whether live/cached. | Partial: Web Perplexity search path and Desktop inline search results exist. |
| Deep research                 | W, D, M           | ChatGPT deep research; Claude research-like flows.                | Multi-step plan, source queue, citations panel, progress states, report artifact, export, and retry.              | Partial/Missing.                                                             |
| Global app search             | W, D, M           | ChatGPT/Claude sidebars and project search.                       | Search chats, projects, artifacts, files, settings, connectors, and allowed memories; preserve trust boundary.    | Partial/Missing; reference docs say prior global search was stubbed.         |
| Citations panel               | W, D, M           | Search/research answers show sources.                             | Citations must map to message spans/results and survive reload/export.                                            | Partial.                                                                     |
| Internal/app connector search | W, D, M           | ChatGPT apps with search/sync; Claude connectors.                 | Apps can search third-party data only with explicit connector permission and context label.                       | Partial.                                                                     |

## Projects And Workspaces

| Component / option   | Surfaces         | Competitive target                                                      | AGI requirement                                                                                                    | Current AGI status |
| -------------------- | ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Create project       | W, D, M          | ChatGPT/Claude projects with name/icon/color/instructions/files/chats.  | New project modal/page with name, icon/color, privacy mode, provider mode, instructions, sources, members if team. | Partial.           |
| Project memory       | W, D, M          | ChatGPT project memory and Claude project knowledge/RAG.                | Project-only vs default memory behavior, source visibility, chat/file scoping, and shared-project isolation.       | Partial/Missing.   |
| Move chat to project | W, D, M          | ChatGPT move/drag chats into projects.                                  | Move action must update context, instructions, memory boundary, and sync.                                          | Partial/Missing.   |
| Project sources      | W, D, M          | Files, saved responses, app links/connectors.                           | Sources list supports upload, app links, saved responses, remove, refresh, permission state.                       | Partial.           |
| Project sharing      | W, D, M          | ChatGPT Business/Enterprise and Claude Team/Enterprise project sharing. | Private/team/org share, permissions, invite, audit, no leakage of personal memories.                               | Gated/Partial.     |
| Developer projects   | CLI, VSC, D Code | Codex projects/worktrees, Claude Code project scopes.                   | Workspace roots, local dirs, worktrees, branch prefix, repo connection, permission profile.                        | Partial.           |

Sources: ChatGPT projects official help, Claude projects official help, Codex app features.

## Memory And Personalization

| Component / option                    | Surfaces | Competitive target                                           | AGI requirement                                                                                                                  | Current AGI status                               |
| ------------------------------------- | -------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Saved memory                          | W, D, M  | ChatGPT saved memories; Claude personalization.              | View/add/edit/delete, disable, account/workspace scope, privacy-mode scope.                                                      | Partial: shared MemoryEditor exists but limited. |
| Reference chat history                | W, D, M  | ChatGPT memory can reference chat history.                   | Toggle reference chats; search relevant past chats; generate memory from history; exclude temporary/private chats.               | Missing/Partial.                                 |
| Project memory                        | W, D, M  | Project-only memory in ChatGPT, project knowledge in Claude. | Memory must respect project and sharing boundary.                                                                                | Partial/Missing.                                 |
| Import memory from other AI providers | W, D, M  | User-specified AGI feature.                                  | Provide prompt/instructions for exporting from other provider, import review screen, dedupe, edit, approve, start import button. | Missing.                                         |
| Custom instructions/profile           | W, D, M  | ChatGPT custom instructions/profile; Claude personalization. | Full name, what AGI should call you, work description, instructions/preferences.                                                 | Partial.                                         |
| Temporary chat excludes memory        | W, D, M  | ChatGPT Temporary Chat.                                      | Temporary chats neither reference nor update saved/chat-history memory.                                                          | Partial.                                         |

Sources: ChatGPT memory official help/FAQ, ChatGPT projects, Anthropic personalization, local Claude reference settings captures.

## Connectors, Apps, MCP, Plugins, And Skills

| Component / option           | Surfaces               | Competitive target                                                      | AGI requirement                                                                                                    | Current AGI status                                     |
| ---------------------------- | ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Connector/app directory      | W, D, M, CLI, VSC, CHR | ChatGPT Apps directory; Claude connectors; Codex plugins.               | Directory with categories, search, details, connect/install, permissions, admin policy, connected list.            | Partial: Desktop connector gallery exists.             |
| Apps with search             | W, D, M                | ChatGPT apps can search/reference third-party services.                 | User can invoke via @ mention, plus menu, or automatic "load tools when needed" policy; show connector label.      | Partial.                                               |
| Apps with sync               | W, D, M                | ChatGPT apps with sync index selected sources.                          | Sync must have plan gate, admin control, delete/disconnect behavior, memory implications, and data controls.       | Missing/Partial.                                       |
| Write actions                | W, D, M, CHR, CLI, VSC | ChatGPT apps require confirmation; Claude/Codex permissions.            | External writes require confirmation, target preview, permission scope, audit trail, and rollback where possible.  | Partial.                                               |
| Local MCP servers            | D, CLI, VSC            | Claude Desktop local MCP; Claude Code MCP.                              | Add/config/edit/view logs, status, OAuth where available, per-tool permissions, local path restrictions.           | Partial.                                               |
| Remote MCP/custom connectors | W, D, CLI, VSC         | Claude custom connectors using remote MCP; ChatGPT custom apps via MCP. | URL/auth headers, OAuth/bearer token, timeout, SSL, tool discovery, permission review, admin allow/deny.           | Partial: Desktop custom remote MCP dialog exists.      |
| Plugins                      | D, CLI, VSC, CHR       | Codex plugins, Claude plugin-style references.                          | Bundle apps/skills/MCP servers, categories, install/update/uninstall, trust policy, marketplace/source controls.   | Partial.                                               |
| Skills                       | W, D, CLI, VSC         | Claude skills/customization and Codex skills.                           | Skill directory, create/import/edit, slash/menu invocation, project/user scope, permission limits, testing/evals.  | Partial.                                               |
| Tool access mode             | W, D, M, CLI, VSC      | User controls when tools/connectors load.                               | Settings must support load tools when needed, always/ask/off, connector discovery, and per-conversation overrides. | Partial: Desktop capabilities settings has first pass. |

Sources: ChatGPT apps/connectors, ChatGPT apps with sync, Anthropic MCP/local MCP/custom connectors, Claude Code MCP/settings, Codex app features.

## Scheduled Tasks, Automations, Dispatch, And Cowork

| Component / option  | Surfaces       | Competitive target                                         | AGI requirement                                                                                                         | Current AGI status                                                                                                                                                                                              |
| ------------------- | -------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduled tasks     | W, D, M, CHR   | ChatGPT Tasks; Claude/Cowork scheduled; Codex automations. | Create/edit/pause/delete, one-time/recurring/API trigger, notification/email/push, run history, failure state.          | Partial: Desktop `AgiWorkScheduled` (renamed from the deleted `CoworkScheduled`, corrected 2026-08-09) and Chrome scheduled tasks exist; suite parity incomplete.                                               |
| Thread automations  | D, CLI, VSC, W | Codex thread automations preserve thread context.          | Schedule a recurring wake-up on the same thread with context retention and trust labels.                                | Partial/Missing.                                                                                                                                                                                                |
| Project automations | D, CLI, VSC, W | Codex automations run in background worktrees/projects.    | Background worktree/session per project, schedule, prompt, permissions, notifications, result artifact/PR.              | Partial/Missing.                                                                                                                                                                                                |
| Dispatch            | D, M, W        | Claude Cowork Dispatch reference and user requirement.     | Accept tasks from mobile/web/extension, require confirmation, output list, notification, handoff to Desktop/local host. | Partial (corrected 2026-08-09, the `CoworkDispatch` page component was deleted): the surviving desktop dispatch path is the `services/coworkDispatch.ts` runtime plus its `settings/tabs/Cowork` enable toggle. |
| Live artifacts      | D, W           | Claude Cowork live artifacts.                              | Long-running/live artifact state, refresh, share/publish, owner/session.                                                | Partial/Missing.                                                                                                                                                                                                |
| Customize hub       | D, W           | Claude Cowork customize skills/connectors.                 | Central hub for skills, connectors, plugins, task templates, permissions.                                               | Partial.                                                                                                                                                                                                        |

Sources: ChatGPT tasks, Codex app automations/worktrees, local Claude Desktop/Cowork references.

## Settings IA

This is a locked AGI IA target. Agents must not invent new top-level settings categories unless a current decision changes this list.

| Section       | Required options/components                                                                                                                                                                                                                                                                                                            | Current AGI status                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| General       | Profile, full name, what AGI should call you, work description, instructions/preferences, appearance, chat font, voice, voice speed, notifications, response/completion/code preferences, code permission requests, AGI Code emails, web, dispatch, dispatch messages.                                                                 | Partial.                                              |
| Account       | Logout all devices, delete account, subscription cancellation warning, organization ID, active sessions, device, location, created, updated.                                                                                                                                                                                           | Partial.                                              |
| Privacy       | Location, metadata, improve AGI, data export, shared chats, memory preferences, reference chat search, generate memory from history, view/manage memory, import memory.                                                                                                                                                                | Partial/Missing.                                      |
| Billing       | Current plan, adjust plan, payment/Stripe link, invoices table, due date, total, status, action.                                                                                                                                                                                                                                       | Partial/Missing by surface.                           |
| Usage         | Current session, weekly limits, credits spent, monthly spend limit, current balance, auto reload.                                                                                                                                                                                                                                      | Partial/Missing.                                      |
| Capabilities  | Tool access mode, connector discovery, visuals, artifacts, AI-powered artifacts, inline visualizations, code execution, file creation, network egress, domain allow list, skills.                                                                                                                                                      | Partial: Desktop has CapabilitiesSettings first pass. |
| Connectors    | Directory, connected list, MCP servers, OAuth, custom remote MCP, per-tool permissions, logs/config, details/uninstall.                                                                                                                                                                                                                | Partial.                                              |
| AGI Code      | Appearance/interface/form, transcript size, session state classification, local sessions, bypass permissions mode, remote control default, notification attention, worktree location, branch prefix, preview-first, persist previews, create PR automatically, autofix PR, auto-achieve after PR, authorization, dispatch/co-dispatch. | Missing/Partial.                                      |
| AGI in Chrome | Pairing, side panel, ask/act mode, saved prompts, workflow recording, page permissions, blocked sites, shortcut, native host status, file URL access, memory/browser-history controls.                                                                                                                                                 | Partial.                                              |
| Extensions    | Desktop extensions installed locally, filesystem, contact7/context7, desktop commander, Apify, app notes, Excel/local apps, configure/details/uninstall.                                                                                                                                                                               | Partial.                                              |
| Developer     | MCP config/logs, hooks, skills/plugins, provider diagnostics, feature flags, local runtime logs, sandbox/network allowlist, crash reports.                                                                                                                                                                                             | Partial.                                              |

Code anchors: `apps/desktop/src/features/settings`, `apps/mobile/src/features/settings`, `apps/web/features/settings`, `packages/contracts/types/src/suite-contracts.ts`.

## Desktop Surface

| Mode / component      | Required behavior                                                                                                                                                                | Current AGI status                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chat mode             | Full local/BYOK/managed-gated chat with unified composer, artifacts, files, model selector, settings, sidebar.                                                                   | Partial/strongest current desktop area.                                                                                                                                                                                                                                                                                                                                                    |
| AGI Work views        | Home, projects, scheduled tasks, live artifacts, dispatch, customize, task list/status, onboarding checklist, task composer.                                                     | Partial (corrected 2026-08-09, the old "Cowork mode" row claimed `DesktopShellV3` "still shows placeholder for `cowork`"; that placeholder was deleted with the mode and the pages were renamed): `AgiWorkProjects`, `AgiWorkArtifacts`, and `AgiWorkScheduled` are rendered from `DesktopShellV3.tsx`; onboarding checklist, customize hub, and a standalone task composer remain absent. |
| Code mode / AGI Code  | Repo/folder dashboard, local folder add, branch/worktree, permissions, model/effort, usage plan, sessions, PRs, routines, terminal/actions, diff review.                         | Partial: `CodeWorkspace` (file tree, Monaco tabs, diff viewer) mounted in `DesktopShellV3` 2026-08-04, Local-only; dashboard, PRs, routines, terminal/actions remain absent.                                                                                                                                                                                                               |
| Sidebar               | Search, collapse/expand, new chat, projects, artifacts, recent chats, modes, account.                                                                                            | Partial.                                                                                                                                                                                                                                                                                                                                                                                   |
| Desktop app controls  | Run on startup, quick access, voice shortcut, menu bar, keep awake, browser use, computer use, accessibility, screen recording, extensions.                                      | Partial.                                                                                                                                                                                                                                                                                                                                                                                   |
| Local compute host    | File generation, MCP, local models, native messaging, browser/computer-use approvals.                                                                                            | Partial.                                                                                                                                                                                                                                                                                                                                                                                   |
| Cloud mode onboarding | Managed cloud is public alpha on Web, Mobile, and Desktop. Desktop DCL-4 selects the shared `CloudRuntime` only for explicit signed-in Cloud mode; Local + BYOK remain isolated. | Public alpha; shared backend wired.                                                                                                                                                                                                                                                                                                                                                        |

Primary paths: `apps/desktop/src/features/v3`, `apps/desktop/src/features/settings`, `apps/desktop/src/features/connectors`, `apps/desktop/src-tauri`, `packages/ui/unified-chat`.

## Web Surface

| Component          | Required behavior                                                                                                                                                                                                                                                            | Current AGI status |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Synced app chat    | ChatGPT/Claude-style chat with projects, files, artifacts, tools, settings, account.                                                                                                                                                                                         | Partial.           |
| Projects           | Create/manage/share/move chat/sources/project memory.                                                                                                                                                                                                                        | Partial.           |
| Artifacts          | Sidecar, cards, source/preview, export, share/publish gates.                                                                                                                                                                                                                 | Partial.           |
| Billing/usage      | Stripe/payment links, invoices, credits, limits. Managed cloud is public alpha (open by default); Team is a real, purchasable per-seat tier (reinstated 2026-07-11), not an interest list, only genuinely-unavailable hosted capacity should route to a request-access flow. | Partial/Gated.     |
| Connectors/apps    | Directory, OAuth/custom apps, sync/search/write action permissions.                                                                                                                                                                                                          | Partial/Missing.   |
| AGI Code dashboard | Repo selector, activity heatmap, sessions, PRs, routines, run history; managed cloud sessions are public alpha (entitlement-gated, not invite-gated).                                                                                                                        | Partial/Missing.   |
| Admin/team         | Organization policy, audit, connector controls, managed compute readiness.                                                                                                                                                                                                   | Partial/Gated.     |

Primary paths: `apps/web/app`, `apps/web/features`, `apps/web/core`, `apps/web/stores`, `apps/web/db/neon`.

## Mobile Surface

| Component              | Required behavior                                                                                                                                       | Current AGI status                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Local-first onboarding | Choose Local or Cloud (Mobile v1 does not expose BYOK). Cloud is public alpha, signed-in users use it now, no invite/waitlist; Local stays fail-closed. | Partial: Local + public-alpha Cloud (sign-in gated). |
| Mobile chat            | Same one-chat UX scaled to mobile: composer, model/mode, attachments, voice, artifacts preview/share.                                                   | Partial.                                             |
| BYOK handoff           | Local to BYOK reviewed fork with scan/preview/consent.                                                                                                  | Partial: tests and store paths exist.                |
| Approvals/continuity   | Approve Desktop/Code/Chrome tasks, review outputs, preview generated files.                                                                             | Partial/Missing.                                     |
| Heavy generation       | Mobile receives/previews/shares Desktop or managed outputs; not first heavy local generator.                                                            | Gated/Partial.                                       |

Primary paths: `apps/mobile/app`, `apps/mobile/src/features`, `apps/mobile/stores`, `apps/mobile/services`, `apps/mobile/lib/v1FeatureFlags.ts`.

## CLI And AGI Code

| Component / option   | Competitive target                                   | AGI requirement                                                                                                          | Current AGI status                                                                                                      |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Interactive REPL/TUI | Claude Code/Codex CLI interactive prompt.            | Slash commands, model/mode, memory, tools, permissions, hooks, sessions, voice, status.                                  | Partial.                                                                                                                |
| Privacy modes        | AGI differentiator plus Claude/Codex permissions.    | `/privacy-mode`, local block, `/continue-with-byok`, managed gate.                                                       | Present/Partial.                                                                                                        |
| Slash commands       | Claude Code slash commands and Codex slash commands. | Built-ins plus custom project/user commands; discoverable `/` menu; MCP prompt commands.                                 | Partial; `/worktree`, `/subagents`, `/task list`, `/approve`, `/raw` wired 2026-08-05.                                  |
| Permissions          | Claude Code permissions and Codex approvals.         | allow/ask/deny/workspace/network/bypass modes; sensitive file deny; per-tool audit.                                      | Partial; `/approve` alias over `PermissionStore` added 2026-08-05.                                                      |
| Hooks                | Claude Code hook events.                             | Pre/Post tool, notification, prompt submit, stop, subagent stop, compact, session start/end, config change where needed. | Partial/strong: hook coverage check passes.                                                                             |
| Subagents            | Claude Code/Codex subagents.                         | User/project subagents with separate context, tools, model, when-to-use metadata.                                        | Partial; read-only `/subagents` (model/tools/when-to-use) + `/task list` views added 2026-08-05.                        |
| MCP/plugins/skills   | Claude/Codex integrations.                           | Install/update/config/list/status, OAuth, logs, managed allow/deny, slash prompts.                                       | Partial; `/mcp add/remove/enable/disable/reconfigure/restart` over a validated writable registry added 2026-08-05.      |
| Sessions/worktrees   | Codex projects/worktrees and Claude sessions.        | Resume/fork/branch, worktree isolation, PR creation/review, diff preview, local/cloud continuation.                      | Partial; `agi session archive/unarchive/delete` (confirmation-gated) + `/worktree` list/create/remove wired 2026-08-05. |
| Voice                | Claude Code voice and AGI voice requirement.         | Dictation/transcription, local fallback, voice settings.                                                                 | Partial.                                                                                                                |

Primary paths: `apps/cli/src`, `crates/agiworkforce-*`, `packages/contracts/types/src/suite-contracts.ts`.

## VS Code Extension

| Component / option       | Competitive target                                                                             | AGI requirement                                                                                           | Current AGI status |
| ------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------ |
| Sidebar/chat participant | Claude Code IDE and Codex IDE.                                                                 | Chat, edit, review/agent modes, model selector, effort, approvals, file context.                          | Partial.           |
| Editor context           | Codex IDE uses open files/selection and `@file`; Claude IDE shares selection/tabs/diagnostics. | Add current file/selection, @ file picker, diagnostics/problems, terminal capture, images/screenshots.    | Partial.           |
| Diff review/apply        | Claude/Codex IDE diff viewing and local apply.                                                 | Preview patch, accept/reject hunks, checkpoint/stash, apply cloud task locally.                           | Partial.           |
| Cloud/local continuation | Codex cloud delegation/follow-up, AGI Local/BYOK/Managed boundaries.                           | Cloud tasks public alpha (open by default); local conversation can hand off only with preview/consent.    | Partial.           |
| Settings                 | Models, approval mode, endpoint/provider, permissions, shortcuts.                              | Settings must not trust workspace config for sensitive endpoints or security policy without confirmation. | Partial.           |

Primary paths: `apps/extension-vscode/src`.

## Chrome Extension

| Component / option   | Competitive target                                                     | AGI requirement                                                                                                     | Current AGI status |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Side panel           | Claude in Chrome / Codex Chrome plugin.                                | Ask/act chat panel with page context, attachments, saved prompts, mode/provider label, native status.               | Partial.           |
| Page context capture | Chrome extension and Codex browser tasks.                              | Capture visible page/text/metadata/screenshot only with user-visible scope; page data is untrusted.                 | Partial.           |
| Browser actions      | Claude/Codex browser control.                                          | Per-site approval, allowlist/blocklist, high-impact confirmation, prompt-injection defenses, audit.                 | Partial.           |
| Workflow recording   | User requirement and current extension code.                           | Selector-only vs value-capture mode, visible recording state, secret/credential protections, replay approval.       | Partial.           |
| Native bridge        | Codex Chrome native app and AGI Desktop bridge.                        | Pairing, HMAC/session secret, reconnect, native host status, Desktop handoff, cloud invite unlock only behind gate. | Partial.           |
| Permissions/settings | Chrome permissions, file URL access, browser history, memory controls. | Explicit install permission copy, file URL toggle instructions, browser-history prompt, memories on/off behavior.   | Partial.           |

Primary paths: `apps/extension/src`, `apps/extension/native-host`, `apps/extension/docs/threat-model.md`.

## Billing, Usage, Waitlist, And Commercial Gates

| Component / option       | Required behavior                                                                                                                                                                                                   | Current AGI status |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Plan display             | Current plan, local/BYOK/free state, managed public-alpha status, adjust plan.                                                                                                                                      | Partial.           |
| Stripe/payment           | Payment link/checkout, invoices, due date, status, action.                                                                                                                                                          | Partial/Missing.   |
| Usage limits             | Current session, weekly limits, credits, monthly spend limit, current balance, auto reload.                                                                                                                         | Partial/Missing.   |
| Enterprise interest list | Early-access interest list for genuinely-unavailable hosted capacity only (managed cloud chat itself is public alpha, open; Team is a real, purchasable per-seat tier as of 2026-07-11, not an interest-list item). | Partial/Gated.     |
| Promo/invite codes       | Optional promo codes redeem plan credits/offers; they do NOT gate managed-cloud access (cloud is open public alpha).                                                                                                | Partial/Gated.     |
| Abuse/fraud controls     | Metering, quotas, refund/chargeback reserve, provider terms.                                                                                                                                                        | Missing/Gated.     |
| Enterprise               | Org policy, audit, SSO/SCIM, connector policy, managed-credit ledger, support workflow.                                                                                                                             | Partial/Gated.     |

Primary paths: `apps/web/features`, `apps/mobile/app/(app)/billing`, `packages/contracts/types/src/enterprise`, `apps/web/db/neon`.

## Competitor Deltas (officially re-verified 2026-08-09)

This is the founder-requested ChatGPT snapshot from 2026-07-09 through the
2026-08-09 cutoff. Feature existence and dates below come only from current
official OpenAI material; they are acceptance inputs, not claims that AGI has
already reached parity.

- **2026-07-09, ChatGPT Work:** long-running work can research, use connected
  apps and files, create finished documents/spreadsheets/presentations/reports/
  Sites, show progress, accept steering, request approval, and run scheduled or
  monitored tasks. AGI acceptance: one resumable Work run and result contract
  across Web/Mobile/Desktop, with durable progress, approvals, artifacts, and
  schedules. https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- **2026-07-09, Plugin Directory:** plugins replace the App Directory and may
  package skills, apps, and app templates; installation and invocation remain
  subject to workspace roles and underlying app permissions. AGI acceptance:
  the Skills/Plugins/Connectors gate in this matrix needs real discovery,
  install/configure, permission, invocation, and result paths rather than
  preview-only listings. https://help.openai.com/en/articles/20001256-plugins-in-chatgpt-and-codex
- **2026-07-09, OpenAI flagship model-family update:** the flagship tier began rolling out in eligible paid ChatGPT
  plans; official product documentation also distinguishes the family tiers by
  product and plan. The canonical AGI registry now contains verified IDs, but
  presence in the registry is not routing or entitlement proof. AGI acceptance:
  every exposed option must be live, plan-correct, and reach its declared
  harness. https://help.openai.com/en/articles/20001354
- **2026-07-09 to 2026-08-09, Atlas retirement:** OpenAI moved the target for
  browser-agent work to ChatGPT Desktop and its Chrome extension, including
  multiple tabs, downloads, navigation, and authenticated sites. AGI acceptance:
  Desktop and Chrome must share a permissioned browser runtime with download,
  login, multi-tab, prompt-injection, audit, and local/cloud-boundary tests.
  https://help.openai.com/en/articles/20001371
- **2026-07-14, cross-product search:** one entry point searches chats,
  projects, images, and documents on Web/iOS/Android with content filters and
  direct navigation. AGI acceptance: global search must cover the corresponding
  authorized domains on Web/Mobile/Desktop and never cross Local, Managed, or
  developer-session boundaries. https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- **2026-07-15 to 5,000-character custom instructions:** AGI must verify the
  shared profile/instructions contract, validation, persistence, sync, and
  truncation behavior at this floor on Web/Mobile/Desktop.
  https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- **2026-07-16, unified Desktop experience:** Chat/Work recents, Projects, and
  Cloud Work continue across devices while Local conversations remain on the
  computer; Codex stays a separate view. This directly reinforces AGI's
  existing trust-boundary lock and requires Tauri and Electron parity for the
  Managed experience without leaking Local state.
  https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- **2026-07-23, Voice in Work and Codex on Desktop:** voice can start tasks,
  check progress, answer agent questions, and coordinate work using the selected
  experience's tools and permissions. AGI acceptance: voice orchestration needs
  an explicit capability/permission path; dictation alone is not parity.
  https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes
- **2026-07-23, Health on Web and iOS:** the official release added a distinct,
  consented health context backed by supported health records and Apple Health.
  This remains a separate founder-approved Mobile gap; it must not be faked by
  a generic connector or allowed to mix with ordinary chat memory.
  https://help.openai.com/en/articles/6825453-chatgpt-release-notes

OpenAI material published after the cutoff is research input for the next
snapshot, not a retroactive 2026-08-09 acceptance requirement. Cached snippets,
press reports, and local screenshots may help locate evidence but cannot create
a release claim.

Cross-vendor findings from the preceding snapshot remain in the matrix instead
of being erased by the OpenAI-focused refresh:

- **Claude usage reflection (2026-07-09):** Anthropic's official announcement
  describes a beta dashboard that summarizes usage patterns over selectable
  time ranges and offers AI-fluency guidance. AGI still has no equivalent
  product row; add a privacy-scoped usage-insights gap rather than treating
  ordinary billing totals as parity.
  https://www.anthropic.com/news/reflect-with-claude
- **Remote developer-session control:** the preceding snapshot recorded a
  trusted-device flow for controlling a developer session from another device.
  The 2026-08-09 re-verification did not recover a current primary-source page,
  so this remains an explicitly **UNVERIFIED** research item, not a release
  claim and not a finding that may be silently deleted. It still maps to AGI's
  remote-control threat model and approval/audit requirements.
- **Documentation-link migration:** prior Anthropic developer links were
  observed redirecting from the legacy docs host to the current platform docs
  host. Link integrity remains an operational documentation check even when the
  underlying feature comparison is unchanged.

## Required Research Ledger

Future agents updating parity must use official sources for current competitor claims and the local reference folder for visual/UI details.

OpenAI official sources:

- ChatGPT capabilities: https://help.openai.com/en/articles/9260256-chatgpt-capabilities-overview
- ChatGPT apps/connectors: https://help.openai.com/en/articles/11487775-connectors-in-chatgpt
- ChatGPT apps with sync: https://help.openai.com/en/articles/10847137
- ChatGPT projects: https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt
- ChatGPT memory: https://help.openai.com/en/articles/8983136-what-is-memory
- ChatGPT memory FAQ: https://help.openai.com/en/articles/8590148-memory-faq
- ChatGPT tasks: https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt
- ChatGPT voice: https://help.openai.com/en/articles/8400625-voice-mode
- ChatGPT Canvas: https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt-and-how-do-i-use-it
- ChatGPT macOS Chat Bar: https://help.openai.com/en/articles/9295241-accessing-the-launcher-chatgpt-macos-app
- Codex app features: https://developers.openai.com/codex/app/features
- Codex CLI features: https://developers.openai.com/codex/cli/features
- Codex IDE features: https://developers.openai.com/codex/ide/features
- Codex Chrome extension: https://developers.openai.com/codex/app/chrome-extension

Anthropic official sources:

- Claude Desktop install: https://support.anthropic.com/en/articles/10065433-installing-claude-for-desktop
- Claude projects: https://support.anthropic.com/en/articles/9517075-what-are-projects
- Claude artifacts: https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Claude personalization: https://support.anthropic.com/en/articles/10185728-understanding-claude-s-personalization-features
- Claude local MCP desktop: https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop
- Claude custom remote MCP connectors: https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp
- Claude Code overview: https://docs.anthropic.com/en/docs/claude-code/overview
- Claude Code IDE integrations: https://docs.anthropic.com/en/docs/claude-code/ide-integrations
- Claude Code settings: https://docs.anthropic.com/en/docs/claude-code/settings
- Claude Code permissions/IAM: https://docs.anthropic.com/en/docs/claude-code/iam
- Claude Code hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Claude Code subagents: https://docs.anthropic.com/en/docs/claude-code/sub-agents
- Claude Code slash commands: https://docs.anthropic.com/en/docs/claude-code/slash-commands
- Claude Code MCP: https://docs.anthropic.com/en/docs/claude-code/mcp
- Claude in Chrome: https://www.anthropic.com/news/claude-for-chrome

Local evidence:

- `/Users/siddhartha/Desktop/claude_reference/CLAUDE_REFERENCE.md`
- `/Users/siddhartha/Desktop/claude_reference/COMPARISON.md`
- `/Users/siddhartha/Desktop/claude_reference/claude/2026-05-13/manifest.md`
- `/Users/siddhartha/Desktop/claude_reference/claude/2026-05-15/claude-desktop-post-update-notes.md`
- `/Users/siddhartha/Desktop/claude_reference/**`

Do not copy proprietary source, screenshots, icons, text, or layouts exactly. Use these references to define AGI-owned feature parity and implementation requirements.

## Implementation Definition Of Done

A parity row is done only when:

- UI exists on the claimed surface with real controls, disabled states, empty/loading/error/success states, and responsive layout.
- State/store/service/runtime path is wired from user action to result.
- Trust boundary, provider label, and data retention behavior are visible where applicable.
- Persistence and reload behavior are correct where the feature claims history/sync.
- Tests cover core behavior and trust-boundary failure cases.
- Launch-critical UI has screenshot/e2e verification.
- The relevant row in this matrix or the active plan is updated from `Partial/Missing/Gated` to the verified state.
