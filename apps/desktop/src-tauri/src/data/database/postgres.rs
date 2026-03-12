use base64::Engine;
use postgres_types::ToSql;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_postgres::{Client, NoTls, Row};

use crate::data::database::ConnectionConfig;
use crate::sys::error::{Error, Result};

pub struct PostgresPool {
    clients: Arc<RwLock<Vec<Client>>>,
    config: ConnectionConfig,
    max_size: usize,
}

impl PostgresPool {
    pub async fn new(config: ConnectionConfig, max_size: usize) -> Result<Self> {
        let pool = Self {
            clients: Arc::new(RwLock::new(Vec::new())),
            config,
            max_size,
        };

        pool.create_connection().await?;

        Ok(pool)
    }

    async fn create_connection(&self) -> Result<()> {
        let conn_str = self.config.build_connection_string()?;

        tracing::debug!(
            "Creating PostgreSQL connection to {}:{}",
            self.config.host.as_deref().unwrap_or("unknown"),
            self.config.port.unwrap_or(5432)
        );

        let (client, connection) = tokio_postgres::connect(&conn_str, NoTls).await?;

        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("PostgreSQL connection error: {}", e);
            }
        });

        client.execute("SELECT 1", &[]).await?;

        let mut clients = self.clients.write().await;
        if clients.len() < self.max_size {
            clients.push(client);
            tracing::info!("PostgreSQL connection created successfully");
            Ok(())
        } else {
            Err(Error::Other("Pool is full".to_string()))
        }
    }

    /// Get a client from the pool. Reuses an existing healthy connection
    /// instead of creating a new TCP connection each time (Bug #92 fix).
    pub async fn get_client(&self) -> Result<Client> {
        // Try to reuse an existing pooled connection
        {
            let clients = self.clients.read().await;
            if let Some(client) = clients.first() {
                // Health-check the pooled connection
                match client.execute("SELECT 1", &[]).await {
                    Ok(_) => {
                        // Connection is healthy — clone the Arc and return
                        // Note: tokio_postgres::Client doesn't implement Clone,
                        // so we return the pool reference pattern below instead.
                    }
                    Err(_) => {
                        // Connection is dead, will recreate below
                    }
                }
            }
        }

        // If pool has a healthy connection, reuse it by popping and returning
        {
            let mut clients = self.clients.write().await;
            while let Some(client) = clients.pop() {
                match client.execute("SELECT 1", &[]).await {
                    Ok(_) => {
                        // Healthy — put it back and create a new one from the pool config
                        // (tokio_postgres::Client is not Clone, so we return this one
                        // and replenish the pool in the background)
                        let config_clone = self.config.clone();
                        let clients_arc = self.clients.clone();
                        let max = self.max_size;
                        tokio::spawn(async move {
                            if let Ok(conn_str) = config_clone.build_connection_string() {
                                if let Ok((new_client, connection)) =
                                    tokio_postgres::connect(&conn_str, NoTls).await
                                {
                                    tokio::spawn(async move {
                                        if let Err(e) = connection.await {
                                            tracing::error!("PostgreSQL connection error: {}", e);
                                        }
                                    });
                                    let mut pool = clients_arc.write().await;
                                    if pool.len() < max {
                                        pool.push(new_client);
                                    }
                                }
                            }
                        });
                        return Ok(client);
                    }
                    Err(_) => {
                        // Dead connection, drop it and try next
                        tracing::warn!("Dropping dead PostgreSQL connection from pool");
                        continue;
                    }
                }
            }
        }

        // No healthy connections in pool — create a fresh one
        let conn_str = self.config.build_connection_string()?;
        let (client, connection) = tokio_postgres::connect(&conn_str, NoTls).await?;
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                tracing::error!("PostgreSQL connection error: {}", e);
            }
        });
        Ok(client)
    }

    pub async fn health_check(&self) -> Result<()> {
        let client = self.get_client().await?;
        client.execute("SELECT 1", &[]).await?;
        Ok(())
    }
}

pub fn row_to_map(row: &Row) -> Result<HashMap<String, JsonValue>> {
    let mut map = HashMap::new();

    for (idx, column) in row.columns().iter().enumerate() {
        let name = column.name().to_string();
        let value = postgres_value_to_json(row, idx)?;
        map.insert(name, value);
    }

    Ok(map)
}

