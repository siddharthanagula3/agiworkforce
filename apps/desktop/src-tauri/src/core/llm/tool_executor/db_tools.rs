use super::*;

impl ToolExecutor {
    pub(crate) async fn execute_db_query_tool(&self, args: &HashMap<String, Value>) -> Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?;

        // Validate it's a SELECT query only (read-only)
        let query_upper = query.trim().to_uppercase();
        if !query_upper.starts_with("SELECT") && !query_upper.starts_with("WITH") {
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
            "DROP", "TRUNCATE", "DELETE", "ALTER", "CREATE", "INSERT", "UPDATE", "GRANT", "REVOKE",
            "ATTACH", "DETACH", "PRAGMA", "LOAD_EXTENSION",
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
            let query_result: Result<(Vec<String>, Vec<serde_json::Value>), String> = (|| {
                let mut stmt = conn
                    .prepare(query)
                    .map_err(|e| format!("Query preparation error: {}", e))?;
                let column_names: Vec<String> =
                    stmt.column_names().iter().map(|s| s.to_string()).collect();

                let mut rows_iter = stmt
                    .query([])
                    .map_err(|e| format!("Query execution error: {}", e))?;
                let mut rows: Vec<serde_json::Value> = Vec::new();

                while let Some(row) = rows_iter
                    .next()
                    .map_err(|e| format!("Row fetch error: {}", e))?
                {
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

                Ok((column_names, rows))
            })(
            );

            match query_result {
                Ok((column_names, rows)) => {
                    let row_count = rows.len();
                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "columns": column_names,
                            "rows": rows,
                            "row_count": row_count
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

    pub(crate) async fn execute_db_execute_tool(&self, args: &HashMap<String, Value>) -> Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?;

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

        // Block dangerous DDL operations
        let blocked_keywords = ["DROP", "TRUNCATE", "ALTER", "CREATE", "GRANT", "REVOKE", "ATTACH", "DETACH", "PRAGMA", "LOAD_EXTENSION"];
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
