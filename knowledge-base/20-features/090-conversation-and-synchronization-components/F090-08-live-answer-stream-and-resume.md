---
id: "F090-08"
type: "feature"
title: "Live answer stream and resume"
aliases: ["Streaming", "SSE stream", "Resume stream", "Reconnecting", "x_agent_event", "Agent event envelope", "stream cursor", "S90.13", "S90.14", "S90.15", "X-AGI-Stream-Resume"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.13", "S90.14", "S90.15"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "table:cloud_agent_events", "table:cloud_agent_runs", "table:web_messages", "api:POST /api/llm/v1/chat/completions", "api:POST /api/llm/v1/chat/completions/runs/[runId]/resume/stream", "api:GET /api/llm/v1/chat/completions/runs/[runId]", "SYS-chat-turn-pipeline", "SYS-api-and-contracts", "SYS-sync-and-continuity", "SYS-inference-providers"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-08 Live answer stream and resume

Cloud answers stream to the screen as server-sent events with a keep-alive line every 2 seconds of silence. Agent events carry a versioned envelope and a sequence number, and are journalled for runs. If a connection drops, Web replays the saved answer after its cursor, and Desktop, Mobile and CLI follow the run journal after their last sequence.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.13](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9013), [S90.14](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9014), [S90.15](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9015).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Streams a turn's text and agent events to the client, validates each envelope, and lets a client pick up after a drop without repeating what it has already shown. Two recovery paths exist: replay from the saved assistant turn by character cursor (plain chat) and replay of journalled run events after a sequence number (agent runs). (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:40-95; apps/web/lib/services/cloud-agent-run-service.ts:1218-1246)

**Why it exists.** Long answers cross flaky networks and proxies. Without keep-alives and resume, a drop loses or duplicates text. The brief requires an event gateway with heartbeats and resume, one versioned envelope, and a journalled cursor so a client can resume without duplicates (brief S90.13, S90.14, S90.15).

**Who uses it.** Everyone chatting on Cloud: Web, Mobile, the Tauri desktop shell, CLI, VS Code and Chrome read the same envelope. (apps/web/lib/hooks/useChatStream.ts:3241-3285; apps/desktop/src/api/cloudApi.ts:1225-1250; apps/mobile/services/streaming.ts:363-368; apps/cli/src/app_server/cloud_turns.rs:1050-1060; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1308; apps/extension/src/features/computer-use/cloudAgentClient.ts:470)

**Problems it solves**

- Idle connections dropped by proxies (keep-alive comment every 2 s). (apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:6,29-40)
- Duplicate text after reconnect (sequence ledger and character cursor). (apps/web/lib/hooks/useChatStream.ts:1650-1668,3273-3284)
- Half-shown answers when frames are lost (gap blocks settling until replay). (apps/web/lib/hooks/useChatStream.ts:3241-3245,3771-3777)
- Run state lost on app close (journal in cloud_agent_events). (apps/web/db/neon/0061_cloud_agent_runs.sql:35)

**Use cases**

- Watch a long answer type out, then lose Wi-Fi briefly; the rest fills in.
- Close the laptop during an agent run and reopen: Desktop or Mobile follows the run after its last sequence.
- A proxy drops an idle research stream; keep-alives prevent it.
- A client missing a frame stops settling and asks for the saved remainder.

## 2. User experience

**Where to find it**

- Every Cloud chat on Web (hosted app, also inside Electron Desktop), Mobile, CLI, Chrome side panel and VS Code. Resume is automatic; there is no control. (apps/web/lib/hooks/useChatStream.ts:3771-3777)
- The only visible cue found on Web is a 'reconnecting' stream phase while resume runs. (apps/web/lib/hooks/useChatStream.ts:3040-3049)

**Before you start**

- A Cloud turn (Managed Cloud route).
- For Web plain-chat resume: the conversation is not temporary, the turn is not a continuation, and no durable run handle exists. (apps/web/lib/hooks/useChatStream.ts:3045)
- The server must have saved the assistant turn; if it has not yet, the client retries up to 3 times, 500 ms apart. (apps/web/lib/hooks/useChatStream.ts:1672-1673,3012-3016)

