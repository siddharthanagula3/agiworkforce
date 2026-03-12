# Desktop Inline Agent UX Plan

Status: proposed execution plan  
Source inputs: explored desktop files + official OpenAI and Anthropic docs

## Goal

Make the desktop chat interface the primary execution surface.

Users should see, inline with the message that triggered it:

- reasoning or reasoning summary
- tool calling and function calling
- MCP usage
- connector usage
- approvals
- progress
- results
- errors

The sidecar must become secondary. It may remain for expanded workspaces and artifact inspection, but it must not be the primary place where users discover what the agent is doing.

## Evidence From Current Code

### What already works

- Inline tool timelines already render in `apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx`
- Inline reasoning already renders in `apps/desktop/src/components/UnifiedAgenticChat/ThinkingBlock.tsx`
- Inline panels already exist via `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/InlinePanelList.tsx`
- The chat store already supports per-message inline panels and per-message thinking buffers

### What is currently fragmented

1. Runtime activity is split across three surfaces:
   - inline message UI
   - tool timeline / artifacts
   - global sidecar

2. Sidecar is still auto-focused by event handlers:
   - `apps/desktop/src/hooks/useAgenticEvents.ts`
   - `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/MessageBubble.tsx`

3. There are two event ingestion paths:
   - `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`
   - `apps/desktop/src/hooks/useAgenticEvents.ts`

4. Approval UX is split:
   - inline message-owned approval cards
   - orphan/unassigned approval fallback in `ChatStream`
   - governance-oriented approval surfaces outside the chat flow

5. Tool, MCP, connector, and deep-research state are not normalized into one message-centric transcript model.
6. Encoded connector/tool names must be decoded before they render inline, or users lose visibility into what exact MCP/server/action ran.

## Official Doc Guidance To Respect

### OpenAI

- Reasoning models expose reasoning items and reasoning summaries; application UX should distinguish reasoning from normal output.
- Tool use should be represented as explicit tool steps, not hidden behind plain text.
- MCP tools are first-class tools in the Responses API model.

### Anthropic

- Extended thinking can stream separately from normal output.
- Tool use and thinking must be preserved coherently across turns.
- Fine-grained streaming supports real-time activity rendering.

## Product Rules

1. No hidden agent activity
   - If the agent uses a tool, connector, MCP server, browser action, terminal action, or approval flow, the user must see it inline.

2. No sidecar-first runtime UX
   - Sidecar may show expanded detail, but the primary transcript of activity belongs in chat.

3. One message-centered execution transcript
   - Every action must attach to the assistant message or system message that owns it.

4. One normalization layer
   - Frontend event listeners must normalize backend events into one canonical message activity model before rendering.

5. Reasoning is collapsible
   - Show reasoning or reasoning summary inline in a collapsible block.
   - Do not fake progress with a blinking cursor when real reasoning/tool state exists.

## Target UI Model

Each assistant response should render as a stack of collapsible inline sections:

1. Reasoning
   - provider reasoning summary or streamed thinking

2. Actions
   - tool calls
   - function calls
   - MCP calls
   - connector actions
   - browser / filesystem / terminal actions

3. Results
   - inline panels for search results, code diffs, terminal output, database output, media generation, files, documents

4. Approvals
   - pending approval card inline with approve / reject controls

5. Final response
   - model answer after tools complete

This forms one transcript and removes the need for users to mentally join chat state with sidecar state.

The special thinking-message renderer must follow the same rule. If a message contains reasoning, it still needs to show:

- action trail
- persisted activity log
- approvals
- inline panels
- embedded widgets

## Target Architecture

### Backend contract

Every action-producing backend event should carry:

- `conversation_id`
- `message_id` or `frontend_message_id`
- `action_id`
- `kind`
- `label`
- `status`
- `parameters_summary`
- `result_summary`
- `provider_source`
- `tool_source` (`tool`, `function`, `mcp`, `connector`, `browser`, `terminal`, etc.)

### Frontend normalization

Create one canonical normalization layer that merges:

- stream chunks
- thinking deltas
- tool events
- approval events
- MCP execution events
- connector events
- deep-research task events

into one per-message activity state.

Artifact merge/update rules must also be centralized so stream listeners do not invent different message metadata shapes for the same runtime activity.

Tool/MCP display-name decoding must also be centralized so the transcript shows exact connector and action names instead of raw encoded identifiers or generic bucket labels.

### Rendering

Render from the normalized per-message activity state only.

The sidecar should read from that same state, not own a parallel representation of execution.

## Execution Phases

### Phase 1 — Stop sidecar from owning runtime visibility

- disable sidecar auto-trigger for normal agent activity
- stop auto-focusing sidecar on tool/MCP/approval events
- keep sidecar available only as explicit expand-on-demand
- implemented on 2026-03-11 for desktop:
  - `apps/desktop/src/stores/ui.ts` no longer auto-opens sidecar from runtime events
  - `apps/desktop/src/stores/ui.ts` now ignores event-driven section changes while the sidecar is closed
  - `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/MessageBubble.tsx` now inherits `autoTrigger: false` by default via the UI store
  - pending approvals render inline in `apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx`

### Phase 2 — Define canonical message activity schema

- add a message-centric execution transcript type
- map tool, approval, MCP, connector, and reasoning events into it
- make it the only source used by the chat renderer
- implemented partially on 2026-03-11 for desktop:
  - action-trail entries now inherit transcript ownership through `apps/desktop/src/stores/unifiedChatStore.ts`
  - inline status rendering in `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/MessageBubble.tsx` now reads that owned trail for assistant/system messages
  - persisted runtime activity now renders inline through `apps/desktop/src/components/UnifiedAgenticChat/ActionLogTimeline.tsx`
  - transcript message targeting is now centralized in `apps/desktop/src/lib/runtimeMessageOwnership.ts` and reused by store normalization plus live listener hooks
  - tool/MCP name decoding is now centralized in `apps/desktop/src/lib/toolNameEncoding.ts`
  - repetitive integration-event log/trail/sidecar emission is now centralized in `apps/desktop/src/lib/runtimeActivity.ts`
  - MCP execution events now use that same shared runtime activity emission path in `apps/desktop/src/hooks/useAgenticEvents.ts`
  - `agi:tool_stream` started/completed/error/cancelled activity now uses shared tool-stream builders in `apps/desktop/src/lib/runtimeActivity.ts`

### Phase 3 — Consolidate event ingestion

- reduce overlap between `useTauriStreamListeners.ts` and `useAgenticEvents.ts`
- clearly split responsibilities:
  - stream transport
  - event normalization
  - UI rendering

### Phase 4 — Inline UX unification

- merge `ThinkingBlock`, `ToolTimeline`, `ToolCallCard`, `ApprovalRequestCard`, and inline panels into a single stacked activity layout
- ensure everything collapses cleanly inline per message

### Phase 5 — Release validation

- focused tests for reasoning
- focused tests for approvals
- focused tests for MCP and connector visibility
- no event should require the sidecar to understand what happened

## First Safe Implementation Slice

The safest first slice is:

1. remove automatic sidecar focus for tool / MCP / approval events
2. keep current inline timeline and inline panels as the primary visible transcript
3. attach pending approvals inline to the active assistant message
4. leave sidecar as optional manual expansion only

This changes user experience immediately without requiring a full event-model rewrite first.
