# ADR: Rust `try_with` over `with` for `tokio::task_local!` context adoption

## Status

Accepted — 2026-05-09.

## Context

The Rust mirror of `AsyncLocalStorage<AgentContext>` lives at `apps/desktop/src-tauri/src/sys/commands/agent_context.rs:1-190`:

```rust
tokio::task_local! {
  static COMMAND_CTX: CommandContext;
}
```

Helper accessors include `try_get_request_id()`, `try_get_conversation_id()`, `try_get_command_name()`. The desktop has 1,483 Tauri commands; today only a handful are wired to populate `COMMAND_CTX`. Adoption is incremental.

`tokio::task_local!` exposes two access patterns:

1. **`with(|ctx| ...)`** — panics if no context is set in the current async scope.
2. **`try_with(|ctx| ...)`** — returns `Result<T, AccessError>`; safe to call outside scope.

A handler that calls `with` outside a `scope.run(...)` panics immediately. If existing commands without context call a helper that uses `with`, the entire command crashes. With 1,483 commands, the migration is too risky.

## Decision

All accessors use `try_with` and return `Option<T>` (or `Result`). Existing commands that have not been migrated to set a context via `scope.run(ctx, fut).await` are unaffected — the accessors return `None` rather than panic.

```rust
pub fn try_get_request_id() -> Option<String> {
  COMMAND_CTX.try_with(|ctx| ctx.request_id.clone()).ok()
}
```

Migration is incremental: a command that wants context-aware behaviour wraps its async body in `COMMAND_CTX.scope(ctx, async move { ... }).await`. Helpers it calls then receive `Some(...)` from the accessors. Commands that have not migrated continue to receive `None`.

## Consequences

**Positive**

- No cascade failure during migration. Day-1 of adopting context across desktop touches a few commands; the other 1,470+ remain green.
- Helpers can call `try_get_request_id()` defensively without reasoning about whether a particular caller provides context.
- `try_with` cleanly maps to `Option<T>`, which is idiomatic Rust for fallible reads.
- Tests can run helpers outside any scope (`agent_context.rs` `outside-scope null` test) without setup boilerplate.

**Negative**

- A command that should always have context but is called via an unmigrated path silently degrades — accessors return `None` rather than alerting. Mitigated by the convention that any command requiring context-aware behaviour starts with a `match try_get_request_id() { Some(id) => ..., None => return Err("context required") }` guard.
- `try_with`'s `AccessError` is converted to `None` via `.ok()`, so the original error class is lost. Acceptable here because the only failure mode is "no context set," which is the `None` case.

## References

- `docs/architecture/foundation-2026.md` §4.4.
- `apps/desktop/src-tauri/src/sys/commands/agent_context.rs:1-190`.
- Commit `5982b2c80`.
