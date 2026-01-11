use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::database::{
    ConnectionConfig, ConnectionPool, DatabaseType, MySqlClient, PoolConfig, PostgresClient,
};
use crate::error::{Error, Result};

/// Query result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub rows: Vec<HashMap<String, JsonValue>>,
    pub rows_affected: u64,
    pub execution_time_ms: u128,
}

/// SQL Client for managing database connections and queries
pub struct SqlClient {
    pools: Arc<RwLock<HashMap<String, ConnectionPool>>>,
    postgres_client: PostgresClient,
    mysql_client: MySqlClient,
}

impl SqlClient {
    /// Create a new SQL client
    pub fn new() -> Self {
        Self {
            pools: Arc::new(RwLock::new(HashMap::new())),
            postgres_client: PostgresClient::new(),
            mysql_client: MySqlClient::new(),
        }
    }

    /// Create a connection pool
    pub async fn create_pool(
        &self,
        connection_id: &str,
        config: ConnectionConfig,
        pool_config: PoolConfig,
    ) -> Result<()> {
        tracing::info!("Creating connection pool: {}", connection_id);

        // Validate configuration
        config.validate()?;

        // For PostgreSQL, use the dedicated PostgresClient
        if config.db_type == DatabaseType::PostgreSQL {
            return self
                .postgres_client
                .create_pool(connection_id, config)
                .await;
        }

        // For MySQL, use the dedicated MySqlClient
        if config.db_type == DatabaseType::MySQL {
            return self.mysql_client.create_pool(connection_id, config).await;
        }

        // For other databases, use generic connection pool
        let pool = ConnectionPool::new(config, pool_config).await?;

        // Store the pool
        let mut pools = self.pools.write().await;
        pools.insert(connection_id.to_string(), pool);

        Ok(())
    }

    /// Get a connection pool
    async fn get_pool(&self, connection_id: &str) -> Result<ConnectionPool> {
        let pools = self.pools.read().await;
        pools
            .get(connection_id)
            .cloned()
            .ok_or_else(|| Error::Other(format!("Connection pool not found: {}", connection_id)))
    }

    /// Execute a raw SQL query
    pub async fn execute_query(&self, connection_id: &str, sql: &str) -> Result<QueryResult> {
        tracing::debug!("Executing query: {}", sql);

        // Check database type for specialized clients
        let pools = self.pools.read().await;
        let db_type = pools
            .get(connection_id)
            .map(|pool| pool.get_config().db_type.clone());
        drop(pools);

        // Check if it's in PostgreSQL client
        if db_type.as_ref() == Some(&DatabaseType::PostgreSQL)
            || self
                .postgres_client
                .list_pools()
                .await
                .contains(&connection_id.to_string())
        {
            return self.postgres_client.execute_query(connection_id, sql).await;
        }

        // Check if it's in MySQL client
        if db_type.as_ref() == Some(&DatabaseType::MySQL)
            || self
                .mysql_client
                .list_pools()
                .await
                .contains(&connection_id.to_string())
        {
            return self.mysql_client.execute_query(connection_id, sql).await;
        }

        // For non-PostgreSQL databases, use generic pool
        let start = std::time::Instant::now();
        let pool = self.get_pool(connection_id).await?;
        let config = pool.get_config();

        // Acquire connection from pool
        let conn_id = pool.acquire().await?;

        // Execute query based on database type
        let result = match config.db_type {
            DatabaseType::MySQL => self.execute_mysql_query(sql).await,
            DatabaseType::SQLite => self.execute_sqlite_query(sql).await,
            _ => Err(Error::Other(
                "Unsupported database type for SQL".to_string(),
            )),
        };

        // Release connection back to pool
        pool.release(&conn_id).await?;

        let execution_time_ms = start.elapsed().as_millis();

        match result {
            Ok(mut query_result) => {
                query_result.execution_time_ms = execution_time_ms;
                Ok(query_result)
            }
            Err(e) => Err(e),
        }
    }

