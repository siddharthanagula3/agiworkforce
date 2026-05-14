//! Connection pooling for MCP servers.
//! Reuses live `McpConnection` instances across tool calls.
//! Idle timeout reaper closes connections after 5 minutes of inactivity.

use crate::mcp::McpConnection;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

const IDLE_TIMEOUT_SECS: u64 = 300;

#[allow(dead_code)]
struct PooledEntry {
    connection: Arc<RwLock<McpConnection>>,
    last_used: Instant,
}

#[allow(dead_code)]
#[derive(Default)]
pub struct McpConnectionManager {
    pool: RwLock<HashMap<String, PooledEntry>>,
}

#[allow(dead_code)]
impl McpConnectionManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn get_or_init<F, Fut>(
        &self,
        server_name: &str,
        init: F,
    ) -> anyhow::Result<Arc<RwLock<McpConnection>>>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = anyhow::Result<McpConnection>>,
    {
        {
            let pool = self.pool.read().await;
            if let Some(entry) = pool.get(server_name) {
                return Ok(entry.connection.clone());
            }
        }
        let conn = init().await?;
        let arc = Arc::new(RwLock::new(conn));
        let mut pool = self.pool.write().await;
        pool.insert(
            server_name.to_string(),
            PooledEntry {
                connection: arc.clone(),
                last_used: Instant::now(),
            },
        );
        Ok(arc)
    }

    pub async fn touch(&self, server_name: &str) {
        let mut pool = self.pool.write().await;
        if let Some(entry) = pool.get_mut(server_name) {
            entry.last_used = Instant::now();
        }
    }

    pub async fn reap_idle(&self) -> usize {
        let mut pool = self.pool.write().await;
        let before = pool.len();
        let now = Instant::now();
        pool.retain(|_, entry| {
            now.duration_since(entry.last_used) < Duration::from_secs(IDLE_TIMEOUT_SECS)
        });
        before - pool.len()
    }

    pub async fn len(&self) -> usize {
        self.pool.read().await.len()
    }

    pub async fn close_all(&self) {
        self.pool.write().await.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn new_pool_is_empty() {
        let mgr = McpConnectionManager::new();
        assert_eq!(mgr.len().await, 0);
    }

    #[tokio::test]
    async fn reap_on_empty_pool_returns_zero() {
        let mgr = McpConnectionManager::new();
        assert_eq!(mgr.reap_idle().await, 0);
    }

    #[tokio::test]
    async fn close_all_on_empty_is_noop() {
        let mgr = McpConnectionManager::new();
        mgr.close_all().await;
        assert_eq!(mgr.len().await, 0);
    }

    #[tokio::test]
    async fn touch_nonexistent_server_is_noop() {
        let mgr = McpConnectionManager::new();
        mgr.touch("ghost-server").await;
        assert_eq!(mgr.len().await, 0);
    }

    #[test]
    fn idle_timeout_is_five_minutes() {
        assert_eq!(IDLE_TIMEOUT_SECS, 300);
    }

    #[tokio::test]
    async fn get_or_init_error_does_not_insert() {
        let mgr = McpConnectionManager::new();
        let result = mgr
            .get_or_init("failing-server", || async {
                Err(anyhow::anyhow!("simulated connect failure"))
            })
            .await;
        assert!(result.is_err());
        assert_eq!(mgr.len().await, 0);
    }
}
