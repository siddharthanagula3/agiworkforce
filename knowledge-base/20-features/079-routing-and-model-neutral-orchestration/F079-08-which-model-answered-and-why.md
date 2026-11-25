---
id: "F079-08"
type: "feature"
title: "Which model answered, and why"
aliases: ["Which model answered", "Moved to <model>", "Auto chose <model>", "Routing explanation", "Actual-model attribution", "Routing policy version", "policyVersion", "model escalation receipt", "Auto route notice", "S79.26", "S79.27", "S79.28"]
area: "79 Routing and model-neutral orchestration"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S79.26", "S79.27", "S79.28"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-observability-and-operations", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design", "F079-07", "file:packages/ui/unified-chat/src/lib/modelEscalation.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F079-08 Which model answered, and why

Every answer names the model that wrote it. When Auto moves a chat to another model, a short grey line says 'Moved to <model>: <reason>'. Each Cloud routing decision is also stored with the routing policy version that made it, so a turn can be traced later.

Area: [79. Routing and model-neutral orchestration](README.md). Requirement items: [S79.26](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7926), [S79.27](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7927), [S79.28](../../10-requirements/capabilities/079-routing-and-model-neutral-orchestration.md#s7928).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows the served model on each answer, shows a one-time receipt when Auto changed the chat's model with a plain-language reason, and records a trace for every Cloud routing decision that includes the policy version (packages/ai/routing/src/routing-trace.ts:16,153-154).

**Why it exists.** A person should never wonder which model answered or why it changed; Auto keeps a conversation on its model and moves only for a reason (doc: docs/decisions/2026-09-05-living-decision-model.md, D-2026-09-05-06). Engineers need a trace to explain a turn later.

**Who uses it.** Anyone using Auto on Web, Desktop (hosted web), Mobile, Chrome and CLI; engineers and operators reading traces.

**Problems it solves**

- Silent model changes mid-chat.
- Not knowing which model produced an answer.
- No way to link a past decision to the routing rules in force.

**Use cases**

- Person reads 'Moved to <model>: the model Auto would normally use was having trouble' under an answer.
- Person checks the model name under an answer in VS Code.
- CLI user sees 'Auto route: <task> -> <provider>/<model>' when an own-key Auto session changes model.
- Engineer queries a request id in routing_decision_traces to see policyVersion in the trace.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): under the assistant answer in apps/web/features/chat/components/messages/MessageBubble.tsx (receipt at 3511-3517; 'Auto chose <model>' chip built at 2397-2412).
- Mobile: receipt test id model-escalation-receipt in apps/mobile/src/features/chat/components/MessageBubble.tsx:3059-3069; line from apps/mobile/src/features/chat/components/messageTurnNotices.ts:47-55.
- Chrome side panel: line under the answer (apps/extension/src/features/side-panel/bubbles.ts:474-485) and model name in the answer meta (bubbles.ts:464-470).
- CLI: turn notice 'Auto route: ...' (apps/cli/src/agent/chat.rs:725-728).
- VS Code: model label in the answer actions row (webviewContent.ts:4941-4953, :7883); no 'Moved to' line found.

**Before you start**

- Receipt needs a conversation on Auto and a served model different from the previous one.
- Trace needs a Cloud (managed) turn.

**Screens and controls**

- Read-only text. No controls.
- Web chip text 'Auto chose <model>' appears only when the requested model was Auto (MessageBubble.tsx:2409-2413).
- Receipt text format 'Moved to <model label>: <reason phrase>' or 'Moved to <model label>' (packages/ui/unified-chat/src/lib/modelEscalation.ts:55-62).

**Journey**

1. The person sends a message on Auto.
2. The server decides the route and compares it with the conversation's prior model (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2881-2891).
3. If different it adds X-AGI-Moved-From-Model and X-AGI-Moved-Reason headers (packages/contracts/types/src/chat-fallback-reason.ts:9-21).
4. The client saves them in message metadata (useChatStream.ts:1998,2640-2642) and, after streaming ends, shows the receipt once under the answer.

**What the person sees and gets**

- Receipt line with reason phrases: 'the model this chat was already using', 'the best fit for this kind of request', 'the best balance of quality and cost for this kind of request', 'the models Auto prefers for this request were not available', 'the model Auto would normally use was having trouble', 'this conversation is long enough that another model costs less to run', 'the free models are not available in your region', 'Auto is trying a newer model on some requests', 'the model you picked cannot handle this request' (packages/contracts/types/src/auto-route-explanation.ts:1-11).
- Stored trace row (Cloud) with policyVersion.

**Settings**

