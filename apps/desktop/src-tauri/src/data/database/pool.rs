use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

use crate::data::database::ConnectionConfig;
use crate::sys::error::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolConfig {
    pub max_connections: u32,
    pub min_connections: u32,
    pub connection_timeout_ms: u64,
    pub idle_timeout_ms: u64,
    pub max_lifetime_ms: Option<u64>,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_connections: 10,
            min_connections: 2,
            connection_timeout_ms: 30000,
            idle_timeout_ms: 600000,
            max_lifetime_ms: Some(1800000),
        }
    }
}

#[derive(Debug)]
struct PooledConnection {
    id: String,
    created_at: Instant,
    last_used: Instant,
    in_use: bool,
}

impl PooledConnection {
    fn new() -> Self {
        let now = Instant::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            created_at: now,
            last_used: now,
            in_use: false,
        }
    }

    fn is_expired(&self, config: &PoolConfig) -> bool {
        if self.last_used.elapsed().as_millis() > config.idle_timeout_ms as u128 {
            return true;
        }

        if let Some(max_lifetime) = config.max_lifetime_ms {
            if self.created_at.elapsed().as_millis() > max_lifetime as u128 {
                return true;
            }
        }

        false
    }
}

#[derive(Clone)]
pub struct ConnectionPool {
    config: ConnectionConfig,
    pool_config: PoolConfig,
    connections: Arc<RwLock<Vec<PooledConnection>>>,
    stats: Arc<RwLock<PoolStats>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PoolStats {
    pub total_connections: u32,
    pub active_connections: u32,
    pub idle_connections: u32,
    pub total_acquired: u64,
    pub total_released: u64,
    pub total_created: u64,
    pub total_closed: u64,
    pub wait_time_ms: u64,
}

impl ConnectionPool {
    pub async fn new(config: ConnectionConfig, pool_config: PoolConfig) -> Result<Self> {
        tracing::info!(
            "Creating connection pool for {} with max {} connections",
            config.db_type,
            pool_config.max_connections
        );

        config.validate()?;

        let pool = Self {
            config,
            pool_config: pool_config.clone(),
            connections: Arc::new(RwLock::new(Vec::new())),
            stats: Arc::new(RwLock::new(PoolStats::default())),
        };

        pool.ensure_min_connections().await?;

        Ok(pool)
    }

    async fn ensure_min_connections(&self) -> Result<()> {
        let connections = self.connections.read().await;
        let current_count = connections.len();
        drop(connections);

        if current_count < self.pool_config.min_connections as usize {
            let needed = self.pool_config.min_connections as usize - current_count;
            for _ in 0..needed {
                self.create_connection().await?;
            }
        }

        Ok(())
    }

    async fn create_connection(&self) -> Result<String> {
        let mut connections = self.connections.write().await;

        if connections.len() >= self.pool_config.max_connections as usize {
            return Err(Error::Other("Connection pool exhausted".to_string()));
        }

        let conn = PooledConnection::new();
        let conn_id = conn.id.clone();
        connections.push(conn);

        let mut stats = self.stats.write().await;
        stats.total_created += 1;
        stats.total_connections = connections.len() as u32;

        tracing::debug!("Created new connection: {}", conn_id);

        Ok(conn_id)
    }

