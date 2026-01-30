use std::collections::HashMap;
use tauri::State;
use tokio::sync::Mutex;

use crate::data::database::{
    ConnectionConfig, DeleteQuery, InsertQuery, MongoClient, PoolConfig, QueryBuilder,
    QueryValidation, RedisClient, SelectQuery, SqlClient, SqlSecurityValidator, UpdateQuery,
};

pub struct DatabaseState {
    pub sql_client: SqlClient,
    pub mongo_client: MongoClient,
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
            mongo_client: MongoClient::new(),
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

    // SECURITY: Block dangerous SQL operations - only SELECT queries are allowed by default
    let blocked_keywords = [
        "DROP",
        "TRUNCATE",
        "DELETE",
        "ALTER TABLE",
        "CREATE USER",
        "GRANT",
        "REVOKE",
        "INSERT",
        "UPDATE",
    ];
    let sql_upper = sql.to_uppercase();
    for keyword in &blocked_keywords {
        if sql_upper.contains(keyword) {
            tracing::error!("Blocked dangerous SQL query with keyword: {}", keyword);
            return Err(format!(
                "SQL operation '{}' is not allowed. Only SELECT queries are permitted for security.",
                keyword
            ));
        }
    }

    // Verify query starts with SELECT (after trimming whitespace)
    let trimmed_upper = sql_upper.trim();
    if !trimmed_upper.starts_with("SELECT") && !trimmed_upper.starts_with("WITH") {
        return Err("Only SELECT queries are allowed. Use specific mutation commands for data modifications.".to_string());
    }

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
    state: State<'_, Mutex<DatabaseState>>,
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

#[tauri::command]
pub async fn db_mysql_call_procedure(
    connection_id: String,
    procedure_name: String,
    params: Vec<serde_json::Value>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<Vec<serde_json::Value>, String> {
    // AUDIT-003-006 fix: Validate procedure_name against alphanumeric pattern
    // SQL identifiers should only contain alphanumeric characters, underscores, and optionally a schema prefix
    let is_valid_identifier = procedure_name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '.');

    if !is_valid_identifier || procedure_name.is_empty() {
        return Err(format!(
            "Invalid procedure name '{}': must contain only alphanumeric characters, underscores, or dots",
            procedure_name
        ));
    }

    // Additional check: prevent SQL injection via schema.procedure format
    if procedure_name.matches('.').count() > 1 {
        return Err("Invalid procedure name: too many dots".to_string());
    }

    // Prevent excessively long names
    if procedure_name.len() > 128 {
        return Err(format!(
            "Procedure name too long: {} characters. Maximum is 128",
            procedure_name.len()
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

#[tauri::command]
pub async fn db_build_insert(query: InsertQuery) -> Result<String, String> {
    let mut builder = QueryBuilder::insert(&query.table);

    builder = builder.into_columns(&query.columns.iter().map(|s| s.as_str()).collect::<Vec<_>>());

    for values in &query.values {
        builder = builder.values(&values.iter().map(|s| s.as_str()).collect::<Vec<_>>());
    }

    builder
        .build()
        .map_err(|e| format!("Failed to build query: {}", e))
}

#[tauri::command]
pub async fn db_build_update(query: UpdateQuery) -> Result<String, String> {
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

    // Store in database
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

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
/// not for display purposes.
#[tauri::command]
pub async fn db_get_stored_password(connection_id: String) -> Result<Option<String>, String> {
    use crate::core::mcp::config::decrypt_mcp_credential;

    if connection_id.trim().is_empty() {
        return Err("Connection ID cannot be empty".to_string());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_state_creation() {
        let state = DatabaseState::new();

        drop(state);
    }
}
