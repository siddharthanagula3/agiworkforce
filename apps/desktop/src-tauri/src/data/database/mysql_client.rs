use mysql_async::{prelude::*, Opts, OptsBuilder, Pool, PoolConstraints, PoolOpts, Row, Value};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::data::database::{ConnectionConfig, QueryResult};
use crate::sys::error::{Error, Result};

pub struct MySqlClient {
    pools: Arc<RwLock<HashMap<String, Pool>>>,
}

impl MySqlClient {
    /// SECURITY: Validates a SQL statement for safety in query mode.
    /// Blocks DDL/DML operations, stacked queries, and comment injection.
    /// Only SELECT, SHOW, DESCRIBE, and EXPLAIN statements are allowed.
    fn validate_query_sql(sql: &str) -> Result<()> {
        let sql_upper = sql.trim().to_uppercase();

        // Block empty queries
        if sql_upper.is_empty() {
            return Err(Error::Other("SQL query cannot be empty".to_string()));
        }

        // Block stacked queries (multiple statements via semicolons)
        if sql.contains(';') {
            return Err(Error::Other(
                "Multiple SQL statements (semicolons) are not allowed in query mode".to_string(),
            ));
        }

        // Block SQL comment injection
        if sql.contains("--") || sql.contains("/*") {
            return Err(Error::Other(
                "SQL comments are not allowed in query mode".to_string(),
            ));
        }

        // Only allow read-only statements
        let allowed_prefixes = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "WITH"];
        let is_allowed = allowed_prefixes
            .iter()
            .any(|prefix| sql_upper.starts_with(prefix));

        if !is_allowed {
            return Err(Error::Other(format!(
                "Only SELECT, SHOW, DESCRIBE, and EXPLAIN statements are allowed in query mode. Got: {}",
                sql_upper.chars().take(30).collect::<String>()
            )));
        }

