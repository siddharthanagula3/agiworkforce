use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;
use tauri::State;
use tokio::sync::Mutex;

use crate::data::database::{
    ConnectionConfig, DeleteQuery, InsertQuery, PoolConfig, QueryBuilder, QueryValidation,
    SelectQuery, SqlClient, SqlSecurityValidator, UpdateQuery,
};
#[cfg(feature = "remote-databases")]
use crate::data::database::{MongoClient, RedisClient};
use crate::sys::commands::tool_confirmation::{request_tool_confirmation, ToolConfirmationState};
use crate::sys::security::tool_guard::{RiskLevel, ToolConfirmationRequest, ToolSafetyTier};

#[cfg(feature = "remote-databases")]
/// Validates procedure names: must start with a letter or underscore, followed by
/// alphanumerics/underscores (max 64 chars per segment), with at most one dot separator
/// for schema-qualified names (e.g. `my_schema.my_proc`).
/// Rejects dot-only strings like `....` that pass the old character-set check.
static PROC_NAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_]{0,63}(\.[a-zA-Z_][a-zA-Z0-9_]{0,63})*$")
        .expect("static regex is valid")
});

/// Regex patterns compiled once at startup.
/// Word-boundary matching prevents bypass via comment injection (`SEL/**/ECT`),
/// whitespace tricks (`SELECT\n...`), or embedded keywords inside identifiers.
static BLOCKED_KEYWORD_RE: Lazy<Regex> = Lazy::new(|| {
    // Each keyword is wrapped in \b…\b so partial matches inside names are ignored.
    Regex::new(r"(?i)\b(DROP|TRUNCATE|DELETE|INSERT|UPDATE|ALTER|CREATE\s+USER|GRANT|REVOKE)\b")
        .expect("static regex is valid")
});

/// Matches SQL block comments which can hide keywords from naive substring checks.
static BLOCK_COMMENT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"/\*[\s\S]*?\*/").expect("static regex is valid"));

/// Validates that a SQL query is a read-only SELECT/WITH statement.
///
/// Defences applied (in order):
/// 1. Strip block comments (`/* … */`) before keyword matching — prevents `SEL/**/ECT`.
/// 2. Word-boundary regex matching for blocked DML/DDL keywords.
/// 3. Reject semicolons — prevents multi-statement injection (`SELECT 1; DROP TABLE x`).
/// 4. Require the query to start with SELECT or WITH after stripping leading whitespace.
///
/// The optional `context` is included in error messages (e.g. "batch query at index 3").
fn validate_read_only_sql(sql: &str, context: Option<&str>) -> Result<(), String> {
    let loc = context
        .map(|ctx| format!(" in {}", ctx))
        .unwrap_or_default();

    // 1. Remove block comments before further analysis.
    let without_comments = BLOCK_COMMENT_RE.replace_all(sql, " ");

    // 2. Reject multi-statement separators.
    if without_comments.contains(';') {
        tracing::error!(
            "Blocked SQL query{} containing semicolon (multi-statement attempt)",
            loc
        );
        return Err(format!(
            "Semicolons are not allowed in SELECT queries{loc}. \
             Only a single SELECT statement is permitted."
        ));
    }

    // 3. Blocked keyword detection with word-boundary matching.
    if let Some(m) = BLOCKED_KEYWORD_RE.find(&without_comments) {
        let keyword = m.as_str().to_uppercase();
        tracing::error!(
            "Blocked dangerous SQL query{} with keyword: {}",
            loc,
            keyword
        );
        return Err(format!(
            "SQL operation '{keyword}' is not allowed{loc}. \
             Only SELECT queries are permitted for security."
        ));
    }

    // 4. Require SELECT or WITH (CTE) as the leading statement.
    let trimmed_upper = without_comments.trim().to_uppercase();
    if !trimmed_upper.starts_with("SELECT") && !trimmed_upper.starts_with("WITH") {
        return Err(format!(
            "Only SELECT queries are allowed{loc}. \
             Use specific mutation commands for data modifications."
        ));
    }

    Ok(())
}

pub struct DatabaseState {
    pub sql_client: SqlClient,
    #[cfg(feature = "remote-databases")]
    pub mongo_client: MongoClient,
    #[cfg(feature = "remote-databases")]
    pub redis_client: RedisClient,
}

impl Default for DatabaseState {
    fn default() -> Self {
        Self::new()
    }
}

