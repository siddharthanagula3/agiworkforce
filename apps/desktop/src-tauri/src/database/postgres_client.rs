use deadpool_postgres::{Config, ManagerConfig, Pool, RecyclingMethod, Runtime};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_postgres::{types::ToSql, NoTls, Row};

use crate::database::{ConnectionConfig, QueryResult};
use crate::error::{Error, Result};

/// PostgreSQL client with connection pooling
pub struct PostgresClient {
    pools: Arc<RwLock<HashMap<String, Pool>>>,
}

impl PostgresClient {
    /// Create a new PostgreSQL client
    pub fn new() -> Self {
        Self {
            pools: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a connection pool
    pub async fn create_pool(&self, connection_id: &str, config: ConnectionConfig) -> Result<()> {
        tracing::info!("Creating PostgreSQL pool: {}", connection_id);

        // Build connection string
        let _conn_str = config.build_connection_string()?;

        // Parse connection string into deadpool config
        let mut pg_config = Config::new();

        // Parse the connection string manually
        if let Some(host) = config.host.as_ref() {
            pg_config.host = Some(host.clone());
        }
        if let Some(port) = config.port {
            pg_config.port = Some(port);
        }
        if let Some(user) = config.username.as_ref() {
            pg_config.user = Some(user.clone());
        }
        if let Some(password) = config.password.as_ref() {
            pg_config.password = Some(password.clone());
        }
        if let Some(dbname) = config.database.as_ref() {
            pg_config.dbname = Some(dbname.clone());
        }

        pg_config.manager = Some(ManagerConfig {
            recycling_method: RecyclingMethod::Fast,
        });

        // Create the pool
        let pool = pg_config
            .create_pool(Some(Runtime::Tokio1), NoTls)
            .map_err(|e| Error::Other(format!("Failed to create PostgreSQL pool: {}", e)))?;

        // Test the connection
        let client = pool
            .get()
            .await
            .map_err(|e| Error::Other(format!("Failed to get connection: {}", e)))?;

        client
            .query("SELECT 1", &[])
            .await
            .map_err(|e| Error::Other(format!("Connection test failed: {}", e)))?;

        tracing::info!("PostgreSQL connection test successful");

        // Store the pool
        let mut pools = self.pools.write().await;
        pools.insert(connection_id.to_string(), pool);

        Ok(())
    }

    /// Get a pool by connection ID
    async fn get_pool(&self, connection_id: &str) -> Result<Pool> {
        let pools = self.pools.read().await;
        pools
            .get(connection_id)
            .cloned()
            .ok_or_else(|| Error::Other(format!("Pool not found: {}", connection_id)))
    }

    /// Execute a query
    pub async fn execute_query(&self, connection_id: &str, sql: &str) -> Result<QueryResult> {
        let start = std::time::Instant::now();

        tracing::debug!("PostgreSQL query: {}", sql);

        let pool = self.get_pool(connection_id).await?;
        let client = pool
            .get()
            .await
            .map_err(|e| Error::Other(format!("Failed to get connection: {}", e)))?;

        let rows = client
            .query(sql, &[])
            .await
            .map_err(|e| Error::Other(format!("Query failed: {}", e)))?;

        let result = Self::rows_to_query_result(rows, start.elapsed().as_millis())?;

        tracing::debug!(
            "Query returned {} rows in {}ms",
            result.rows.len(),
            result.execution_time_ms
        );

        Ok(result)
    }

    /// Execute a prepared statement
    pub async fn execute_prepared(
        &self,
        connection_id: &str,
        sql: &str,
        params: &[JsonValue],
    ) -> Result<QueryResult> {
        let start = std::time::Instant::now();

        tracing::debug!("PostgreSQL prepared: {} with {} params", sql, params.len());

        let pool = self.get_pool(connection_id).await?;
        let client = pool
            .get()
            .await
            .map_err(|e| Error::Other(format!("Failed to get connection: {}", e)))?;

        // Convert JsonValue params to ToSql
        let pg_params = Self::json_params_to_sql(params)?;
        let param_refs: Vec<&(dyn ToSql + Sync)> = pg_params
            .iter()
            .map(|p| p.as_ref() as &(dyn ToSql + Sync))
            .collect();

        let rows = client
            .query(sql, &param_refs)
            .await
            .map_err(|e| Error::Other(format!("Prepared statement failed: {}", e)))?;

        let result = Self::rows_to_query_result(rows, start.elapsed().as_millis())?;

        tracing::debug!(
            "Prepared statement returned {} rows in {}ms",
            result.rows.len(),
            result.execution_time_ms
        );

        Ok(result)
    }

    /// Execute a batch of queries in a transaction
    pub async fn execute_batch(
        &self,
        connection_id: &str,
        queries: &[String],
    ) -> Result<Vec<QueryResult>> {
        tracing::info!("Executing batch of {} queries", queries.len());

        let pool = self.get_pool(connection_id).await?;
        let mut client = pool
            .get()
            .await
            .map_err(|e| Error::Other(format!("Failed to get connection: {}", e)))?;

        // Start transaction
        let transaction = client
            .transaction()
            .await
            .map_err(|e| Error::Other(format!("Failed to start transaction: {}", e)))?;

        let mut results = Vec::new();

        for query in queries {
            let start = std::time::Instant::now();

            let rows = transaction
                .query(query, &[])
                .await
                .map_err(|e| Error::Other(format!("Query failed in transaction: {}", e)))?;

            let result = Self::rows_to_query_result(rows, start.elapsed().as_millis())?;
            results.push(result);
        }

        // Commit transaction
        transaction
            .commit()
            .await
            .map_err(|e| Error::Other(format!("Failed to commit transaction: {}", e)))?;

        tracing::info!("Batch execution completed successfully");

        Ok(results)
    }

    /// Close a connection pool
    pub async fn close_pool(&self, connection_id: &str) -> Result<()> {
        tracing::info!("Closing PostgreSQL pool: {}", connection_id);

        let mut pools = self.pools.write().await;

        if pools.remove(connection_id).is_some() {
            Ok(())
        } else {
            Err(Error::Other(format!("Pool not found: {}", connection_id)))
        }
    }

    /// List all pools
    pub async fn list_pools(&self) -> Vec<String> {
        let pools = self.pools.read().await;
        pools.keys().cloned().collect()
    }

    /// Convert PostgreSQL rows to QueryResult
    fn rows_to_query_result(rows: Vec<Row>, execution_time_ms: u128) -> Result<QueryResult> {
        let mut result_rows = Vec::new();

        for row in &rows {
            let mut result_row = HashMap::new();

            for (idx, column) in row.columns().iter().enumerate() {
                let column_name = column.name().to_string();
                let value = Self::row_value_to_json(row, idx)?;
                result_row.insert(column_name, value);
            }

            result_rows.push(result_row);
        }

        Ok(QueryResult {
            rows: result_rows,
            rows_affected: rows.len() as u64,
            execution_time_ms,
        })
    }

    /// Convert a row value to JSON
    fn row_value_to_json(row: &Row, idx: usize) -> Result<JsonValue> {
        use tokio_postgres::types::Type;

        let column = &row.columns()[idx];
        let col_type = column.type_();

        // Handle NULL
        if row
            .try_get::<_, Option<String>>(idx)
            .ok()
            .flatten()
            .is_none()
        {
            return Ok(JsonValue::Null);
        }

        match *col_type {
            Type::BOOL => {
                let val: bool = row.get(idx);
                Ok(JsonValue::Bool(val))
            }
            Type::INT2 | Type::INT4 => {
                let val: i32 = row.get(idx);
                Ok(JsonValue::Number(val.into()))
            }
            Type::INT8 => {
                let val: i64 = row.get(idx);
                Ok(JsonValue::Number(val.into()))
            }
            Type::FLOAT4 => {
                let val: f32 = row.get(idx);
                Ok(serde_json::Number::from_f64(val as f64)
                    .map(JsonValue::Number)
                    .unwrap_or(JsonValue::Null))
            }
            Type::FLOAT8 => {
                let val: f64 = row.get(idx);
                Ok(serde_json::Number::from_f64(val)
                    .map(JsonValue::Number)
                    .unwrap_or(JsonValue::Null))
            }
            Type::TEXT | Type::VARCHAR | Type::BPCHAR | Type::NAME => {
                let val: String = row.get(idx);
                Ok(JsonValue::String(val))
            }
            Type::JSON | Type::JSONB => {
                let val: JsonValue = row.get(idx);
                Ok(val)
            }
            Type::TIMESTAMP => {
                let val: chrono::NaiveDateTime = row.get(idx);
                Ok(JsonValue::String(val.to_string()))
            }
            Type::TIMESTAMPTZ => {
                let val: chrono::DateTime<chrono::Utc> = row.get(idx);
                Ok(JsonValue::String(val.to_rfc3339()))
            }
            Type::UUID => {
                let val: uuid::Uuid = row.get(idx);
                Ok(JsonValue::String(val.to_string()))
            }
            _ => {
                // Fallback: try to get as string
                match row.try_get::<_, String>(idx) {
                    Ok(val) => Ok(JsonValue::String(val)),
                    Err(_) => Ok(JsonValue::Null),
                }
            }
        }
    }

    /// Convert JSON params to PostgreSQL ToSql types
    fn json_params_to_sql(params: &[JsonValue]) -> Result<Vec<Box<dyn ToSql + Sync + Send>>> {
        let mut result: Vec<Box<dyn ToSql + Sync + Send>> = Vec::new();

        for param in params {
            match param {
                JsonValue::Null => result.push(Box::new(None::<String>)),
                JsonValue::Bool(b) => result.push(Box::new(*b)),
                JsonValue::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        result.push(Box::new(i));
                    } else if let Some(f) = n.as_f64() {
                        result.push(Box::new(f));
                    } else {
                        return Err(Error::Other("Invalid number parameter".to_string()));
                    }
                }
                JsonValue::String(s) => result.push(Box::new(s.clone())),
                JsonValue::Array(_) | JsonValue::Object(_) => {
                    result.push(Box::new(param.clone()));
                }
            }
        }

        Ok(result)
    }
}