**Screens and controls**

- No dedicated control. The chat shows streaming text, then a 'reconnecting' phase, then the final answer or an error.

**Journey**

1. Person sends a message.
2. Server opens an SSE response with no-cache headers and keep-alive lines; frames carry envelopes with sequence numbers.
3. If the connection ends early or a gap in sequence is seen, the Web client posts the last sequence and delivered character count to /runs/<turnId>/resume/stream.
4. The server sends only the unseen text and a finish frame, then [DONE].
5. The client appends the remainder and settles the answer.
6. For agent runs, Desktop, Mobile and CLI instead fetch GET /runs/<runId>?after=<sequence> pages and replay them.

**What the person sees and gets**

- Error text when resume fails: 'The answer stream lost events and could not be resumed.' (apps/web/lib/hooks/useChatStream.ts:3773-3775)
- Mobile message 'The response ended before completion. Please retry.' (apps/mobile/services/streaming.ts:403)
- Response headers X-AGI-Stream-Resume, X-AGI-Stream-Resume-Characters, X-AGI-Stream-Truncation. (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:85-91)
- Run headers X-AGI-Agent-Run-Id and X-AGI-Agent-Run-URL. (apps/web/app/api/llm/v1/chat/completions/route.ts:357-360)

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Heartbeat wrapper sends ': keepalive' after 2000 ms without output and reports client drops with bytes delivered. (apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:6,24-27,52-64)
- Main completions route wraps tool-loop and research streams in withSseHeartbeat. (apps/web/app/api/llm/v1/chat/completions/route.ts:786,1235)
- Agent events are encoded into an envelope (schema version, session, turn, sequence, time) validated by zod on the server before sending. (apps/web/app/api/llm/v1/chat/completions/lib/agent-event-stream.ts:111-134; packages/contracts/cloud-contracts/src/agent-events.ts:321-341)
- Clients validate with parseAgentEventDelta: Web, Desktop, Mobile, VS Code, Chrome. (packages/contracts/cloud-contracts/src/agent-events.ts:343-346; apps/desktop/src/api/cloudApi.ts:1240; apps/mobile/services/streaming.ts:364)
- Run events are journalled in batches: text, reasoning and tool deltas coalesce for 250 ms or 64 events; other events flush at once. Insert is idempotent per (run, sequence). (apps/web/lib/services/cloud-agent-event-journal.ts:11-22; apps/web/lib/services/cloud-agent-run-service.ts:841-845,908-917)
- GET /runs/<id>?after= returns events after a sequence, up to 500 per page, and a nextAfterSequence. (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:46-70)
- Web: sequence ledger with verdicts in-order, duplicate, gap, unsequenced; duplicates skipped; a gap blocks [DONE] settle and triggers cursor replay. (packages/contracts/types/src/provider-adapter.ts:477-514; apps/web/lib/hooks/useChatStream.ts:3241-3285,3771-3777)
- Resume route returns 404 when the turn is absent for the caller and 400 'resume_cursor_invalid' for a bad cursor. (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:46-47,60-63,72)
- Desktop and Mobile follow runs after the last sequence and drop already-seen events. (apps/desktop/src/runtime/CloudRuntime.ts:695-725; apps/mobile/services/streaming.ts:940-1010; apps/desktop/src/api/cloudApi.ts:1243-1250)
- CLI accepts only the next expected sequence and the current schema version. (apps/cli/src/app_server/cloud_turns.rs:1050-1060)

**Incomplete**

- Web resume by character cursor works only for plain chat; temporary chats, turn continuations and durable runs return false from resumeFromCursor. (apps/web/lib/hooks/useChatStream.ts:3045)
- The brief's cursor/replay store points at the run journal; the plain-chat resume route reads the saved assistant message, not the journal. (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:66-74)
- The StreamEnvelope (key 'envelope') that the Web gap check reads is stamped by withStreamEnvelope only in the human-held resume route and the replay builder; where the first-leg stream is stamped was not found. Frames without it are read as 'unsequenced' with no gap check. (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:402; packages/contracts/types/src/provider-adapter.ts:477-480)