impl DatabaseState {
    pub fn new() -> Self {
        Self {
            sql_client: SqlClient::new(),
            #[cfg(feature = "remote-databases")]
            mongo_client: MongoClient::new(),
            #[cfg(feature = "remote-databases")]
            redis_client: RedisClient::new(),
        }
    }
}

#[tauri::command]
pub async fn db_create_pool(
    connection_id: String,
    config: ConnectionConfig,
    pool_config: PoolConfig,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    let state = state.lock().await;

    state
        .sql_client
        .create_pool(&connection_id, config, pool_config)
        .await
        .map_err(|e| format!("Failed to create connection pool: {}", e))
}

#[tauri::command]
pub async fn db_execute_query(
    connection_id: String,
    sql: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    if connection_id.trim().is_empty() {
        return Err("Connection ID cannot be empty".to_string());
    }
    if connection_id.len() > 500 {
        return Err(format!(
            "Connection ID too long: {} characters. Maximum is 500",
            connection_id.len()
        ));
    }

    if sql.trim().is_empty() {
        return Err("SQL query cannot be empty".to_string());
    }
    if sql.len() > 1_000_000 {
        return Err(format!(
            "SQL query too long: {} characters. Maximum is 1MB",
            sql.len()
        ));
    }

    validate_read_only_sql(&sql, None)?;

    let state = state.lock().await;

    let result = state
        .sql_client
        .execute_query(&connection_id, &sql)
        .await
        .map_err(|e| {
            format!(
                "Query execution failed for connection '{}': {}",
                connection_id, e
            )
        })?;

    serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
}

#[tauri::command]
pub async fn db_execute_prepared(
    connection_id: String,
    sql: String,
    params: Vec<serde_json::Value>,
    app: tauri::AppHandle,
    state: State<'_, Mutex<DatabaseState>>,
    confirmation_state: State<'_, ToolConfirmationState>,
) -> Result<serde_json::Value, String> {
    if connection_id.trim().is_empty() {
        return Err("Connection ID cannot be empty".to_string());
    }

    if sql.trim().is_empty() {
        return Err("SQL query cannot be empty".to_string());
    }
    if sql.len() > 1_000_000 {
        return Err(format!(
            "SQL query too long: {} characters. Maximum is 1MB",
            sql.len()
        ));
    }

    if params.len() > 1000 {
        return Err(format!(
            "Too many parameters: {}. Maximum is 1000",
            params.len()
        ));
    }

    // SECURITY (H3): Restrict db_execute_prepared to safe DML/DQL only.
    // DROP, ALTER, CREATE, PRAGMA, ATTACH, and other DDL statements are not allowed.
    let sql_upper = sql.trim().to_uppercase();
    if !sql_upper.starts_with("SELECT")
        && !sql_upper.starts_with("INSERT")
        && !sql_upper.starts_with("UPDATE")
        && !sql_upper.starts_with("DELETE")
        && !sql_upper.starts_with("WITH")
    {
        return Err(format!(
            "Only SELECT, INSERT, UPDATE, DELETE, and WITH statements are allowed in prepared statements. Got: {}",
            &sql[..sql.len().min(50)]
        ));
    }

    // SECURITY: Require user confirmation for write operations (INSERT/UPDATE/DELETE).
    // SELECT and WITH (read-only) queries proceed without confirmation.
    let is_write_operation = sql_upper.starts_with("INSERT")
        || sql_upper.starts_with("UPDATE")
        || sql_upper.starts_with("DELETE");

    if is_write_operation {
        let preview = if sql.len() > 200 {
            format!("{}...", &sql[..200])
        } else {
            sql.clone()
        };

        let confirmation_request = ToolConfirmationRequest {
            request_id: uuid::Uuid::new_v4().to_string(),
            tool_name: "db_execute_prepared".to_string(),
            tool_description: format!(
                "Execute {} on connection '{}'",
                sql_upper.split_whitespace().next().unwrap_or("SQL"),
                connection_id
            ),
            arguments: serde_json::json!({
                "sql": preview,
                "connection_id": connection_id,
                "param_count": params.len(),
            }),
            risk_level: RiskLevel::Medium,
            safety_tier: ToolSafetyTier::RequiresConfirmation,
            risk_factors: vec![
                "This operation modifies database data".to_string(),
                format!("Statement type: {}", sql_upper.split_whitespace().next().unwrap_or("UNKNOWN")),
            ],
        };

        let approved = request_tool_confirmation(&app, &confirmation_state, confirmation_request, 60)
            .await?;

        if !approved {
            return Err("Database write operation denied by user".to_string());
        }
    }

    let state = state.lock().await;

    let result = state
        .sql_client
        .execute_prepared(&connection_id, &sql, &params)
        .await
        .map_err(|e| format!("Prepared statement execution failed: {}", e))?;

    serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
}

