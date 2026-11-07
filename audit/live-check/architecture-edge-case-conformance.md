# Architecture edge-case conformance

Status: Current execution queue; incomplete
Owner: Platform + application maintainers
Last updated: 2026-11-02
Baseline: `c5d073487defa4c5bdc0e0acb0ca5026d15cfe49`; corrections are unreleased

This queue tests the existing architecture by user job and lifecycle, across six
public surfaces. It does not turn missing test coverage into product defects or
duplicate the feature statuses in `audit/ledger/ecosystem-capability-ledger.jsonl`.
Ledger sections 19–22, 53–60, 63–68, 70–74, 76–82, 90 and 96–103 own the
corresponding capabilities. Electron hosts Web; retained Tauri code is not proof
of a feature in the public Desktop. Optional source release applies to selected
parts such as the CLI and its dependencies, with no license change authorized.

## Evidence rules

**Automated** means deterministic tests against the actual owner with mocked
dependencies where stated. **Local live** means a real disposable dependency.
**Native** means the actual installed application runtime. **Inspected** means
source and existing coverage were traced, without executing that scenario in
this pass. None of these labels establishes deployed behavior by itself.

For every pending check, preserve an unchanged positive control, record what
actually executed, and check state before and after completion. Fresh accounts,
conversations or private test profiles prevent cross-case contamination. Use
fixtures before paid inference. Do not reset a person's Keychain, change billing,
relax approvals or silently cross Local/BYOK/Managed boundaries to test a flow.

## Confirmed corrections and instrument findings

1. **Quiet-hours DST boundary:** wall-clock remaining minutes were added to a
   UTC instant by `quiet-hours-service.ts`. Across Chicago's spring transition,
   a 22:00–08:00 window released at 09:00 instead of 08:00. Fall could wake the
   worker at 07:00, which the email handler rechecked and deferred; early delivery
   was not established. The canonical `quietHoursEndAt` now finds the first
   eligible UTC minute using the same zoned predicate. Seconds and milliseconds
   no longer carry beyond the boundary. Boolean push eligibility avoids that
   bounded search. Four baseline failures and five positive controls were
   reproduced; 54 shared clock cases and nine service cases pass after repair.
   Historical sub-minute timezone offsets and real notification delivery remain
   outside this finite suite.
2. **Stale inline edit:** `runInlineCommand.ts` read selection text before
   generation, then `applyEdit.ts` wrote a late `WorkspaceEdit` without the
   original document version. Two original-code cases overwrote intervening
   edits; an unchanged-buffer positive control passed. The original URI,
   selection and version now travel with the proposal. Trust, closed state,
   cancellation and ownership are checked before a versioned `TextEditor.edit`.
   Fourteen unit cases cover delayed responses, delayed review, editor switches,
   close/reopen, trust loss, cancellation and commit receipts. Native tests also
   cover accepted edits, preserved human edits and competing versioned writes.
3. **Repeated Code Key prompt:** isolated native tests launched VS Code with a
   temporary home/profile while using its persistent secret-storage backend.
   The owner observed macOS's missing-Keychain dialog in that test host. Every
   test-host/CLI launch now passes VS Code's memory-only secret-storage option.
   A native synthetic secret write/read/delete succeeded. The real login
   Keychain was not reset or modified; this does not verify real credential
   persistence. Private test profiles are removed on exit.
4. **False-positive native coverage:** the packaged test runner copied an
   explicit file list that omitted the new inline suite. One registration test
   passing did not establish edit safety. The allowlist now includes that suite,
   and Mocha rejects an empty selection. The final native run executed four
   named cases in VS Code 1.143.1, using the built VSIX and cleared credentials.
5. **Dormant SQL conformance:** both driver legs existed but required an opt-in
   URL and WebSocket proxy absent from the normal test invocation. CI now runs
   them after test migrations and rejects empty, skipped or failed results.
   Both adapters passed 32 cases against disposable PostgreSQL 17.11, including
   real forced RLS, denied cross-tenant writes, physical pool reuse and rollback.
   The exact CI shell step passed locally. This tests driver primitives with a
   scratch policy, not all production policies or ledger concurrency.
6. **Unicode coverage:** the existing arbitrary-byte stream fixture was ASCII.
   Additional tests split valid multilingual text and tool arguments at every
   byte boundary, one byte at a time and in 64 seeded partitions. Seven Google
   stream-framing cases pass. This closes a coverage gap; no parser defect was
   demonstrated by those valid fixtures.

## Lifecycle execution matrix

The owners below are current implementation entry points. The final column is
the remaining acceptance boundary, even when a narrower test passed. Forty-three
scenarios are a finite working matrix, not an exhaustive architecture guarantee.

