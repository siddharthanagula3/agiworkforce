use super::*;

impl ToolExecutor {
    /// Execute the `conversation_search` agent tool.
    ///
    /// Searches past conversations for messages matching a keyword query,
    /// returning ranked results with conversation context.
    pub(super) async fn execute_conversation_search_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::features::search::conversation_search;
            use tauri::Manager;

            let db_state = app.state::<crate::sys::commands::chat::AppDatabase>();

            let query = args
                .get("query")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing required parameter: query"))?
                .to_string();

            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);

            let conversation_id = args
                .get("conversation_id")
                .and_then(|v| v.as_i64());

            let conn = db_state.connection().map_err(|e| anyhow!("{}", e))?;

            match conversation_search::search_past_conversations(
                &conn,
                &query,
                limit,
                conversation_id,
            ) {
                Ok(results) => {
                    let count = results.len();
                    let result_json: Vec<Value> = results
                        .iter()
                        .map(|r| {
                            json!({
                                "conversation_id": r.conversation_id,
                                "conversation_title": r.conversation_title,
                                "message_preview": r.message_preview,
                                "sender": r.sender,
                                "timestamp": r.timestamp,
                                "relevance_score": r.relevance_score,
                            })
                        })
                        .collect();

                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "query": query,
                            "results": result_json,
                            "count": count,
                        }),
                        error: None,
                        metadata: HashMap::from([
                            ("tool".to_string(), json!(tool_id)),
                            ("query".to_string(), json!(query)),
                            ("result_count".to_string(), json!(count)),
                        ]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({
                        "error": format!("Conversation search failed: {}", e),
                        "query": query,
                    }),
                    error: Some(format!("Conversation search failed: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for conversation search" }),
                error: Some("App handle not available for conversation search".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    /// Execute the `recent_chats` agent tool.
    ///
    /// Returns the N most recently updated conversations with title,
    /// timestamp, and message count.
    pub(super) async fn execute_recent_chats_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::features::search::conversation_search;
            use tauri::Manager;

            let db_state = app.state::<crate::sys::commands::chat::AppDatabase>();

            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);

            let conn = db_state.connection().map_err(|e| anyhow!("{}", e))?;

            match conversation_search::get_recent_conversations(&conn, limit) {
                Ok(results) => {
                    let count = results.len();
                    let result_json: Vec<Value> = results
                        .iter()
                        .map(|r| {
                            json!({
                                "conversation_id": r.conversation_id,
                                "title": r.title,
                                "timestamp": r.timestamp,
                                "message_count": r.message_count,
                            })
                        })
                        .collect();

                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "conversations": result_json,
                            "count": count,
                        }),
                        error: None,
                        metadata: HashMap::from([
                            ("tool".to_string(), json!(tool_id)),
                            ("result_count".to_string(), json!(count)),
                        ]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({
                        "error": format!("Failed to get recent conversations: {}", e),
                    }),
                    error: Some(format!("Failed to get recent conversations: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for recent chats" }),
                error: Some("App handle not available for recent chats".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}