#[tauri::command]
pub async fn db_execute_batch(
    connection_id: String,
    queries: Vec<String>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<Vec<serde_json::Value>, String> {
    if connection_id.trim().is_empty() {
        return Err("Connection ID cannot be empty".to_string());
    }

    if queries.is_empty() {
        return Err("Queries array cannot be empty".to_string());
    }
    if queries.len() > 100 {
        return Err(format!(
            "Too many queries in batch: {}. Maximum is 100",
            queries.len()
        ));
    }

    for (index, query) in queries.iter().enumerate() {
        if query.trim().is_empty() {
            return Err(format!("Query at index {} is empty", index));
        }
        if query.len() > 1_000_000 {
            return Err(format!(
                "Query at index {} too long: {} characters. Maximum is 1MB",
                index,
                query.len()
            ));
        }

        validate_read_only_sql(query, Some(&format!("batch query at index {}", index)))?;
    }

    let state = state.lock().await;

    state
        .sql_client
        .execute_batch(&connection_id, &queries)
        .await
        .map(|results| {
            results
                .into_iter()
                .filter_map(|r| serde_json::to_value(r).ok())
                .collect()
        })
        .map_err(|e| format!("Batch execution failed: {}", e))
}

#[tauri::command]
pub async fn db_close_pool(
    connection_id: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    let state = state.lock().await;

    state
        .sql_client
        .close_pool(&connection_id)
        .await
        .map_err(|e| format!("Failed to close pool: {}", e))
}

#[tauri::command]
pub async fn db_list_pools(state: State<'_, Mutex<DatabaseState>>) -> Result<Vec<String>, String> {
    let state = state.lock().await;
    Ok(state.sql_client.list_pools().await)
}

#[tauri::command]
pub async fn db_get_pool_stats(
    connection_id: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    let state = state.lock().await;

    let stats = state
        .sql_client
        .get_pool_stats(&connection_id)
        .await
        .map_err(|e| format!("Failed to get pool stats: {}", e))?;

    serde_json::to_value(stats).map_err(|e| format!("Serialization error: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mysql_test_connection(
    connection_id: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<bool, String> {
    let state = state.lock().await;

    state
        .sql_client
        .mysql_test_connection(&connection_id)
        .await
        .map_err(|e| format!("MySQL connection test failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mysql_list_tables(
    connection_id: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<Vec<String>, String> {
    let state = state.lock().await;

    state
        .sql_client
        .mysql_list_tables(&connection_id)
        .await
        .map_err(|e| format!("MySQL list tables failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mysql_describe_table(
    connection_id: String,
    table_name: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    let state = state.lock().await;

    let result = state
        .sql_client
        .mysql_describe_table(&connection_id, &table_name)
        .await
        .map_err(|e| format!("MySQL describe table failed: {}", e))?;

    serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mysql_list_indexes(
    connection_id: String,
    table_name: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    let state = state.lock().await;

    let result = state
        .sql_client
        .mysql_list_indexes(&connection_id, &table_name)
        .await
        .map_err(|e| format!("MySQL list indexes failed: {}", e))?;

    serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mysql_call_procedure(
    connection_id: String,
    procedure_name: String,
    params: Vec<serde_json::Value>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<Vec<serde_json::Value>, String> {
    // H5 fix: Use regex to reject dot-only strings like `....` and enforce proper
    // identifier structure: `my_proc` or `schema.my_proc`.
    if !PROC_NAME_RE.is_match(&procedure_name) {
        return Err(format!(
            "Invalid procedure name '{}': must match pattern [a-zA-Z_][a-zA-Z0-9_]{{0,63}}(\\.[a-zA-Z_][a-zA-Z0-9_]{{0,63}})* \
             (e.g. 'my_proc' or 'schema.my_proc')",
            procedure_name
        ));
    }

    let state = state.lock().await;

    state
        .sql_client
        .mysql_call_procedure(&connection_id, &procedure_name, &params)
        .await
        .map(|results| {
            results
                .into_iter()
                .filter_map(|r| serde_json::to_value(r).ok())
                .collect()
        })
        .map_err(|e| format!("MySQL call procedure failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mysql_bulk_insert(
    connection_id: String,
    table_name: String,
    columns: Vec<String>,
    rows: Vec<Vec<serde_json::Value>>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<u64, String> {
    // AUDIT-003-012 fix: Validate table_name and columns against injection
    // SQL identifiers should only contain alphanumeric characters, underscores, and optionally a schema prefix

    // Validate table name
    let is_valid_table = table_name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '.');

    if !is_valid_table || table_name.is_empty() {
        return Err(format!(
            "Invalid table name '{}': must contain only alphanumeric characters, underscores, or dots",
            table_name
        ));
    }

    if table_name.matches('.').count() > 1 {
        return Err("Invalid table name: too many dots".to_string());
    }

    if table_name.len() > 128 {
        return Err(format!(
            "Table name too long: {} characters. Maximum is 128",
            table_name.len()
        ));
    }

    // Validate column names
    for col in &columns {
        let is_valid_col = col.chars().all(|c| c.is_alphanumeric() || c == '_');

        if !is_valid_col || col.is_empty() {
            return Err(format!(
                "Invalid column name '{}': must contain only alphanumeric characters or underscores",
                col
            ));
        }

        if col.len() > 128 {
            return Err(format!(
                "Column name '{}' too long: {} characters. Maximum is 128",
                col,
                col.len()
            ));
        }
    }

    if columns.is_empty() {
        return Err("Columns array cannot be empty".to_string());
    }

    if rows.is_empty() {
        return Err("Rows array cannot be empty".to_string());
    }

    let state = state.lock().await;

    let column_refs: Vec<&str> = columns.iter().map(|s| s.as_str()).collect();

    state
        .sql_client
        .mysql_bulk_insert(&connection_id, &table_name, &column_refs, &rows)
        .await
        .map_err(|e| format!("MySQL bulk insert failed: {}", e))
}

#[tauri::command]
pub async fn db_validate_query(sql: String) -> Result<QueryValidation, String> {
    let validator =
        SqlSecurityValidator::new().map_err(|e| format!("Failed to create validator: {}", e))?;

    validator
        .validate_query(&sql)
        .map_err(|e| format!("Query validation failed: {}", e))
}

#[tauri::command]
pub async fn db_build_select(query: SelectQuery) -> Result<String, String> {
    let builder = QueryBuilder::select(&query.table)
        .columns(&query.columns.iter().map(|s| s.as_str()).collect::<Vec<_>>());

    let builder = if let Some(ref where_clause) = query.where_clause {
        builder.where_clause(where_clause)
    } else {
        builder
    };

    let builder = if let Some(limit) = query.limit {
        builder.limit(limit)
    } else {
        builder
    };

    let builder = if let Some(offset) = query.offset {
        builder.offset(offset)
    } else {
        builder
    };

    builder
        .build()
        .map_err(|e| format!("Failed to build query: {}", e))
}

/// Build an INSERT SQL string using string interpolation.
///
/// # Deprecation Warning (M10)
/// This command returns a fully-interpolated SQL string. Callers should treat
/// the result as read-only data for display purposes only. For actual database
/// writes, use `db_execute_prepared` with parameterized placeholders instead,
/// which eliminates the risk of SQL injection from bypassing the escape layer.
/// All column names and values are length-validated (max 10 000 chars each).
#[tauri::command]
pub async fn db_build_insert(query: InsertQuery) -> Result<String, String> {
    // M10: validate lengths on all columns and values before building
    for col in &query.columns {
        if col.len() > 10_000 {
            return Err(format!(
                "Column name too long ({} chars). Maximum is 10 000",
                col.len()
            ));
        }
    }
    for row in &query.values {
        for val in row {
            if val.len() > 10_000 {
                return Err(format!(
                    "Value too long ({} chars). Maximum is 10 000",
                    val.len()
                ));
            }
        }
    }

    tracing::warn!(
        "db_build_insert uses string interpolation. Prefer db_execute_prepared for safe writes."
    );

    let mut builder = QueryBuilder::insert(&query.table);

    builder = builder.into_columns(&query.columns.iter().map(|s| s.as_str()).collect::<Vec<_>>());

    for values in &query.values {
        builder = builder.values(&values.iter().map(|s| s.as_str()).collect::<Vec<_>>());
    }

    builder
        .build()
        .map_err(|e| format!("Failed to build query: {}", e))
}

/// Build an UPDATE SQL string using string interpolation.
///
/// # Deprecation Warning (M10)
/// This command returns a fully-interpolated SQL string. For actual database
/// writes, use `db_execute_prepared` with parameterized placeholders instead.
/// All keys and values are length-validated (max 10 000 chars each).
#[tauri::command]
pub async fn db_build_update(query: UpdateQuery) -> Result<String, String> {
    // M10: validate lengths on all set_values keys and values
    for (key, val) in &query.set_values {
        if key.len() > 10_000 {
            return Err(format!(
                "Column name too long ({} chars). Maximum is 10 000",
                key.len()
            ));
        }
        if val.len() > 10_000 {
            return Err(format!(
                "Value too long ({} chars). Maximum is 10 000",
                val.len()
            ));
        }
    }

    tracing::warn!(
        "db_build_update uses string interpolation. Prefer db_execute_prepared for safe writes."
    );

    let mut builder = QueryBuilder::update(&query.table);

    for (key, value) in &query.set_values {
        builder = builder.set(key, value);
    }

    let builder = if let Some(ref where_clause) = query.where_clause {
        builder.where_clause(where_clause)
    } else {
        builder
    };

    builder
        .build()
        .map_err(|e| format!("Failed to build query: {}", e))
}

#[tauri::command]
pub async fn db_build_delete(query: DeleteQuery) -> Result<String, String> {
    let builder = QueryBuilder::delete(&query.table);

    let builder = if let Some(ref where_clause) = query.where_clause {
        builder.where_clause(where_clause)
    } else {
        builder
    };

    builder
        .build()
        .map_err(|e| format!("Failed to build query: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mongo_connect(
    connection_id: String,
    config: ConnectionConfig,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    let state = state.lock().await;

    state
        .mongo_client
        .connect(&connection_id, config)
        .await
        .map_err(|e| format!("MongoDB connection failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mongo_find(
    connection_id: String,
    collection: String,
    filter: HashMap<String, serde_json::Value>,
    limit: Option<u64>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    let state = state.lock().await;

    let result = state
        .mongo_client
        .find(&connection_id, &collection, &filter, limit)
        .await
        .map_err(|e| format!("MongoDB find failed: {}", e))?;

    serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mongo_find_one(
    connection_id: String,
    collection: String,
    filter: HashMap<String, serde_json::Value>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<Option<HashMap<String, serde_json::Value>>, String> {
    let state = state.lock().await;

    state
        .mongo_client
        .find_one(&connection_id, &collection, &filter)
        .await
        .map_err(|e| format!("MongoDB findOne failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mongo_insert_one(
    connection_id: String,
    collection: String,
    document: HashMap<String, serde_json::Value>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<String, String> {
    let state = state.lock().await;

    state
        .mongo_client
        .insert_one(&connection_id, &collection, &document)
        .await
        .map_err(|e| format!("MongoDB insertOne failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mongo_insert_many(
    connection_id: String,
    collection: String,
    documents: Vec<HashMap<String, serde_json::Value>>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<Vec<String>, String> {
    let state = state.lock().await;

    state
        .mongo_client
        .insert_many(&connection_id, &collection, &documents)
        .await
        .map_err(|e| format!("MongoDB insertMany failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mongo_update_many(
    connection_id: String,
    collection: String,
    filter: HashMap<String, serde_json::Value>,
    update: HashMap<String, serde_json::Value>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    let state = state.lock().await;

    let result = state
        .mongo_client
        .update_many(&connection_id, &collection, &filter, &update)
        .await
        .map_err(|e| format!("MongoDB updateMany failed: {}", e))?;

    serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mongo_delete_many(
    connection_id: String,
    collection: String,
    filter: HashMap<String, serde_json::Value>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<u64, String> {
    let state = state.lock().await;

    state
        .mongo_client
        .delete_many(&connection_id, &collection, &filter)
        .await
        .map_err(|e| format!("MongoDB deleteMany failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_mongo_disconnect(
    connection_id: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    let state = state.lock().await;

    state
        .mongo_client
        .disconnect(&connection_id)
        .await
        .map_err(|e| format!("MongoDB disconnect failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_redis_connect(
    connection_id: String,
    config: ConnectionConfig,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    let state = state.lock().await;

    state
        .redis_client
        .connect(&connection_id, config)
        .await
        .map_err(|e| format!("Redis connection failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_redis_get(
    connection_id: String,
    key: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<Option<String>, String> {
    let state = state.lock().await;

    state
        .redis_client
        .get(&connection_id, &key)
        .await
        .map_err(|e| format!("Redis GET failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_redis_set(
    connection_id: String,
    key: String,
    value: String,
    expiration_seconds: Option<u64>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    if connection_id.trim().is_empty() {
        return Err("Connection ID cannot be empty".to_string());
    }

    if key.is_empty() {
        return Err("Redis key cannot be empty".to_string());
    }
    if key.len() > 512_000_000 {
        return Err(format!(
            "Redis key too long: {} bytes. Maximum is 512MB",
            key.len()
        ));
    }

    if value.len() > 512_000_000 {
        return Err(format!(
            "Redis value too large: {} bytes. Maximum is 512MB",
            value.len()
        ));
    }

    if let Some(exp) = expiration_seconds {
        if exp == 0 {
            return Err("Expiration must be greater than 0 seconds".to_string());
        }
        if exp > 31_536_000 {
            return Err(format!(
                "Expiration too long: {} seconds. Maximum is 1 year (31,536,000 seconds)",
                exp
            ));
        }
    }

    let state = state.lock().await;

    state
        .redis_client
        .set(&connection_id, &key, &value, expiration_seconds)
        .await
        .map_err(|e| format!("Redis SET failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_redis_del(
    connection_id: String,
    keys: Vec<String>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<u64, String> {
    let state = state.lock().await;

    state
        .redis_client
        .del(&connection_id, &keys)
        .await
        .map_err(|e| format!("Redis DEL failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_redis_exists(
    connection_id: String,
    key: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<bool, String> {
    let state = state.lock().await;

    state
        .redis_client
        .exists(&connection_id, &key)
        .await
        .map_err(|e| format!("Redis EXISTS failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_redis_expire(
    connection_id: String,
    key: String,
    seconds: u64,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<bool, String> {
    let state = state.lock().await;

    state
        .redis_client
        .expire(&connection_id, &key, seconds)
        .await
        .map_err(|e| format!("Redis EXPIRE failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_redis_hget(
    connection_id: String,
    key: String,
    field: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<Option<String>, String> {
    let state = state.lock().await;

    state
        .redis_client
        .hget(&connection_id, &key, &field)
        .await
        .map_err(|e| format!("Redis HGET failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_redis_hset(
    connection_id: String,
    key: String,
    field: String,
    value: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<bool, String> {
    let state = state.lock().await;

    state
        .redis_client
        .hset(&connection_id, &key, &field, &value)
        .await
        .map_err(|e| format!("Redis HSET failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_redis_hgetall(
    connection_id: String,
    key: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<HashMap<String, String>, String> {
    let state = state.lock().await;

    state
        .redis_client
        .hgetall(&connection_id, &key)
        .await
        .map_err(|e| format!("Redis HGETALL failed: {}", e))
}

#[cfg(feature = "remote-databases")]
#[tauri::command]
pub async fn db_redis_disconnect(
    connection_id: String,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    let state = state.lock().await;

    state
        .redis_client
        .disconnect(&connection_id)
        .await
        .map_err(|e| format!("Redis disconnect failed: {}", e))
}

/// Store a database connection password securely using encrypted storage.
/// The password is encrypted with machine-derived keys and stored in the database.
/// This prevents passwords from being visible in React DevTools or memory dumps.
#[tauri::command]
pub async fn db_store_password(connection_id: String, password: String) -> Result<(), String> {
    use crate::core::mcp::config::encrypt_mcp_credential;

    if connection_id.trim().is_empty() {
        return Err("Connection ID cannot be empty".to_string());
    }

    if connection_id.len() > 500 {
        return Err(format!(
            "Connection ID too long: {} characters. Maximum is 500",
            connection_id.len()
        ));
    }

    // Encrypt the password using machine-derived keys
    let encrypted = encrypt_mcp_credential(&password)
        .ok_or_else(|| "Failed to encrypt password".to_string())?;

    // Get the database path
    let app_data =
        dirs::data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;
    let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

    // Store in database.
    //
    // KNOWN LIMITATION (M16): This function opens a raw rusqlite connection that
    // bypasses the application connection pool (DatabaseState / SqlitePool). This is
    // acceptable here for two reasons:
    //
    //   1. Security: The password has already been encrypted by `encrypt_mcp_credential`
    //      before reaching the database write. No plaintext credential ever touches the
    //      storage layer. The security invariant is preserved regardless of which
    //      connection handle is used.
    //
    //   2. Concurrency: This is a single-user desktop application. SQLite WAL mode
    //      (enabled below) allows concurrent reads alongside this write without
    //      blocking the pool. Write contention risk is negligible in practice.
    //
    // TECH DEBT (M16): This opens a standalone connection instead of using the pool.
    // Migration to pool-based access requires adding `pool: State<'_, SqlitePoolState>`
    // to the command signature, updating the frontend `invoke()` call, and the
    // Tauri command registration in `lib.rs`.
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable WAL mode on this standalone connection to reduce lock contention with
    // the pool (M16 mitigation — remove once migrated to pool-based access).
    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("Failed to enable WAL mode: {}", e))?;

    let cred_key = format!("db_connection_password_{}", connection_id);
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
         VALUES (?1, ?2, 'db_credentials', 1, ?3, ?3)",
        rusqlite::params![cred_key, encrypted, now],
    )
    .map_err(|e| format!("Failed to store password: {}", e))?;

    tracing::info!(
        "Database password stored securely for connection: {}",
        connection_id
    );
    Ok(())
}

/// Check if a password exists for a database connection.
/// Returns true if a password is stored, false otherwise.
/// Does NOT return the actual password for security reasons.
#[tauri::command]
pub async fn db_has_stored_password(connection_id: String) -> Result<bool, String> {
    if connection_id.trim().is_empty() {
        return Err("Connection ID cannot be empty".to_string());
    }

    // Get the database path
    let app_data =
        dirs::data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;
    let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

    // Check in database
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let cred_key = format!("db_connection_password_{}", connection_id);

    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM settings_v2 WHERE key = ?1 AND encrypted = 1)",
            rusqlite::params![cred_key],
            |row| row.get(0),
        )
        .unwrap_or(false);

    Ok(exists)
}

/// Retrieve a stored database password for creating a connection.
/// This should only be called when actually establishing a connection,
/// not for display purposes. Requires explicit user approval.
#[tauri::command]
pub async fn db_get_stored_password(
    app: tauri::AppHandle,
    confirmation_state: State<'_, ToolConfirmationState>,
    connection_id: String,
) -> Result<Option<String>, String> {
    use crate::core::mcp::config::decrypt_mcp_credential;

    if connection_id.trim().is_empty() {
        return Err("Connection ID cannot be empty".to_string());
    }

    // SECURITY: Retrieving stored passwords requires explicit user approval
    let confirmation = ToolConfirmationRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        tool_name: "db_get_stored_password".to_string(),
        tool_description: format!(
            "Retrieve stored database password for connection '{}'",
            connection_id
        ),
        parameters: serde_json::json!({
            "connection_id": connection_id,
        }),
        risk_level: RiskLevel::Critical,
        safety_tier: ToolSafetyTier::RequiresExplicitApproval,
        reason: "Accessing stored database passwords is a sensitive operation that requires explicit approval.".to_string(),
        reversible: false,
        undo_description: None,
    };

    let approved = request_tool_confirmation(&app, &confirmation_state, confirmation, 120)
        .await
        .map_err(|e| e.to_string())?;

    if !approved {
        return Err("Password retrieval cancelled by user".to_string());
    }

    // Get the database path
    let app_data =
        dirs::data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;
    let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

    // Retrieve from database
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let cred_key = format!("db_connection_password_{}", connection_id);

    let encrypted: Option<String> = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1 AND encrypted = 1",
            rusqlite::params![cred_key],
            |row| row.get(0),
        )
        .ok();

    match encrypted {
        Some(enc_value) => {
            let decrypted = decrypt_mcp_credential(&enc_value);
            Ok(decrypted)
        }
        None => Ok(None),
    }
}

/// Delete a stored database password.
#[tauri::command]
pub async fn db_delete_stored_password(connection_id: String) -> Result<(), String> {
    if connection_id.trim().is_empty() {
        return Err("Connection ID cannot be empty".to_string());
    }

    // Get the database path
    let app_data =
        dirs::data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;
    let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

    // Delete from database
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let cred_key = format!("db_connection_password_{}", connection_id);

    conn.execute(
        "DELETE FROM settings_v2 WHERE key = ?1",
        rusqlite::params![cred_key],
    )
    .map_err(|e| format!("Failed to delete password: {}", e))?;

    tracing::info!(
        "Database password deleted for connection: {}",
        connection_id
    );
    Ok(())
}

// MySQL stub implementations when remote-databases feature is disabled.
#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mysql_test_connection(
    _connection_id: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<bool, String> {
    Err("MySQL support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mysql_list_tables(
    _connection_id: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<Vec<String>, String> {
    Err("MySQL support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mysql_describe_table(
    _connection_id: String,
    _table_name: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    Err("MySQL support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mysql_list_indexes(
    _connection_id: String,
    _table_name: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    Err("MySQL support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mysql_call_procedure(
    _connection_id: String,
    _procedure_name: String,
    _params: Vec<serde_json::Value>,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<Vec<serde_json::Value>, String> {
    Err("MySQL support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mysql_bulk_insert(
    _connection_id: String,
    _table_name: String,
    _columns: Vec<String>,
    _rows: Vec<Vec<serde_json::Value>>,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<u64, String> {
    Err("MySQL support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

// Stub implementations when remote-databases feature is disabled.
// These return user-friendly errors instead of causing compile failures.
#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mongo_connect(
    _connection_id: String,
    _config: ConnectionConfig,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    Err("MongoDB support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mongo_find(
    _connection_id: String,
    _collection: String,
    _filter: HashMap<String, serde_json::Value>,
    _limit: Option<u64>,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    Err("MongoDB support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mongo_find_one(
    _connection_id: String,
    _collection: String,
    _filter: HashMap<String, serde_json::Value>,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<Option<HashMap<String, serde_json::Value>>, String> {
    Err("MongoDB support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mongo_insert_one(
    _connection_id: String,
    _collection: String,
    _document: HashMap<String, serde_json::Value>,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<String, String> {
    Err("MongoDB support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mongo_insert_many(
    _connection_id: String,
    _collection: String,
    _documents: Vec<HashMap<String, serde_json::Value>>,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<Vec<String>, String> {
    Err("MongoDB support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mongo_update_many(
    _connection_id: String,
    _collection: String,
    _filter: HashMap<String, serde_json::Value>,
    _update: HashMap<String, serde_json::Value>,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    Err("MongoDB support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mongo_delete_many(
    _connection_id: String,
    _collection: String,
    _filter: HashMap<String, serde_json::Value>,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<u64, String> {
    Err("MongoDB support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_mongo_disconnect(
    _connection_id: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    Err("MongoDB support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_redis_connect(
    _connection_id: String,
    _config: ConnectionConfig,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    Err("Redis support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_redis_get(
    _connection_id: String,
    _key: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<Option<String>, String> {
    Err("Redis support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_redis_set(
    _connection_id: String,
    _key: String,
    _value: String,
    _expiration_seconds: Option<u64>,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    Err("Redis support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_redis_del(
    _connection_id: String,
    _keys: Vec<String>,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<u64, String> {
    Err("Redis support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_redis_exists(
    _connection_id: String,
    _key: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<bool, String> {
    Err("Redis support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_redis_expire(
    _connection_id: String,
    _key: String,
    _seconds: u64,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<bool, String> {
    Err("Redis support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_redis_hget(
    _connection_id: String,
    _key: String,
    _field: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<Option<String>, String> {
    Err("Redis support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_redis_hset(
    _connection_id: String,
    _key: String,
    _field: String,
    _value: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<bool, String> {
    Err("Redis support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_redis_hgetall(
    _connection_id: String,
    _key: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<HashMap<String, String>, String> {
    Err("Redis support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(not(feature = "remote-databases"))]
#[tauri::command]
pub async fn db_redis_disconnect(
    _connection_id: String,
    _state: State<'_, Mutex<DatabaseState>>,
) -> Result<(), String> {
    Err("Redis support is not enabled. Rebuild with the 'remote-databases' feature.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_state_creation() {
        let state = DatabaseState::new();

        drop(state);
    }
}
