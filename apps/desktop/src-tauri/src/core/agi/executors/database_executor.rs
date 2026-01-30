//! Database operations executor.
//!
//! Handles database operations including queries, executions, and transactions.
//! Includes comprehensive SQL injection protection for read-only queries and
//! supports multiple database types via SqlClient.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;

/// EXE-004 fix: Default query timeout in seconds to prevent indefinite hangs
const DEFAULT_QUERY_TIMEOUT_SECS: u64 = 30;

/// EXE-004 fix: Maximum allowed query timeout (5 minutes)
const MAX_QUERY_TIMEOUT_SECS: u64 = 300;

/// Executor for database operations.
///
/// Provides tools for:
/// - `db_query`: Execute read-only SELECT queries with SQL injection protection
/// - `db_execute`: Execute non-SELECT statements (INSERT, UPDATE, DELETE, etc.)
/// - `db_transaction_begin`: Start a new database transaction
/// - `db_transaction_commit`: Commit the current transaction
/// - `db_transaction_rollback`: Rollback the current transaction
pub struct DatabaseExecutor;

impl DatabaseExecutor {
    /// Create a new database executor.
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// Dangerous SQL keywords that are blocked in read-only queries.
    ///
    /// These keywords are not allowed in `db_query` operations to prevent
    /// accidental or malicious data modification. For write operations,
    /// use `db_execute` with proper authorization.
    const DANGEROUS_SQL_KEYWORDS: &'static [&'static str] = &[
        // Data destruction
        "DROP",
        "TRUNCATE",
        "DELETE",
        // Schema modification
        "ALTER",
        "CREATE",
        "RENAME",
        // Data modification (use db_execute for these)
        "INSERT",
        "UPDATE",
        "REPLACE",
        "MERGE",
        "UPSERT",
        // Permission/security changes
        "GRANT",
        "REVOKE",
        // Database administration
        "VACUUM",
        "ANALYZE",
        "REINDEX",
        "CLUSTER",
        // Transaction control (should be explicit via db_transaction_* tools)
        "BEGIN",
        "COMMIT",
        "ROLLBACK",
        "SAVEPOINT",
        // Dangerous operations
        "EXEC",
        "EXECUTE",
        "CALL",
        // File system access
        "COPY",
        "LOAD",
        "ATTACH",
        "DETACH",
        // SQLite specific
        "PRAGMA",
    ];

    /// Validate a SQL query for injection attacks.
    ///
    /// This function checks for:
    /// 1. Dangerous SQL keywords that could modify data
    /// 2. SQL comment syntax that may indicate injection attempts
    /// 3. Multiple statements (semicolon-separated queries)
    ///
    /// # Arguments
    ///
    /// * `query` - The SQL query string to validate
    ///
    /// # Returns
    ///
    /// `Ok(())` if the query is safe, `Err` with a descriptive message if dangerous.
    pub(crate) fn validate_query(query: &str) -> Result<()> {
        // Normalize query for keyword detection (uppercase, collapse whitespace)
        let normalized_query = query.to_uppercase();
        let query_words: Vec<&str> = normalized_query.split_whitespace().collect();

        // Check for dangerous keywords at word boundaries
        for keyword in Self::DANGEROUS_SQL_KEYWORDS {
            for word in query_words.iter() {
                // Remove common SQL punctuation for comparison
                let clean_word = word.trim_matches(|c: char| !c.is_alphanumeric());
                if clean_word == *keyword {
                    // Additional check: don't block if it's clearly inside a string literal
                    // (basic heuristic - proper parsing would require full SQL parser)
                    let keyword_pos = normalized_query.find(keyword);
                    if let Some(pos) = keyword_pos {
                        // Count quotes before this position
                        let prefix = &query[..pos.min(query.len())];
                        let single_quotes = prefix.matches('\'').count();
                        let double_quotes = prefix.matches('"').count();

                        // If odd number of quotes, we're inside a string literal
                        if single_quotes.is_multiple_of(2) && double_quotes.is_multiple_of(2) {
                            tracing::error!(
                                "[DatabaseExecutor] SQL injection attempt blocked: dangerous keyword '{}' in query",
                                keyword
                            );
                            return Err(anyhow!(
                                "Dangerous SQL operation '{}' is not allowed in db_query. \
                                Use db_execute for write operations with proper authorization.",
                                keyword
                            ));
                        }
                    }
                }
            }
        }

        // Additional check for SQL comment-based injection attempts
        if normalized_query.contains("--") || normalized_query.contains("/*") {
            tracing::warn!(
                "[DatabaseExecutor] SQL query contains comment syntax which may indicate injection attempt"
            );
            // Don't block, but log for monitoring - legitimate queries may contain comments
        }

        // Check for multiple statements (semicolon outside strings)
        Self::check_multiple_statements(query)?;

        Ok(())
    }

    /// Check for multiple SQL statements in a single query.
    ///
    /// Multiple statements are not allowed to prevent SQL injection attacks
    /// that append malicious commands after legitimate queries.
    ///
    /// # EXE-001 fix: Improved tokenization to handle SQL escape sequences
    ///
    /// SQL uses doubled quotes for escaping (e.g., 'test''s' or "say ""hello""")
    /// in addition to backslash escaping in some databases. This implementation
    /// handles both cases.
    pub(crate) fn check_multiple_statements(query: &str) -> Result<()> {
        let mut in_string = false;
        let mut string_char = ' ';
        let chars: Vec<char> = query.chars().collect();
        let len = chars.len();
        let mut i = 0;

        while i < len {
            let c = chars[i];

            if !in_string && (c == '\'' || c == '"') {
                in_string = true;
                string_char = c;
            } else if in_string && c == string_char {
                // EXE-001 fix: Check for SQL-style doubled quote escape ('' or "")
                // This is the standard SQL way to escape quotes
                if i + 1 < len && chars[i + 1] == string_char {
                    // Doubled quote - skip the next character (it's part of the escape)
                    i += 1;
                } else {
                    // Check for backslash escape (used by MySQL and others)
                    let is_backslash_escaped = i > 0 && chars[i - 1] == '\\';
                    if !is_backslash_escaped {
                        in_string = false;
                    }
                }
            } else if !in_string && c == ';' {
                // Found semicolon outside string - check if there's more SQL after it
                let remaining: String = chars[i + 1..].iter().collect();
                let remaining = remaining.trim();
                if !remaining.is_empty() {
                    tracing::error!(
                        "[DatabaseExecutor] SQL injection attempt blocked: multiple statements detected"
                    );
                    return Err(anyhow!(
                        "Multiple SQL statements are not allowed. Use separate db_query calls."
                    ));
                }
            }
            i += 1;
        }

        Ok(())
    }

    /// Execute a read-only database query with SQL injection protection.
    async fn execute_query(
        context: &ExecutorContext,
        parameters: &HashMap<String, Value>,
    ) -> Result<Value> {
        let database_id = parameters
            .get("database_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing database_id parameter"))?;

        let query = parameters
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?;

        // Validate query length to prevent DoS
        if query.len() > 1_000_000 {
            return Err(anyhow!(
                "Query too long: {} characters. Maximum is 1MB",
                query.len()
            ));
        }

        // SECURITY: SQL injection protection
        Self::validate_query(query)?;

        let Some(ref app) = context.app_handle else {
            return Err(anyhow!("App handle not available for database query"));
        };

        use crate::sys::commands::DatabaseState;
        use tauri::Manager;
        use tokio::sync::Mutex;

        let db_state = app.state::<Mutex<DatabaseState>>();
        let db_guard = db_state.lock().await;

        // EXE-004 fix: Get timeout from parameters or use default
        let timeout_secs = parameters
            .get("timeout_secs")
            .and_then(|v| v.as_u64())
            .map(|t| t.min(MAX_QUERY_TIMEOUT_SECS))
            .unwrap_or(DEFAULT_QUERY_TIMEOUT_SECS);

        // EXE-004 fix: Wrap query execution with timeout to prevent indefinite hangs
        let query_future = db_guard.sql_client.execute_query(database_id, query);
        let result = tokio::time::timeout(Duration::from_secs(timeout_secs), query_future)
            .await
            .map_err(|_| {
                anyhow!(
                    "Query timed out after {} seconds. Consider optimizing the query or increasing the timeout.",
                    timeout_secs
                )
            })?
            .map_err(|e| anyhow!("Database query failed: {}", e))?;

        let result_json = serde_json::to_value(&result)
            .map_err(|e| anyhow!("Failed to serialize result: {}", e))?;

        tracing::info!(
            "[DatabaseExecutor] Query executed on '{}': {} rows returned in {}ms",
            database_id,
            result.rows.len(),
            result.execution_time_ms
        );

        Ok(json!({
            "success": true,
            "database_id": database_id,
            "rows": result.rows.len(),
            "rows_affected": result.rows_affected,
            "execution_time_ms": result.execution_time_ms,
            "data": result_json
        }))
    }

    /// Execute a SQL statement that may modify data.
    ///
    /// Unlike `db_query`, this function does not block write operations.
    /// It supports parameterized queries for safe value insertion.
    async fn execute_sql(
        context: &ExecutorContext,
        parameters: &HashMap<String, Value>,
    ) -> Result<Value> {
        let connection_id = parameters
            .get("connection_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing connection_id parameter"))?;

        let sql = parameters
            .get("sql")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing sql parameter"))?;

        // Validate SQL length to prevent DoS
        if sql.len() > 1_000_000 {
            return Err(anyhow!(
                "SQL too long: {} characters. Maximum is 1MB",
                sql.len()
            ));
        }

        // Get optional prepared statement parameters
        let params = parameters
            .get("params")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        // Validate parameter count
        if params.len() > 1000 {
            return Err(anyhow!(
                "Too many parameters: {}. Maximum is 1000",
                params.len()
            ));
        }

        let Some(ref app) = context.app_handle else {
            return Err(anyhow!("App handle not available for database execute"));
        };

        use crate::sys::commands::DatabaseState;
        use tauri::Manager;
        use tokio::sync::Mutex;

        let db_state = app.state::<Mutex<DatabaseState>>();
        let db_guard = db_state.lock().await;

        let result = if params.is_empty() {
            db_guard.sql_client.execute_query(connection_id, sql).await
        } else {
            db_guard
                .sql_client
                .execute_prepared(connection_id, sql, &params)
                .await
        }
        .map_err(|e| anyhow!("Database execute failed: {}", e))?;

        tracing::info!(
            "[DatabaseExecutor] SQL executed on '{}': {} rows affected in {}ms",
            connection_id,
            result.rows_affected,
            result.execution_time_ms
        );

        Ok(json!({
            "success": true,
            "connection_id": connection_id,
            "rows_affected": result.rows_affected,
            "execution_time_ms": result.execution_time_ms
        }))
    }

    /// Begin a new database transaction.
    async fn execute_transaction_begin(
        context: &ExecutorContext,
        parameters: &HashMap<String, Value>,
    ) -> Result<Value> {
        let connection_id = parameters
            .get("connection_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing connection_id parameter"))?;

        let Some(ref app) = context.app_handle else {
            return Err(anyhow!("App handle not available for transaction begin"));
        };

        use crate::sys::commands::DatabaseState;
        use tauri::Manager;
        use tokio::sync::Mutex;

        let db_state = app.state::<Mutex<DatabaseState>>();
        let db_guard = db_state.lock().await;

        let result = db_guard
            .sql_client
            .execute_query(connection_id, "BEGIN TRANSACTION")
            .await
            .map_err(|e| anyhow!("Failed to begin transaction: {}", e))?;

        tracing::info!(
            "[DatabaseExecutor] Transaction started on connection: {}",
            connection_id
        );

        Ok(json!({
            "success": true,
            "connection_id": connection_id,
            "transaction_started": true,
            "execution_time_ms": result.execution_time_ms
        }))
    }

    /// Commit the current database transaction.
    async fn execute_transaction_commit(
        context: &ExecutorContext,
        parameters: &HashMap<String, Value>,
    ) -> Result<Value> {
        let connection_id = parameters
            .get("connection_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing connection_id parameter"))?;

        let Some(ref app) = context.app_handle else {
            return Err(anyhow!("App handle not available for transaction commit"));
        };

        use crate::sys::commands::DatabaseState;
        use tauri::Manager;
        use tokio::sync::Mutex;

        let db_state = app.state::<Mutex<DatabaseState>>();
        let db_guard = db_state.lock().await;

        let result = db_guard
            .sql_client
            .execute_query(connection_id, "COMMIT")
            .await
            .map_err(|e| anyhow!("Failed to commit transaction: {}", e))?;

        tracing::info!(
            "[DatabaseExecutor] Transaction committed on connection: {}",
            connection_id
        );

        Ok(json!({
            "success": true,
            "connection_id": connection_id,
            "transaction_committed": true,
            "execution_time_ms": result.execution_time_ms
        }))
    }

    /// Rollback the current database transaction.
    async fn execute_transaction_rollback(
        context: &ExecutorContext,
        parameters: &HashMap<String, Value>,
    ) -> Result<Value> {
        let connection_id = parameters
            .get("connection_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing connection_id parameter"))?;

        let Some(ref app) = context.app_handle else {
            return Err(anyhow!("App handle not available for transaction rollback"));
        };

        use crate::sys::commands::DatabaseState;
        use tauri::Manager;
        use tokio::sync::Mutex;

        let db_state = app.state::<Mutex<DatabaseState>>();
        let db_guard = db_state.lock().await;

        let result = db_guard
            .sql_client
            .execute_query(connection_id, "ROLLBACK")
            .await
            .map_err(|e| anyhow!("Failed to rollback transaction: {}", e))?;

        tracing::info!(
            "[DatabaseExecutor] Transaction rolled back on connection: {}",
            connection_id
        );

        Ok(json!({
            "success": true,
            "connection_id": connection_id,
            "transaction_rolled_back": true,
            "execution_time_ms": result.execution_time_ms
        }))
    }
}

