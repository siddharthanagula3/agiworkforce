# Desktop Event Ingestion Map

Status: active  
Scope: `apps/desktop`

Purpose: document the current live listener split so consolidation work edits the real runtime paths and does not recreate duplicate event handlers.

## Canonical Listener Files

### `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`

This file currently owns transport-heavy and chat-runtime-heavy listeners:

- chat stream lifecycle
  - `chat:stream-start`
  - `chat:stream-status`
  - `chat:stream-chunk`
  - `chat:stream-end`
  - `chat:stream-error`
- pending message queue events
- provider thinking stream events
- agent finished / stop-related chat events
- tool result / tool timeout / tool mode blocking events
- some inline artifact and action-trail updates tied closely to active chat streaming

Working rule:

- if an event is tightly coupled to the active conversation stream or streaming message identity, it belongs here for now

### `apps/desktop/src/hooks/useAgenticEvents.ts`

This file currently owns higher-level agent and integration events:

- file / terminal / generic tool execution events
- extension events
- agent plan and action updates
- metrics and background task events
- approval request / approval resolution events
- calendar / automation / cloud / gmail integration events
- MCP server / MCP tool execution events
- action-log updates for long-lived operational visibility

Working rule:

- if an event is integration-facing, governance-facing, or ecosystem-facing rather than core stream transport, it currently lands here

## Current Problems

1. The listener split is functional but not architectural.
   - message ownership, action trail, action log, inline artifacts, and sidecar context are updated from both files

2. Both files can affect transcript visibility.
   - this increases the chance of hidden state or duplicate UI behavior

3. The split is by history, not by contract.
   - there is not yet a single message-activity normalization layer that both files feed

## Current Stabilized Rules

These rules are now in effect:

- sidecar must not auto-open from runtime activity
- action-trail entries must resolve to a transcript message
- action-log entries used by the chat UI must resolve to a transcript message
- inline chat is the primary execution transcript
- transcript message targeting is centralized in `apps/desktop/src/lib/runtimeMessageOwnership.ts`
- transcript per-message activity reads are centralized in `apps/desktop/src/lib/messageActivity.ts` and `apps/desktop/src/components/UnifiedAgenticChat/useMessageRuntimeActivity.ts`
- artifact merge/update semantics are centralized in `apps/desktop/src/lib/messageArtifacts.ts`
- transcript message/artifact lookup is centralized in `apps/desktop/src/lib/messageLookup.ts`
- repetitive integration-event log/trail/sidecar emission is centralized in `apps/desktop/src/lib/runtimeActivity.ts`
- calendar, automation, cloud, gmail, and MCP execution events now use the shared runtime activity emission path in `apps/desktop/src/hooks/useAgenticEvents.ts`
- `agi:tool_stream` started/completed/error/cancelled activity now uses shared tool-stream activity builders in `apps/desktop/src/lib/runtimeActivity.ts`
- stream finalization target resolution and terminal message patches are centralized in `apps/desktop/src/lib/streamLifecycle.ts`
- active stream target resolution is centralized in `apps/desktop/src/lib/streamLifecycle.ts`
- thinking-event content plans are centralized in `apps/desktop/src/lib/streamContentRuntime.ts`
- tool-call and tool-result artifact payload shaping are centralized in `apps/desktop/src/lib/streamContentRuntime.ts`
- streaming-state/progress metadata patches are centralized in `apps/desktop/src/lib/streamLifecycle.ts`
- tool-call and tool-result metadata patches are centralized in `apps/desktop/src/lib/streamLifecycle.ts`
- artifact terminal-state transitions are centralized in `apps/desktop/src/lib/messageArtifacts.ts`
- tool-stream trail cleanup and terminal artifact reconciliation are centralized in `apps/desktop/src/lib/toolStreamRuntime.ts`
- `agi:tool_stream` store update payloads are centralized in `apps/desktop/src/lib/toolStreamRuntime.ts`
- encoded MCP / connector tool names are centralized in `apps/desktop/src/lib/toolNameEncoding.ts` and `apps/desktop/src/lib/toolDisplayNames.ts`

## Next Consolidation Target

The next safe architectural move is:

1. keep `useTauriStreamListeners.ts` as the transport/event-capture layer
2. move normalization into one shared message-activity mapper
3. make `useAgenticEvents.ts` feed that same mapper instead of directly shaping multiple UI surfaces
4. render chat transcript from the normalized per-message activity state

## Do Not Do

- do not create a third listener system
- do not reintroduce sidecar-first visibility
- do not attach new runtime UI directly to `actionLog` or `actionTrail` without transcript ownership