### Cloud, schedules and data

| ID  | Case and canonical owner                                                                                                    | Evidence this pass; remaining check                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | Simultaneous turns and duplicate request IDs: `apps/web/app/api/llm/v1/chat/completions/lib/conversation-turn-admission.ts` | Inspected admission/lock tests. Run competing real SQL admissions and verify one owner/reservation.                                                                                     |
| C02 | Delayed/replayed events: `apps/web/lib/services/cloud-agent-run-service.ts`                                                 | Inspected event cursor and state guards. Replay persisted events through a fresh client and prove no terminal-state regression.                                                         |
| C03 | Browser stops reading: `apps/web/lib/workflows/durable-stream-write.ts`                                                     | Inspected bounded writer and unread-stream tests. Run the real workflow through disconnect/reopen and settlement.                                                                       |
| C04 | Cancel, orphan reaping and late executor events: `apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts`           | Inspected terminal-state/reaper handling. Verify actual executor abort and any already-started external effect separately.                                                              |
| C05 | Competing approval, expired checkpoint and stale lease: `apps/web/lib/services/cloud-agent-run-service.ts`                  | Inspected guards. Race real SQL claims with distinct owners; refusal must not execute the tool.                                                                                         |
| C06 | Pooled tenant scope and captured workspace: `packages/platform/data-layer/src/adapters/sql-session.ts`                      | Local live: both drivers isolate actual RLS rows, reuse the same backend and restore scope. Job workspace/org membership and production policies still need their own checks.           |
| C07 | Duplicate usage finalization and reservation recovery: `apps/web/lib/services/managed-usage-request-service.ts`             | Inspected invariant tests. Verify ledger conservation under real SQL contention and late completions without spending credits.                                                          |
| C08 | Concurrent schedule sweeps and revoked membership: `apps/web/lib/services/schedule-service.ts`                              | Inspected occurrence/lease/membership tests. Race two workers against a disposable database.                                                                                            |
| C09 | Ignored abort, retries and missed-run grace: `apps/web/lib/services/schedule-service.ts`                                    | Inspected timeout/retry/grace tests. A terminal row alone cannot prove a remote operation stopped.                                                                                      |
| C10 | Recurrence gap/fold and missed occurrence coalescing: `packages/platform/utils/src/scheduling/schedule-time.ts`             | Existing schedule-time tests inspected. Run recurrence creation, dispatch and reopening with the real schedule persistence path.                                                        |
| C11 | Quiet-hours gap/fold, midnight and date jump: `packages/contracts/types/src/time-focus.ts`                                  | Automated: 54 shared cases, including 1,440 starting-minute checks; nine service cases. Real queued delivery, browser/OS permission and urgent exceptions require transport acceptance. |
| C12 | Hidden/idle sessions and optional polling: `apps/web/lib/hooks/useManagedUsageSummary.ts`                                   | Activity gates inspected. Representative production transfer measurement remains `NEON-FREE-TRANSFER-BUDGET-01`; source gates do not prove Free-plan readiness.                         |

### Rendering and extensibility

| ID  | Case and canonical owner                                                                                                                    | Evidence this pass; remaining check                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Functional output versus image intent: `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`                                          | Automated output-intent cases reject inappropriate image calls and preserve explicit image requests with stubs. Current provider tool choice still needs minimal authorized live acceptance. |
| R02 | UTF-8/SSE/tool-argument byte splits: `packages/ai/providers/google/src/__tests__/stream-crlf-framing.test.ts`                               | Automated: seven framing cases with multilingual partitions. Verify source identity through persistence, reopen and copy.                                                                    |
| R03 | Incomplete math/code/diagram streaming and cancellation: `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx`    | Parsing/stream ownership inspected. Verify cancel → persisted partial output → fresh session in both themes.                                                                                 |
| R04 | Edit the second identical block; conflicting revisions: `packages/ui/unified-chat/src/components/markdown/assistantFenceEdits.ts`           | Automated functional/copy fixtures passed. Remounts do not establish fresh server-backed reopening or concurrent SQL edits.                                                                  |
| R05 | Separate diagrams, charts and artifact order: `apps/web/features/chat/components/messages/MessageBubble.tsx`                                | Functional fixtures passed with renderer mocks. Run actual Mermaid compilation and inspect controls/geometry in the browser.                                                                 |
| R06 | Four independent images, partial failure and retry: `apps/web/features/chat/components/messages/MessageBubble.tsx`                          | Deterministic gallery/tool-loop fixtures passed. The environment-gated gallery-envelope case was skipped; actual wire-envelope acceptance remains open.                                      |
| R07 | Hostile HTML/SVG and sandbox message spoofing: `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx`                       | Automated Markdown XSS cases passed. Deployed CSP, iframe isolation and parent-message enforcement need browser/runtime evidence.                                                            |
| R08 | Account/workspace switch during artifact completion: `apps/web/features/chat/stores/artifacts-store.ts`                                     | Scope invalidation inspected. Inject a late old-account result through real stores; the cache-scope mock alone is insufficient.                                                              |
| R09 | Skill metadata, warm cache and header-only updates: `apps/web/features/plugins/server/directory/installed-skills.ts`                        | Metadata repair already committed at the baseline with prior regression evidence. Running-UI import/refresh and distributed cache acceptance remain open.                                    |
| R10 | Plugin disable/re-enable/removal versus connector lifetime: `apps/web/lib/connectors/plugin-connectors.ts`                                  | Implementation and prior tests inspected. Claude's documented retained-connector behavior is a comparison point, not authorization to change AGI account grants.                             |
| R11 | Connector discovery followed by 401/403/revocation: `apps/web/lib/user-connector-tools.ts`                                                  | OAuth fixtures passed. Real provider revocation/in-flight expiry remains unverified; do not grant a new service merely to test it.                                                           |
| R12 | Session approval, risk, explicit block and temporary chats: `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts` | Session-grant fixtures passed, including unavailable storage. Real concurrent grants and scope restoration remain open.                                                                      |