- No setting hides the receipt (none found in the files opened).
- AGI_ROUTING_TRACE_RETENTION_DAYS and AGI_ROUTING_TRACE_RETENTION_BATCH tune trace retention (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:21-40).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- resolveModelEscalation builds the line from moved-from model, reason and served model; if no marker, it derives a move when routing source is auto and the pinned model differs (modelEscalation.ts:27-52).
- Web, Mobile and Chrome render the receipt; CLI prints an Auto route notice (see map).
- Trace builder stores policyVersion, selection, reason, fallbacks, stages and inputs (routing-trace.ts:140-200); policyVersion comes from the registry release (routing-trace.ts:16).
- Web server writes the trace without blocking the turn and completes it with outcome, time to first token, duration and cost (routing-decision-trace-service.ts:167-215).
- CLI sessions record policy_version on Auto routing state (apps/cli/src/platform/runtime/session.rs:402-407; chat.rs:737).
- VS Code shows the served model label on each finished answer (ChatStateManager.ts:6609,6816-6833; webviewContent.ts:4941).

**Incomplete**

- Chrome derives movedFromModel on the client from the previous answer, not from the server header (apps/extension/src/features/side-panel/answeredModel.ts:17-38).
- The CLI notice appears only for own-key Auto sessions; the function returns early for Managed, Local and on-device, and when the server routes Auto (apps/cli/src/agent/chat.rs:660-663,707-723).
- The decision record D-2026-09-05-06 says move only on failure; the server marks a move whenever the Auto route model differs from the prior model, with the route reason (request-processor.ts:2881-2891). Reason can be e.g. preferred_slot.

**Present but disconnected or switched off**

- Migration 0212 header says 'NOT YET APPLIED: draft only' (apps/web/db/neon/0212_routing_decision_traces.sql:1-5). Whether it is applied to any database is unknown; the code writes to the table and logs a warning if the write fails.

**Not available**

- VS Code: no 'Moved to' line found; attribution is present (brief says missing for both).
- Mobile and Desktop Local: no routing trace; traces cover Cloud only (request-processor.ts:4876: Local and BYOK never reach this route).
- API consumers: policy version is in the stored trace only; no response field was found.

## 4. Required behaviour

**Established requirements**

- The user can see why Auto chose or moved to a model. (source: S79.26 brief)
- Each answer shows which model actually produced it. (source: S79.27 brief)
- Routing policies are versioned and each decision traces to its policy version. (source: S79.28 brief)
- The line is a receipt shown once after the answer finishes. (source: S79.26 brief; MessageBubble.tsx:3511)
- Auto stays on the conversation's model and escalates on a failure signal; quality moves up, never sideways or down. (source: doc: docs/decisions/2026-09-05-living-decision-model.md D-2026-09-05-06)

**Acceptance criteria**