    pub async fn acquire(&self) -> Result<String> {
        let start = Instant::now();
        let timeout = Duration::from_millis(self.pool_config.connection_timeout_ms);

        loop {
            {
                let mut connections = self.connections.write().await;

                connections.retain(|conn| !conn.is_expired(&self.pool_config));

                if let Some(conn) = connections.iter_mut().find(|c| !c.in_use) {
                    conn.in_use = true;
                    conn.last_used = Instant::now();

                    let conn_id = conn.id.clone();

                    let mut stats = self.stats.write().await;
                    stats.total_acquired += 1;
                    stats.active_connections += 1;
                    stats.idle_connections = stats.idle_connections.saturating_sub(1);

                    return Ok(conn_id);
                }
            }

            match self.create_connection().await {
                Ok(conn_id) => {
                    let mut connections = self.connections.write().await;
                    if let Some(conn) = connections.iter_mut().find(|c| c.id == conn_id) {
                        conn.in_use = true;
                        conn.last_used = Instant::now();
                    }

                    let mut stats = self.stats.write().await;
                    stats.total_acquired += 1;
                    stats.active_connections += 1;

                    return Ok(conn_id);
                }
                Err(_) if start.elapsed() < timeout => {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
                Err(e) => {
                    return Err(e);
                }
            }

            if start.elapsed() >= timeout {
                let mut stats = self.stats.write().await;
                stats.wait_time_ms += start.elapsed().as_millis() as u64;
                return Err(Error::Other("Connection pool timeout".to_string()));
            }
        }
    }

    pub async fn release(&self, connection_id: &str) -> Result<()> {
        let mut connections = self.connections.write().await;

        if let Some(conn) = connections.iter_mut().find(|c| c.id == connection_id) {
            conn.in_use = false;
            conn.last_used = Instant::now();

            let mut stats = self.stats.write().await;
            stats.total_released += 1;
            stats.active_connections = stats.active_connections.saturating_sub(1);
            stats.idle_connections += 1;

            tracing::debug!("Released connection: {}", connection_id);

            Ok(())
        } else {
            Err(Error::Other("Connection not found in pool".to_string()))
        }
    }

    pub async fn close_connection(&self, connection_id: &str) -> Result<()> {
        let mut connections = self.connections.write().await;

        if let Some(pos) = connections.iter().position(|c| c.id == connection_id) {
            connections.remove(pos);

            let mut stats = self.stats.write().await;
            stats.total_closed += 1;
            stats.total_connections = connections.len() as u32;

            tracing::debug!("Closed connection: {}", connection_id);

            Ok(())
        } else {
            Err(Error::Other("Connection not found".to_string()))
        }
    }

    pub async fn close_all(&self) -> Result<()> {
        let mut connections = self.connections.write().await;
        let count = connections.len();

        connections.clear();

        let mut stats = self.stats.write().await;
        stats.total_closed += count as u64;
        stats.total_connections = 0;
        stats.active_connections = 0;
        stats.idle_connections = 0;

        tracing::info!("Closed all {} connections", count);

        Ok(())
    }

    pub async fn get_stats(&self) -> PoolStats {
        let stats = self.stats.read().await;
        stats.clone()
    }

    pub async fn health_check(&self) -> Result<()> {
        {
            let mut connections = self.connections.write().await;
            let before_count = connections.len();
            connections.retain(|conn| !conn.is_expired(&self.pool_config));
            let removed_count = before_count - connections.len();

            if removed_count > 0 {
                tracing::info!("Health check removed {} expired connections", removed_count);
            }
        }

        self.ensure_min_connections().await?;

        Ok(())
    }

    pub fn get_config(&self) -> &ConnectionConfig {
        &self.config
    }

    pub fn get_pool_config(&self) -> &PoolConfig {
        &self.pool_config
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::database::ConnectionConfig;

    #[tokio::test]
    async fn test_pool_creation() {
        let config = ConnectionConfig::sqlite(":memory:");
        let pool_config = PoolConfig {
            max_connections: 5,
            min_connections: 2,
            ..Default::default()
        };

        let pool = ConnectionPool::new(config, pool_config).await.unwrap();
        let stats = pool.get_stats().await;

        assert_eq!(stats.total_connections, 2);
    }

    #[tokio::test]
    async fn test_acquire_and_release() {
        let config = ConnectionConfig::sqlite(":memory:");
        let pool_config = PoolConfig::default();

        let pool = ConnectionPool::new(config, pool_config).await.unwrap();

        let conn_id = pool.acquire().await.unwrap();
        let stats = pool.get_stats().await;
        assert_eq!(stats.active_connections, 1);

        pool.release(&conn_id).await.unwrap();
        let stats = pool.get_stats().await;
        assert_eq!(stats.active_connections, 0);
        assert_eq!(stats.idle_connections, 1);
    }

    #[tokio::test]
    async fn test_pool_exhaustion() {
        let config = ConnectionConfig::sqlite(":memory:");
        let pool_config = PoolConfig {
            max_connections: 2,
            min_connections: 0,
            connection_timeout_ms: 500,
            ..Default::default()
        };

        let pool = ConnectionPool::new(config, pool_config).await.unwrap();

        let conn1 = pool.acquire().await.unwrap();
        let _conn2 = pool.acquire().await.unwrap();

        let result = pool.acquire().await;
        assert!(result.is_err());

        pool.release(&conn1).await.unwrap();
        let conn3 = pool.acquire().await;
        assert!(conn3.is_ok());
    }

    #[tokio::test]
    async fn test_close_all() {
        let config = ConnectionConfig::sqlite(":memory:");
        let pool_config = PoolConfig::default();

        let pool = ConnectionPool::new(config, pool_config).await.unwrap();

        let _conn1 = pool.acquire().await.unwrap();
        let _conn2 = pool.acquire().await.unwrap();

        pool.close_all().await.unwrap();

        let stats = pool.get_stats().await;
        assert_eq!(stats.total_connections, 0);
    }
}
