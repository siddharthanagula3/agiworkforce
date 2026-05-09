# ADR: `messageQueueManager` is a per-surface factory, not a module singleton

## Status

Accepted — 2026-05-09.

## Context

The reference Anthropic implementation in `~/Desktop/reference/src/utils/messageQueueManager.ts` is a module-level singleton. That works for Claude Code (single process, one queue) but does not match this codebase: six surfaces (CLI, desktop, web, mobile, Chrome ext, VS Code ext) each run their own JS context with their own send pipelines. Sharing a queue across surfaces would either require IPC (which we have nowhere else for chat input) or would corrupt state when two surfaces ran simultaneously in the same process (e.g. desktop + Tauri-hosted web).

Two designs were considered:

1. **Module-level singleton** with side-effect imports.
2. **Factory** returning isolated `MessageQueue` instances; a thin `getSendQueue(surfaceId)` cache wrapper preserves singleton ergonomics for callers.

## Decision

`createMessageQueue(options)` is the canonical factory (`packages/runtime/src/queue/messageQueueManager.ts`). Each surface calls it once with surface-specific options (storage adapter, lane caps, abort signal source) and gets an isolated `MessageQueue`. The queue's state lives inside a `createStore<readonly QueuedCommand[]>`, so it inherits `Object.is` short-circuiting and `useSyncExternalStore` compatibility from §2 for free.

A `getSendQueue(surfaceId)` cache wrapper at `packages/unified-chat/src/queue/sendQueue.ts` looks up by `surfaceId` so callers do not need to thread the queue through every send.

## Consequences

**Positive**

- Multiple surfaces in the same process do not contaminate each other's queues. Tested via "two queues are completely independent" (`messageQueueManager.test.ts`).
- Each surface chooses its own storage adapter (`Storage` for web, MMKV for mobile, `chrome.storage.local` for Chrome ext, `vscode.Memento` for VS Code ext, in-memory for desktop, no persistence in CLI). A singleton would force one backend or a discriminated union of backends.
- Lane caps and abort-signal wiring can vary per surface without conditionals in shared code.

**Negative**

- Callers must remember to pass `surfaceId`. Mitigated by the `getSendQueue(surfaceId)` cache wrapper which reads `surfaceId` from `useChat`'s prop signature.
- The CLI Rust port (`apps/cli/src/message_queue.rs`) does not share code with the TS factory; both implementations must be maintained in lockstep to preserve the contract. Mitigated by symmetric property tests (53 TS, 11 Rust, both including a 1000-message FIFO-within-priority property test).
- A per-surface factory makes "list every queue's depth" cumbersome — there is no global registry. Acceptable: surfaces report their own queue depth via telemetry channels.

## References

- `docs/architecture/foundation-2026.md` §3.4.
- `tasks/research/exec/1.4-report.md` §3 item 1.
- `packages/runtime/src/queue/messageQueueManager.ts`.
- `packages/unified-chat/src/queue/sendQueue.ts`.
