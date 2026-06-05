use super::*;

impl ToolExecutor {
    /// Execute the `todo_write` tool: validate a list of todo items and emit them
    /// to the frontend via the `todo:update` Tauri event channel.
    ///
    /// Expected arguments:
    /// - `todos` (Array, required): Array of objects with `id?`, `title`/`description`,
    ///   `status?` where status is one of "pending", "in_progress", or "completed".
    ///   An empty array clears the displayed task list.
    pub(super) async fn execute_todo_write_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let todos = args
            .get("todos")
            .and_then(|v| v.as_array())
            .ok_or_else(|| anyhow!("Missing required 'todos' array parameter"))?;

        let valid_statuses = ["pending", "in_progress", "completed"];
        let mut validated_todos = Vec::with_capacity(todos.len());
        let mut in_progress_count = 0usize;

        for (i, todo) in todos.iter().enumerate() {
            let id = todo
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("todo-{}", i));

            let title = match todo
                .get("title")
                .or_else(|| todo.get("description"))
                .or_else(|| todo.get("content"))
                .and_then(|v| v.as_str())
            {
                Some(t) if !t.trim().is_empty() => t,
                _ => {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({
                            "success": false,
                            "error": format!("Todo at index {} is missing a non-empty title or description", i)
                        }),
                        error: Some(format!(
                            "Todo at index {} is missing a non-empty title or description",
                            i
                        )),
                        metadata: HashMap::from([("tool_name".to_string(), json!("todo_write"))]),
                    });
                }
            };

            let status = todo
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("pending");

            if !valid_statuses.contains(&status) {
                return Ok(ToolResult {
                    success: false,
                    data: json!({
                        "success": false,
                        "error": format!(
                            "Invalid status '{}' for todo '{}'. Must be one of: pending, in_progress, completed",
                            status, title
                        )
                    }),
                    error: Some(format!(
                        "Invalid status '{}' for todo '{}'. Must be one of: pending, in_progress, completed",
                        status, title
                    )),
                    metadata: HashMap::from([("tool_name".to_string(), json!("todo_write"))]),
                });
            }

            if status == "in_progress" {
                in_progress_count += 1;
                if in_progress_count > 1 {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({
                            "success": false,
                            "error": "Only one todo can be in_progress at a time"
                        }),
                        error: Some("Only one todo can be in_progress at a time".to_string()),
                        metadata: HashMap::from([("tool_name".to_string(), json!("todo_write"))]),
                    });
                }
            }

            validated_todos.push(json!({
                "id": id,
                "title": title.trim(),
                "status": status
            }));
        }

        let payload = json!({ "todos": validated_todos });

        // Emit to frontend via Tauri event channel
        if let Some(ref app_handle) = self.app_handle {
            if let Err(e) = app_handle.emit("todo:update", &payload) {
                tracing::error!("Failed to emit todo:update event: {}", e);
                return Ok(ToolResult {
                    success: false,
                    data: json!({
                        "success": false,
                        "error": format!("Failed to emit todo event: {}", e)
                    }),
                    error: Some(format!("Failed to emit todo event: {}", e)),
                    metadata: HashMap::from([("tool_name".to_string(), json!("todo_write"))]),
                });
            }
        }

        let count = validated_todos.len();

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "count": count,
                "todos": validated_todos
            }),
            error: None,
            metadata: HashMap::from([("tool_name".to_string(), json!("todo_write"))]),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::agi::tools::ToolRegistry;
    use std::sync::Arc;

    #[tokio::test]
    async fn todo_write_allows_empty_array_to_clear_list() {
        let executor = ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")));
        let mut args = HashMap::new();
        args.insert("todos".to_string(), json!([]));

        let result = executor
            .execute_todo_write_tool(&args)
            .await
            .expect("todo clear result");

        assert!(result.success);
        assert_eq!(result.data["count"], json!(0));
        assert_eq!(result.data["todos"], json!([]));
    }

    #[tokio::test]
    async fn todo_write_rejects_multiple_in_progress_items() {
        let executor = ToolExecutor::new(Arc::new(ToolRegistry::new().expect("registry")));
        let mut args = HashMap::new();
        args.insert(
            "todos".to_string(),
            json!([
                {"title": "first", "status": "in_progress"},
                {"description": "second", "status": "in_progress"}
            ]),
        );

        let result = executor
            .execute_todo_write_tool(&args)
            .await
            .expect("todo validation result");

        assert!(!result.success);
        let error = result.error.as_deref().expect("validation error");
        assert!(error.contains("Only one todo"));
    }
}