### Developer and native surfaces

| ID  | Case and canonical owner                                                                                           | Evidence this pass; remaining check                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D01 | Deferred inline edit versus human changes: `apps/extension-vscode/src/core/runInlineCommand.ts`                    | Fourteen safety unit cases and native editor checks passed. Preserve original-code negative controls; do not silently rebase a stale proposal.                                             |
| D02 | Native edit races, cancellation and outcome receipt: `apps/extension-vscode/src/platform/applyEdit.ts`             | Native competing writes accept one winner; unit tests preserve the receipt if cancellation follows a committed edit. Do not infer network/backend cancellation from this result.           |
| D03 | Workspace trust and outbound sensitive content: `apps/extension-vscode/src/core/outboundContentGuard.ts`           | Full extension unit suite includes trust/refusal coverage. Run permission changes during actual runtime tool requests with no sensitive payloads.                                          |
| D04 | Multi-root workspace identity and execution target: `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Inspected Host Developer boundary. Verify two folders and target switches against the real stdio runtime.                                                                                  |
| D05 | Argument/workspace-bound approvals and reconnect: `apps/cli/src/app_server/developer_host.rs`                      | Inspected typed host boundary. Run CLI/IDE reconnection, revoked approval and stale request IDs; Rust suites were not run in this pass.                                                    |
| D06 | Paths, symlinks and credential attachments: `apps/desktop/electron` and VS Code outbound guards                    | Inspected native guard ownership. Exercise filesystem races and permission withdrawal on each public host; retained Tauri tests are not Electron evidence.                                 |
| D07 | Electron bridge origin and native grant withdrawal: `apps/desktop/electron/main.ts`                                | Inspected hosted-Web and device boundary. Verify invalid origins, permission withdrawal and renderer restart in the public host.                                                           |
| D08 | CLI interrupt, partial transcript and session recovery: `apps/cli/src/app_server/developer_host.rs`                | Inspected host lifecycle. Native TUI recovery and interrupted tool side effects remain open.                                                                                               |
| D09 | Command working directory, stop and output limits: `apps/extension-vscode/src`                                     | Existing extension unit coverage executed. Verify the actual terminal/runtime path; a text output channel is not a structured test-results interface.                                      |
| D10 | Device authentication and native secret lifetime: `apps/extension-vscode/src/test/runTests.ts`                     | Native synthetic secret round trip passed with memory-only storage; real OS-backed secure persistence and account switching remain unverified.                                             |
| D11 | Browser tab/frame provenance and navigation: `apps/extension/src`                                                  | Inspected ownership boundaries from the architecture atlas. Run stale-tab/navigation/frame changes in the actual extension.                                                                |
| D12 | Local/BYOK versus eligible Cloud sync: `apps/extension/src/features/cloud-bridge/conversationSync.ts`              | Inspected provenance gating. Verify explicit handoff and refusal across real surfaces without sending Local data to Cloud.                                                                 |
| D13 | Installed VSIX identity, copied tests and zero cases: `apps/extension-vscode/src/test/vsixInstallation.ts`         | Local/native package hash, installed bytes and four named cases verified; empty selections now fail. Other store distributions are not covered by this artifact.                           |
| D14 | Selected CLI source-release closure: `apps/cli/Cargo.toml`                                                         | CLI + 12 internal Rust crate dependencies and shared build inputs inspected. A clean isolated export build and license decision remain open; the whole repository is not being relicensed. |

### Media, files, effective settings and scale

| ID  | Case and canonical owner                                                                                        | Evidence this pass; remaining check                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| X01 | Image-job cancel/retry, partial assets and settlement: `apps/web/app/api/media/image/lib/image-job-executor.ts` | Source-traced in the atlas. Use provider stubs and real persistence before authorized live output quality checks. No image credits used here.                      |
| X02 | Voice permission, reconnect, interruption and settlement: `apps/web/features/chat/lib/live-voice-session.ts`    | Source-traced separate transport/usage lifetime. Device audio, real disconnection and late tool events remain open.                                                |
| X03 | Upload/archive validation and document round trips: file/artifact owners in the atlas                           | Source inventory only. Validate malformed archives, boundary sizes, binary preservation and native document export/reopen with fixture files.                      |
| X04 | Global/conversation/model reasoning and status: request routing and provider adapters                           | Source inventory only this pass. Compare actual effective payload with displayed setting on model switch; a “Thinking” label does not prove reasoning was enabled. |
| X05 | Backpressure, resource bounds and horizontal scale: Cloud run, stream and data owners above                     | Bounded paths inspected; no production load or 100,000-user run performed. Define measurable resource/latency budgets before claiming scale.                       |

## Current primary comparison evidence

Checked on 2026-11-02. These are documented behaviors, not live comparative UI
sessions or evidence that AGI has parity. Unknown plan, region or platform limits
remain unknown. No decompiled vendor code was imported.

| Reference                                                                                                                                                                                                                                                             | Bounded comparison and availability                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ChatGPT capabilities](https://help.openai.com/en/articles/9260256-chatgpt-capabilities-overview)                                                                                                                                                                     | Tools depend on settings/subscription. Existing supplied ChatGPT examples remain dated observed references; this page does not prove current visual geometry.                                                                                                                                                  |
| [Claude unified Plugins page](https://support.claude.com/en/articles/17740565-manage-plugins-skills-and-connectors-from-one-plugins-page) and [connector permissions](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities) | Primary extensibility reference. Unified page rollout began October 29; documented general availability November 9 and Enterprise November 30 are future dates at this check. Plugin removal and connector grants have distinct lifetimes. Mobile connector beta and organization controls limit availability. |
| [Perplexity Computer setup](https://www.perplexity.ai/personal-computer-setup)                                                                                                                                                                                        | Mac/device setup distinguishes folders, apps, browser and sensitive-action permissions. No inference about vendor DST scheduling semantics or all-platform availability.                                                                                                                                       |
| [Gemini Canvas](https://support.google.com/gemini/answer/16047321?hl=en)                                                                                                                                                                                              | Computer/web editing, saves and app preview guide the relevant artifact job. Direct fetch succeeded in this refresh; an earlier fetch timeout was not missing-feature evidence.                                                                                                                                |
| [Cursor Agent](https://cursor.com/docs/agent/overview) and [security](https://cursor.com/docs/agent/security)                                                                                                                                                         | Developer reference separates models, tools and instructions; checkpoints concern files rather than message history. MCP connection and tool approval are distinct. We do not copy weaker workspace-trust defaults.                                                                                            |
| [Antigravity permissions](https://antigravity.google/docs/permissions) and [agent settings](https://antigravity.google/docs/agent-settings)                                                                                                                           | Developer reference distinguishes permission precedence, project/global settings and sandbox/code access. Platform/preset differences and preview availability prevent assuming every account uses one behavior.                                                                                               |

## Verification and completion boundary

The focused Web run passed 125 tests and skipped one environment-gated gallery
case. The shared types package passed 2,281 tests, and all 1,507 extension unit
tests passed. Both live SQL legs passed 32
cases. Four packaged native VS Code cases passed with no provider credentials;
seven multilingual stream-framing tests passed. Package typechecks passed for
Web, shared types, the data layer, the Google adapter and VS Code, including its
native test build. Logs and report receipts are local review artifacts, not
production telemetry. Repository-guard receipts must accompany the commit;
no remote CI result is claimed here.

No production deployment, database migration, provider grant, billing change or
Fly restart is part of this pass. Mobile devices, actual OS credential storage,
fresh server-backed rendering reopening, deployed sandbox behavior and real
provider revocation remain unverified. Close rows only with their stated
acceptance evidence or an explicit decision recorded in the existing owner.