        // Block dangerous keywords even within allowed statements (e.g., subqueries with mutations)
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
            "LOAD_FILE",
            "INTO OUTFILE",
            "INTO DUMPFILE",
        ];
        for keyword in &blocked_keywords {
            if sql_upper.contains(keyword) {
                return Err(Error::Other(format!(
                    "SQL operation '{}' is not allowed in query mode",
                    keyword
                )));
            }
        }

        Ok(())
    }

    pub fn new() -> Self {
        Self {
            pools: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_pool(&self, connection_id: &str, config: ConnectionConfig) -> Result<()> {
        tracing::info!("Creating MySQL pool: {}", connection_id);

        let conn_str = config.build_connection_string()?;

        let opts = Opts::from_url(&conn_str)
            .map_err(|e| Error::Other(format!("Failed to parse MySQL connection string: {}", e)))?;

        let pool_opts = PoolOpts::default().with_constraints(
            PoolConstraints::new(5, 100)
                .or_else(|| PoolConstraints::new(1, 10))
                .unwrap_or_else(|| {
                    tracing::warn!("Using hardcoded pool constraints as fallback");
                    // This is a valid constraint that should never fail (1 <= 10)
                    PoolConstraints::new(1, 10).expect("static pool constraints 1..10")
                }),
        );

        let pool = Pool::new(OptsBuilder::from_opts(opts).pool_opts(pool_opts));

        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

        conn.query_drop("SELECT 1")
            .await
            .map_err(|e| Error::Other(format!("MySQL connection test failed: {}", e)))?;

        tracing::info!("MySQL connection test successful");

        let mut pools = self.pools.write().await;
        pools.insert(connection_id.to_string(), pool);

        Ok(())
    }

    async fn get_pool(&self, connection_id: &str) -> Result<Pool> {
        let pools = self.pools.read().await;
        pools
            .get(connection_id)
            .cloned()
            .ok_or_else(|| Error::Other(format!("Pool not found: {}", connection_id)))
    }

    pub async fn execute_query(&self, connection_id: &str, sql: &str) -> Result<QueryResult> {
        let start = std::time::Instant::now();

        // SECURITY: Validate SQL statement before execution
        Self::validate_query_sql(sql)?;

        tracing::info!(
            "[SECURITY][MySQL] Executing query on '{}': {}",
            connection_id,
            sql
        );

        let pool = self.get_pool(connection_id).await?;
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

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

        let mysql_params = Self::json_params_to_mysql(params)?;

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

    pub async fn execute_batch(
        &self,
        connection_id: &str,
        queries: &[String],
    ) -> Result<Vec<QueryResult>> {
        tracing::info!("Executing batch of {} queries", queries.len());

        // SECURITY: Validate each query in the batch
        for (i, query) in queries.iter().enumerate() {
            Self::validate_query_sql(query).map_err(|e| {
                Error::Other(format!("Batch query {} validation failed: {}", i + 1, e))
            })?;
        }

        tracing::info!(
            "[SECURITY][MySQL] Executing validated batch of {} queries on '{}'",
            queries.len(),
            connection_id
        );

        let pool = self.get_pool(connection_id).await?;
        let mut conn = pool
            .get_conn()
            .await
            .map_err(|e| Error::Other(format!("Failed to get MySQL connection: {}", e)))?;

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

        transaction
            .commit()
            .await
            .map_err(|e| Error::Other(format!("Failed to commit MySQL transaction: {}", e)))?;

        tracing::info!("Batch execution completed successfully");

        Ok(results)
    }

    pub async fn close_pool(&self, connection_id: &str) -> Result<()> {
        tracing::info!("Closing MySQL pool: {}", connection_id);

        let mut pools = self.pools.write().await;

        if let Some(pool) = pools.remove(connection_id) {
            pool.disconnect()
                .await
                .map_err(|e| Error::Other(format!("Failed to disconnect MySQL pool: {}", e)))?;
            Ok(())
        } else {
            Err(Error::Other(format!("Pool not found: {}", connection_id)))
        }
    }

    pub async fn list_pools(&self) -> Vec<String> {
        let pools = self.pools.read().await;
        pools.keys().cloned().collect()
    }

    fn rows_to_query_result(rows: Vec<Row>, execution_time_ms: u128) -> Result<QueryResult> {
        let mut result_rows = Vec::new();

        for row in rows {
            let mut result_row = HashMap::new();

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

    fn row_value_to_json(row: &Row, idx: usize) -> Result<JsonValue> {
        use mysql_async::consts::ColumnType;

        let columns = row.columns_ref();
        let column = &columns[idx];
        let value: Value = row
            .as_ref(idx)
            .ok_or_else(|| Error::Other("Column index out of bounds".to_string()))?
            .clone();

        if value == Value::NULL {
            return Ok(JsonValue::Null);
        }

        match column.column_type() {
            ColumnType::MYSQL_TYPE_TINY
            | ColumnType::MYSQL_TYPE_SHORT
            | ColumnType::MYSQL_TYPE_LONG
            | ColumnType::MYSQL_TYPE_INT24 => match value {
                Value::Int(i) => Ok(JsonValue::Number(i.into())),
                Value::UInt(u) => Ok(JsonValue::Number(serde_json::Number::from(u as i64))),
                _ => Ok(JsonValue::Null),
            },
            ColumnType::MYSQL_TYPE_LONGLONG => match value {
                Value::Int(i) => Ok(JsonValue::Number(i.into())),
                Value::UInt(u) => {
                    if u <= i64::MAX as u64 {
                        Ok(JsonValue::Number((u as i64).into()))
                    } else {
                        Ok(JsonValue::String(u.to_string()))
                    }
                }
                _ => Ok(JsonValue::Null),
            },
            ColumnType::MYSQL_TYPE_FLOAT | ColumnType::MYSQL_TYPE_DOUBLE => match value {
                Value::Float(f) => Ok(serde_json::Number::from_f64(f as f64)
                    .map(JsonValue::Number)
                    .unwrap_or(JsonValue::Null)),
                Value::Double(d) => Ok(serde_json::Number::from_f64(d)
                    .map(JsonValue::Number)
                    .unwrap_or(JsonValue::Null)),
                _ => Ok(JsonValue::Null),
            },
            ColumnType::MYSQL_TYPE_DECIMAL | ColumnType::MYSQL_TYPE_NEWDECIMAL => match value {
                Value::Bytes(ref bytes) => {
                    let s = String::from_utf8_lossy(bytes);

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
            },
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
            ColumnType::MYSQL_TYPE_JSON => match value {
                Value::Bytes(ref bytes) => {
                    let s = String::from_utf8_lossy(bytes);

                    match serde_json::from_str::<JsonValue>(&s) {
                        Ok(json_val) => Ok(json_val),
                        Err(_) => Ok(JsonValue::String(s.to_string())),
                    }
                }
                _ => Ok(JsonValue::Null),
            },
            ColumnType::MYSQL_TYPE_BIT => match value {
                Value::Bytes(ref bytes) => {
                    let mut num: u64 = 0;
                    for &byte in bytes.iter() {
                        num = (num << 8) | byte as u64;
                    }
                    Ok(JsonValue::Number((num as i64).into()))
                }
                _ => Ok(JsonValue::Null),
            },
            _ => match value {
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
            },
        }
    }

    fn json_params_to_mysql(params: &[JsonValue]) -> Result<Vec<Value>> {
        let mut result: Vec<Value> = Vec::new();

        for param in params {
            match param {
                JsonValue::Null => result.push(Value::NULL),
                JsonValue::Bool(b) => {
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

    #[tokio::test]
    #[ignore = "requires a live MySQL on MYSQL_URL; run with --ignored after starting one"]
    async fn test_create_pool() {
        let client = MySqlClient::new();
        let config = ConnectionConfig::mysql("localhost", 3306, "mysql", "root", "password");

        let result = client.create_pool("test", config).await;
        assert!(result.is_ok());

        let pools = client.list_pools().await;
        assert_eq!(pools.len(), 1);
    }

    #[tokio::test]
    #[ignore = "requires a live MySQL on MYSQL_URL; run with --ignored after starting one"]
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
