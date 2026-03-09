use super::*;

impl ToolExecutor {
    pub(super) async fn execute_memory_remember_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::agi::memory_manager::MemoryCategory;
            use tauri::Manager;

            let memory_state = app.state::<crate::sys::commands::memory::MemoryState>();

            // Support both "key"/"value" format and "category"/"topic"/"content" format
            let (category, topic, content) = if let (Some(key), Some(value)) = (
                args.get("key").and_then(|v| v.as_str()),
                args.get("value").and_then(|v| v.as_str()),
            ) {
                // Simple key/value format - use Fact category
                (MemoryCategory::Fact, key.to_string(), value.to_string())
            } else {
                // Full format with category/topic/content
                let category_str = args
                    .get("category")
                    .and_then(|v| v.as_str())
                    .unwrap_or("fact");
                let category = match category_str.to_lowercase().as_str() {
                    "preference" | "preferences" => MemoryCategory::Preference,
                    "decision" | "decisions" => MemoryCategory::Decision,
                    "context" => MemoryCategory::Context,
                    _ => MemoryCategory::Fact,
                };
                let topic = args
                    .get("topic")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing topic or key parameter"))?
                    .to_string();
                let content = args
                    .get("content")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing content or value parameter"))?
                    .to_string();
                (category, topic, content)
            };

            let importance = args
                .get("importance")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .unwrap_or(5);
            let source = args.get("source").and_then(|v| v.as_str());

            match memory_state.manager.remember(
                category,
                &topic,
                &content,
                Some(importance),
                source,
            ) {
                Ok(memory_id) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "memory_id": memory_id,
                        "topic": topic,
                        "content": content,
                        "message": format!("Remembered: {} = {}", topic, content)
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to store memory: {}", e), "success": false }),
                    error: Some(format!("Failed to store memory: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for memory operations", "success": false }),
                error: Some("App handle not available for memory operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(super) async fn execute_memory_recall_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::agi::memory_manager::MemoryCategory;
            use tauri::Manager;

            let memory_state = app.state::<crate::sys::commands::memory::MemoryState>();

            // Support both "key" format and "category"/"topic" format
            let (category, topic) = if let Some(key) = args.get("key").and_then(|v| v.as_str()) {
                (MemoryCategory::Fact, key.to_string())
            } else {
                let category_str = args
                    .get("category")
                    .and_then(|v| v.as_str())
                    .unwrap_or("fact");
                let category = match category_str.to_lowercase().as_str() {
                    "preference" | "preferences" => MemoryCategory::Preference,
                    "decision" | "decisions" => MemoryCategory::Decision,
                    "context" => MemoryCategory::Context,
                    _ => MemoryCategory::Fact,
                };
                let topic = args
                    .get("topic")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing topic or key parameter"))?
                    .to_string();
                (category, topic)
            };

            match memory_state.manager.recall(category, &topic) {
                Ok(Some(entry)) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "found": true,
                        "memory_id": entry.id,
                        "topic": entry.topic,
                        "content": entry.content,
                        "importance": entry.importance,
                        "category": format!("{:?}", entry.category).to_lowercase(),
                        "created_at": entry.created_at,
                        "updated_at": entry.updated_at
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Ok(None) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "found": false,
                        "topic": topic,
                        "message": format!("No memory found for '{}'", topic)
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to recall memory: {}", e), "success": false }),
                    error: Some(format!("Failed to recall memory: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for memory operations", "success": false }),
                error: Some("App handle not available for memory operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(super) async fn execute_memory_search_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use tauri::Manager;

            let memory_state = app.state::<crate::sys::commands::memory::MemoryState>();

            let query = args
                .get("query")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing query parameter"))?
                .to_string();
            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(20);

            match memory_state.manager.search(&query, limit) {
                Ok(entries) => {
                    let results: Vec<serde_json::Value> = entries
                        .iter()
                        .map(|e| {
                            json!({
                                "memory_id": e.id,
                                "topic": e.topic,
                                "content": e.content,
                                "importance": e.importance,
                                "category": format!("{:?}", e.category).to_lowercase(),
                            })
                        })
                        .collect();
                    let count = results.len();
                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "results": results,
                            "count": count,
                            "query": query
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to search memories: {}", e), "success": false }),
                    error: Some(format!("Failed to search memories: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for memory operations", "success": false }),
                error: Some("App handle not available for memory operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(super) async fn execute_memory_forget_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::agi::memory_manager::MemoryCategory;
            use tauri::Manager;

            let memory_state = app.state::<crate::sys::commands::memory::MemoryState>();

            // Support either memory_id or category+topic
            if let Some(memory_id) = args.get("memory_id").and_then(|v| v.as_i64()) {
                match memory_state.manager.forget(memory_id) {
                    Ok(true) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "deleted": true,
                            "memory_id": memory_id,
                            "message": "Memory deleted successfully"
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                    Ok(false) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "deleted": false,
                            "memory_id": memory_id,
                            "message": "No memory found with that ID"
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to delete memory: {}", e), "success": false }),
                        error: Some(format!("Failed to delete memory: {}", e)),
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                }
            } else {
                // Delete by category + topic
                let category_str = args
                    .get("category")
                    .and_then(|v| v.as_str())
                    .unwrap_or("fact");
                let category = match category_str.to_lowercase().as_str() {
                    "preference" | "preferences" => MemoryCategory::Preference,
                    "decision" | "decisions" => MemoryCategory::Decision,
                    "context" => MemoryCategory::Context,
                    _ => MemoryCategory::Fact,
                };
                let topic = args
                    .get("topic")
                    .or_else(|| args.get("key"))
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing topic, key, or memory_id parameter"))?;

                match memory_state.manager.forget_topic(category, topic) {
                    Ok(true) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "deleted": true,
                            "topic": topic,
                            "message": format!("Memory '{}' deleted successfully", topic)
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                    Ok(false) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "deleted": false,
                            "topic": topic,
                            "message": format!("No memory found for '{}'", topic)
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to delete memory: {}", e), "success": false }),
                        error: Some(format!("Failed to delete memory: {}", e)),
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for memory operations", "success": false }),
                error: Some("App handle not available for memory operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}
