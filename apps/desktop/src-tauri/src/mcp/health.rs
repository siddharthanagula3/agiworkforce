use crate::mcp::client::McpClient;
use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;

/// Health status for an MCP server
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

/// Health check result for a server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerHealth {
    pub server_name: String,
    pub status: HealthStatus,
    pub last_check: DateTime<Utc>,
    pub response_time_ms: Option<u64>,
    pub error_message: Option<String>,
    pub tool_count: usize,
    pub consecutive_failures: u32,
}

/// Health monitor for MCP servers
pub struct McpHealthMonitor {
    client: Arc<McpClient>,
    health_records: Arc<Mutex<HashMap<String, ServerHealth>>>,
}

impl McpHealthMonitor {
    /// Create a new health monitor
    pub fn new(client: Arc<McpClient>) -> Self {
        Self {
            client,
            health_records: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Perform health check on a server
    pub async fn check_server_health(&self, server_name: &str) -> ServerHealth {
        let start = std::time::Instant::now();
        
        let (status, error_message, tool_count) = match self.client.list_server_tools(server_name) {
            Ok(tools) => {
                if tools.is_empty() {
                    (HealthStatus::Degraded, Some("No tools available".to_string()), 0)
                } else {
                    (HealthStatus::Healthy, None, tools.len())
                }
            }
            Err(e) => {
                tracing::warn!("[MCP Health] Server {} health check failed: {}", server_name, e);
                (HealthStatus::Unhealthy, Some(e.to_string()), 0)
            }
        };

        let response_time_ms = start.elapsed().as_millis() as u64;

        let mut records = self.health_records.lock();
        let consecutive_failures = if status == HealthStatus::Unhealthy {
            records
                .get(server_name)
                .map(|h| h.consecutive_failures + 1)
                .unwrap_or(1)
        } else {
            0
        };

        let health = ServerHealth {
            server_name: server_name.to_string(),
            status,
            last_check: Utc::now(),
            response_time_ms: Some(response_time_ms),
            error_message,
            tool_count,
            consecutive_failures,
        };

        records.insert(server_name.to_string(), health.clone());
        health
    }

    /// Get health status for all servers
    pub fn get_all_health(&self) -> Vec<ServerHealth> {
        let records = self.health_records.lock();
        records.values().cloned().collect()
    }

    /// Get health status for a specific server
    pub fn get_server_health(&self, server_name: &str) -> Option<ServerHealth> {
        let records = self.health_records.lock();
        records.get(server_name).cloned()
    }

    /// Start periodic health checks
    pub fn start_monitoring(
        self: Arc<Self>,
        interval: Duration,
        app_handle: tauri::AppHandle,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let mut interval_timer = tokio::time::interval(interval);
            loop {
                interval_timer.tick().await;

                let servers = self.client.get_connected_servers();
                for server_name in servers.iter() {
                    let health = self.check_server_health(server_name).await;
                    
                    // Emit event if unhealthy
                    if health.status == HealthStatus::Unhealthy {
                        tracing::warn!(
                            "[MCP Health] Server {} is unhealthy: {:?}",
                            server_name,
                            health.error_message
                        );
                        
                        if let Err(e) = app_handle.emit("mcp://server-unhealthy", &health) {
                            tracing::error!("[MCP Health] Failed to emit unhealthy event: {}", e);
                        }
                    }
                }
            }
        })
    }

    /// Clear health records
    pub fn clear(&self) {
        self.health_records.lock().clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_status_serialization() {
        let status = HealthStatus::Healthy;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"healthy\"");
    }
}

