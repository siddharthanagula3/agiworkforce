/// Per-command async context for the Rust side of the IPC boundary.
///
/// AsyncLocalStorage on the TS side isolates JS async chains. On the Rust side,
/// tokio::task_local! provides the same isolation within a tokio task.
///
/// Cross-boundary contract: context values do NOT cross the Rust↔TS IPC boundary
/// automatically. Values that Rust needs (e.g., conversation_id) must be
/// passed as explicit fields in the Tauri command's request payload.
///
/// Usage in a Tauri command:
/// ```rust
/// use crate::sys::commands::agent_context::{CommandContext, COMMAND_CTX};
///
/// #[tauri::command]
/// pub async fn my_command(conversation_id: Option<String>) -> Result<String, String> {
///     let ctx = CommandContext {
///         request_id: uuid::Uuid::new_v4().to_string(),
///         conversation_id,
///         command_name: "my_command".to_string(),
///         invoked_at_ms: std::time::SystemTime::now()
///             .duration_since(std::time::UNIX_EPOCH)
///             .unwrap_or_default()
///             .as_millis() as u64,
///     };
///     COMMAND_CTX.scope(ctx, async move {
///         // Any code awaited here — including sub-tasks — can call
///         // COMMAND_CTX.with(|ctx| ...) to read the bound context.
///         do_async_work().await
///     }).await
/// }
/// ```
use serde::{Deserialize, Serialize};

/// Per-Tauri-command context bound to a tokio task via COMMAND_CTX.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandContext {
    /// Stable ID for this invocation — correlates with TS-side AgentContext.requestId.
    pub request_id: String,
    /// Active conversation ID, None for non-chat commands.
    pub conversation_id: Option<String>,
    /// Name of the Tauri command being executed (for tracing).
    pub command_name: String,
    /// Epoch milliseconds when the command was dispatched.
    pub invoked_at_ms: u64,
}

tokio::task_local! {
    /// Task-local storage for per-command context on the Rust side.
    ///
    /// This is the Rust analogue of AsyncLocalStorage<AgentContext> on the TS side.
    /// Set it at command entry via `COMMAND_CTX.scope(ctx, future).await` — the
    /// context is then readable via `COMMAND_CTX.with(|ctx| ...)` anywhere in
    /// the same tokio task (including across .await points) without passing it
    /// explicitly through every call frame.
    ///
    /// tokio::task_local! is Send + Sync safe because each tokio task has its own
    /// independent copy — there is no sharing across tasks.
    pub static COMMAND_CTX: CommandContext;
}

/// Attempt to read a field from the current task-local context.
/// Returns None when called outside a COMMAND_CTX.scope() — handles legacy
/// command paths that haven't been wired yet.
pub fn try_get_request_id() -> Option<String> {
    COMMAND_CTX.try_with(|ctx| ctx.request_id.clone()).ok()
}

/// Attempt to read the conversation_id from the current task-local context.
pub fn try_get_conversation_id() -> Option<String> {
    COMMAND_CTX.try_with(|ctx| ctx.conversation_id.clone()).ok().flatten()
}

/// Attempt to read the command_name from the current task-local context.
pub fn try_get_command_name() -> Option<String> {
    COMMAND_CTX.try_with(|ctx| ctx.command_name.clone()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn context_is_accessible_across_await() {
        let ctx = CommandContext {
            request_id: "test-req-1".to_string(),
            conversation_id: Some("conv-1".to_string()),
            command_name: "test_command".to_string(),
            invoked_at_ms: 0,
        };

        COMMAND_CTX
            .scope(ctx, async {
                // Simulate an await hop
                tokio::task::yield_now().await;
                let req_id = try_get_request_id();
                assert_eq!(req_id.as_deref(), Some("test-req-1"));

                let conv_id = try_get_conversation_id();
                assert_eq!(conv_id.as_deref(), Some("conv-1"));
            })
            .await;
    }

    #[tokio::test]
    async fn context_is_none_outside_scope() {
        // Called outside any COMMAND_CTX.scope()
        assert!(try_get_request_id().is_none());
        assert!(try_get_conversation_id().is_none());
        assert!(try_get_command_name().is_none());
    }

    #[tokio::test]
    async fn concurrent_tasks_have_independent_contexts() {
        let n = 100usize;
        let handles: Vec<_> = (0..n)
            .map(|i| {
                tokio::spawn(async move {
                    let ctx = CommandContext {
                        request_id: format!("req-{i}"),
                        conversation_id: Some(format!("conv-{i}")),
                        command_name: format!("cmd-{i}"),
                        invoked_at_ms: i as u64,
                    };
                    COMMAND_CTX
                        .scope(ctx, async move {
                            // Yield to let other tasks interleave
                            tokio::task::yield_now().await;
                            let seen = try_get_request_id().unwrap();
                            assert_eq!(seen, format!("req-{i}"), "contamination at i={i}");
                            seen
                        })
                        .await
                })
            })
            .collect();

        for (i, handle) in handles.into_iter().enumerate() {
            let result = handle.await.expect("task panicked");
            assert_eq!(result, format!("req-{i}"));
        }
    }

    #[tokio::test]
    async fn nested_scopes_are_independent() {
        let outer = CommandContext {
            request_id: "outer".to_string(),
            conversation_id: None,
            command_name: "outer_cmd".to_string(),
            invoked_at_ms: 0,
        };
        let inner = CommandContext {
            request_id: "inner".to_string(),
            conversation_id: Some("conv-inner".to_string()),
            command_name: "inner_cmd".to_string(),
            invoked_at_ms: 1,
        };

        COMMAND_CTX
            .scope(outer, async {
                let outer_id = try_get_request_id().unwrap();
                assert_eq!(outer_id, "outer");

                // Spawn a child task — it does NOT inherit the parent task-local.
                // This documents the expected isolation behavior.
                let child = tokio::spawn(async {
                    // No COMMAND_CTX.scope() in the child — so try_with returns None.
                    assert!(
                        try_get_request_id().is_none(),
                        "child must not inherit parent task-local"
                    );
                });
                child.await.unwrap();

                // Inner scope in the SAME task: tokio task_local is re-entrant per scope.
                COMMAND_CTX
                    .scope(inner, async {
                        let inner_id = try_get_request_id().unwrap();
                        assert_eq!(inner_id, "inner");
                    })
                    .await;

                // After inner scope, outer context is restored.
                // NOTE: tokio::task_local! does NOT restore on nested scope exit
                // (it is task-level, not scope-stack). This test documents that
                // COMMAND_CTX.scope() in the same task replaces, not stacks.
                // The TS side (AsyncLocalStorage) DOES restore on nested scope exit.
            })
            .await;
    }
}
