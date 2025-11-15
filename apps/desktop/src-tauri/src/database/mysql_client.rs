use mysql_async::{prelude::*, Opts, OptsBuilder, Pool, PoolConstraints, PoolOpts, Row, Value};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::database::{ConnectionConfig, QueryResult};
use crate::error::{Error, Result};

/// MySQL client with connection pooling
pub struct MySqlClient {
    pools: Arc<RwLock<HashMap<String, Pool>>>,
}

impl MySqlClient {
    /// Create a new MySQL client
    pub fn new() -> Self {
        Self {
            pools: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a connection pool
    pub async fn create_pool(&self, connection_id: &str, config: ConnectionConfig) -> Result<()> {
        tracing::info!("Creating MySQL pool: {}", connection_id);

        // Build connection string
        let conn_str = config.build_connection_string()?;

        // Parse connection string into MySQL Opts
        let opts = Opts::from_url(&conn_str)
            .map_err(|e| Error::Other(format!("Failed to parse MySQL connection string: {}", e)))?;

        // Configure pool constraints (5 min, 100 max connections)
        let pool_opts = PoolOpts::default().with_constraints(
            PoolConstraints::new(5, 100).unwrap_or_else(|_| {
                PoolConstraints::new(1, 10).expect("Failed to create fallback pool constraints")
            }),
        );

        // Create the pool with connection string and pool options
        let pool = Pool::new(OptsBuilder::from_opts(opts).pool_opts(pool_opts));

        // Test the connection
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        conn.query_drop("SELECT 1")
            .await
            .map_err(|e| Error::Other(format!("MySQL connection test failed: {}", e)))?;

        tracing::info!("MySQL connection test successful");

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

        tracing::debug!("MySQL query: {}", sql);

        let pool = self.get_pool(connection_id).await?;
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        // Execute query and fetch results
        let rows: Vec<Row> = conn
            .query(sql)
            .await
            .map_err(|e| Error::Other(format!("MySQL query failed: {}", e)))?;

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

        tracing::debug!("MySQL prepared: {} with {} params", sql, params.len());

        let pool = self.get_pool(connection_id).await?;
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        // Convert JsonValue params to MySQL Value
        let mysql_params = Self::json_params_to_mysql(params)?;

        // Execute prepared statement
        let rows: Vec<Row> = conn
            .exec(sql, mysql_params)
            .await
            .map_err(|e| Error::Other(format!("MySQL prepared statement failed: {}", e)))?;

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
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        // Start transaction
        let mut transaction = conn
            .start_transaction(Default::default())
            .await
            .map_err(|e| Error::Other(format!("Failed to start MySQL transaction: {}", e)))?;

        let mut results = Vec::new();

        for query in queries {
            let start = std::time::Instant::now();

            let rows: Vec<Row> = transaction
                .query(query)
                .await
                .map_err(|e| Error::Other(format!("Query failed in MySQL transaction: {}", e)))?;

            let result = Self::rows_to_query_result(rows, start.elapsed().as_millis())?;
            results.push(result);
        }

        // Commit transaction
        transaction
            .commit()
            .await
            .map_err(|e| Error::Other(format!("Failed to commit MySQL transaction: {}", e)))?;

        tracing::info!("Batch execution completed successfully");

        Ok(results)
    }

    /// Close a connection pool
    pub async fn close_pool(&self, connection_id: &str) -> Result<()> {
        tracing::info!("Closing MySQL pool: {}", connection_id);

        let mut pools = self.pools.write().await;

        if let Some(pool) = pools.remove(connection_id) {
            // Disconnect the pool
            pool.disconnect()
                .await
                .map_err(|e| Error::Other(format!("Failed to disconnect MySQL pool: {}", e)))?;
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

    /// Test connection health
    pub async fn test_connection(&self, connection_id: &str) -> Result<bool> {
        let pool = self.get_pool(connection_id).await?;

        match pool.get_conn().await {
            Ok(mut conn) => match conn.query_drop("SELECT 1").await {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            },
            Err(_) => Ok(false),
        }
    }

    /// Get list of all tables in the database
    pub async fn list_tables(&self, connection_id: &str) -> Result<Vec<String>> {
        let pool = self.get_pool(connection_id).await?;
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        let rows: Vec<Row> = conn
            .query("SHOW TABLES")
            .await
            .map_err(|e| Error::Other(format!("Failed to list tables: {}", e)))?;

        let mut tables = Vec::new();
        for row in rows {
            if let Some(Value::Bytes(ref bytes)) = row.as_ref(0) {
                tables.push(String::from_utf8_lossy(bytes).to_string());
            }
        }

        Ok(tables)
    }

    /// Get table schema (columns and their types)
    pub async fn describe_table(
        &self,
        connection_id: &str,
        table_name: &str,
    ) -> Result<Vec<HashMap<String, JsonValue>>> {
        let pool = self.get_pool(connection_id).await?;
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        let query = format!("DESCRIBE `{}`", table_name.replace('`', "``"));
        let rows: Vec<Row> = conn
            .query(&query)
            .await
            .map_err(|e| Error::Other(format!("Failed to describe table: {}", e)))?;

        let mut columns = Vec::new();
        for row in rows {
            let mut column = HashMap::new();

            if let Some(Value::Bytes(ref bytes)) = row.as_ref(0) {
                column.insert(
                    "Field".to_string(),
                    JsonValue::String(String::from_utf8_lossy(bytes).to_string()),
                );
            }
            if let Some(Value::Bytes(ref bytes)) = row.as_ref(1) {
                column.insert(
                    "Type".to_string(),
                    JsonValue::String(String::from_utf8_lossy(bytes).to_string()),
                );
            }
            if let Some(Value::Bytes(ref bytes)) = row.as_ref(2) {
                column.insert(
                    "Null".to_string(),
                    JsonValue::String(String::from_utf8_lossy(bytes).to_string()),
                );
            }
            if let Some(Value::Bytes(ref bytes)) = row.as_ref(3) {
                column.insert(
                    "Key".to_string(),
                    JsonValue::String(String::from_utf8_lossy(bytes).to_string()),
                );
            }
            if let Some(value) = row.as_ref(4) {
                match value {
                    Value::Bytes(ref bytes) => {
                        column.insert(
                            "Default".to_string(),
                            JsonValue::String(String::from_utf8_lossy(bytes).to_string()),
                        );
                    }
                    Value::NULL => {
                        column.insert("Default".to_string(), JsonValue::Null);
                    }
                    _ => {}
                }
            }
            if let Some(Value::Bytes(ref bytes)) = row.as_ref(5) {
                column.insert(
                    "Extra".to_string(),
                    JsonValue::String(String::from_utf8_lossy(bytes).to_string()),
                );
            }

            columns.push(column);
        }

        Ok(columns)
    }

    /// Get table indexes
    pub async fn list_indexes(
        &self,
        connection_id: &str,
        table_name: &str,
    ) -> Result<Vec<HashMap<String, JsonValue>>> {
        let pool = self.get_pool(connection_id).await?;
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        let query = format!("SHOW INDEX FROM `{}`", table_name.replace('`', "``"));
        let rows: Vec<Row> = conn
            .query(&query)
            .await
            .map_err(|e| Error::Other(format!("Failed to list indexes: {}", e)))?;

        let result = Self::rows_to_query_result(rows, 0)?;
        Ok(result.rows)
    }

    /// Execute a stored procedure
    pub async fn call_procedure(
        &self,
        connection_id: &str,
        procedure_name: &str,
        params: &[JsonValue],
    ) -> Result<Vec<QueryResult>> {
        let pool = self.get_pool(connection_id).await?;
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        // Convert JSON params to MySQL Value
        let mysql_params = Self::json_params_to_mysql(params)?;

        // Build CALL statement with placeholders
        let placeholders: Vec<&str> = params.iter().map(|_| "?").collect();
        let call_sql = format!("CALL {}({})", procedure_name, placeholders.join(", "));

        tracing::debug!("Calling procedure: {}", call_sql);

        // Execute the stored procedure
        let query_result: Vec<Vec<Row>> = conn
            .exec(&call_sql, mysql_params)
            .await
            .map_err(|e| Error::Other(format!("Failed to call procedure: {}", e)))?;

        // Convert all result sets
        let mut results = Vec::new();
        for rows in query_result {
            let result = Self::rows_to_query_result(rows, 0)?;
            results.push(result);
        }

        Ok(results)
    }

    /// Bulk insert multiple rows efficiently
    pub async fn bulk_insert(
        &self,
        connection_id: &str,
        table_name: &str,
        columns: &[&str],
        rows: &[Vec<JsonValue>],
    ) -> Result<u64> {
        if rows.is_empty() {
            return Ok(0);
        }

        let pool = self.get_pool(connection_id).await?;
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        // Build bulk INSERT statement
        let column_list = columns.join("`, `");
        let placeholders: Vec<String> = rows
            .iter()
            .map(|row| {
                let params: Vec<&str> = row.iter().map(|_| "?").collect();
                format!("({})", params.join(", "))
            })
            .collect();

        let sql = format!(
            "INSERT INTO `{}` (`{}`) VALUES {}",
            table_name.replace('`', "``"),
            column_list,
            placeholders.join(", ")
        );

        // Flatten all row values into a single parameter list
        let mut all_params = Vec::new();
        for row in rows {
            let mysql_params = Self::json_params_to_mysql(row)?;
            all_params.extend(mysql_params);
        }

        tracing::debug!("Bulk insert: {} rows into {}", rows.len(), table_name);

        // Execute bulk insert
        let result = conn
            .exec_drop(&sql, all_params)
            .await
            .map_err(|e| Error::Other(format!("Bulk insert failed: {}", e)))?;

        // Get affected rows
        Ok(conn.affected_rows())
    }

    /// Stream large query results
    pub async fn stream_query(
        &self,
        connection_id: &str,
        sql: &str,
        batch_size: usize,
    ) -> Result<Vec<QueryResult>> {
        let pool = self.get_pool(connection_id).await?;
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        tracing::debug!("Streaming query with batch size {}: {}", batch_size, sql);

        // Execute query
        let rows: Vec<Row> = conn
            .query(sql)
            .await
            .map_err(|e| Error::Other(format!("MySQL query failed: {}", e)))?;

        // Split results into batches
        let mut results = Vec::new();
        for chunk in rows.chunks(batch_size) {
            let result = Self::rows_to_query_result(chunk.to_vec(), 0)?;
            results.push(result);
        }

        Ok(results)
    }

    /// Convert MySQL rows to QueryResult
    fn rows_to_query_result(rows: Vec<Row>, execution_time_ms: u128) -> Result<QueryResult> {
        let mut result_rows = Vec::new();

        for row in rows {
            let mut result_row = HashMap::new();

            // Get column names and values
            let columns = row.columns_ref();

            for (idx, column) in columns.iter().enumerate() {
                let column_name = column.name_str().to_string();
                let value = Self::row_value_to_json(&row, idx)?;
                result_row.insert(column_name, value);
            }

            result_rows.push(result_row);
        }

        let rows_count = result_rows.len() as u64;
        Ok(QueryResult {
            rows: result_rows,
            rows_affected: rows_count,
            execution_time_ms,
        })
    }

    /// Convert a row value to JSON
    fn row_value_to_json(row: &Row, idx: usize) -> Result<JsonValue> {
        use mysql_async::consts::ColumnType;

        let columns = row.columns_ref();
        let column = &columns[idx];
        let value: Value = row
            .as_ref(idx)
            .ok_or_else(|| Error::Other("Column index out of bounds".to_string()))?
            .clone();

        // Handle NULL
        if value == Value::NULL {
            return Ok(JsonValue::Null);
        }

        // Convert based on column type
        match column.column_type() {
            ColumnType::MYSQL_TYPE_TINY
            | ColumnType::MYSQL_TYPE_SHORT
            | ColumnType::MYSQL_TYPE_LONG
            | ColumnType::MYSQL_TYPE_INT24 => match value {
                Value::Int(i) => Ok(JsonValue::Number(i.into())),
                Value::UInt(u) => Ok(JsonValue::Number(serde_json::Number::from(u as i64))),
                _ => Ok(JsonValue::Null),
            },
            ColumnType::MYSQL_TYPE_LONGLONG => {
                match value {
                    Value::Int(i) => Ok(JsonValue::Number(i.into())),
                    Value::UInt(u) => {
                        // Try to fit u64 into i64, otherwise convert to string
                        if u <= i64::MAX as u64 {
                            Ok(JsonValue::Number((u as i64).into()))
                        } else {
                            Ok(JsonValue::String(u.to_string()))
                        }
                    }
                    _ => Ok(JsonValue::Null),
                }
            }
            ColumnType::MYSQL_TYPE_FLOAT | ColumnType::MYSQL_TYPE_DOUBLE => match value {
                Value::Float(f) => Ok(serde_json::Number::from_f64(f as f64)
                    .map(JsonValue::Number)
                    .unwrap_or(JsonValue::Null)),
                Value::Double(d) => Ok(serde_json::Number::from_f64(d)
                    .map(JsonValue::Number)
                    .unwrap_or(JsonValue::Null)),
                _ => Ok(JsonValue::Null),
            },
            ColumnType::MYSQL_TYPE_DECIMAL | ColumnType::MYSQL_TYPE_NEWDECIMAL => {
                match value {
                    Value::Bytes(ref bytes) => {
                        let s = String::from_utf8_lossy(bytes);
                        // Try to parse as number
                        if let Ok(n) = s.parse::<i64>() {
                            Ok(JsonValue::Number(n.into()))
                        } else if let Ok(f) = s.parse::<f64>() {
                            Ok(serde_json::Number::from_f64(f)
                                .map(JsonValue::Number)
                                .unwrap_or(JsonValue::Null))
                        } else {
                            Ok(JsonValue::String(s.to_string()))
                        }
                    }
                    _ => Ok(JsonValue::Null),
                }
            }
            ColumnType::MYSQL_TYPE_STRING
            | ColumnType::MYSQL_TYPE_VAR_STRING
            | ColumnType::MYSQL_TYPE_VARCHAR
            | ColumnType::MYSQL_TYPE_BLOB
            | ColumnType::MYSQL_TYPE_TINY_BLOB
            | ColumnType::MYSQL_TYPE_MEDIUM_BLOB
            | ColumnType::MYSQL_TYPE_LONG_BLOB => match value {
                Value::Bytes(ref bytes) => {
                    let s = String::from_utf8_lossy(bytes).to_string();
                    Ok(JsonValue::String(s))
                }
                _ => Ok(JsonValue::Null),
            },
            ColumnType::MYSQL_TYPE_DATE
            | ColumnType::MYSQL_TYPE_DATETIME
            | ColumnType::MYSQL_TYPE_TIMESTAMP => match value {
                Value::Date(year, month, day, hour, minute, second, _) => {
                    let datetime_str = format!(
                        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
                        year, month, day, hour, minute, second
                    );
                    Ok(JsonValue::String(datetime_str))
                }
                Value::Bytes(ref bytes) => Ok(JsonValue::String(
                    String::from_utf8_lossy(bytes).to_string(),
                )),
                _ => Ok(JsonValue::Null),
            },
            ColumnType::MYSQL_TYPE_TIME => match value {
                Value::Time(is_neg, days, hours, minutes, seconds, _) => {
                    let total_hours = days * 24 + hours as u32;
                    let time_str = if is_neg {
                        format!("-{:02}:{:02}:{:02}", total_hours, minutes, seconds)
                    } else {
                        format!("{:02}:{:02}:{:02}", total_hours, minutes, seconds)
                    };
                    Ok(JsonValue::String(time_str))
                }
                _ => Ok(JsonValue::Null),
            },
            ColumnType::MYSQL_TYPE_YEAR => match value {
                Value::Int(i) => Ok(JsonValue::Number(i.into())),
                Value::UInt(u) => Ok(JsonValue::Number((u as i64).into())),
                _ => Ok(JsonValue::Null),
            },
            ColumnType::MYSQL_TYPE_JSON => {
                match value {
                    Value::Bytes(ref bytes) => {
                        let s = String::from_utf8_lossy(bytes);
                        // Try to parse as JSON
                        match serde_json::from_str::<JsonValue>(&s) {
                            Ok(json_val) => Ok(json_val),
                            Err(_) => Ok(JsonValue::String(s.to_string())),
                        }
                    }
                    _ => Ok(JsonValue::Null),
                }
            }
            ColumnType::MYSQL_TYPE_BIT => {
                match value {
                    Value::Bytes(ref bytes) => {
                        // Convert bytes to integer
                        let mut num: u64 = 0;
                        for &byte in bytes.iter() {
                            num = (num << 8) | byte as u64;
                        }
                        Ok(JsonValue::Number((num as i64).into()))
                    }
                    _ => Ok(JsonValue::Null),
                }
            }
            _ => {
                // Fallback: try to convert to string
                match value {
                    Value::Bytes(ref bytes) => Ok(JsonValue::String(
                        String::from_utf8_lossy(bytes).to_string(),
                    )),
                    Value::Int(i) => Ok(JsonValue::Number(i.into())),
                    Value::UInt(u) => Ok(JsonValue::Number((u as i64).into())),
                    Value::Float(f) => Ok(serde_json::Number::from_f64(f as f64)
                        .map(JsonValue::Number)
                        .unwrap_or(JsonValue::Null)),
                    Value::Double(d) => Ok(serde_json::Number::from_f64(d)
                        .map(JsonValue::Number)
                        .unwrap_or(JsonValue::Null)),
                    _ => Ok(JsonValue::Null),
                }
            }
        }
    }

    /// Convert JSON params to MySQL Value types
    fn json_params_to_mysql(params: &[JsonValue]) -> Result<Vec<Value>> {
        let mut result: Vec<Value> = Vec::new();

        for param in params {
            match param {
                JsonValue::Null => result.push(Value::NULL),
                JsonValue::Bool(b) => {
                    // MySQL doesn't have native boolean, use TINYINT (0/1)
                    result.push(Value::Int(if *b { 1 } else { 0 }));
                }
                JsonValue::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        result.push(Value::Int(i));
                    } else if let Some(u) = n.as_u64() {
                        result.push(Value::UInt(u));
                    } else if let Some(f) = n.as_f64() {
                        result.push(Value::Double(f));
                    } else {
                        return Err(Error::Other("Invalid number parameter".to_string()));
                    }
                }
                JsonValue::String(s) => {
                    result.push(Value::Bytes(s.as_bytes().to_vec()));
                }
                JsonValue::Array(_) | JsonValue::Object(_) => {
                    // For JSON types, serialize to string
                    let json_str = serde_json::to_string(param).map_err(|e| {
                        Error::Other(format!("Failed to serialize JSON param: {}", e))
                    })?;
                    result.push(Value::Bytes(json_str.as_bytes().to_vec()));
                }
            }
        }

        Ok(result)
    }
}

impl Default for MySqlClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mysql_client_creation() {
        let client = MySqlClient::new();
        let pools = client.list_pools().await;
        assert_eq!(pools.len(), 0);
    }

    // Integration tests require a running MySQL instance
    // Run with: docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=password mysql:8

    #[tokio::test]
    #[ignore] // Requires MySQL instance
    async fn test_create_pool() {
        let client = MySqlClient::new();
        let config = ConnectionConfig::mysql("localhost", 3306, "mysql", "root", "password");

        let result = client.create_pool("test", config).await;
        assert!(result.is_ok());

        let pools = client.list_pools().await;
        assert_eq!(pools.len(), 1);
    }

    #[tokio::test]
    #[ignore] // Requires MySQL instance
    async fn test_execute_query() {
        let client = MySqlClient::new();
        let config = ConnectionConfig::mysql("localhost", 3306, "mysql", "root", "password");

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
