use super::*;

/// Maximum number of rows returned from db_query to prevent data exfiltration
const MAX_QUERY_ROWS: usize = 1000;

/// Maximum SQL query length to prevent abuse
const MAX_QUERY_LENGTH: usize = 10_000;

impl ToolExecutor {
    pub(crate) async fn execute_db_query_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?;

        // SECURITY: Enforce query length limit
        if query.len() > MAX_QUERY_LENGTH {
            tracing::warn!(
                "[SECURITY] db_query rejected: query exceeds max length ({} > {})",
                query.len(),
                MAX_QUERY_LENGTH
            );
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": format!("Query too long ({} chars). Maximum allowed: {} chars.", query.len(), MAX_QUERY_LENGTH), "success": false }),
                error: Some(format!(
                    "Query too long ({} chars). Maximum allowed: {} chars.",
                    query.len(),
                    MAX_QUERY_LENGTH
                )),
                metadata: HashMap::new(),
            });
        }

        // Validate it's a SELECT query only (read-only)
        let query_upper = query.trim().to_uppercase();
        if !query_upper.starts_with("SELECT") {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "db_query only supports SELECT statements. Use db_execute for modifications.", "success": false }),
                error: Some(
                    "db_query only supports SELECT statements. Use db_execute for modifications."
                        .to_string(),
                ),
                metadata: HashMap::new(),
            });
        }

        // SECURITY: Block CTE (WITH) queries — they can bypass table allowlist validation
        // by hiding table references inside CTE definitions.
        if query_upper.contains("WITH") {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "CTE (WITH) queries are not supported for security reasons. Please rewrite without WITH clauses.", "success": false }),
                error: Some("CTE (WITH) queries are not supported for security reasons. Please rewrite without WITH clauses.".to_string()),
                metadata: HashMap::new(),
            });
        }

        // SECURITY: Block stacked queries (multiple statements via semicolons)
        // and SQL comment injection that could bypass keyword filters
        if query.contains(';') {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "Multiple SQL statements (semicolons) are not allowed.", "success": false }),
                error: Some("Multiple SQL statements (semicolons) are not allowed.".to_string()),
                metadata: HashMap::new(),
            });
        }
        if query.contains("--") || query.contains("/*") {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "SQL comments are not allowed in queries.", "success": false }),
                error: Some("SQL comments are not allowed in queries.".to_string()),
                metadata: HashMap::new(),
            });
        }

        // Block dangerous operations even in SELECT (like subqueries with mutations)
        let blocked_keywords = [
            "DROP",
            "TRUNCATE",
            "DELETE",
            "ALTER",
            "CREATE",
            "INSERT",
            "UPDATE",
            "GRANT",
            "REVOKE",
            "ATTACH",
            "DETACH",
            "PRAGMA",
            "LOAD_EXTENSION",
        ];
        for keyword in &blocked_keywords {
            if query_upper.contains(keyword) {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("SQL operation '{}' is not allowed in db_query.", keyword), "success": false }),
                    error: Some(format!(
                        "SQL operation '{}' is not allowed in db_query.",
                        keyword
                    )),
                    metadata: HashMap::new(),
                });
            }
        }

        // SECURITY: Table allowlist — LLM may only SELECT from non-sensitive tables.
        // Sensitive tables (users, auth_sessions, api_keys, master_password, etc.) are excluded.
        // SEV-DESK-10 fix: `settings` removed. The settings table holds encrypted
        // API key blobs (provider keys, BYOK material) and OAuth tokens — even
        // though the values are encrypted, returning them to the LLM means
        // they cross the user→provider trust boundary (the LLM provider sees
        // the ciphertext + adjacent metadata, expanding leak surface). The LLM
        // has no legitimate need to read settings.
        const ALLOWED_QUERY_TABLES: &[&str] = &[
            "conversations",
            "messages",
            "automation_history",
            "overlay_events",
            "command_history",
            "context_items",
            "workflow_definitions",
            "workflow_executions",
            "workflow_execution_logs",
            "published_workflows",
            "workflow_clones",
            "workflow_ratings",
            "workflow_favorites",
            "workflow_comments",
            "scheduled_jobs",
            "job_executions",
            "browser_sessions",
            "browser_tabs",
            "browser_automation_history",
            "calendar_accounts",
            "mcp_servers",
            "mcp_tools_cache",
            "projects",
            "project_settings",
            "project_memories",
            "user_memory",
            "daily_logs",
            "agent_templates",
            "template_installs",
            "analytics_snapshots",
            "user_milestones",
            "metrics_daily_cache",
            "realtime_metrics",
            "automation_benchmarks",
            "process_benchmarks",
            "roi_configurations",
            "background_agents",
            "agi_tasks",
            "agi_task_checkpoints",
            "conversation_branches",
            "autonomous_sessions",
            "autonomous_task_logs",
            "employee_tasks",
            "ai_employees",
            "user_employees",
        ];
        // Extract FROM and JOIN table references and validate each against the allowlist.
        {
            let tokens: Vec<&str> = query_upper.split_whitespace().collect();
            let mut i = 0;
            while i < tokens.len() {
                if tokens[i] == "FROM" || tokens[i] == "JOIN" {
                    if let Some(table_token) = tokens.get(i + 1) {
                        // Strip any trailing comma or parenthesis
                        let table_name =
                            table_token.trim_matches(|c: char| !c.is_alphanumeric() && c != '_');
                        if !table_name.is_empty()
                            && !ALLOWED_QUERY_TABLES.contains(&table_name.to_lowercase().as_str())
                        {
                            return Ok(ToolResult {
                                success: false,
                                data: json!({ "error": format!("Access to table '{}' is not permitted.", table_name), "success": false }),
                                error: Some(format!(
                                    "Access to table '{}' is not permitted.",
                                    table_name
                                )),
                                metadata: HashMap::new(),
                            });
                        }
                    }
                }
                i += 1;
            }
        }

        // SECURITY: Audit log for AI-constructed queries.
        // SEV-DESK-17 fix: demoted from `info!` to `debug!`. The full query text
        // can include user-pasted content via WHERE filters and surfaces in
        // Console.app on macOS at INFO level. DEBUG keeps the audit trail
        // available when troubleshooting without bleeding into default-level
        // log streams. Truncate to 200 chars to bound a misbehaving model.
        let trimmed_query = if query.len() > 200 {
            format!("{}…", &query[..200])
        } else {
            query.to_string()
        };
        tracing::debug!(
            "[SECURITY][db_query] AI executing SELECT query: {}",
            trimmed_query
        );

        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            // Execute query and collect results - using a closure to manage lifetimes
            let query_result: Result<(Vec<String>, Vec<serde_json::Value>, bool), String> =
                (|| {
                    let mut stmt = conn
                        .prepare(query)
                        .map_err(|e| format!("Query preparation error: {}", e))?;
                    let column_names: Vec<String> =
                        stmt.column_names().iter().map(|s| s.to_string()).collect();

                    let mut rows_iter = stmt
                        .query([])
                        .map_err(|e| format!("Query execution error: {}", e))?;
                    let mut rows: Vec<serde_json::Value> = Vec::new();
                    let mut truncated = false;

                    while let Some(row) = rows_iter
                        .next()
                        .map_err(|e| format!("Row fetch error: {}", e))?
                    {
                        // SECURITY: Enforce row limit to prevent data exfiltration
                        if rows.len() >= MAX_QUERY_ROWS {
                            truncated = true;
                            break;
                        }

                        let mut obj = serde_json::Map::new();
                        for (idx, col_name) in column_names.iter().enumerate() {
                            let value: rusqlite::types::Value = row
                                .get(idx)
                                .map_err(|e| format!("Column read error: {}", e))?;
                            obj.insert(
                                col_name.clone(),
                                match value {
                                    rusqlite::types::Value::Null => json!(null),
                                    rusqlite::types::Value::Integer(n) => json!(n),
                                    rusqlite::types::Value::Real(f) => json!(f),
                                    rusqlite::types::Value::Text(s) => json!(s),
                                    rusqlite::types::Value::Blob(b) => {
                                        json!(format!("<blob {} bytes>", b.len()))
                                    }
                                },
                            );
                        }
                        rows.push(serde_json::Value::Object(obj));
                    }

                    Ok((column_names, rows, truncated))
                })();

            match query_result {
                Ok((column_names, rows, truncated)) => {
                    let row_count = rows.len();
                    if truncated {
                        tracing::warn!(
                            "[SECURITY][db_query] Result truncated to {} rows (limit: {})",
                            row_count,
                            MAX_QUERY_ROWS
                        );
                    }
                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "columns": column_names,
                            "rows": rows,
                            "row_count": row_count,
                            "truncated": truncated,
                            "max_rows": MAX_QUERY_ROWS
                        }),
                        error: None,
                        metadata: HashMap::from([("query".to_string(), json!(query))]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.clone(), "success": false }),
                    error: Some(e),
                    metadata: HashMap::from([("query".to_string(), json!(query))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_db_execute_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?;

        // SECURITY: Enforce query length limit
        if query.len() > MAX_QUERY_LENGTH {
            tracing::warn!(
                "[SECURITY] db_execute rejected: query exceeds max length ({} > {})",
                query.len(),
                MAX_QUERY_LENGTH
            );
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": format!("Query too long ({} chars). Maximum allowed: {} chars.", query.len(), MAX_QUERY_LENGTH), "success": false }),
                error: Some(format!(
                    "Query too long ({} chars). Maximum allowed: {} chars.",
                    query.len(),
                    MAX_QUERY_LENGTH
                )),
                metadata: HashMap::new(),
            });
        }

        // SECURITY: Block stacked queries and SQL comment injection
        if query.contains(';') {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "Multiple SQL statements (semicolons) are not allowed.", "success": false }),
                error: Some("Multiple SQL statements (semicolons) are not allowed.".to_string()),
                metadata: HashMap::new(),
            });
        }
        if query.contains("--") || query.contains("/*") {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "SQL comments are not allowed in queries.", "success": false }),
                error: Some("SQL comments are not allowed in queries.".to_string()),
                metadata: HashMap::new(),
            });
        }

        // Validate it's a modification query (INSERT, UPDATE, DELETE)
        let query_upper = query.trim().to_uppercase();
        let is_modification = query_upper.starts_with("INSERT")
            || query_upper.starts_with("UPDATE")
            || query_upper.starts_with("DELETE");

        if !is_modification {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "db_execute only supports INSERT, UPDATE, or DELETE statements. Use db_query for SELECT.", "success": false }),
                error: Some("db_execute only supports INSERT, UPDATE, or DELETE statements. Use db_query for SELECT.".to_string()),
                metadata: HashMap::new(),
            });
        }

        // Block dangerous DDL operations and CTEs (which can bypass table allowlist)
        let blocked_keywords = [
            "DROP",
            "TRUNCATE",
            "ALTER",
            "CREATE",
            "GRANT",
            "REVOKE",
            "ATTACH",
            "DETACH",
            "PRAGMA",
            "LOAD_EXTENSION",
            "WITH",
        ];
        for keyword in &blocked_keywords {
            if query_upper.contains(keyword) {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("SQL operation '{}' is not allowed. Only INSERT, UPDATE, DELETE are permitted.", keyword), "success": false }),
                    error: Some(format!("SQL operation '{}' is not allowed. Only INSERT, UPDATE, DELETE are permitted.", keyword)),
                    metadata: HashMap::new(),
                });
            }
        }

        // SECURITY: Table allowlist for write operations — very narrow set.
        const ALLOWED_WRITE_TABLES: &[&str] = &[
            "conversations",
            "messages",
            "user_memory",
            "daily_logs",
            "workflow_executions",
            "workflow_execution_logs",
            "background_agents",
            "agi_tasks",
            "agi_task_checkpoints",
            "scheduled_jobs",
            "job_executions",
            "automation_history",
            "employee_tasks",
        ];
        {
            let tokens: Vec<&str> = query_upper.split_whitespace().collect();
            // For INSERT: "INSERT INTO table_name"
            // For UPDATE: "UPDATE table_name"
            // For DELETE: "DELETE FROM table_name"
            let table_name_opt = if query_upper.starts_with("INSERT") {
                tokens
                    .iter()
                    .position(|t| *t == "INTO")
                    .and_then(|p| tokens.get(p + 1))
            } else if query_upper.starts_with("UPDATE") {
                tokens.get(1)
            } else if query_upper.starts_with("DELETE") {
                tokens
                    .iter()
                    .position(|t| *t == "FROM")
                    .and_then(|p| tokens.get(p + 1))
            } else {
                None
            };
            if let Some(table_token) = table_name_opt {
                let table_name =
                    table_token.trim_matches(|c: char| !c.is_alphanumeric() && c != '_');
                if !table_name.is_empty()
                    && !ALLOWED_WRITE_TABLES.contains(&table_name.to_lowercase().as_str())
                {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Write access to table '{}' is not permitted.", table_name), "success": false }),
                        error: Some(format!(
                            "Write access to table '{}' is not permitted.",
                            table_name
                        )),
                        metadata: HashMap::new(),
                    });
                }
            }

            // SECURITY: Also validate FROM/JOIN table references in embedded SELECT subqueries.
            // Write queries like "INSERT INTO t SELECT ... FROM sensitive_table" can exfiltrate data.
            // Re-use the same ALLOWED_QUERY_TABLES allowlist from execute_db_query_tool.
            const ALLOWED_QUERY_TABLES: &[&str] = &[
                "conversations",
                "messages",
                "settings",
                "automation_history",
                "overlay_events",
                "command_history",
                "context_items",
                "workflow_definitions",
                "workflow_executions",
                "workflow_execution_logs",
                "published_workflows",
                "workflow_clones",
                "workflow_ratings",
                "workflow_favorites",
                "workflow_comments",
                "scheduled_jobs",
                "job_executions",
                "browser_sessions",
                "browser_tabs",
                "browser_automation_history",
                "calendar_accounts",
                "mcp_servers",
                "mcp_tools_cache",
                "projects",
                "project_settings",
                "project_memories",
                "user_memory",
                "daily_logs",
                "agent_templates",
                "template_installs",
                "analytics_snapshots",
                "user_milestones",
                "metrics_daily_cache",
                "realtime_metrics",
                "automation_benchmarks",
                "process_benchmarks",
                "roi_configurations",
                "background_agents",
                "agi_tasks",
                "agi_task_checkpoints",
                "conversation_branches",
                "autonomous_sessions",
                "autonomous_task_logs",
                "employee_tasks",
                "ai_employees",
                "user_employees",
            ];
            let mut i = 0;
            while i < tokens.len() {
                if tokens[i] == "FROM" || tokens[i] == "JOIN" {
                    if let Some(table_token) = tokens.get(i + 1) {
                        let table_name =
                            table_token.trim_matches(|c: char| !c.is_alphanumeric() && c != '_');
                        if !table_name.is_empty()
                            && !ALLOWED_WRITE_TABLES.contains(&table_name.to_lowercase().as_str())
                            && !ALLOWED_QUERY_TABLES.contains(&table_name.to_lowercase().as_str())
                        {
                            return Ok(ToolResult {
                                success: false,
                                data: json!({ "error": format!("Access to table '{}' is not permitted in subquery.", table_name), "success": false }),
                                error: Some(format!(
                                    "Access to table '{}' is not permitted in subquery.",
                                    table_name
                                )),
                                metadata: HashMap::new(),
                            });
                        }
                    }
                }
                i += 1;
            }
        }

        // SECURITY: Audit log for AI-constructed mutations (elevated risk)
        tracing::warn!(
            "[SECURITY][db_execute] AI executing mutation query: {}",
            query
        );

        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute(query, []) {
                Ok(rows_affected) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "rows_affected": rows_affected,
                        "query": query
                    }),
                    error: None,
                    metadata: HashMap::from([("query".to_string(), json!(query))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Query execution error: {}", e), "success": false }),
                    error: Some(format!("Query execution error: {}", e)),
                    metadata: HashMap::from([("query".to_string(), json!(query))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_db_transaction_begin_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute("BEGIN TRANSACTION", []) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message": "Transaction started",
                        "status": "active"
                    }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => {
                    let err_msg = format!("Failed to begin transaction: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_db_transaction_commit_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute("COMMIT", []) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message": "Transaction committed",
                        "status": "committed"
                    }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => {
                    let err_msg = format!("Failed to commit transaction: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_db_transaction_rollback_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute("ROLLBACK", []) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message": "Transaction rolled back",
                        "status": "rolled_back"
                    }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => {
                    let err_msg = format!("Failed to rollback transaction: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}
