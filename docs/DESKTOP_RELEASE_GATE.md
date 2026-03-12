# Desktop Release Gate

Status: active  
Scope: `apps/desktop`

Benchmark reference:

- `docs/DESKTOP_COWORK_COMPETITIVE_PLAN.md`

This gate exists to stop the desktop app from shipping with duplicate runtimes, hidden agent state, or UI paths that only work when the sidecar is open.

## 1. Runtime Authority

Before release, these must be true:

- one canonical frontend send path
- one canonical backend chat runtime
- one canonical reasoning stream path
- one canonical approval path
- no parked duplicate handlers pretending to be live

Authority is determined by:

- mounted React tree imports
- active Rust `mod.rs` declarations
- registered Tauri commands in `apps/desktop/src-tauri/src/lib.rs`

## 2. Inline Visibility

The chat transcript must expose, inline:

- reasoning or reasoning summary
- tool/function calls
- approvals
- progress
- results and errors

Release is blocked if a user must open the sidecar to understand what the agent just did.

The sidecar is secondary and manual.

## 3. Event Contract

Every runtime event that affects user trust must be attributable to a transcript unit.

Required identifiers where applicable:

- `conversation_id`
- `message_id` or `frontend_message_id`
- `action_id`
- `kind`
- `status`

Events without transcript ownership are release blockers unless they are purely diagnostic.

## 4. Frontend Validation

Minimum required checks:

- `pnpm --filter @agiworkforce/desktop typecheck`
- targeted chat UI tests for changed surfaces
- targeted store tests for changed state contracts

Required regression areas:

- sidecar does not auto-take over runtime visibility
- reasoning renders inline
- approvals render inline
- approvals resolve to the correct transcript message
- approval timeout behavior works without modal-only logic
- stream end/error paths resolve the correct transcript message
- stream end/error paths clear streaming state without inventing divergent metadata
- cross-store initialization must not depend on optional store APIs being present at import time
- encoded MCP / connector names render as decoded inline labels instead of raw transport identifiers
- repetitive integration-domain events use shared runtime activity emission instead of open-coded log+trail+sidecar mutations
- transcript components use shared per-message runtime selectors instead of ad hoc action-log/action-trail/approval filters
- tool-stream cleanup and terminal artifact reconciliation use shared helpers instead of duplicated listener-side message patch logic
- `agi:tool_stream` store updates use shared helper builders instead of open-coded per-case payload mutation
- thinking-event and tool-call/result payload shaping use shared helpers instead of open-coded stream-listener transforms

## 5. Backend Validation

For chat/runtime changes, run:

- targeted Rust parser/runtime tests
- targeted Tauri command tests where affected

Required regression areas:

- reasoning deltas parse correctly for supported providers
- tool events stream consistently
- chat backend state types and stop-flag helpers come from `chat/state.rs` instead of duplicate inline definitions
- extracted Rust search/cost submodules stay the canonical owners of their registered commands instead of drifting back into `chat/mod.rs`
- extracted Rust control submodules stay the canonical owners of their registered commands instead of drifting back into `chat/mod.rs`
- extracted Rust compaction/export submodules stay the canonical owners of their registered commands instead of drifting back into `chat/mod.rs`
- extracted Rust conversation/message CRUD submodules stay the canonical owners of their registered commands instead of drifting back into `chat/mod.rs`
- extracted Rust intent/agent-mode helpers stay the canonical owners of classification and mode-selection policy instead of drifting back into `chat/mod.rs`
- extracted Rust persistence/provider-access/prompt-context/timeout helpers stay the canonical owners of send-loop policy instead of drifting back into `chat/mod.rs`
- extracted Rust browser-context/attachments/tool-config/message-context helpers stay the canonical owners of those send-loop policies instead of drifting back into `chat/mod.rs`
- extracted Rust stream/tool-execution helpers stay the canonical owners of streaming consumption and tool execution orchestration instead of drifting back into `chat/mod.rs`
- extracted Rust command modules (`send_message.rs`, `maintenance.rs`, `intent.rs`) stay the canonical owners of their Tauri command implementations instead of drifting back into `chat/mod.rs`
- extracted Rust `send_message_setup.rs` and `send_message_execution.rs` stay the canonical owners of chat bootstrap and branch orchestration instead of growing the command file back into a monolith
- extracted Rust chat submodules stay source-compatible with the registered Tauri command table
- approval events reconcile correctly
- conversation persistence and cloud sync remain intact

## 6. Deletion Safety

A file can be removed only if all are true:

- not mounted, imported, registered, or declared by the live runtime
- responsibility already exists in a canonical path
- useful behavior has been ported first
- targeted validation passes after removal

## 7. UX Release Questions

All answers must be yes:

- Can the user tell what the agent is doing without reading logs?
- Can the user see tool use inline?
- Can the user see approvals inline?
- Can the user distinguish reasoning from final output?
- Can the user recover from errors without hunting across panels?

If any answer is no, desktop is not release-ready.
