use std::collections::HashMap;
use tauri::State;
use tokio::sync::Mutex;

use crate::database::{
    ConnectionConfig, DatabaseType, DeleteQuery, InsertQuery, MongoClient, PoolConfig,
    QueryBuilder, RedisClient, SelectQuery, SqlClient, UpdateQuery,
};

/// State for managing database clients
pub struct DatabaseState {
    pub sql_client: SqlClient,
    pub mongo_client: MongoClient,
    pub redis_client: RedisClient,
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

// SQL Commands

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
    let state = state.lock().await;

    state
        .sql_client
        .execute_query(&connection_id, &sql)
        .await
        .map(|result| serde_json::to_value(result).unwrap())
        .map_err(|e| format!("Query execution failed: {}", e))
}

#[tauri::command]
pub async fn db_execute_prepared(
    connection_id: String,
    sql: String,
    params: Vec<serde_json::Value>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<serde_json::Value, String> {
    let state = state.lock().await;

    state
        .sql_client
        .execute_prepared(&connection_id, &sql, &params)
        .await
        .map(|result| serde_json::to_value(result).unwrap())
        .map_err(|e| format!("Prepared statement execution failed: {}", e))
}

#[tauri::command]
pub async fn db_execute_batch(
    connection_id: String,
    queries: Vec<String>,
    state: State<'_, Mutex<DatabaseState>>,
) -> Result<Vec<serde_json::Value>, String> {
    let state = state.lock().await;

    state
        .sql_client
        .execute_batch(&connection_id, &queries)
        .await
        .map(|results| {
            results
                .into_iter()
                .map(|r| serde_json::to_value(r).unwrap())
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

    state
        .sql_client
        .get_pool_stats(&connection_id)
        .await
        .map(|stats| serde_json::to_value(stats).unwrap())
        .map_err(|e| format!("Failed to get pool stats: {}", e))
}

// Query Builder Commands

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

// MongoDB Commands

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

    state
        .mongo_client
        .find(&connection_id, &collection, &filter, limit)
        .await
        .map(|result| serde_json::to_value(result).unwrap())
        .map_err(|e| format!("MongoDB find failed: {}", e))
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

    state
        .mongo_client
        .update_many(&connection_id, &collection, &filter, &update)
        .await
        .map(|result| serde_json::to_value(result).unwrap())
        .map_err(|e| format!("MongoDB updateMany failed: {}", e))
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

// Redis Commands

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_state_creation() {
        let state = DatabaseState::new();
        // Just verify it compiles and creates
        drop(state);
    }
}