1. After a finished Auto answer served by a model other than the previous one, a 'Moved to <model>' line appears once; during streaming it does not.
2. A known reason code shows its plain phrase; an unknown code shows the raw code.
3. An answer on a pinned (manual) model shows no 'Moved to' line.
4. Every finished answer shows its served model on Web, Mobile, Chrome, CLI and VS Code.
5. A Cloud turn writes one routing_decision_traces row whose trace JSON has policyVersion equal to the registry release version.
6. A failed trace write never fails the turn.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reason codes shown to people must be a closed list with plain phrases [inferred from auto-route-explanation.ts].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the 'Moved to' line in VS Code.
- [proposed] Add a dedicated policy_version column or index to the trace table so audits do not read JSON.
- [proposed] Align the move rule with D-2026-09-05-06 or update the decision record.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | explainAutoRouteReason | `packages/contracts/types/src/auto-route-explanation.ts` | Reason code to plain phrase. |
| service | resolveModelEscalation | `packages/ui/unified-chat/src/lib/modelEscalation.ts` | Builds the 'Moved to' line. |
| component | ProvenanceFooter | `packages/ui/unified-chat/src/components/ProvenanceFooter.tsx` | Shared footer using the model label and escalation. |
| component | Web MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Receipt and 'Auto chose' chip. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Reads moved headers into metadata (1998,2640). |
| store | web-chat-store metadata | `apps/web/shared/stores/web-chat-store.ts` | Message metadata field movedFromModel (231). |
| service | autoModelMove | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Decides the move (2881) and returns it on the processed turn (6927-6928). |
| service | addModelEscalationHeaders | `packages/contracts/types/src/chat-fallback-reason.ts` | Sanitised X-AGI-Moved-From-Model and X-AGI-Moved-Reason headers. |
| service | assistant turn persistence | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts` | Saves movedFromModel and movedReason with the assistant message (236,328-329). |
| service | buildRoutingDecisionTrace | `packages/ai/routing/src/routing-trace.ts` | Builds the trace with policyVersion. |
| service | routing decision trace service | `apps/web/lib/services/model-rollout/routing-decision-trace-service.ts` | Writes and completes the trace row. |
| table | routing_decision_traces | `apps/web/db/neon/0212_routing_decision_traces.sql` | Stores trace JSON and outcome. |
| component | Mobile MessageBubble | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Receipt at 3059; line source at 1959. |
| service | Mobile modelEscalationLine | `apps/mobile/src/features/chat/components/messageTurnNotices.ts` | Wraps resolveModelEscalation for a message (47-55). |
| component | Chrome bubbles | `apps/extension/src/features/side-panel/bubbles.ts` | buildRouteReceipt (474) and model meta (464). |
| service | Chrome answeredModel | `apps/extension/src/features/side-panel/answeredModel.ts` | Derives movedFromModel from previous answer. |
| service | CLI re_resolve_auto_route_for_turn | `apps/cli/src/agent/chat.rs` | Auto re-resolution and the 'Auto route' notice (650-740). |
| service | CLI routing policy version | `apps/cli/src/platform/runtime/session.rs` | current_routing_policy_version (405) stored on managed Auto routing state. |
| service | Rust registry policy version | `crates/agiworkforce-model-registry/src/lib.rs` | routing_policy_version (652). |
| config | routing policies release | `packages/ai/model-registry/catalog/routing-policies.json` | Holds release.policyVersion (line 4). |
| service | VS Code served model tracking | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | turn_model event and modelLabel in done payload (6609,6816-6833). |
| component | VS Code webview answer meta | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | answerMeta shows model label (4941). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server resolves the Auto route and compares its model with the conversation's prior route affinity. | our servers | request-processor.ts:2881-2891,4983-4987 |
| Server builds the decision trace with policyVersion and starts an asynchronous write. | our servers | request-processor.ts:4855-4875; routing-decision-trace-service.ts:167-197 |
| Server adds moved headers to the stream response. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:966-967 |
| Client reads headers, stores them with the message, and after the stream ends renders the receipt. | device | useChatStream.ts:1998,2640; MessageBubble.tsx:3511 |
| At completion the server updates the trace with outcome, time to first token, duration and provider cost. | our servers | routing-decision-trace-service.ts:199-231; stream-transform.ts:64 |
| CLI own-key Auto session re-classifies each turn locally against the bundled registry and prints the notice. | device | apps/cli/src/agent/chat.rs:660-740 |
| Chrome compares the answered model with the previous answer's model and sets movedFromModel. | device | apps/extension/src/features/side-panel/answeredModel.ts:17-38 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| movedFromModel and movedReason on the assistant message | Saved conversation message and local message metadata | With the conversation (Web); Chrome and Mobile store in their own message state | With the message |
| Routing decision trace (selection, task type, reason, model, provider, route, cohort, fallbacks, policyVersion in JSON; request id, surface, user id, organization id) | table routing_decision_traces | Server only | Deleted after the retention window (default 30 days in code) and on account erasure; organization link is set null on workspace erasure (apps/web/lib/server/organization-erasure.ts:176; account-erasure.ts:157); included in user export (apps/web/app/api/user/export/route.ts:2477) |

**Models and providers.** Receipt uses the model catalog label for the served model (modelEscalation.ts:55-62). The reason code comes from the Auto resolver (auto.ts:444-449). No provider is called by this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Receipt shows for any signed-in Cloud user. Trace rows record user id; Local and own-key turns on Web do not reach this route (request-processor.ts:4876). |
| Permissions | Trace table is operational telemetry with no app_rls privileges (0212 header). Reading is by service context and platform admin routes. |
| Subscription | No entitlement gates the receipt or the trace (none found in the code). |
| Limits and metering | Trace reasons are capped at 20 items of 300 characters (routing-trace.ts, MAX_TRACE_REASONS and MAX_TRACE_REASON_LENGTH); pending-trace memory capped at 2000 (routing-decision-trace-service.ts, PENDING_TRACE_LIMIT). |
| Feature flags | Trace builder reads stage flags only to record them. No flag hides the receipt. |
| Model compatibility | Label lookup works for catalog models; an unknown id is shown as the raw id (modelEscalation.ts:56). |
| Provider restrictions | none found in the code |
| Local mode | Mobile and Desktop Local: no routing trace or receipt source found; the CLI Local session does not re-resolve Auto (chat.rs:707-723 returns for Local/OnDevice). Attribution of the on-device model name in Local mode: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | Receipt hidden until streaming ends. | MessageBubble.tsx:3511; mobile MessageBubble.tsx:1959 |
| No reason in the marker | Line shows 'Moved to <model>' without a reason. | modelEscalation.ts:55-62 |
| Unknown reason code | Raw code is shown after the colon. | modelEscalation.ts:58-59 |
| Manual model selection | No receipt (user changed the model). | modelEscalation.ts:43-52; test title at modelEscalation.test.ts:55 |
| Older turns saved before the marker existed | Move derived from pinned vs served model, no reason. | modelEscalation.ts:20-24,43-52 |
| Trace write fails | Logged and dropped; turn unaffected. | routing-decision-trace-service.ts:186-195 |
| Header text unsafe | Characters outside a safe set are replaced with underscore and truncated. | chat-fallback-reason.ts:18-20 |
| Screen reader | VS Code adds a visually hidden author label 'AGI (<model>) replied:'; other apps' accessibility of the receipt: not handled in the code found. | webviewContent.ts:7879 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/lib/__tests__/modelEscalation.test.ts`: Names the served model and reason, omits reason, silent when same model, derivation from pin, silent for manual, marker preferred.
- `apps/web/lib/services/model-rollout/__tests__/routing-decision-trace.test.ts`: Trace written with cohort and slot, no completion for unrecorded decision, later success overwrites failure, write failure swallowed.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.model-continuity.test.ts`: Second turn stays on first model when nothing failed; moves one rung up on failure.
- `apps/mobile/__tests__/MessageBubbleMounts.test.tsx`: Mobile bubble mounts (references resolveModelEscalation; exact assertions not opened).
- `apps/mobile/__tests__/sharedChatEntries.test.ts`: References the escalation helper (exact assertions not opened).
- `packages/ai/routing/src/__tests__/shadow-canary.test.ts`: References buildRoutingDecisionTrace or policy version (exact assertions not opened).

**Test scenarios**

- **Receipt after a move**
  1. On Auto, send a turn that makes the route change model (for example after a failure).
  2. Wait for the stream to end.
  - Expected: One 'Moved to <model>: <reason>' line under the answer; none while streaming.
- **Pinned model**
  1. Pick a specific model.
  2. Send two turns.
  - Expected: No receipt on either.
- **CLI own-key Auto**
  1. Start an own-key session with an Auto selection.
  2. Send a coding prompt then an image prompt.
  - Expected: 'Auto route: <task> -> <provider>/<model>' only when the model changed.
- **Trace row**
  1. Send a Cloud turn.
  2. Query routing_decision_traces by request id.
  - Expected: One served row; trace JSON has policyVersion; outcome set after completion.
- **VS Code attribution**
  1. Finish a turn in VS Code.
  - Expected: Answer shows the model label; no 'Moved to' line.

**Where to look when it fails**

- Log '[routing-trace] decision was not persisted' / 'outcome was not persisted'.
- Server log 'Auto route decision for a continuing conversation' with switchedModel (request-processor.ts:4992-5005).
- Headers X-AGI-Moved-From-Model, X-AGI-Moved-Reason, X-AGI-Resolved-Model.
- Table routing_decision_traces (reason, model_key, trace).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/web/079-routing-and-model-neutral-orchestration.md)
- Desktop: [70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/desktop/079-routing-and-model-neutral-orchestration.md)
- Mobile: [70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/mobile/079-routing-and-model-neutral-orchestration.md)
- CLI: [70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/cli/079-routing-and-model-neutral-orchestration.md)
- VS Code: [70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/vscode/079-routing-and-model-neutral-orchestration.md)
- Chrome: [70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md](../../70-qa/test-plans/chrome/079-routing-and-model-neutral-orchestration.md)

## 10. Gaps and dependencies

- **VS Code has no 'Moved to' line; brief says attribution is missing too but code shows model label.** Affects: VS Code. Evidence: ChatStateManager.ts:6816-6833; webviewContent.ts:4941. Work needed: Add the receipt line; correct the brief for attribution.
- **Trace migration 0212 is marked draft, not applied, in its own header.** Affects: Operators, SLO data. Evidence: 0212_routing_decision_traces.sql:1-5. Work needed: Confirm applied state per environment.
- **Move rule differs from the decision record (any model difference vs failure only).** Affects: Web, Desktop, Mobile, Chrome. Evidence: request-processor.ts:2881-2891 vs docs/decisions/2026-09-05-living-decision-model.md. Work needed: Decide which is right; update code or record.
- **Chrome does not use the server header for the move.** Affects: Chrome. Evidence: answeredModel.ts:17-38. Work needed: Use the server marker if Chrome gets Cloud headers.
- **No Local-mode attribution or trace found on Mobile and Desktop.** Affects: Mobile, Desktop Local. Evidence: request-processor.ts:4876. Work needed: Establish what Local shows.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-observability-and-operations
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design
- F079-07
- file:packages/ui/unified-chat/src/lib/modelEscalation.ts

## Unknown

- Whether migration 0212 is applied in production.
- Exact retention window in production (default in code is 30 days).
- Mobile and Desktop Local-mode model attribution.
- Whether VS Code receives routing reasons from the local runtime at all.
- Whether any API response exposes policyVersion to callers.