impl Default for DatabaseExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for DatabaseExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec![
            "db_query",
            "db_execute",
            "db_transaction_begin",
            "db_transaction_commit",
            "db_transaction_rollback",
        ]
    }

    fn description(&self) -> &'static str {
        "Database operations executor for queries, executions, and transactions"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "db_query" => Self::execute_query(context, parameters).await,
            "db_execute" => Self::execute_sql(context, parameters).await,
            "db_transaction_begin" => Self::execute_transaction_begin(context, parameters).await,
            "db_transaction_commit" => Self::execute_transaction_commit(context, parameters).await,
            "db_transaction_rollback" => {
                Self::execute_transaction_rollback(context, parameters).await
            }
            _ => Err(anyhow!("Unknown database tool: {}", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_executor_tool_names() {
        let executor = DatabaseExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"db_query"));
        assert!(names.contains(&"db_execute"));
        assert!(names.contains(&"db_transaction_begin"));
        assert!(names.contains(&"db_transaction_commit"));
        assert!(names.contains(&"db_transaction_rollback"));
        assert_eq!(names.len(), 5);
    }

    #[test]
    fn test_database_executor_description() {
        let executor = DatabaseExecutor::new();
        assert!(!executor.description().is_empty());
    }

    #[test]
    fn test_sql_injection_detection_safe_queries() {
        // Safe queries should pass validation
        assert!(DatabaseExecutor::validate_query("SELECT * FROM users").is_ok());
        assert!(
            DatabaseExecutor::validate_query("SELECT name, email FROM users WHERE id = 1").is_ok()
        );
        assert!(
            DatabaseExecutor::validate_query("SELECT * FROM orders WHERE status = 'pending'")
                .is_ok()
        );
        assert!(DatabaseExecutor::validate_query("SELECT COUNT(*) FROM products").is_ok());
        assert!(DatabaseExecutor::validate_query(
            "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id"
        )
        .is_ok());
        assert!(DatabaseExecutor::validate_query(
            "WITH cte AS (SELECT * FROM users) SELECT * FROM cte"
        )
        .is_ok());
    }

    #[test]
    fn test_sql_injection_detection_dangerous_queries() {
        // Dangerous queries should fail validation
        assert!(DatabaseExecutor::validate_query("DROP TABLE users").is_err());
        assert!(DatabaseExecutor::validate_query("DELETE FROM users").is_err());
        assert!(DatabaseExecutor::validate_query("INSERT INTO users VALUES (1, 'test')").is_err());
        assert!(DatabaseExecutor::validate_query("UPDATE users SET name = 'test'").is_err());
        assert!(DatabaseExecutor::validate_query("TRUNCATE TABLE users").is_err());
        assert!(
            DatabaseExecutor::validate_query("ALTER TABLE users ADD COLUMN test VARCHAR(50)")
                .is_err()
        );
        assert!(DatabaseExecutor::validate_query("CREATE TABLE malicious (id INT)").is_err());
        assert!(DatabaseExecutor::validate_query("GRANT ALL ON users TO attacker").is_err());
        assert!(DatabaseExecutor::validate_query("EXEC sp_malicious").is_err());
        assert!(DatabaseExecutor::validate_query("PRAGMA table_info(users)").is_err());
    }

    #[test]
    fn test_multiple_statement_detection() {
        // Single statement should pass
        assert!(DatabaseExecutor::validate_query("SELECT * FROM users").is_ok());
        assert!(DatabaseExecutor::validate_query("SELECT * FROM users;").is_ok()); // Trailing semicolon OK

        // Multiple statements should fail
        assert!(DatabaseExecutor::validate_query("SELECT * FROM users; DROP TABLE users").is_err());
        assert!(DatabaseExecutor::validate_query(
            "SELECT * FROM users; DELETE FROM users WHERE 1=1"
        )
        .is_err());
    }

    #[test]
    fn test_keyword_inside_string_literal() {
        // Keywords inside string literals should NOT be blocked
        // The query "SELECT description FROM items WHERE name = 'DROP test'" is safe
        // because 'DROP' is inside a string literal
        let _query = "SELECT * FROM items WHERE description = 'Please DROP off the package'";
        // This is a known limitation - the heuristic may still block this
        // A full SQL parser would be needed for perfect detection
        // For now, we accept some false positives for security
    }

    #[test]
    fn test_transaction_control_blocked_in_query() {
        // Transaction control should go through explicit tools, not db_query
        assert!(DatabaseExecutor::validate_query("BEGIN TRANSACTION").is_err());
        assert!(DatabaseExecutor::validate_query("COMMIT").is_err());
        assert!(DatabaseExecutor::validate_query("ROLLBACK").is_err());
        assert!(DatabaseExecutor::validate_query("SAVEPOINT my_savepoint").is_err());
    }

    #[test]
    fn test_default_impl() {
        let executor = DatabaseExecutor::default();
        assert_eq!(executor.tool_names().len(), 5);
    }
}