**Present but disconnected or switched off**

- None found.

**Not available**

- Resume by cursor in VS Code and Chrome side panel: only envelope parsing was found; no replay client found. (apps/extension-vscode/src/integrations/localRuntimeClient.ts:1308; apps/extension/src/features/computer-use/cloudAgentClient.ts:470)
- Local mode streaming is a different path (local runtime) and not covered here.

## 4. Required behaviour

**Established requirements**

- A gateway streams a turn's events as server-sent events with agent-run headers, heartbeats and a resume path. (source: brief S90.13)
- Stream events use one versioned envelope that the server encodes and every client decodes and validates. (source: brief S90.14)
- Events are journalled with a sequence cursor so a client can re-read after a cursor or resume a dropped stream without duplicates. (source: brief S90.15)
- Keep-alive interval is 2 seconds. (source: apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:6)
- Resume sends only the unseen part of the saved answer. (source: apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:74)

**Acceptance criteria**

1. An idle 5 s gap in a stream contains at least two ': keepalive' lines.
2. Dropping the connection at 40 characters then resuming with cursor characters=40 yields only the rest, with no repeated text.
3. A resume for a turn id that belongs to another account returns 404 not_found.
4. A resume body with a negative number returns 400 resume_cursor_invalid.
5. A skipped sequence number stops the Web client from finishing until replay completes.
6. GET run?after=N returns only events with sequence greater than N, in order.
7. A second write of the same (run, sequence) does not create a duplicate row.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every client that renders agent events should dedupe by sequence, as Web, Desktop, Mobile and CLI do. [inferred]
- Resume should be offered on every Cloud surface; today only Web, Desktop, Mobile and CLI have replay code. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Name one owner for the two envelopes (StreamEnvelope and AgentEventEnvelope) in docs.
- [proposed] Stamp the first-leg stream so gap detection covers plain chat from the first byte, if it is not already.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | withSseHeartbeat | `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts` | Keep-alive lines, SSE headers, disconnect log. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Opens the stream, sets run headers. |
| service | createAgentEventStreamEmitter | `apps/web/app/api/llm/v1/chat/completions/lib/agent-event-stream.ts` | Builds and validates the agent event envelope per frame. |
| schema | AgentEventEnvelopeSchema | `packages/contracts/cloud-contracts/src/agent-events.ts` | Shared envelope schema and parseAgentEventDelta. |
| config | AGENT_EVENT_SCHEMA_VERSION | `packages/contracts/types/src/developer-session-versioning.ts` | Envelope schema version number. |
| service | stream-envelope | `apps/web/app/api/llm/v1/chat/completions/lib/stream-envelope.ts` | Stamps sequence on frames; builds the resume replay stream. |
| endpoint | POST /api/llm/v1/chat/completions/runs/[runId]/resume/stream | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts` | Replays the unseen tail of a saved turn. |
| service | readPersistedAssistantTurn | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts` | Reads the saved assistant text used by resume. |
| endpoint | GET /api/llm/v1/chat/completions/runs/[runId] | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | Pages journalled events after a sequence. |
| service | cloud-agent-run-service | `apps/web/lib/services/cloud-agent-run-service.ts` | appendCloudAgentEvents, getCloudAgentRun. |
| service | cloud-agent-event-journal | `apps/web/lib/services/cloud-agent-event-journal.ts` | Coalesces and flushes journal writes. |
| table | cloud_agent_events | `apps/web/db/neon/0061_cloud_agent_runs.sql` | Event journal keyed by (run_id, sequence). |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Web reader: sequence checks, replayFromCursor, ledger. |
| service | inspectStreamSequence | `packages/contracts/types/src/provider-adapter.ts` | Sequence verdict function. |
| service | cloudApi stream reader | `apps/desktop/src/api/cloudApi.ts` | Tauri desktop envelope parse and cursor dedupe. |
| service | CloudRuntime follow | `apps/desktop/src/runtime/CloudRuntime.ts` | Tauri desktop run follow after last sequence. |
| service | streaming.ts | `apps/mobile/services/streaming.ts` | Mobile stream reader and durable run follower. |
| service | cloud_turns | `apps/cli/src/app_server/cloud_turns.rs` | CLI reader that checks schema version and sequence. |
| service | localRuntimeClient | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | VS Code envelope parse. |
| service | cloudAgentClient | `apps/extension/src/features/computer-use/cloudAgentClient.ts` | Chrome envelope parse. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client posts the chat request to the completions route. | device | apps/web/lib/hooks/useChatStream.ts (stream request) |
| Server resolves the model route, calls the provider, and turns provider chunks into envelope frames. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/agent-event-stream.ts:111-134 |
| Provider produces the tokens. | outside service | Cloud route calls an outside model provider [inferred from route design; see SYS-inference-providers] |
| Server wraps the body in withSseHeartbeat and sets no-cache headers. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:1235; apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:8-13 |
| For runs, envelopes are batched into cloud_agent_events and the run row's last sequence is advanced. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/managed-agent-stream.ts:172,513; apps/web/lib/services/cloud-agent-run-service.ts:893-985 |
| Client validates each frame, skips duplicates, tracks last sequence and delivered characters. | device | apps/web/lib/hooks/useChatStream.ts:3273-3285 |
| On drop or gap, client calls resume (Web) or follows the run (Desktop, Mobile, CLI) and appends the unseen part. | device and our servers | apps/web/lib/hooks/useChatStream.ts:2990-3043; apps/mobile/services/streaming.ts:980-1010 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run events (envelopes) | table cloud_agent_events | Read back by clients through GET runs/<id>?after= | Deleted on account erasure (apps/web/lib/server/account-erasure.ts and deletion-manifest.ts reference the table); other retention unknown. |
| Saved assistant turn (text, truncation flag) | table web_messages (read by readPersistedAssistantTurn) | Yes, see F090-10 | With the conversation. |
| Client cursor (last sequence, delivered characters) | in memory on Web; run reference in app state on Desktop and Mobile | No | Lost on reload for Web plain chat [inferred]; not verified. |