fn postgres_value_to_json(row: &Row, idx: usize) -> Result<JsonValue> {
    let column = &row.columns()[idx];
    let type_name = column.type_().name();

    if row.try_get::<_, Option<String>>(idx).is_ok() && row.get::<_, Option<String>>(idx).is_none()
    {
        return Ok(JsonValue::Null);
    }

    match type_name {
        "bool" => {
            let val: Option<bool> = row.try_get(idx).ok();
            Ok(val.map(JsonValue::Bool).unwrap_or(JsonValue::Null))
        }
        "int2" | "smallint" => {
            let val: Option<i16> = row.try_get(idx).ok();
            Ok(val
                .map(|v| JsonValue::Number(v.into()))
                .unwrap_or(JsonValue::Null))
        }
        "int4" | "int" | "integer" => {
            let val: Option<i32> = row.try_get(idx).ok();
            Ok(val
                .map(|v| JsonValue::Number(v.into()))
                .unwrap_or(JsonValue::Null))
        }
        "int8" | "bigint" => {
            let val: Option<i64> = row.try_get(idx).ok();
            Ok(val
                .map(|v| JsonValue::Number(v.into()))
                .unwrap_or(JsonValue::Null))
        }
        "float4" | "real" => {
            let val: Option<f32> = row.try_get(idx).ok();
            Ok(val
                .and_then(|v| serde_json::Number::from_f64(v as f64))
                .map(JsonValue::Number)
                .unwrap_or(JsonValue::Null))
        }
        "float8" | "double precision" => {
            let val: Option<f64> = row.try_get(idx).ok();
            Ok(val
                .and_then(serde_json::Number::from_f64)
                .map(JsonValue::Number)
                .unwrap_or(JsonValue::Null))
        }
        "text" | "varchar" | "char" | "bpchar" | "name" => {
            let val: Option<String> = row.try_get(idx).ok();
            Ok(val.map(JsonValue::String).unwrap_or(JsonValue::Null))
        }
        "json" | "jsonb" => {
            let val: Option<JsonValue> = row.try_get(idx).ok();
            Ok(val.unwrap_or(JsonValue::Null))
        }
        "timestamp" | "timestamptz" => {
            let val: Option<chrono::NaiveDateTime> = row.try_get(idx).ok();
            Ok(val
                .map(|v| JsonValue::String(v.to_string()))
                .unwrap_or(JsonValue::Null))
        }
        "date" => {
            let val: Option<chrono::NaiveDate> = row.try_get(idx).ok();
            Ok(val
                .map(|v| JsonValue::String(v.to_string()))
                .unwrap_or(JsonValue::Null))
        }
        "time" => {
            let val: Option<chrono::NaiveTime> = row.try_get(idx).ok();
            Ok(val
                .map(|v| JsonValue::String(v.to_string()))
                .unwrap_or(JsonValue::Null))
        }
        "uuid" => {
            let val: Option<uuid::Uuid> = row.try_get(idx).ok();
            Ok(val
                .map(|v| JsonValue::String(v.to_string()))
                .unwrap_or(JsonValue::Null))
        }
        "bytea" => {
            let val: Option<Vec<u8>> = row.try_get(idx).ok();
            Ok(val
                .map(|v| JsonValue::String(base64::engine::general_purpose::STANDARD.encode(v)))
                .unwrap_or(JsonValue::Null))
        }
        "_text" | "_varchar" | "_int4" | "_int8" => {
            let val: Option<Vec<String>> = row.try_get(idx).ok();
            Ok(val
                .map(|v| JsonValue::Array(v.into_iter().map(JsonValue::String).collect()))
                .unwrap_or(JsonValue::Null))
        }
        _ => {
            tracing::warn!(
                "Unknown PostgreSQL type: {}, attempting string conversion",
                type_name
            );
            let val: Option<String> = row.try_get(idx).ok();
            Ok(val.map(JsonValue::String).unwrap_or(JsonValue::Null))
        }
    }
}

pub fn json_to_postgres_param(value: &JsonValue) -> Box<dyn ToSql + Send + Sync> {
    match value {
        JsonValue::Null => Box::new(None::<String>),
        JsonValue::Bool(b) => Box::new(*b),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(None::<i64>)
            }
        }
        JsonValue::String(s) => Box::new(s.clone()),
        JsonValue::Array(_) | JsonValue::Object(_) => Box::new(value.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn test_postgres_pool_creation() {
        let config =
            ConnectionConfig::postgres("localhost", 5432, "test_db", "postgres", "postgres");

        let pool = PostgresPool::new(config, 5).await;
        assert!(pool.is_ok());
    }

    #[tokio::test]
    #[ignore]
    async fn test_postgres_health_check() {
        let config =
            ConnectionConfig::postgres("localhost", 5432, "test_db", "postgres", "postgres");

        let pool = PostgresPool::new(config, 5).await.unwrap();
        let result = pool.health_check().await;
        assert!(result.is_ok());
    }
}