    /// Execute a prepared statement
    pub async fn execute_prepared(
        &self,
        connection_id: &str,
        sql: &str,
        params: &[JsonValue],
    ) -> Result<QueryResult> {
        tracing::debug!(
            "Executing prepared statement: {} with {} params",
            sql,
            params.len()
        );

        // Check if this is a PostgreSQL connection
        let pools = self.pools.read().await;
        let is_postgres = if let Some(pool) = pools.get(connection_id) {
            pool.get_config().db_type == DatabaseType::PostgreSQL
        } else {
            // Not in generic pools, check if it's in postgres_client
            self.postgres_client
                .list_pools()
                .await
                .contains(&connection_id.to_string())
        };
        drop(pools);

        if is_postgres {
            return self
                .postgres_client
                .execute_prepared(connection_id, sql, params)
                .await;
        }

        // For non-PostgreSQL databases, use generic pool
        let start = std::time::Instant::now();
        let pool = self.get_pool(connection_id).await?;
        let config = pool.get_config();

        let conn_id = pool.acquire().await?;

        let result = match config.db_type {
            DatabaseType::MySQL => self.execute_mysql_prepared(sql, params).await,
            DatabaseType::SQLite => self.execute_sqlite_prepared(sql, params).await,
            _ => Err(Error::Other("Unsupported database type".to_string())),
        };

        pool.release(&conn_id).await?;

        let execution_time_ms = start.elapsed().as_millis();

        match result {
            Ok(mut query_result) => {
                query_result.execution_time_ms = execution_time_ms;
                Ok(query_result)
            }
            Err(e) => Err(e),
        }
    }

    /// Execute a batch of queries in a transaction
    pub async fn execute_batch(
        &self,
        connection_id: &str,
        queries: &[String],
    ) -> Result<Vec<QueryResult>> {
        tracing::info!("Executing batch of {} queries", queries.len());

        // Check if this is a PostgreSQL connection
        let pools = self.pools.read().await;
        let is_postgres = if let Some(pool) = pools.get(connection_id) {
            pool.get_config().db_type == DatabaseType::PostgreSQL
        } else {
            // Not in generic pools, check if it's in postgres_client
            self.postgres_client
                .list_pools()
                .await
                .contains(&connection_id.to_string())
        };
        drop(pools);

        if is_postgres {
            return self
                .postgres_client
                .execute_batch(connection_id, queries)
                .await;
        }

        // For non-PostgreSQL databases, use generic pool (simplified without transactions)
        let pool = self.get_pool(connection_id).await?;
        let conn_id = pool.acquire().await?;

        let mut results = Vec::new();

        for query in queries {
            let result = self.execute_query(connection_id, query).await?;
            results.push(result);
        }

        pool.release(&conn_id).await?;

        Ok(results)
    }

    /// Close a connection pool
    pub async fn close_pool(&self, connection_id: &str) -> Result<()> {
        tracing::info!("Closing connection pool: {}", connection_id);

        // Try to close from postgres_client first
        if self
            .postgres_client
            .list_pools()
            .await
            .contains(&connection_id.to_string())
        {
            return self.postgres_client.close_pool(connection_id).await;
        }

        // Otherwise, close from generic pools
        let mut pools = self.pools.write().await;

        if let Some(pool) = pools.remove(connection_id) {
            pool.close_all().await?;
            Ok(())
        } else {
            Err(Error::Other(format!(
                "Connection pool not found: {}",
                connection_id
            )))
        }
    }

    /// List all active connection pools
    pub async fn list_pools(&self) -> Vec<String> {
        let pools = self.pools.read().await;
        let mut all_pools: Vec<String> = pools.keys().cloned().collect();

        // Add PostgreSQL pools
        all_pools.extend(self.postgres_client.list_pools().await);

        all_pools
    }

    /// Get pool statistics
    pub async fn get_pool_stats(
        &self,
        connection_id: &str,
    ) -> Result<crate::database::pool::PoolStats> {
        let pool = self.get_pool(connection_id).await?;
        Ok(pool.get_stats().await)
    }

    // MySQL-specific operations

    /// Test MySQL connection health
    pub async fn mysql_test_connection(&self, connection_id: &str) -> Result<bool> {
        self.mysql_client.test_connection(connection_id).await
    }

    /// List all tables in MySQL database
    pub async fn mysql_list_tables(&self, connection_id: &str) -> Result<Vec<String>> {
        self.mysql_client.list_tables(connection_id).await
    }