**Models and providers.** Any provider route feeds the same envelope; the resume replay only needs the saved text and its model label. (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:75-83)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; resume resolves the caller through getUserScopedDb and filters the turn by user and workspace. (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:53,66-71) |
| Permissions | CSRF token required on resume; rate limit bucket 'chat-conversation'. (route.ts:50-55) |
| Subscription | Resume itself has no plan check; the original turn is metered by its own reservation (see F090-09). Resume replays saved text and does not call a provider. (route.ts:74-83) |
| Limits and metering | Resume has no usage charge found. Run follow pages up to 500 events (default 100). (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:53) |
| Feature flags | None found. |
| Model compatibility | Model independent. |
| Provider restrictions | None found. |
| Local mode | Not covered: resume and the run journal are Cloud server features; Local inference streams from the device runtime. [inferred] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Idle | Keep-alive comment after 2 s silence. | sse-heartbeat.ts:55-58 |
| Client drops | Server logs 'sse_stream_disconnected' and counts a failure. | sse-heartbeat.ts:24-27 |
| Turn not yet saved | 404 on resume; client retries 3 times with 500 ms wait. | useChatStream.ts:3012-3016 |
| Resume fails | Error 'The answer stream lost events and could not be resumed.' | useChatStream.ts:3771-3775 |
| Sign-out or account change mid stream | Token owner assertion aborts the reader. | useChatStream.ts:3003-3020 (assertTokenOwner) |
| Cancel | AbortError is treated as a cancel and not resumed. | useChatStream.ts:3783-3800 |
| Truncated answer | Finish reason 'stopped' and X-AGI-Stream-Truncation header. | resume/stream/route.ts:30,79,90 |
| Offline | Network errors in resume attempts are retried; no offline queue for the stream itself. | useChatStream.ts:3001-3011 |
| Accessibility | Not handled in the code reviewed for the reconnect state; not searched. | none |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.test.ts`: Heartbeat wrapper.
- `apps/web/app/api/llm/v1/chat/completions/lib/stream-envelope.test.ts`: Envelope stamping and buildTurnResumeStream.
- `apps/web/app/api/llm/v1/chat/completions/lib/agent-event-stream.test.ts`: Agent event emitter.
- `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.test.ts`: Resume route.
- `apps/web/lib/hooks/useChatStream.envelope.test.tsx`: Web reader and envelope handling.
- `apps/web/lib/workflows/__tests__/durable-stream-bounds.test.ts`: Durable stream bounds.
- `packages/contracts/types/src/__tests__/developer-session-versioning.test.ts`: Schema version constants.

**Test scenarios**

- **Idle keep-alive**
  1. Start a stream whose provider pauses 6 s.
  2. Read the raw response.
  - Expected: Lines ': keepalive' appear about every 2 s.
- **Mid-answer drop on Web**
  1. Send a long prompt.
  2. Disable the network after some text appears for 3 s, then enable it.
  - Expected: Phase shows reconnecting, then the answer completes with no repeated sentence.
- **Invalid cursor**
  1. POST resume with cursor {sequence:-1,characters:0}.
  - Expected: 400 resume_cursor_invalid.
- **Other account's turn**
  1. POST resume with a turn id owned by another user.
  - Expected: 404 not_found.
- **Agent run follow**
  1. Start an agent run on Desktop or Mobile, kill the app after some events, reopen.
  - Expected: Events after the last saved sequence appear once each; run ends in a terminal state.
- **Duplicate journal write**
  1. Call appendCloudAgentEvents twice with the same envelope.
  - Expected: One row for that (run, sequence).

**Where to look when it fails**

- Log event 'sse_stream_disconnected' and failure metric 'stream_disconnected'.
- Table cloud_agent_events (sequence gaps) and cloud_agent_runs.last_event_sequence.
- Response headers X-AGI-Stream-Resume and X-AGI-Agent-Run-Id.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Cloud resume replay exists on Web, Desktop, Mobile and CLI only; VS Code and Chrome parse envelopes but no replay found** Affects: VS Code and Chrome users. Evidence: apps/extension-vscode/src/integrations/localRuntimeClient.ts:1308; apps/extension/src/features/computer-use/cloudAgentClient.ts:470. Work needed: Confirm and add run-follow or accept a documented difference.
- **Where the first-leg Web stream gets its StreamEnvelope stamp is not found; gap detection depends on it** Affects: Web plain chat reliability. Evidence: withStreamEnvelope used only at runs/[runId]/resume/route.ts:402. Work needed: Trace the stamping path or add it to the main route.
- **Web plain-chat resume is unavailable for temporary chats and continuations** Affects: Web users in temporary chats. Evidence: apps/web/lib/hooks/useChatStream.ts:3045. Work needed: Decide the product rule; temporary chats may be intentionally unsaved.
- **Brief cites journal lines that moved (cloud-agent-run-service.ts:788/1112 now different)** Affects: Documentation. Evidence: apps/web/lib/services/cloud-agent-run-service.ts:841,1218. Work needed: Refresh the brief's code references.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- table:cloud_agent_events
- table:cloud_agent_runs
- table:web_messages
- api:POST /api/llm/v1/chat/completions
- api:POST /api/llm/v1/chat/completions/runs/[runId]/resume/stream
- api:GET /api/llm/v1/chat/completions/runs/[runId]
- SYS-chat-turn-pipeline
- SYS-api-and-contracts
- SYS-sync-and-continuity
- SYS-inference-providers

## Unknown

- Where the first-leg Web stream is stamped with the StreamEnvelope key.
- Whether VS Code and Chrome have any reconnect replay.
- How long cloud_agent_events rows are retained.
- What the person sees on Web while 'reconnecting' (visual copy not read).
- Whether Mobile and CLI use the plain-chat resume route (not found).
