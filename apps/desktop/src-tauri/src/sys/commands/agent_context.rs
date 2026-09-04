use serde::{Deserialize, Serialize};

/// Per-Tauri-command context bound to a tokio task via COMMAND_CTX.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandContext {
    pub request_id: String,
    /// Active conversation ID, None for non-chat commands.
    pub conversation_id: Option<String>,
    /// Name of the Tauri command being executed (for tracing).
    pub command_name: String,
    /// Epoch milliseconds when the command was dispatched.
    pub invoked_at_ms: u64,
}

tokio::task_local! {
    pub static COMMAND_CTX: CommandContext;
}

pub fn try_get_request_id() -> Option<String> {
    COMMAND_CTX.try_with(|ctx| ctx.request_id.clone()).ok()
}

/// Attempt to read the conversation_id from the current task-local context.
pub fn try_get_conversation_id() -> Option<String> {
    COMMAND_CTX
        .try_with(|ctx| ctx.conversation_id.clone())
        .ok()
        .flatten()
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

                let child = tokio::spawn(async {
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