    /// Describe MySQL table schema
    pub async fn mysql_describe_table(
        &self,
        connection_id: &str,
        table_name: &str,
    ) -> Result<Vec<HashMap<String, JsonValue>>> {
        self.mysql_client
            .describe_table(connection_id, table_name)
            .await
    }

    /// List MySQL table indexes
    pub async fn mysql_list_indexes(
        &self,
        connection_id: &str,
        table_name: &str,
    ) -> Result<Vec<HashMap<String, JsonValue>>> {
        self.mysql_client
            .list_indexes(connection_id, table_name)
            .await
    }

    /// Call MySQL stored procedure
    pub async fn mysql_call_procedure(
        &self,
        connection_id: &str,
        procedure_name: &str,
        params: &[JsonValue],
    ) -> Result<Vec<QueryResult>> {
        self.mysql_client
            .call_procedure(connection_id, procedure_name, params)
            .await
    }

    /// Bulk insert rows into MySQL table
    pub async fn mysql_bulk_insert(
        &self,
        connection_id: &str,
        table_name: &str,
        columns: &[&str],
        rows: &[Vec<JsonValue>],
    ) -> Result<u64> {
        self.mysql_client
            .bulk_insert(connection_id, table_name, columns, rows)
            .await
    }

    /// Stream large MySQL query results
    pub async fn mysql_stream_query(
        &self,
        connection_id: &str,
        sql: &str,
        batch_size: usize,
    ) -> Result<Vec<QueryResult>> {
        self.mysql_client
            .stream_query(connection_id, sql, batch_size)
            .await
    }

    // Database-specific query execution methods
    // PostgreSQL is handled by postgres_client, these are for MySQL and SQLite

    async fn execute_mysql_query(&self, _sql: &str) -> Result<QueryResult> {
        // TODO: Implement with mysql_async crate
        tracing::warn!("MySQL query execution not yet implemented");
        Ok(QueryResult {
            rows: Vec::new(),
            rows_affected: 0,
            execution_time_ms: 0,
        })
    }

    async fn execute_sqlite_query(&self, sql: &str) -> Result<QueryResult> {
        // Using rusqlite (already available in project)
        tracing::debug!("Executing SQLite query: {}", sql);

        // Simplified placeholder - would use actual rusqlite connection
        Ok(QueryResult {
            rows: Vec::new(),
            rows_affected: 0,
            execution_time_ms: 0,
        })
    }

    async fn execute_mysql_prepared(
        &self,
        _sql: &str,
        _params: &[JsonValue],
    ) -> Result<QueryResult> {
        tracing::warn!("MySQL prepared statement not yet implemented");
        Ok(QueryResult {
            rows: Vec::new(),
            rows_affected: 0,
            execution_time_ms: 0,
        })
    }

    async fn execute_sqlite_prepared(
        &self,
        _sql: &str,
        _params: &[JsonValue],
    ) -> Result<QueryResult> {
        tracing::debug!("Executing SQLite prepared statement");
        Ok(QueryResult {
            rows: Vec::new(),
            rows_affected: 0,
            execution_time_ms: 0,
        })
    }
}

impl Default for SqlClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sql_client_creation() {
        let client = SqlClient::new();
        let pools = client.list_pools().await;
        assert_eq!(pools.len(), 0);
    }

    #[tokio::test]
    async fn test_create_sqlite_pool() {
        let client = SqlClient::new();
        let config = ConnectionConfig::sqlite(":memory:");
        let pool_config = PoolConfig::default();

        let result = client.create_pool("test_pool", config, pool_config).await;
        assert!(result.is_ok());

        let pools = client.list_pools().await;
        assert_eq!(pools.len(), 1);
        assert!(pools.contains(&"test_pool".to_string()));
    }

    #[tokio::test]
    async fn test_close_pool() {
        let client = SqlClient::new();
        let config = ConnectionConfig::sqlite(":memory:");
        let pool_config = PoolConfig::default();

        client
            .create_pool("test_pool", config, pool_config)
            .await
            .unwrap();
        client.close_pool("test_pool").await.unwrap();

        let pools = client.list_pools().await;
        assert_eq!(pools.len(), 0);
    }
}