impl Default for PostgresClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_postgres_client_creation() {
        let client = PostgresClient::new();
        let pools = client.list_pools().await;
        assert_eq!(pools.len(), 0);
    }

    // Integration tests require a running PostgreSQL instance
    // Run with: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres

    #[tokio::test]
    #[ignore] // Requires PostgreSQL instance
    async fn test_create_pool() {
        let client = PostgresClient::new();
        let config =
            ConnectionConfig::postgres("localhost", 5432, "postgres", "postgres", "password");

        let result = client.create_pool("test", config).await;
        assert!(result.is_ok());

        let pools = client.list_pools().await;
        assert_eq!(pools.len(), 1);
    }

    #[tokio::test]
    #[ignore] // Requires PostgreSQL instance
    async fn test_execute_query() {
        let client = PostgresClient::new();
        let config =
            ConnectionConfig::postgres("localhost", 5432, "postgres", "postgres", "password");

        client.create_pool("test", config).await.unwrap();

        let result = client
            .execute_query("test", "SELECT 1 as num, 'hello' as text")
            .await;
        assert!(result.is_ok());

        let query_result = result.unwrap();
        assert_eq!(query_result.rows.len(), 1);
        assert_eq!(
            query_result.rows[0].get("num"),
            Some(&JsonValue::Number(1.into()))
        );
    }
}
